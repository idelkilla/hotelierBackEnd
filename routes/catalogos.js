/**
 * NOTE: All routes here are prefixed with /api/catalogos in index.js
 * Ensure frontend calls include the /api prefix.
 */
import { Router } from 'express'
import * as db from '../db.js'
import { authenticateToken } from '../middleware/authMiddleware.js'

const router = Router()

// ── Helper genérico GET ──────────────────────────────────────────────────────
const makeGet = (sql) => async (_req, res, next) => {
  try {
    const { rows } = await db.query(sql)
    res.json(rows)
  } catch (err) { next(err) }
}

// ════════════════════════════════════════════════════════════════════════════
// HOSPEDAJE
// ════════════════════════════════════════════════════════════════════════════
router.get('/tipos-hospedaje', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT "ID_TIPO" as id, "NOMBRE_TIPO" as nombre
      FROM public."TIPO_HOSPEDAJE"
      ORDER BY "NOMBRE_TIPO" ASC
    `)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
router.post('/tipos-hospedaje', authenticateToken, async (req, res, next) => {
  try {
    const { NOMBRE_TIPO } = req.body
    const { rows: [r] } = await db.query(
      `INSERT INTO public."TIPO_HOSPEDAJE" ("NOMBRE_TIPO") VALUES ($1) RETURNING *`, [NOMBRE_TIPO]
    )
    res.status(201).json(r)
  } catch (err) { next(err) }
})
router.patch('/tipos-hospedaje/:id', authenticateToken, async (req, res, next) => {
  try {
    const { NOMBRE_TIPO } = req.body
    const { rows: [r] } = await db.query(
      `UPDATE public."TIPO_HOSPEDAJE" SET "NOMBRE_TIPO" = $1 WHERE "ID_TIPO" = $2 RETURNING *`,
      [NOMBRE_TIPO, req.params.id]
    )
    if (!r) return res.status(404).json({ message: 'No encontrado' })
    res.json(r)
  } catch (err) { next(err) }
})
router.delete('/tipos-hospedaje/:id', authenticateToken, async (req, res, next) => {
  try {
    await db.query(`DELETE FROM public."TIPO_HOSPEDAJE" WHERE "ID_TIPO" = $1`, [req.params.id])
    res.json({ message: 'Eliminado' })
  } catch (err) { next(err) }
})

// ════════════════════════════════════════════════════════════════════════════
// HABITACIÓN
// ════════════════════════════════════════════════════════════════════════════
router.get('/tipos-habitacion', authenticateToken, makeGet(
  `SELECT "ID_TIPO_HABITACION", "NOMBRE" FROM public."TIPO_HABITACION" ORDER BY "NOMBRE"`
))
router.post('/tipos-habitacion', authenticateToken, async (req, res, next) => {
  try {
    const { NOMBRE } = req.body
    const { rows: [r] } = await db.query(
      `INSERT INTO public."TIPO_HABITACION" ("NOMBRE") VALUES ($1) RETURNING *`, [NOMBRE]
    )
    res.status(201).json(r)
  } catch (err) { next(err) }
})
router.patch('/tipos-habitacion/:id', authenticateToken, async (req, res, next) => {
  try {
    const { NOMBRE } = req.body
    const { rows: [r] } = await db.query(
      `UPDATE public."TIPO_HABITACION" SET "NOMBRE" = $1 WHERE "ID_TIPO_HABITACION" = $2 RETURNING *`,
      [NOMBRE, req.params.id]
    )
    if (!r) return res.status(404).json({ message: 'No encontrado' })
    res.json(r)
  } catch (err) { next(err) }
})
router.delete('/tipos-habitacion/:id', authenticateToken, async (req, res, next) => {
  try {
    await db.query(`DELETE FROM public."TIPO_HABITACION" WHERE "ID_TIPO_HABITACION" = $1`, [req.params.id])
    res.json({ message: 'Eliminado' })
  } catch (err) { next(err) }
})

// ════════════════════════════════════════════════════════════════════════════
// SERVICIOS INCLUIDOS
// ════════════════════════════════════════════════════════════════════════════
router.get('/servicios-incluidos', authenticateToken, makeGet(
  `SELECT "ID_SERVICIO_INCLUIDO", "NOMBRE" FROM public."SERVICIO_INCLUIDO" ORDER BY "NOMBRE"`
))
router.post('/servicios-incluidos', authenticateToken, async (req, res, next) => {
  try {
    const { NOMBRE } = req.body
    const { rows: [r] } = await db.query(
      `INSERT INTO public."SERVICIO_INCLUIDO" ("NOMBRE") VALUES ($1) RETURNING *`, [NOMBRE]
    )
    res.status(201).json(r)
  } catch (err) { next(err) }
})
router.patch('/servicios-incluidos/:id', authenticateToken, async (req, res, next) => {
  try {
    const { NOMBRE } = req.body
    const { rows: [r] } = await db.query(
      `UPDATE public."SERVICIO_INCLUIDO" SET "NOMBRE" = $1 WHERE "ID_SERVICIO_INCLUIDO" = $2 RETURNING *`,
      [NOMBRE, req.params.id]
    )
    if (!r) return res.status(404).json({ message: 'No encontrado' })
    res.json(r)
  } catch (err) { next(err) }
})
router.delete('/servicios-incluidos/:id', authenticateToken, async (req, res, next) => {
  try {
    await db.query(`DELETE FROM public."SERVICIO_INCLUIDO" WHERE "ID_SERVICIO_INCLUIDO" = $1`, [req.params.id])
    res.json({ message: 'Eliminado' })
  } catch (err) { next(err) }
})

// ════════════════════════════════════════════════════════════════════════════
// ESTADOS DE RESERVA
// ════════════════════════════════════════════════════════════════════════════
router.get('/estados-reserva', authenticateToken, makeGet(
  `SELECT "ID_ESTADO", "ESTADO" FROM public."ESTADO_RESERVA" ORDER BY "ESTADO"`
))
router.post('/estados-reserva', authenticateToken, async (req, res, next) => {
  try {
    const { ESTADO } = req.body
    // ESTADO_RESERVA no usa identity, necesita ID manual — ajusta si usas sequence
    const { rows: [{ max }] } = await db.query(`SELECT COALESCE(MAX("ID_ESTADO"), 0) + 1 AS max FROM public."ESTADO_RESERVA"`)
    const { rows: [r] } = await db.query(
      `INSERT INTO public."ESTADO_RESERVA" ("ID_ESTADO", "ESTADO") VALUES ($1, $2) RETURNING *`,
      [max, ESTADO]
    )
    res.status(201).json(r)
  } catch (err) { next(err) }
})
router.patch('/estados-reserva/:id', authenticateToken, async (req, res, next) => {
  try {
    const { ESTADO } = req.body
    const { rows: [r] } = await db.query(
      `UPDATE public."ESTADO_RESERVA" SET "ESTADO" = $1 WHERE "ID_ESTADO" = $2 RETURNING *`,
      [ESTADO, req.params.id]
    )
    if (!r) return res.status(404).json({ message: 'No encontrado' })
    res.json(r)
  } catch (err) { next(err) }
})
router.delete('/estados-reserva/:id', authenticateToken, async (req, res, next) => {
  try {
    await db.query(`DELETE FROM public."ESTADO_RESERVA" WHERE "ID_ESTADO" = $1`, [req.params.id])
    res.json({ message: 'Eliminado' })
  } catch (err) { next(err) }
})

// ════════════════════════════════════════════════════════════════════════════
// NIVELES DE MEMBRESÍA
// ════════════════════════════════════════════════════════════════════════════
router.get('/niveles-membresia', authenticateToken, makeGet(
  `SELECT "ID_NIVEL", "NOMBRE_NIVEL", "PUNTOS_MINIMOS", "DESCRIPCION"
   FROM public."NIVEL_MEMBRESIA" ORDER BY "PUNTOS_MINIMOS"`
))
router.post('/niveles-membresia', authenticateToken, async (req, res, next) => {
  try {
    const { NOMBRE_NIVEL, PUNTOS_MINIMOS, DESCRIPCION } = req.body
    const { rows: [r] } = await db.query(
      `INSERT INTO public."NIVEL_MEMBRESIA" ("NOMBRE_NIVEL", "PUNTOS_MINIMOS", "DESCRIPCION")
       VALUES ($1, $2, $3) RETURNING *`,
      [NOMBRE_NIVEL, PUNTOS_MINIMOS ?? 0, DESCRIPCION || null]
    )
    res.status(201).json(r)
  } catch (err) { next(err) }
})
router.patch('/niveles-membresia/:id', authenticateToken, async (req, res, next) => {
  try {
    const { NOMBRE_NIVEL, PUNTOS_MINIMOS, DESCRIPCION } = req.body
    const { rows: [r] } = await db.query(
      `UPDATE public."NIVEL_MEMBRESIA"
       SET "NOMBRE_NIVEL"   = COALESCE($1, "NOMBRE_NIVEL"),
           "PUNTOS_MINIMOS" = COALESCE($2, "PUNTOS_MINIMOS"),
           "DESCRIPCION"    = COALESCE($3, "DESCRIPCION")
       WHERE "ID_NIVEL" = $4 RETURNING *`,
      [NOMBRE_NIVEL, PUNTOS_MINIMOS, DESCRIPCION, req.params.id]
    )
    if (!r) return res.status(404).json({ message: 'No encontrado' })
    res.json(r)
  } catch (err) { next(err) }
})
router.delete('/niveles-membresia/:id', authenticateToken, async (req, res, next) => {
  try {
    await db.query(`DELETE FROM public."NIVEL_MEMBRESIA" WHERE "ID_NIVEL" = $1`, [req.params.id])
    res.json({ message: 'Eliminado' })
  } catch (err) { next(err) }
})

// ════════════════════════════════════════════════════════════════════════════
// TIPOS DE UBICACIÓN
// ════════════════════════════════════════════════════════════════════════════
router.get('/tipos-ubicacion', authenticateToken, makeGet(
  `SELECT "ID_TIPO", "NOMBRE" FROM public."TIPO_UBICACION" ORDER BY "NOMBRE"`
))
router.post('/tipos-ubicacion', authenticateToken, async (req, res, next) => {
  try {
    const { NOMBRE } = req.body
    const { rows: [r] } = await db.query(
      `INSERT INTO public."TIPO_UBICACION" ("NOMBRE") VALUES ($1) RETURNING *`, [NOMBRE]
    )
    res.status(201).json(r)
  } catch (err) { next(err) }
})
router.patch('/tipos-ubicacion/:id', authenticateToken, async (req, res, next) => {
  try {
    const { NOMBRE } = req.body
    const { rows: [r] } = await db.query(
      `UPDATE public."TIPO_UBICACION" SET "NOMBRE" = $1 WHERE "ID_TIPO" = $2 RETURNING *`,
      [NOMBRE, req.params.id]
    )
    if (!r) return res.status(404).json({ message: 'No encontrado' })
    res.json(r)
  } catch (err) { next(err) }
})
router.delete('/tipos-ubicacion/:id', authenticateToken, async (req, res, next) => {
  try {
    await db.query(`DELETE FROM public."TIPO_UBICACION" WHERE "ID_TIPO" = $1`, [req.params.id])
    res.json({ message: 'Eliminado' })
  } catch (err) { next(err) }
})

// ════════════════════════════════════════════════════════════════════════════
// CATÁLOGOS DE SOLO LECTURA (sin cambios)
// ════════════════════════════════════════════════════════════════════════════
router.get('/paises', makeGet(
  `SELECT p."ID_PAIS", p."NOMBRE", p."ISO_CODE", p."MONEDA_LOCAL",
          p."CODIGO_TELEFONO", c."NOMBRE" AS "CONTINENTE"
   FROM public."PAIS" p
   JOIN public."CONTINENTE" c ON c."ID_CONTINENTE" = p."ID_CONTINENTE"
   ORDER BY p."NOMBRE"`
))

router.get('/ciudades', async (req, res, next) => {
  const idPais = req.query.id_pais
  if (!idPais) return res.status(400).json({ message: 'id_pais requerido' })
  try {
    const { rows } = await db.query(
      `SELECT "ID_CIUDAD", "NOMBRE" FROM public."CIUDAD" WHERE "ID_PAIS" = $1 ORDER BY "NOMBRE"`,
      [idPais]
    )
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/proveedores', makeGet(
  `SELECT p."ID_PROVEEDOR", p."NOMBRE_LEGAL", p."RNC", t."NOMBRE_TIPO" AS "TIPO_PROVEEDOR"
   FROM public."PROVEEDOR" p
   JOIN public."TIPO_PROVEEDOR" t ON t."ID_TIPO" = p."ID_TIPO"
   ORDER BY p."NOMBRE_LEGAL"`
))

router.get('/tipos-proveedor', makeGet(
  `SELECT "ID_TIPO", "NOMBRE_TIPO" FROM public."TIPO_PROVEEDOR" ORDER BY "NOMBRE_TIPO"`
))

router.get('/puestos', authenticateToken, makeGet(
  `SELECT "ID_PUESTO", "NOMBRE_PUESTO", "SUELDO_BASE" FROM public."PUESTO" ORDER BY "NOMBRE_PUESTO"`
))

router.get('/idiomas', makeGet(
  `SELECT "ID_IDIOMA", "NOMBRE_IDIOMA" FROM public."IDIOMA" ORDER BY "NOMBRE_IDIOMA"`
))

router.get('/estados-civiles', makeGet(
  `SELECT "ID_ESTADO_CIVIL", "NOMBRE_ESTADO" FROM public."ESTADO_CIVIL" ORDER BY "NOMBRE_ESTADO"`
))

router.get('/tipos-documentacion', makeGet(
  `SELECT "ID_TIPO", "TIPO" FROM public."TIPO_DOCUMENTACION" ORDER BY "TIPO"`
))

router.get('/tipos-telefono', makeGet(
  `SELECT "ID_TIPO", "NOMBRE" FROM public."TIPO_TELEFONO" ORDER BY "NOMBRE"`
))

router.get('/tipos-correo', makeGet(
  `SELECT "ID_TIPO", "NOMBRE" FROM public."TIPO_CORREO_ELECTRONICO" ORDER BY "NOMBRE"`
))

export default router