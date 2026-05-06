// ============================================================
// ARCHIVO: hotelierBackEnd/src/routes/metodoPago.js
// REEMPLAZA completamente el contenido actual de este archivo.
// El metodoPagoController.js puedes BORRARLO — no se usa en ningún lado.
// ============================================================

import { Router } from 'express'
import * as db from '../db.js'
import { authenticateToken } from '../middleware/authMiddleware.js'

const router = Router()
router.use(authenticateToken)

// ── Helper: obtener ID_PERSONA desde ID_USUARIO ───────────────
async function getPersonaId(idUsuario) {
  const { rows } = await db.query(
    `SELECT "ID_PERSONA" FROM public."USUARIO" WHERE "ID_USUARIO" = $1`,
    [idUsuario]
  )
  return rows[0]?.ID_PERSONA ?? null
}

// ─────────────────────────────────────────────────────────────
// GET /api/metodos-pago
// Devuelve todas las tarjetas del usuario autenticado.
// Incluye GUARDADA y CODIGO_POSTAL que están en la BD.
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const idPersona = await getPersonaId(req.user.id)

    // Si el usuario no tiene PERSONA vinculada aún, devolver array vacío
    if (!idPersona) return res.json([])

    const { rows } = await db.query(
      `SELECT
         "ID_METODO"                        AS id,
         "TIPO"                             AS tipo,
         "ULTIMOS4"                         AS last4,
         "NOMBRE_TITULAR"                   AS nombre,
         CONCAT("MES_EXP", '/', "ANO_EXP") AS expiracion,
         "CODIGO_POSTAL"                    AS codigo_postal,
         "GUARDADA"                         AS guardada
       FROM public."METODO_PAGO"
       WHERE "ID_PERSONA" = $1
       ORDER BY "GUARDADA" DESC, "CREATED_AT" DESC`,
      [idPersona]
    )

    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// POST /api/metodos-pago
// Guarda una nueva tarjeta.
// Body esperado: { tipo, numero, nombre, expiracion, codigoPostal?, guardar? }
// El CVV NUNCA se recibe ni guarda aquí.
// ─────────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { tipo, numero, nombre, expiracion, codigoPostal, guardar } = req.body

    // Validaciones
    if (!tipo || !numero || !nombre || !expiracion) {
      return res.status(400).json({
        error: 'Campos requeridos: tipo, numero, nombre, expiracion'
      })
    }
    if (!/^\d{2}\/\d{2}$/.test(expiracion)) {
      return res.status(400).json({
        error: 'expiracion debe tener formato MM/AA'
      })
    }

    const numeroLimpio = numero.replace(/\s/g, '')
    if (numeroLimpio.length < 13) {
      return res.status(400).json({
        error: 'El número de tarjeta debe tener al menos 13 dígitos'
      })
    }

    const idPersona = await getPersonaId(req.user.id)
    if (!idPersona) {
      return res.status(404).json({
        error: 'Perfil no encontrado. Completa tu información personal primero.'
      })
    }

    const ultimos4    = numeroLimpio.slice(-4)
    const [mes, anio] = expiracion.split('/')
    const cpLimpio    = typeof codigoPostal === 'string' && codigoPostal.trim() !== ''
                          ? codigoPostal.trim()
                          : null
    const guardada    = guardar === true || guardar === 'true'

    const { rows } = await db.query(
      `INSERT INTO public."METODO_PAGO"
         ("ID_PERSONA", "TIPO", "ULTIMOS4", "NOMBRE_TITULAR",
          "MES_EXP", "ANO_EXP", "CODIGO_POSTAL", "GUARDADA")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING
         "ID_METODO"                        AS id,
         "TIPO"                             AS tipo,
         "ULTIMOS4"                         AS last4,
         "NOMBRE_TITULAR"                   AS nombre,
         CONCAT("MES_EXP", '/', "ANO_EXP") AS expiracion,
         "CODIGO_POSTAL"                    AS codigo_postal,
         "GUARDADA"                         AS guardada`,
      [idPersona, tipo, ultimos4, nombre.trim(), mes, anio, cpLimpio, guardada]
    )

    res.status(201).json(rows[0])
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// PATCH /api/metodos-pago/:id/guardar
// Marca o desmarca una tarjeta como "guardada para futuras compras".
// Body: { guardar: true } o { guardar: false }
// ─────────────────────────────────────────────────────────────
router.patch('/:id/guardar', async (req, res, next) => {
  try {
    const idPersona = await getPersonaId(req.user.id)
    if (!idPersona) {
      return res.status(404).json({ error: 'Perfil no encontrado' })
    }

    const guardada = req.body.guardar === true || req.body.guardar === 'true'

    const { rowCount, rows } = await db.query(
      `UPDATE public."METODO_PAGO"
       SET "GUARDADA" = $1
       WHERE "ID_METODO" = $2 AND "ID_PERSONA" = $3
       RETURNING
         "ID_METODO" AS id,
         "GUARDADA"  AS guardada`,
      [guardada, req.params.id, idPersona]
    )

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Tarjeta no encontrada o sin permiso' })
    }

    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// DELETE /api/metodos-pago/:id
// Elimina una tarjeta — verifica que pertenezca al usuario.
// ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const idPersona = await getPersonaId(req.user.id)
    if (!idPersona) {
      return res.status(404).json({ error: 'Perfil no encontrado' })
    }

    const { rowCount } = await db.query(
      `DELETE FROM public."METODO_PAGO"
       WHERE "ID_METODO" = $1 AND "ID_PERSONA" = $2`,
      [req.params.id, idPersona]
    )

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Tarjeta no encontrada o sin permiso' })
    }

    res.json({ message: 'Tarjeta eliminada correctamente' })
  } catch (err) {
    next(err)
  }
})

export default router