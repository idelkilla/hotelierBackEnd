import { Router } from 'express'
import { getProfile, updateProfile } from '../controllers/userController.js'
import { authenticateToken } from '../middleware/authMiddleware.js'
import * as db from '../db.js'

const router = Router()
router.use(authenticateToken)

router.get('/profile',        getProfile)
router.put('/profile/update', updateProfile)

// ── NUEVA: membresía del usuario ──────────────────────────────
router.get('/membresia', async (req, res, next) => {
  try {
    const idPersona = req.user.id_persona || req.user.ID_PERSONA

    // USUARIO → PERSONA → CLIENTE → MIEMBRO → NIVEL
    const { rows } = await db.query(`
      SELECT
        m."NUMERO_MIEMBRO",
        m."FECHA_INICIO",
        m."PUNTOS_FIDELIDAD",
        n."NOMBRE_NIVEL",
        n."DESCRIPCION",
        n."PUNTOS_MINIMOS"
      FROM "USUARIO" u
      JOIN "CLIENTE" c  ON c."ID_CLIENTE"  = u."ID_PERSONA"
      JOIN "MIEMBRO"  m  ON m."ID_CLIENTE"  = c."ID_CLIENTE"
      JOIN "NIVEL_MEMBRESIA" n ON n."ID_NIVEL" = m."ID_NIVEL"
      WHERE u."ID_PERSONA" = $1
    `, [idPersona])

    if (!rows.length) return res.json(null)   // no es miembro todavía
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

export default router