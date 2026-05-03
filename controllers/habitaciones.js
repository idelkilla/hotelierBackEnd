import { Router } from 'express'
import * as db from '../db.js'

const router = Router()

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