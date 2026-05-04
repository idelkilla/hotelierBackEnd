import { Router } from 'express'
import * as db from '../db.js'
import { authenticateToken } from '../middleware/authMiddleware.js'

const router = Router()

/**
 * GET /api/usuarios
 * Retorna una lista unificada de todos los usuarios (Empleados, Clientes, Miembros)
 * para el panel administrativo.
 */
router.get('/', authenticateToken, async (_req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        e."ID_EMPLEADO"     AS id,
        p."NOMBRE_COMPLETO" AS nombre,
        u."CORREO_ELECTRONICO" AS correo,
        'Activo'            AS estado,
        'Empleado'          AS tipo,
        NULL                AS nivel_membresia
      FROM public."EMPLEADO" e
      JOIN public."PERSONA" p  ON p."ID_PERSONA"  = e."ID_PERSONA"
      JOIN public."USUARIO" u  ON u."ID_PERSONA"  = e."ID_PERSONA"

      UNION ALL

      SELECT
        c."ID_CLIENTE"      AS id,
        p."NOMBRE_COMPLETO" AS nombre,
        u."CORREO_ELECTRONICO" AS correo,
        c."ESTADO_CLIENTE"  AS estado,
        'Cliente'           AS tipo,
        NULL                AS nivel_membresia
      FROM public."CLIENTE" c
      JOIN public."PERSONA" p  ON p."ID_PERSONA" = c."ID_CLIENTE"
      JOIN public."USUARIO" u  ON u."ID_PERSONA" = c."ID_CLIENTE"
      WHERE NOT EXISTS (
        SELECT 1 FROM public."MIEMBRO" m WHERE m."ID_CLIENTE" = c."ID_CLIENTE"
      )

      UNION ALL

      SELECT
        c."ID_CLIENTE"      AS id,
        p."NOMBRE_COMPLETO" AS nombre,
        u."CORREO_ELECTRONICO" AS correo,
        c."ESTADO_CLIENTE"  AS estado,
        'Miembro'           AS tipo,
        nm."NOMBRE_NIVEL"   AS nivel_membresia
      FROM public."MIEMBRO" m
      JOIN public."CLIENTE" c        ON c."ID_CLIENTE"  = m."ID_CLIENTE"
      JOIN public."PERSONA" p        ON p."ID_PERSONA"  = c."ID_CLIENTE"
      JOIN public."USUARIO" u        ON u."ID_PERSONA"  = c."ID_CLIENTE"
      JOIN public."NIVEL_MEMBRESIA" nm ON nm."ID_NIVEL" = m."ID_NIVEL"

      ORDER BY id
    `)
    res.json(rows)
  } catch (err) { next(err) }
})

export default router