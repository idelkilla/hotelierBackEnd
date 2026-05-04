import { Router } from 'express'
import * as db from '../db.js'
import { authenticateToken } from '../middleware/authMiddleware.js'

const router = Router()

// GET /api/usuarios — listado unificado empleados + clientes + miembros
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        u."ID_USUARIO"                        AS id,
        p."NOMBRE_COMPLETO"                   AS nombre,
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
    console.error('❌ /api/usuarios error:', err.message)
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
        p."NOMBRE_COMPLETO"      AS nombre_completo,
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
    const idPersona = await db.query(
      `SELECT "ID_PERSONA" FROM public."USUARIO" WHERE "ID_USUARIO" = $1`, [id]
    ).then(r => r.rows[0]?.ID_PERSONA)

    if (tipo === 'empleado' && idPersona) {
      const { rows: emp } = await db.query(`
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
        LIMIT 1
      `, [idPersona])
      Object.assign(usuario, emp[0] || {})
    }

    if ((tipo === 'cliente' || tipo === 'miembro') && idPersona) {
      const { rows: cli } = await db.query(`
        SELECT
          c."ESTADO_CLIENTE"        AS estado,
          c."GENERO"                AS genero,
          c."DESCRIPCION_PERSONAL"  AS descripcion_personal
        FROM public."CLIENTE" c
        WHERE c."ID_CLIENTE" = $1
      `, [idPersona])
      Object.assign(usuario, cli[0] || {})
    }

    if (tipo === 'miembro' && idPersona) {
      const { rows: mem } = await db.query(`
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
      Object.assign(usuario, mem[0] || {})
    }

    res.json(usuario)
  } catch (err) {
    console.error('❌ /api/usuarios/:id error:', err.message)
    next(err)
  }
})

export default router