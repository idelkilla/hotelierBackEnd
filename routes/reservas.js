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
        r."ID_RESERVA",
        r."FECHA_INICIO",
        r."FECHA_FIN",
        r."ID_ESTADO",
        r."ID_EMPLEADO",
        r."ID_ORIGEN",
        r."ID_DESTINO",
        er."ESTADO"                             AS estado_nombre,
        p."NOMBRE_COMPLETO"                     AS cliente_nombre,
        uo."NOMBRE"                             AS origen_nombre,
        ud."NOMBRE"                             AS destino_nombre,
        pe."NOMBRE_COMPLETO"                    AS empleado_nombre
      FROM public."RESERVA" r
      LEFT JOIN public."ESTADO_RESERVA" er ON er."ID_ESTADO" = r."ID_ESTADO"
      LEFT JOIN public."CLIENTE" c         ON c."ID_CLIENTE" = r."ID_CLIENTE"
      LEFT JOIN public."PERSONA" p         ON p."ID_PERSONA" = c."ID_CLIENTE"
      LEFT JOIN public."EMPLEADO" em  ON em."ID_EMPLEADO" = r."ID_EMPLEADO"
      LEFT JOIN public."PERSONA" pe   ON pe."ID_PERSONA" = em."ID_PERSONA"
      LEFT JOIN public."UBICACION" uo ON uo."ID_UBICACION" = r."ID_ORIGEN"
      LEFT JOIN public."UBICACION" ud ON ud."ID_UBICACION" = r."ID_DESTINO"
      ORDER BY r."FECHA_INICIO" DESC
      LIMIT 50
    `)
    res.json(rows)
  } catch (err) {
    console.error('Error en GET /api/reservas:', err)
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
    console.error(`Error en GET /api/reservas/${id}/detalles:`, err)
    next(err)
  }
})

/**
 * PATCH /api/reservas/:id/estado
 * Actualiza el estado de una reserva (ej: de Pendiente a Confirmada).
 */
router.patch('/:id/estado', async (req, res, next) => {
  const { id } = req.params
  let { ID_ESTADO } = req.body

  // Validamos que el ID y el nuevo estado no sean nulos o vacíos
  if (!id || ID_ESTADO === undefined || ID_ESTADO === null || ID_ESTADO === "") {
    return res.status(400).json({ 
      message: 'ID de reserva o nuevo estado faltante',
      received: { id, ID_ESTADO, body: req.body }
    })
  }

  try {
    await db.query(`
        UPDATE public."RESERVA"
        SET "ID_ESTADO" = $1
        WHERE "ID_RESERVA" = $2
    `, [ID_ESTADO, id])
    res.json({ message: 'Estado actualizado correctamente' })
  } catch (err) {
    console.error(`Error en PATCH /api/reservas/${id}/estado:`, err)
    next(err)
  }
})

export default router