import { Router } from 'express'
import * as db from '../db.js'

const router = Router()

/**
 * GET /api/dashboard/stats
 * Retorna los totales para el dashboard administrativo
 */
router.get('/stats', async (req, res, next) => {
  try {
    const queries = {
      usuarios:     'SELECT COUNT(*) FROM public."USUARIO"',
      hospedajes:   'SELECT COUNT(*) FROM public."HOSPEDAJE"',
      reservas:     'SELECT COUNT(*) FROM public."RESERVA"',
      clientes:     'SELECT COUNT(*) FROM public."CLIENTE"',
      miembros:     'SELECT COUNT(*) FROM public."MIEMBRO"',
      actividades:  'SELECT COUNT(*) FROM public."ACTIVIDADES"',
      habitaciones: 'SELECT COUNT(*) FROM public."HABITACION"'
    }

    const stats = {}
    for (const [key, sql] of Object.entries(queries)) {
      const { rows } = await db.query(sql)
      stats[key] = parseInt(rows[0].count, 10)
    }
    stats.actividad_total = stats.reservas + stats.hospedajes + (stats.actividades || 0)

    res.json(stats)
  } catch (err) { next(err) }
})

export default router