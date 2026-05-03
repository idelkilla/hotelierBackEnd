import { Router } from 'express'
import * as db from '../db.js'

const router = Router()

/**
 * GET /api/habitaciones
 * Obtiene el listado de todas las habitaciones con su tipo y estado de reserva.
 */
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT h."ID_HABITACION", h."CAPACIDAD_ADULTO", h."CAPACIDAD_NINOS",
             h."PRECIO_NOCHE", h."ID_HOSPEDAJE",
             t."NOMBRE" AS "TIPO_HABITACION",
             EXISTS(
               SELECT 1 FROM public."DISPONIBILIDAD" d
               WHERE d."ID_HABITACION" = h."ID_HABITACION"
               AND d."ESTADO" = 'R'
             ) AS "RESERVADA"
      FROM public."HABITACION" h
      JOIN public."TIPO_HABITACION" t ON t."ID_TIPO_HABITACION" = h."ID_TIPO_HABITACION"
    `)
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

/**
 * PUT /api/habitaciones/:id
 * Actualiza una habitación existente
 */
router.put('/:id', async (req, res, next) => {
    const { id } = req.params
    const { id_tipo_habitacion, capacidad_adulto, capacidad_ninos, precio_noche } = req.body
    try {
        await db.query(`
            UPDATE public."HABITACION"
            SET "ID_TIPO_HABITACION" = $1, "CAPACIDAD_ADULTO" = $2, "CAPACIDAD_NINOS" = $3, "PRECIO_NOCHE" = $4
            WHERE "ID_HABITACION" = $5`,
            [id_tipo_habitacion, capacidad_adulto, capacidad_ninos, precio_noche, id])
        res.json({ message: 'Habitación actualizada' })
    } catch (err) { next(err) }
})

/**
 * DELETE /api/habitaciones/:id
 */
router.delete('/:id', async (req, res, next) => {
    try {
        await db.query('DELETE FROM public."HABITACION" WHERE "ID_HABITACION" = $1', [req.params.id])
        res.json({ message: 'Habitación eliminada' })
    } catch (err) { next(err) }
})

export default router