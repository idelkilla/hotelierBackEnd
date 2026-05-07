import { Router } from 'express'
import * as db from '../db.js'
import bcrypt from 'bcryptjs'
import { authenticateToken } from '../middleware/authMiddleware.js'

const router = Router()

/**
 * GET /api/usuarios?tipo=todos|empleado|cliente|miembro
 * Lista unificada con filtro opcional
 */
router.get('/', authenticateToken, async (req, res, next) => {
  const tipoFiltro = (req.query.tipo || 'todos').toLowerCase()

  try {
    const { rows } = await db.query(`
      SELECT
        u."ID_USUARIO"                        AS id,
        COALESCE(p."NOMBRE_COMPLETO", u."USUARIO") AS nombre,
        u."CORREO_ELECTRONICO"                AS correo,
        u."USUARIO"                           AS usuario,
        u."ID_PERSONA",
        CONCAT_WS(', ', 
          CASE WHEN e."ID_EMPLEADO" IS NOT NULL THEN 'Empleado' END,
          CASE WHEN c."ID_CLIENTE"  IS NOT NULL THEN 'Cliente' END,
          CASE WHEN m."ID_CLIENTE"  IS NOT NULL THEN 'Miembro' END
        )                                     AS todos_los_roles,
        CASE
          WHEN m."ID_CLIENTE"  IS NOT NULL THEN 'Miembro'
          WHEN c."ID_CLIENTE"  IS NOT NULL THEN 'Cliente'
          WHEN e."ID_EMPLEADO" IS NOT NULL THEN 'Empleado'
          ELSE 'Usuario'
        END                                   AS rol_principal,
        COALESCE(c."ESTADO_CLIENTE", 'A')     AS estado,
        nm."NOMBRE_NIVEL"                     AS nivel_membresia,
        c."FECHA_REGISTRO"                    AS fecha_registro
      FROM public."USUARIO" u
      LEFT JOIN public."PERSONA"  p  ON p."ID_PERSONA"  = u."ID_PERSONA"
      LEFT JOIN public."EMPLEADO" e  ON e."ID_EMPLEADO" = u."ID_PERSONA"
      LEFT JOIN public."CLIENTE"  c  ON c."ID_CLIENTE"  = u."ID_PERSONA"
      LEFT JOIN public."MIEMBRO"  m  ON m."ID_CLIENTE"  = u."ID_PERSONA"
      LEFT JOIN public."NIVEL_MEMBRESIA" nm ON nm."ID_NIVEL" = m."ID_NIVEL"
      ORDER BY u."ID_USUARIO" DESC
    `)

    // Filtrar por tipo en el backend
    let resultado = rows
    if (tipoFiltro === 'cliente') {
      // Mostrar TANTO Clientes como Miembros cuando se filtra por Cliente
      resultado = rows.filter(u => u.rol_principal === 'Cliente' || u.rol_principal === 'Miembro')
    } else if (tipoFiltro !== 'todos') {
      resultado = rows.filter(u => u.rol_principal.toLowerCase() === tipoFiltro)
    }

    res.json(resultado)
  } catch (err) {
    console.error('❌ GET /api/usuarios error:', err.stack)
    next(err)
  }
})

/**
 * GET /api/usuarios/buscar?q=texto&tipo=cliente
 * Búsqueda con filtro de tipo
 */
router.get('/buscar', authenticateToken, async (req, res, next) => {
  const q = (req.query.q || '').trim()
  const tipoFiltro = (req.query.tipo || 'todos').toLowerCase()

  if (!q) return res.json([])

  try {
    const { rows } = await db.query(`
      SELECT
        u."ID_USUARIO"                        AS id,
        COALESCE(p."NOMBRE_COMPLETO", u."USUARIO") AS nombre,
        u."CORREO_ELECTRONICO"                AS correo,
        CASE
          WHEN m."ID_CLIENTE"  IS NOT NULL THEN 'Miembro'
          WHEN c."ID_CLIENTE"  IS NOT NULL THEN 'Cliente'
          WHEN e."ID_EMPLEADO" IS NOT NULL THEN 'Empleado'
          ELSE 'Usuario'
        END                                   AS tipo
      FROM public."USUARIO" u
      LEFT JOIN public."PERSONA"  p  ON p."ID_PERSONA"  = u."ID_PERSONA"
      LEFT JOIN public."EMPLEADO" e  ON e."ID_EMPLEADO" = u."ID_PERSONA"
      LEFT JOIN public."CLIENTE"  c  ON c."ID_CLIENTE"  = u."ID_PERSONA"
      LEFT JOIN public."MIEMBRO"  m  ON m."ID_CLIENTE"  = u."ID_PERSONA"
      WHERE
        p."NOMBRE_COMPLETO" ILIKE $1
        OR u."CORREO_ELECTRONICO" ILIKE $1
        OR u."USUARIO" ILIKE $1
      ORDER BY p."NOMBRE_COMPLETO"
      LIMIT 20
    `, [`%${q}%`])

    // Filtrar por tipo
    let resultado = rows
    if (tipoFiltro === 'cliente') {
      // Mostrar TANTO Clientes como Miembros
      resultado = rows.filter(u => u.tipo === 'Cliente' || u.tipo === 'Miembro')
    } else if (tipoFiltro !== 'todos') {
      resultado = rows.filter(u => u.tipo.toLowerCase() === tipoFiltro)
    }

    res.json(resultado)
  } catch (err) {
    console.error('❌ GET /api/usuarios/buscar error:', err.stack)
    next(err)
  }
})

/**
 * GET /api/usuarios/:id?tipo=empleado|cliente|miembro
 * Detalle individual
 */
router.get('/:id', authenticateToken, async (req, res, next) => {
  const { id } = req.params
  const tipo = (req.query.tipo || '').toLowerCase()
  try {
    // 1. Obtener datos del usuario
    const { rows: base } = await db.query(`
      SELECT
        u."ID_USUARIO"           AS id,
        u."USUARIO"              AS usuario,
        u."CORREO_ELECTRONICO"   AS correo,
        u."ID_PERSONA",
        COALESCE(p."NOMBRE_COMPLETO", u."USUARIO") AS nombre_completo,
        p."APELLIDOS"            AS apellidos,
        t."CODIGO_PAIS"          AS codigo_pais,
        t."NUMERO_TELEFONICO"    AS numero_telefonico
      FROM public."USUARIO" u
      LEFT JOIN public."PERSONA"  p ON p."ID_PERSONA" = u."ID_PERSONA"
      LEFT JOIN public."TELEFONO" t ON t."ID_PERSONA" = u."ID_PERSONA"
        AND t."ESTADO_TELEFONO" = 'A'
      WHERE u."ID_USUARIO" = $1
      LIMIT 1
    `, [id])

    if (!base.length) {
      return res.status(404).json({ message: 'Usuario no encontrado' })
    }

    const usuario = { ...base[0] }
    const idPersona = usuario.ID_PERSONA
    delete usuario.ID_PERSONA

    // 2. Si no hay ID_PERSONA, retornar solo usuario base
    if (!idPersona) {
      return res.json(usuario)
    }

    // 3. Cargar datos específicos según tipo
    if (tipo === 'empleado') {
      const { rows } = await db.query(`
        SELECT
          e."FECHA_CONTRATACION",
          ep."SUELDO"            AS sueldo,
          ep."ID_PUESTO"         AS id_puesto,
          pu."NOMBRE_PUESTO"
        FROM public."EMPLEADO" e
        LEFT JOIN public."EMPLEADO_PUESTO" ep ON ep."ID_EMPLEADO" = e."ID_EMPLEADO"
          AND ep."FECHA_FIN" >= CURRENT_DATE
        LEFT JOIN public."PUESTO" pu ON pu."ID_PUESTO" = ep."ID_PUESTO"
        WHERE e."ID_EMPLEADO" = $1
        ORDER BY ep."FECHA_INICIO" DESC
        LIMIT 1
      `, [idPersona])
      if (rows.length > 0) {
        Object.assign(usuario, rows[0])
      }
    }

    // ✅ CLIENTE: Obtener datos correctamente
    if (tipo === 'cliente' || tipo === 'miembro') {
      const { rows } = await db.query(`
        SELECT
          c."ID_CLIENTE",
          c."ESTADO_CLIENTE"        AS estado,
          c."GENERO"                AS genero,
          c."FECHA_NACIMIENTO"      AS fecha_nacimiento,
          c."DESCRIPCION_PERSONAL"  AS descripcion_personal,
          c."FECHA_REGISTRO"
        FROM public."CLIENTE" c
        WHERE c."ID_CLIENTE" = $1
      `, [idPersona])

      if (rows.length > 0) {
        Object.assign(usuario, rows[0])
      } else {
        return res.status(404).json({ 
          message: `No se encontró registro de ${tipo} para este usuario` 
        })
      }
    }

    // ✅ MIEMBRO: Obtener datos correctamente
    if (tipo === 'miembro') {
      const { rows } = await db.query(`
        SELECT
          m."NUMERO_MIEMBRO",
          m."FECHA_INICIO",
          m."PUNTOS_FIDELIDAD",
          m."ID_NIVEL",
          nm."NOMBRE_NIVEL"
        FROM public."MIEMBRO" m
        LEFT JOIN public."NIVEL_MEMBRESIA" nm ON nm."ID_NIVEL" = m."ID_NIVEL"
        WHERE m."ID_CLIENTE" = $1
      `, [idPersona])

      if (rows.length > 0) {
        Object.assign(usuario, rows[0])
      } else {
        return res.status(404).json({ 
          message: 'Este cliente no es miembro' 
        })
      }
    }

    res.json(usuario)
  } catch (err) {
    console.error('❌ GET /api/usuarios/:id error:', err.stack)
    next(err)
  }
})

router.put('/:id', authenticateToken, async (req, res, next) => {
  const { id } = req.params
  const {
    nombre_completo, apellidos, correo, usuario,
    codigo_pais, numero_telefonico, contrasena,
    id_puesto, sueldo,
    genero, estado_cliente, descripcion_personal,
    numero_miembro, id_nivel, puntos_fidelidad,
    tipo
  } = req.body

  try {
    // 1. Actualizar USUARIO + PERSONA
    await db.query(`
      UPDATE public."USUARIO"
      SET "CORREO_ELECTRONICO" = $1, "USUARIO" = $2
      WHERE "ID_USUARIO" = $3
    `, [correo, usuario, id])

    // Obtener ID_PERSONA
    const { rows: [u] } = await db.query(
      `SELECT "ID_PERSONA" FROM public."USUARIO" WHERE "ID_USUARIO" = $1`, [id]
    )
    if (!u?.ID_PERSONA) return res.status(404).json({ message: 'Usuario no encontrado' })
    const idPersona = u.ID_PERSONA

    // Actualizar PERSONA
    if (nombre_completo || apellidos) {
      await db.query(`
        UPDATE public."PERSONA"
        SET "NOMBRE_COMPLETO" = COALESCE($1, "NOMBRE_COMPLETO"),
            "APELLIDOS" = COALESCE($2, "APELLIDOS")
        WHERE "ID_PERSONA" = $3
      `, [nombre_completo, apellidos, idPersona])
    }

    // 2. Contraseña (opcional)
    if (contrasena) {
      const hash = await bcrypt.hash(contrasena, 10)
      await db.query(
        `UPDATE public."USUARIO" SET "CONTRASENA" = $1 WHERE "ID_USUARIO" = $2`,
        [hash, id]
      )
    }

    // 3. Teléfono
    if (numero_telefonico) {
      await db.query(`
        UPDATE public."TELEFONO"
        SET "NUMERO_TELEFONICO" = $1, "CODIGO_PAIS" = $2
        WHERE "ID_PERSONA" = $3 AND "ESTADO_TELEFONO" = 'A'
      `, [numero_telefonico, codigo_pais || '+1', idPersona])
    }

    // 4. Cambio de tipo — insertar en tabla destino si no existe
    const tipoActual = await db.query(`
      SELECT
        CASE
          WHEN m."ID_CLIENTE"  IS NOT NULL THEN 'miembro'
          WHEN c."ID_CLIENTE"  IS NOT NULL THEN 'cliente'
          WHEN e."ID_EMPLEADO" IS NOT NULL THEN 'empleado'
          ELSE 'usuario'
        END AS tipo_actual
      FROM public."USUARIO" u
      LEFT JOIN public."EMPLEADO" e ON e."ID_EMPLEADO" = u."ID_PERSONA"
      LEFT JOIN public."CLIENTE"  c ON c."ID_CLIENTE"  = u."ID_PERSONA"
      LEFT JOIN public."MIEMBRO"  m ON m."ID_CLIENTE"  = u."ID_PERSONA"
      WHERE u."ID_USUARIO" = $1
    `, [id])

    const tipoAnterior = tipoActual.rows[0]?.tipo_actual
    const t = tipo?.toLowerCase()

    if (t && t !== tipoAnterior) {
      // Insertar en tabla destino si no existe
      if (t === 'empleado') {
        await db.query(`
          INSERT INTO public."EMPLEADO" ("ID_EMPLEADO", "FECHA_CONTRATACION")
          VALUES ($1, CURRENT_DATE)
          ON CONFLICT DO NOTHING
        `, [idPersona])
      }

      if (t === 'cliente' || t === 'miembro') {
        await db.query(`
          INSERT INTO public."CLIENTE" ("ID_CLIENTE", "ESTADO_CLIENTE", "FECHA_REGISTRO")
          VALUES ($1, 'A', CURRENT_DATE)
          ON CONFLICT DO NOTHING
        `, [idPersona])
      }

      if (t === 'miembro') {
        // Generar número de miembro
        const { rows: maxRows } = await db.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING("NUMERO_MIEMBRO" FROM 4) AS INTEGER)), 0) + 1 AS next
           FROM public."MIEMBRO"`
        )
        const numMiembro = `MEM${String(maxRows[0].next).padStart(6, '0')}`
        await db.query(`
          INSERT INTO public."MIEMBRO" ("ID_CLIENTE", "NUMERO_MIEMBRO", "FECHA_INICIO", "PUNTOS_FIDELIDAD")
          VALUES ($1, $2, CURRENT_DATE, 0)
          ON CONFLICT DO NOTHING
        `, [idPersona, numMiembro])
      }
    }

    // 5. Datos específicos por tipo

    if (t === 'empleado' && id_puesto) {
      await db.query(`
        UPDATE public."EMPLEADO_PUESTO"
        SET "ID_PUESTO" = $1, "SUELDO" = COALESCE($2, "SUELDO")
        WHERE "ID_EMPLEADO" = $3 AND "FECHA_FIN" >= CURRENT_DATE
      `, [id_puesto, sueldo, idPersona])
    }

    if ((t === 'cliente' || t === 'miembro') && (genero || estado_cliente)) {
      await db.query(`
        UPDATE public."CLIENTE"
        SET "GENERO" = COALESCE($1, "GENERO"),
            "ESTADO_CLIENTE" = COALESCE($2, "ESTADO_CLIENTE"),
            "DESCRIPCION_PERSONAL" = COALESCE($3, "DESCRIPCION_PERSONAL")
        WHERE "ID_CLIENTE" = $4
      `, [genero, estado_cliente, descripcion_personal, idPersona])
    }

    if (t === 'miembro' && id_nivel) {
      await db.query(`
        UPDATE public."MIEMBRO"
        SET "ID_NIVEL" = $1, "PUNTOS_FIDELIDAD" = COALESCE($2, "PUNTOS_FIDELIDAD")
        WHERE "ID_CLIENTE" = $3
      `, [id_nivel, puntos_fidelidad, idPersona])
    }

    res.json({ message: 'Usuario actualizado correctamente' })
  } catch (err) {
    console.error('❌ PUT /api/usuarios/:id error:', err.stack)
    next(err)
  }
})

router.delete('/:id', authenticateToken, async (req, res, next) => {
  const { id } = req.params
  try {
    const { rows: [u] } = await db.query(
      `SELECT "ID_PERSONA" FROM public."USUARIO" WHERE "ID_USUARIO" = $1`, [id]
    )
    if (!u) return res.status(404).json({ message: 'Usuario no encontrado' })

    // Eliminar en cascada desde USUARIO (ajusta según tus FK)
    await db.query(`DELETE FROM public."USUARIO" WHERE "ID_USUARIO" = $1`, [id])

    res.json({ message: 'Usuario eliminado' })
  } catch (err) {
    console.error('❌ DELETE /api/usuarios/:id error:', err.stack)
    next(err)
  }
})

export default router