import { Router } from 'express'
import { getProfile, updateProfile } from '../controllers/userController.js'
import { authenticateToken } from '../middleware/authMiddleware.js'
import * as db from '../db.js'

const router = Router()
router.use(authenticateToken)

router.get('/profile',        getProfile)
router.put('/profile/update', updateProfile)

// ── GET membresía ─────────────────────────────────────────────
router.get('/membresia', async (req, res, next) => {
  try {
    const idPersona = req.user.id_persona || req.user.ID_PERSONA
    const { rows } = await db.query(`
      SELECT
        m."NUMERO_MIEMBRO",
        m."FECHA_INICIO",
        m."PUNTOS_FIDELIDAD",
        n."ID_NIVEL",
        n."NOMBRE_NIVEL",
        n."DESCRIPCION",
        n."PUNTOS_MINIMOS"
      FROM "MIEMBRO" m
      JOIN "NIVEL_MEMBRESIA" n ON n."ID_NIVEL" = m."ID_NIVEL"
      WHERE m."ID_CLIENTE" = $1
    `, [idPersona])
    res.json(rows[0] || null)
  } catch (err) { next(err) }
})

// ── GET niveles disponibles ───────────────────────────────────
router.get('/membresia/niveles', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT "ID_NIVEL", "NOMBRE_NIVEL", "PUNTOS_MINIMOS", "DESCRIPCION"
      FROM "NIVEL_MEMBRESIA"
      ORDER BY "PUNTOS_MINIMOS" ASC
    `)
    res.json(rows)
  } catch (err) { next(err) }
})

// ── POST crear membresía ──────────────────────────────────────
router.post('/membresia', async (req, res, next) => {
  try {
    const idPersona = req.user.id_persona || req.user.ID_PERSONA
    const { id_nivel } = req.body

    if (!id_nivel) return res.status(400).json({ error: 'El nivel es requerido.' })

    const { rows: existe } = await db.query(
      `SELECT 1 FROM "MIEMBRO" WHERE "ID_CLIENTE" = $1`, [idPersona]
    )
    if (existe.length) return res.status(409).json({ error: 'Ya tienes una membresía activa.' })

    const { rows: cliente } = await db.query(
      `SELECT 1 FROM "CLIENTE" WHERE "ID_CLIENTE" = $1`, [idPersona]
    )
    if (!cliente.length) {
      await db.query(`
        INSERT INTO "CLIENTE" ("ID_CLIENTE","ESTADO_CLIENTE","FECHA_REGISTRO")
        VALUES ($1, 'A', CURRENT_DATE)
      `, [idPersona])
    }

    const numeroMiembro = 'MEM-' + String(idPersona).padStart(5, '0')

    await db.query(`
      INSERT INTO "MIEMBRO" ("ID_CLIENTE","NUMERO_MIEMBRO","FECHA_INICIO","PUNTOS_FIDELIDAD","ID_NIVEL")
      VALUES ($1, $2, CURRENT_DATE, 0, $3)
      RETURNING *
    `, [idPersona, numeroMiembro, id_nivel])

    const { rows: result } = await db.query(`
      SELECT
        m."NUMERO_MIEMBRO", m."FECHA_INICIO", m."PUNTOS_FIDELIDAD",
        n."ID_NIVEL", n."NOMBRE_NIVEL", n."DESCRIPCION", n."PUNTOS_MINIMOS"
      FROM "MIEMBRO" m
      JOIN "NIVEL_MEMBRESIA" n ON n."ID_NIVEL" = m."ID_NIVEL"
      WHERE m."ID_CLIENTE" = $1
    `, [idPersona])

    res.status(201).json(result[0])
  } catch (err) { next(err) }
})

// ── GET reseñas del usuario autenticado ──────────────────────
router.get('/resenas', async (req, res, next) => {
  try {
    const idPersona = req.user.id_persona || req.user.ID_PERSONA
    console.log('👤 req.user completo:', JSON.stringify(req.user))
    console.log('👤 idPersona:', idPersona)

    const { rows: todas } = await db.query(
      `SELECT "ID_RESENA", "ID_CLIENTE" FROM "RESENA" ORDER BY "ID_RESENA" DESC LIMIT 5`
    )
    console.log('📋 Últimas reseñas en BD:', JSON.stringify(todas))

    const { rows } = await db.query(`
      SELECT
        r."ID_RESENA"    AS id,
        r."COMENTARIO"   AS texto,
        r."CALIFICACION" AS estrellas,
        s."NOMBRE"       AS titulo
      FROM "RESENA" r
      JOIN "SERVICIO" s ON s."ID_SERVICIO" = r."ID_SERVICIO"
      WHERE r."ID_CLIENTE" = $1
      ORDER BY r."ID_RESENA" DESC
    `, [idPersona])

    console.log('✅ Reseñas del usuario:', rows.length)
    res.json(rows)
  } catch (err) { next(err) }
})
// ── POST crear reseña ─────────────────────────────────────────
router.post('/resenas', async (req, res, next) => {
  try {
    const idPersona = req.user.id_persona || req.user.ID_PERSONA
    const { titulo, texto, estrellas } = req.body

    if (!texto?.trim() || !estrellas) {
      return res.status(400).json({ error: 'Comentario y calificación son requeridos.' })
    }

    // Verificar que exista como CLIENTE, si no crearlo
    const { rows: cliente } = await db.query(
      `SELECT 1 FROM "CLIENTE" WHERE "ID_CLIENTE" = $1`, [idPersona]
    )
    if (!cliente.length) {
      await db.query(`
        INSERT INTO "CLIENTE" ("ID_CLIENTE","ESTADO_CLIENTE","FECHA_REGISTRO")
        VALUES ($1, 'A', CURRENT_DATE)
      `, [idPersona])
    }

    const { rows } = await db.query(`
      INSERT INTO "RESENA" ("COMENTARIO", "CALIFICACION", "ID_CLIENTE", "ID_SERVICIO")
      VALUES ($1, $2, $3, 1)
      RETURNING "ID_RESENA" AS id, "COMENTARIO" AS texto, "CALIFICACION" AS estrellas
    `, [texto.trim(), estrellas, idPersona])

    res.status(201).json({
      ...rows[0],
      titulo: titulo || 'Mi reseña',
      fecha:  new Date().toLocaleDateString('es-DO')
    })
  } catch (err) { next(err) }
})
export default router