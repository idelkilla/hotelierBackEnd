import { Router } from 'express'
import * as db from '../db.js'
import { authenticateToken } from '../middleware/authMiddleware.js'

const router = Router()
router.use(authenticateToken)

// ── Helper: obtener ID_PERSONA desde ID_USUARIO ───────────────────────────────
async function getPersonaId(idUsuario) {
  const { rows } = await db.query(
    `SELECT "ID_PERSONA" FROM public."USUARIO" WHERE "ID_USUARIO" = $1`,
    [idUsuario]
  )
  return rows[0]?.ID_PERSONA ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/metodos-pago
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const idPersona = await getPersonaId(req.user.id)
    if (!idPersona) return res.status(404).json({ error: 'Persona no encontrada' })

    const { rows } = await db.query(
      `SELECT
         "ID_METODO"                        AS id,
         "TIPO"                             AS tipo,
         "ULTIMOS4"                         AS last4,
         "NOMBRE_TITULAR"                   AS nombre,
         CONCAT("MES_EXP", '/', "ANO_EXP") AS expiracion
       FROM public."METODO_PAGO"
       WHERE "ID_PERSONA" = $1
       ORDER BY "CREATED_AT" DESC`,
      [idPersona]
    )
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/metodos-pago
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { tipo, numero, nombre, expiracion } = req.body

    // Validaciones
    if (!tipo || !numero || !nombre || !expiracion) {
      return res.status(400).json({ error: 'Todos los campos son requeridos: tipo, numero, nombre, expiracion' })
    }
    if (!/^\d{2}\/\d{2}$/.test(expiracion)) {
      return res.status(400).json({ error: 'El campo expiracion debe tener formato MM/AA' })
    }
    const numeroLimpio = numero.replace(/\s/g, '')
    if (numeroLimpio.length < 13) {
      return res.status(400).json({ error: 'El número de tarjeta debe tener al menos 13 dígitos' })
    }

    const idPersona = await getPersonaId(req.user.id)
    if (!idPersona) return res.status(404).json({ error: 'Persona no encontrada' })

    const ultimos4    = numeroLimpio.slice(-4)
    const [mes, anio] = expiracion.split('/')

    const { rows } = await db.query(
      `INSERT INTO public."METODO_PAGO"
         ("ID_PERSONA", "TIPO", "ULTIMOS4", "NOMBRE_TITULAR", "MES_EXP", "ANO_EXP")
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING
         "ID_METODO"                        AS id,
         "TIPO"                             AS tipo,
         "ULTIMOS4"                         AS last4,
         "NOMBRE_TITULAR"                   AS nombre,
         CONCAT("MES_EXP", '/', "ANO_EXP") AS expiracion`,
      [idPersona, tipo, ultimos4, nombre.trim(), mes, anio]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/metodos-pago/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const idPersona = await getPersonaId(req.user.id)
    if (!idPersona) return res.status(404).json({ error: 'Persona no encontrada' })

    const { rowCount } = await db.query(
      `DELETE FROM public."METODO_PAGO"
       WHERE "ID_METODO" = $1 AND "ID_PERSONA" = $2`,
      [req.params.id, idPersona]
    )
    if (rowCount === 0) return res.status(404).json({ error: 'Método de pago no encontrado' })

    res.json({ message: 'Método de pago eliminado correctamente' })
  } catch (err) {
    next(err)
  }
})

export default router