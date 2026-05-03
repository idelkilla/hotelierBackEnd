import { Router } from 'express'
import * as db from '../db.js'

const router = Router()

/**
 * GET /api/reservas
 * Obtiene el listado completo de reservas con nombres de clientes, 
 * ubicaciones y estados procesados.
 */
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
        SELECT 
            r."ID_RESERVA", 
            p_cli."NOMBRE_COMPLETO" as cliente_nombre,
            u_ori."NOMBRE" as origen_nombre,
            u_des."NOMBRE" as destino_nombre,
            r."FECHA_INICIO", 
            r."FECHA_FIN", 
            er."ESTADO" as estado_nombre,
            p_emp."NOMBRE_COMPLETO" as empleado_nombre,
            r."ID_ESTADO"
        FROM public."RESERVA" r
        LEFT JOIN public."CLIENTE" c ON r."ID_CLIENTE" = c."ID_CLIENTE"
        LEFT JOIN public."PERSONA" p_cli ON c."ID_PERSONA" = p_cli."ID_PERSONA"
        LEFT JOIN public."UBICACION" u_ori ON r."ID_ORIGEN" = u_ori."ID_UBICACION"
        LEFT JOIN public."UBICACION" u_des ON r."ID_DESTINO" = u_des."ID_UBICACION"
        LEFT JOIN public."ESTADO_RESERVA" er ON r."ID_ESTADO" = er."ID_ESTADO"
        LEFT JOIN public."EMPLEADO" e ON r."ID_EMPLEADO" = e."ID_EMPLEADO"
        LEFT JOIN public."PERSONA" p_emp ON e."ID_PERSONA" = p_emp."ID_PERSONA"
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