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
      SELECT
        r."ID_RESERVA"                         AS id_reserva,
        r."FECHA_INICIO"                        AS fecha_inicio,
        r."FECHA_FIN"                           AS fecha_fin,
        er."ESTADO"                             AS estado,
        p."NOMBRE_COMPLETO"                     AS cliente_nombre,
        uo."NOMBRE"                             AS origen,
        ud."NOMBRE"                             AS destino
      FROM public."RESERVA" r
      JOIN public."ESTADO_RESERVA" er ON er."ID_ESTADO" = r."ID_ESTADO"
      JOIN public."CLIENTE" c         ON c."ID_CLIENTE" = r."ID_CLIENTE"
      JOIN public."PERSONA" p         ON p."ID_PERSONA" = c."ID_CLIENTE"
      LEFT JOIN public."UBICACION" uo ON uo."ID_UBICACION" = r."ID_ORIGEN"
      LEFT JOIN public."UBICACION" ud ON ud."ID_UBICACION" = r."ID_DESTINO"
      ORDER BY r."FECHA_INICIO" DESC
      LIMIT 50
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