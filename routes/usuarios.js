import { Router } from 'express'
import * as db from '../db.js'
import bcrypt from 'bcryptjs'
import { authenticateToken } from '../middleware/authMiddleware.js'

const router = Router()

// GET /api/usuarios — listado unificado empleados + clientes + miembros
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        u."ID_USUARIO"                        AS id,
        COALESCE(p."NOMBRE_COMPLETO", u."USUARIO") AS nombre,
        u."CORREO_ELECTRONICO"                AS correo,
        u."USUARIO"                           AS usuario,
        CASE
          WHEN e."ID_EMPLEADO" IS NOT NULL THEN 'Empleado'
          WHEN m."ID_CLIENTE"  IS NOT NULL THEN 'Miembro'
          WHEN c."ID_CLIENTE"  IS NOT NULL THEN 'Cliente'
          ELSE 'Usuario'
        END                                   AS tipo,
        COALESCE(c."ESTADO_CLIENTE", 'A')     AS estado,
        nm."NOMBRE_NIVEL"                     AS nivel_membresia
      FROM public."USUARIO" u
      LEFT JOIN public."PERSONA"  p  ON p."ID_PERSONA"  = u."ID_PERSONA"
      LEFT JOIN public."EMPLEADO" e  ON e."ID_EMPLEADO" = u."ID_PERSONA"
      LEFT JOIN public."CLIENTE"  c  ON c."ID_CLIENTE"  = u."ID_PERSONA"
      LEFT JOIN public."MIEMBRO"  m  ON m."ID_CLIENTE"  = u."ID_PERSONA"
      LEFT JOIN public."NIVEL_MEMBRESIA" nm ON nm."ID_NIVEL" = m."ID_NIVEL"
      ORDER BY u."ID_USUARIO" DESC
    `)
    res.json(rows)
  } catch (err) {
    console.error('❌ GET /api/usuarios error:', err.stack)
    next(err)
  }
})

// GET /api/usuarios/:id?tipo=empleado|cliente|miembro
router.get('/:id', authenticateToken, async (req, res, next) => {
  const { id } = req.params
  const tipo = (req.query.tipo || '').toLowerCase()
  try {
    // Datos base del usuario + persona
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

    if (!base.length) return res.status(404).json({ message: 'Usuario no encontrado' })

    const usuario = { ...base[0] }
    const idPersona = usuario.ID_PERSONA
    delete usuario.ID_PERSONA

    if (!idPersona) return res.json(usuario)

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
      Object.assign(usuario, rows[0] || {})
    }

    if (tipo === 'cliente' || tipo === 'miembro') {
      const { rows } = await db.query(`
        SELECT
          c."ESTADO_CLIENTE"        AS estado,
          c."GENERO"                AS genero,
          c."FECHA_NACIMIENTO"      AS fecha_nacimiento,
          c."DESCRIPCION_PERSONAL"  AS descripcion_personal
        FROM public."CLIENTE" c
        WHERE c."ID_CLIENTE" = $1
      `, [idPersona])
      Object.assign(usuario, rows[0] || {})
    }

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
      Object.assign(usuario, rows[0] || {})
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
    // Empleado
    id_puesto, turno, sueldo, fecha_contratacion,
    // Cliente
    genero, estado_cliente, descripcion_personal,
    // Miembro
    numero_miembro, id_nivel, puntos_fidelidad, fecha_inicio,
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
    const idPersona = u?.ID_PERSONA
    if (!idPersona) return res.status(404).json({ message: 'Usuario no encontrado' })

    await db.query(`
      UPDATE public."PERSONA"
      SET "NOMBRE_COMPLETO" = $1, "APELLIDOS" = $2
      WHERE "ID_PERSONA" = $3
    `, [nombre_completo, apellidos, idPersona])

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

    // 4. Datos específicos por tipo
    const t = tipo?.toLowerCase()

    if (t === 'empleado') {
      await db.query(`
        UPDATE public."EMPLEADO_PUESTO"
        SET "ID_PUESTO" = $1, "SUELDO" = $2
        WHERE "ID_EMPLEADO" = $3 AND "FECHA_FIN" >= CURRENT_DATE
      `, [id_puesto, sueldo, idPersona])
    }

    if (t === 'cliente' || t === 'miembro') {
      await db.query(`
        UPDATE public."CLIENTE"
        SET "GENERO" = $1, "ESTADO_CLIENTE" = $2, "DESCRIPCION_PERSONAL" = $3
        WHERE "ID_CLIENTE" = $4
      `, [genero, estado_cliente, descripcion_personal, idPersona])
    }

    if (t === 'miembro') {
      await db.query(`
        UPDATE public."MIEMBRO"
        SET "NUMERO_MIEMBRO" = $1, "ID_NIVEL" = $2,
            "PUNTOS_FIDELIDAD" = $3, "FECHA_INICIO" = $4
        WHERE "ID_CLIENTE" = $5
      `, [numero_miembro, id_nivel, puntos_fidelidad, fecha_inicio, idPersona])
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