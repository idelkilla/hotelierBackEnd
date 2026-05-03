import { Router } from 'express'
import * as db from '../db.js'

const router = Router()

/**
 * GET /api/reservas
 * Obtiene el listado completo de reservas con nombres de clientes, 
 * ubicaciones y estados procesados.
 */
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT r."ID_RESERVA", r."FECHA_INICIO", r."FECHA_FIN",
             e."ESTADO" AS "ESTADO"
      FROM public."RESERVA" r
      JOIN public."ESTADO_RESERVA" e ON e."ID_ESTADO" = r."ID_ESTADO"
      ORDER BY r."ID_RESERVA" DESC
    `)
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/reservas/:id/detalles
 * Obtiene los detalles de alojamiento (noches, precios) de una reserva específica.
 */
router.get('/:id/detalles', async (req, res, next) => {
  const { id } = req.params
  try {
    const { rows } = await db.query(`
        SELECT 
            dr."ID_DETALLE",
            dr."CANTIDAD_NOCHE",
            dr."FECHA_INICIO",
            dr."FECHA_FIN",
            dr."PRECIO_TOTAL"
        FROM public."DETALLE_RESERVA" dr
        WHERE dr."ID_RESERVA" = $1
    `, [id])
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

/**
 * PATCH /api/reservas/:id/estado
 * Actualiza el estado de una reserva (ej: de Pendiente a Confirmada).
 */
router.patch('/:id/estado', async (req, res, next) => {
  const { id } = req.params
  const { ID_ESTADO } = req.body
  try {
    await db.query(`
        UPDATE public."RESERVA"
        SET "ID_ESTADO" = $1
        WHERE "ID_RESERVA" = $2
    `, [ID_ESTADO, id])
    res.json({ message: 'Estado actualizado correctamente' })
  } catch (err) {
    next(err)
  }
})

export default router