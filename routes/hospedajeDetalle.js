import { Router } from 'express'
import { getPool } from '../db.js'
import { authenticateToken } from '../middleware/authMiddleware.js'

const router = Router()

// GET /api/hospedaje/:id
router.get('/:id', async (req, res) => {
  const pool = getPool()
  const { id } = req.params
  try {
    const { rows } = await pool.query(`
      SELECT
        s."ID_SERVICIO"        AS id,
        p."NOMBRE_LEGAL"       AS nombre,
        h."DESCRIPCION"        AS descripcion,
        th."NOMBRE_TIPO"       AS tipo_hospedaje,
        u."NOMBRE"             AS ubicacion,
        c."NOMBRE"             AS ciudad,
        pa."NOMBRE"            AS pais,
        h."CHECKIN",
        h."CHECKOUT",
        h."CANCELACION",
        h."MASCOTAS",
        h."FUMAR"
      FROM "HOSPEDAJE" h
      JOIN "SERVICIO"       s  ON s."ID_SERVICIO"  = h."ID_HOSPEDAJE"
      JOIN "PROVEEDOR"      p  ON p."ID_PROVEEDOR" = s."ID_PROVEEDOR"
      JOIN "TIPO_HOSPEDAJE" th ON th."ID_TIPO"     = h."ID_TIPO"
      JOIN "UBICACION"      u  ON u."ID_UBICACION" = h."ID_UBICACION"
      JOIN "CIUDAD"         c  ON c."ID_CIUDAD"    = u."ID_CIUDAD"
      JOIN "PAIS"           pa ON pa."ID_PAIS"     = c."ID_PAIS"
      WHERE h."ID_HOSPEDAJE" = $1
    `, [id])
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' })
    res.json(rows[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/hospedaje/:id/servicios
router.get('/:id/servicios', async (req, res) => {
  const pool = getPool()
  const { id } = req.params
  try {
    const { rows } = await pool.query(`
      SELECT si."NOMBRE" AS nombre
      FROM "HOSPEDAJE_SERVICIO" hs
      JOIN "SERVICIO_INCLUIDO" si
        ON si."ID_SERVICIO_INCLUIDO" = hs."ID_SERVICIO_INCLUIDO"
      WHERE hs."ID_HOSPEDAJE" = $1
    `, [id])
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/hospedaje/:id/imagenes
router.get('/:id/imagenes', async (req, res) => {
  const pool = getPool()
  const { id } = req.params
  try {
    const { rows } = await pool.query(`
      SELECT "URL", "ORDEN", "ALT_TEXT"
      FROM "IMAGEN_HOSPEDAJE"
      WHERE "ID_HOSPEDAJE" = $1
      ORDER BY "ORDEN"
    `, [id])
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/hospedaje/:id/anfitrion
router.get('/:id/anfitrion', async (req, res) => {
  const pool = getPool()
  const { id } = req.params
  try {
    const { rows } = await pool.query(`
      SELECT
        per."NOMBRE_COMPLETO"                               AS nombre,
        per."APELLIDOS",
        car."NOMBRE_CARGO"                                  AS cargo,
        EXTRACT(YEAR FROM NOW()) -
        EXTRACT(YEAR FROM MIN(con."FECHA_INICIO"))          AS anios_en_plataforma
      FROM "RESPONSABLE" r
      JOIN "PERSONA"  per ON per."ID_PERSONA" = r."ID_PERSONA"
      JOIN "CARGO"    car ON car."ID_CARGO"   = r."ID_CARGO"
      LEFT JOIN "CONTRATO" con ON con."ID_PROVEEDOR" = r."ID_PROVEEDOR"
      WHERE r."ID_PROVEEDOR" = (
        SELECT "ID_PROVEEDOR" FROM "SERVICIO" WHERE "ID_SERVICIO" = $1
      )
      GROUP BY per."NOMBRE_COMPLETO", per."APELLIDOS", car."NOMBRE_CARGO"
      LIMIT 1
    `, [id])
    
    // Retornamos 200 con null si no hay datos, evitando el error 404 en consola.
    if (!rows.length) return res.json(null)
    
    res.json(rows[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/hospedaje/:id/disponibilidad?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/:id/disponibilidad', async (req, res) => {
  const pool = getPool()
  const { id } = req.params
  const { desde, hasta } = req.query
  if (!desde || !hasta)
    return res.status(400).json({ error: 'Faltan parámetros desde y hasta' })
  try {
    const { rows } = await pool.query(`
      SELECT
        hab."ID_HABITACION",
        th."NOMBRE"                                        AS tipo_habitacion,
        hab."CAPACIDAD_ADULTO",
        hab."CAPACIDAD_NINOS",
        hab."PRECIO_NOCHE",
        COALESCE(d."PRECIO_AJUSTADO", hab."PRECIO_NOCHE") AS precio_efectivo,
        d."CANTIDAD_DISPONIBLE"
      FROM "HABITACION" hab
      JOIN "TIPO_HABITACION" th ON th."ID_TIPO_HABITACION" = hab."ID_TIPO_HABITACION"
      JOIN "DISPONIBILIDAD"  d  ON d."ID_HABITACION"       = hab."ID_HABITACION"
      WHERE hab."ID_HOSPEDAJE" = $1
        AND d."FECHA" BETWEEN $2 AND $3
        AND d."ESTADO" = 'A'
        AND d."CANTIDAD_DISPONIBLE" > 0
      ORDER BY hab."ID_HABITACION"
    `, [id, desde, hasta])
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/hospedaje/:id/habitaciones-base
router.get('/:id/habitaciones-base', async (req, res) => {
  const pool = getPool()
  const { id } = req.params
  try {
    const { rows } = await pool.query(`
      SELECT 
        hab."ID_HABITACION" AS id,
        th."NOMBRE"         AS tipo_habitacion,
        hab."PRECIO_NOCHE"  AS precio_noche,
        hab."CAPACIDAD_ADULTO",
        hab."CAPACIDAD_NINOS"
      FROM "HABITACION" hab
      JOIN "TIPO_HABITACION" th ON th."ID_TIPO_HABITACION" = hab."ID_TIPO_HABITACION"
      WHERE hab."ID_HOSPEDAJE" = $1
      ORDER BY hab."PRECIO_NOCHE" ASC
    `, [id])
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ✅ GET sin autenticación (público)
// GET /api/hospedaje/:id/resenas
router.get('/:id/resenas', async (req, res) => {
  const pool = getPool()
  const { id } = req.params
  try {
    const { rows } = await pool.query(`
      SELECT
        r."ID_RESENA"                                    AS id,
        COALESCE(p."NOMBRE_COMPLETO", 'Anónimo')        AS nombre,
        COALESCE(p."APELLIDOS", '')                      AS apellidos,
        SUBSTRING(COALESCE(p."NOMBRE_COMPLETO", 'A'), 1, 1) || 
        SUBSTRING(COALESCE(p."APELLIDOS", '?'), 1, 1)   AS initials,
        COALESCE(pa."NOMBRE", 'Desconocido')             AS pais,
        'Reciente'                                       AS fecha,
        ROUND(r."CALIFICACION"::NUMERIC)::INTEGER        AS calificacion,
        r."COMENTARIO"                                   AS comentario,
        0                                                AS likes
      FROM "RESENA" r
      LEFT JOIN "CLIENTE"   c  ON c."ID_CLIENTE"   = r."ID_CLIENTE"
      LEFT JOIN "PERSONA"   p  ON p."ID_PERSONA"   = c."ID_CLIENTE"
      LEFT JOIN "UBICACION" u  ON u."ID_UBICACION" = p."ID_UBICACION"
      LEFT JOIN "CIUDAD"    ci ON ci."ID_CIUDAD"   = u."ID_CIUDAD"
      LEFT JOIN "PAIS"      pa ON pa."ID_PAIS"     = ci."ID_PAIS"
      WHERE r."ID_SERVICIO" = $1
      ORDER BY r."ID_RESENA" DESC
    `, [id])
    res.json(rows)
  } catch (e) {
    console.error('❌ ERROR reseñas:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ✅ POST con autenticación (requiere sesión)
// POST /api/hospedaje/:id/resenas
router.post('/:id/resenas', authenticateToken, async (req, res) => {
  const pool = getPool()
  const { id } = req.params
  const { calificacion, comentario } = req.body

  if (!calificacion || calificacion < 1 || calificacion > 5)
    return res.status(400).json({ error: 'Calificación inválida (1–5)' })
  if (!comentario?.trim())
    return res.status(400).json({ error: 'El comentario es requerido' })

  // id_persona viene del token JWT (authMiddleware lo adjunta a req.user)
  const idPersona = req.user?.id_persona
  if (!idPersona)
    return res.status(401).json({ error: 'No autenticado' })

  try {
    // Obtener id_cliente a partir de id_persona
    const { rows: clientRows } = await pool.query(
      `SELECT "ID_CLIENTE" FROM public."CLIENTE" WHERE "ID_CLIENTE" = $1`,
      [idPersona]
    )
    if (!clientRows.length)
      return res.status(403).json({ error: 'No tienes perfil de cliente' })

    const idCliente = clientRows[0].ID_CLIENTE

    // ID manual seguro (hasta que agregues GENERATED IDENTITY a la tabla)
    const { rows: [{ next_id }] } = await pool.query(
      `SELECT COALESCE(MAX("ID_RESENA"), 0) + 1 AS next_id FROM public."RESENA"`
    )

    await pool.query(
      `INSERT INTO public."RESENA" ("ID_RESENA", "COMENTARIO", "CALIFICACION", "ID_CLIENTE", "ID_SERVICIO")
       VALUES ($1, $2, $3, $4, $5)`,
      [next_id, comentario.trim(), calificacion, idCliente, id]
    )

    res.status(201).json({ ok: true, id_resena: next_id })
  } catch (e) {
    console.error('❌ ERROR publicando reseña:', e.message)
    res.status(500).json({ error: e.message })
  }
})

export default router