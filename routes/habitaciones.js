import { Router } from 'express'
import * as db from '../db.js'

const router = Router()

/**
 * GET /api/habitaciones
 * Listado de todas las habitaciones con su tipo
 */
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT 
        h."ID_HABITACION",
        h."ID_HOSPEDAJE",
        h."ID_TIPO_HABITACION",
        h."CAPACIDAD_ADULTO",
        h."CAPACIDAD_NINOS",
        h."PRECIO_NOCHE",
        t."NOMBRE" AS "TIPO_HABITACION",
        EXISTS(
          SELECT 1 FROM public."DISPONIBILIDAD" d
          WHERE d."ID_HABITACION" = h."ID_HABITACION"
          AND d."ESTADO" = 'R'
        ) AS "RESERVADA"
      FROM public."HABITACION" h
      LEFT JOIN public."TIPO_HABITACION" t ON t."ID_TIPO_HABITACION" = h."ID_TIPO_HABITACION"
      ORDER BY h."ID_HABITACION" DESC
    `)
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/habitaciones/:id
 * ⚠️ CRÍTICO: Este endpoint estaba FALTANDO
 * Obtener una habitación específica
 */
router.get('/:id', async (req, res, next) => {
  const { id } = req.params

  try {
    const { rows: [hab] } = await db.query(`
      SELECT 
        h."ID_HABITACION",
        h."ID_HOSPEDAJE",
        h."ID_TIPO_HABITACION",
        h."CAPACIDAD_ADULTO",
        h."CAPACIDAD_NINOS",
        h."PRECIO_NOCHE",
        t."NOMBRE" AS "TIPO_HABITACION"
      FROM public."HABITACION" h
      LEFT JOIN public."TIPO_HABITACION" t ON t."ID_TIPO_HABITACION" = h."ID_TIPO_HABITACION"
      WHERE h."ID_HABITACION" = $1
    `, [id])

    if (!hab) {
      return res.status(404).json({ error: 'Habitación no encontrada' })
    }

    res.json(hab)
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/habitaciones
 * Crear una nueva habitación
 */
router.post('/', async (req, res, next) => {
  const { id_hospedaje, id_tipo_habitacion, capacidad_adulto, capacidad_ninos, precio_noche } = req.body

  try {
    // Validación
    if (!id_hospedaje || !id_tipo_habitacion) {
      return res.status(400).json({
        error: 'Campos requeridos: id_hospedaje, id_tipo_habitacion'
      })
    }

    if (capacidad_adulto == null || capacidad_ninos == null || precio_noche == null) {
      return res.status(400).json({
        error: 'Campos requeridos: capacidad_adulto, capacidad_ninos, precio_noche'
      })
    }

    // Verificar que el hospedaje existe
    const { rows: hospCheck } = await db.query(
      `SELECT "ID_HOSPEDAJE" FROM public."HOSPEDAJE" WHERE "ID_HOSPEDAJE" = $1`,
      [id_hospedaje]
    )
    if (!hospCheck.length) {
      return res.status(404).json({ error: 'Hospedaje no encontrado' })
    }

    const { rows: [hab] } = await db.query(`
      INSERT INTO public."HABITACION" 
      ("ID_HOSPEDAJE", "ID_TIPO_HABITACION", "CAPACIDAD_ADULTO", "CAPACIDAD_NINOS", "PRECIO_NOCHE")
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [id_hospedaje, id_tipo_habitacion, capacidad_adulto, capacidad_ninos, precio_noche])

    res.status(201).json(hab)
  } catch (err) {
    next(err)
  }
})

/**
 * PUT /api/habitaciones/:id
 * ⚠️ CRÍTICO: Debe devolver la habitación actualizada
 * Actualizar una habitación existente
 */
router.put('/:id', async (req, res, next) => {
  const { id } = req.params
  const { id_tipo_habitacion, capacidad_adulto, capacidad_ninos, precio_noche } = req.body

  try {
    // Validación
    if (capacidad_adulto == null || capacidad_ninos == null || precio_noche == null) {
      return res.status(400).json({
        error: 'Campos requeridos: capacidad_adulto, capacidad_ninos, precio_noche'
      })
    }

    // Verificar que existe
    const { rows: habCheck } = await db.query(
      `SELECT "ID_HABITACION" FROM public."HABITACION" WHERE "ID_HABITACION" = $1`,
      [id]
    )
    if (!habCheck.length) {
      return res.status(404).json({ error: 'Habitación no encontrada' })
    }

    // ✅ CORREGIDO: Usar RETURNING para obtener el registro actualizado
    const { rows: [hab] } = await db.query(`
      UPDATE public."HABITACION"
      SET 
        "ID_TIPO_HABITACION" = COALESCE($1, "ID_TIPO_HABITACION"),
        "CAPACIDAD_ADULTO" = $2,
        "CAPACIDAD_NINOS" = $3,
        "PRECIO_NOCHE" = $4
      WHERE "ID_HABITACION" = $5
      RETURNING *
    `, [id_tipo_habitacion || null, capacidad_adulto, capacidad_ninos, precio_noche, id])

    res.json(hab)
  } catch (err) {
    next(err)
  }
})

/**
 * PATCH /api/habitaciones/:id
 * Actualización parcial (solo los campos enviados)
 */
router.patch('/:id', async (req, res, next) => {
  const { id } = req.params
  const { id_tipo_habitacion, capacidad_adulto, capacidad_ninos, precio_noche } = req.body

  try {
    // Verificar que existe
    const { rows: habCheck } = await db.query(
      `SELECT "ID_HABITACION" FROM public."HABITACION" WHERE "ID_HABITACION" = $1`,
      [id]
    )
    if (!habCheck.length) {
      return res.status(404).json({ error: 'Habitación no encontrada' })
    }

    const { rows: [hab] } = await db.query(`
      UPDATE public."HABITACION"
      SET 
        "ID_TIPO_HABITACION" = COALESCE($1, "ID_TIPO_HABITACION"),
        "CAPACIDAD_ADULTO" = COALESCE($2, "CAPACIDAD_ADULTO"),
        "CAPACIDAD_NINOS" = COALESCE($3, "CAPACIDAD_NINOS"),
        "PRECIO_NOCHE" = COALESCE($4, "PRECIO_NOCHE")
      WHERE "ID_HABITACION" = $5
      RETURNING *
    `, [id_tipo_habitacion, capacidad_adulto, capacidad_ninos, precio_noche, id])

    res.json(hab)
  } catch (err) {
    next(err)
  }
})

/**
 * DELETE /api/habitaciones/:id
 * ⚠️ CRÍTICO: Debe validar existencia
 * Eliminar una habitación
 */
router.delete('/:id', async (req, res, next) => {
  const { id } = req.params

  try {
    // ✅ CORREGIDO: Usar RETURNING para confirmar que se eliminó
    const { rows } = await db.query(
      `DELETE FROM public."HABITACION" WHERE "ID_HABITACION" = $1 RETURNING "ID_HABITACION"`,
      [id]
    )

    if (!rows.length) {
      return res.status(404).json({ error: 'Habitación no encontrada' })
    }

    res.json({
      message: 'Habitación eliminada correctamente',
      id: rows[0].ID_HABITACION
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/habitaciones/hospedaje/:id_hospedaje/detalle
 * Obtener detalles de habitaciones de un hospedaje, con disponibilidad opcional por fechas.
 */
router.get('/hospedaje/:id_hospedaje/detalle', async (req, res, next) => {
  const { id_hospedaje } = req.params
  const { desde, hasta } = req.query

  try {
    const params = desde && hasta ? [id_hospedaje, desde, hasta] : [id_hospedaje]

    const { rows } = await db.query(`
      SELECT 
        h."ID_HABITACION",
        h."ID_HOSPEDAJE",
        h."CAPACIDAD_ADULTO",
        h."CAPACIDAD_NINOS",
        h."PRECIO_NOCHE",
        h."METROS_CUADRADOS",
        h."DESCRIPCION",
        t."NOMBRE" AS "TIPO_HABITACION",
        h."TIPO_CAMA",
        (
          SELECT json_agg(si."NOMBRE")
          FROM public."HABITACION_SERVICIO" hs
          JOIN public."SERVICIO_INCLUIDO" si ON si."ID_SERVICIO_INCLUIDO" = hs."ID_SERVICIO_INCLUIDO"
          WHERE hs."ID_HABITACION" = h."ID_HABITACION"
        ) AS "SERVICIOS",
        (
          SELECT json_agg(img."URL" ORDER BY img."ORDEN")
          FROM public."IMAGEN_HOSPEDAJE" img
          WHERE img."ID_HOSPEDAJE" = h."ID_HOSPEDAJE"
        ) AS "IMAGENES",
        COALESCE((
          SELECT MIN(d."CANTIDAD_DISPONIBLE")
          FROM public."DISPONIBILIDAD" d
          WHERE d."ID_HABITACION" = h."ID_HABITACION"
            AND d."FECHA" BETWEEN $2 AND $3
            AND d."ESTADO" = 'A'
        ), 0) AS "DISPONIBLE"
      FROM public."HABITACION" h
      LEFT JOIN public."TIPO_HABITACION" t ON t."ID_TIPO_HABITACION" = h."ID_TIPO_HABITACION"
      WHERE h."ID_HOSPEDAJE" = $1
      ORDER BY h."PRECIO_NOCHE" ASC
    `, params)

    res.json(rows)
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/habitaciones/hospedaje/:id_hospedaje
 * Obtener todas las habitaciones de un hospedaje específico
 */
router.get('/hospedaje/:id_hospedaje', async (req, res, next) => {
  const { id_hospedaje } = req.params

  try {
    const { rows } = await db.query(`
      SELECT 
        h."ID_HABITACION",
        h."ID_HOSPEDAJE",
        h."ID_TIPO_HABITACION",
        h."CAPACIDAD_ADULTO",
        h."CAPACIDAD_NINOS",
        h."PRECIO_NOCHE",
        t."NOMBRE" AS "TIPO_HABITACION"
      FROM public."HABITACION" h
      LEFT JOIN public."TIPO_HABITACION" t ON t."ID_TIPO_HABITACION" = h."ID_TIPO_HABITACION"
      WHERE h."ID_HOSPEDAJE" = $1
      ORDER BY h."ID_HABITACION" ASC
    `, [id_hospedaje])

    res.json(rows)
  } catch (err) {
    next(err)
  }
})

export default router
