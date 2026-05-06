import express from 'express'
import { getPool } from '../db.js'
import { authenticateToken } from '../middleware/authMiddleware.js'

const router = express.Router()

// Función helper: dado ID_USUARIO del JWT → ID_CLIENTE
async function getIdCliente(pool, idUsuario) {
  const { rows } = await pool.query(
    `SELECT u."ID_PERSONA"
     FROM "USUARIO" u
     WHERE u."ID_USUARIO" = $1`,
    [idUsuario]
  )
  if (!rows[0]) return null
  return rows[0].ID_PERSONA  // ID_PERSONA == ID_CLIENTE (tu register los iguala)
}

// ── GET /api/favoritos ─────────────────────────────────────────
// Lista todos los favoritos del cliente autenticado
router.get('/', authenticateToken, async (req, res) => {
  const pool = getPool()
  try {
    const idCliente = await getIdCliente(pool, req.user.id)
    if (!idCliente) return res.status(404).json({ error: 'Cliente no encontrado' })

    const { rows } = await pool.query(`
      SELECT
        h."ID_HOSPEDAJE"                          AS id,
        u."NOMBRE"                                AS nombre,
        ci."NOMBRE"                               AS ciudad,
        pa."NOMBRE"                               AS pais,
        h."DESCRIPCION"                           AS descripcion,
        img."URL"                                 AS imagen,
        MIN(hab."PRECIO_NOCHE")::numeric          AS precio,
        th."NOMBRE_TIPO"                          AS tipo
      FROM "FAVORITO" f
      JOIN "HOSPEDAJE"          h   ON h."ID_HOSPEDAJE"  = f."ID_HOSPEDAJE"
      JOIN "TIPO_HOSPEDAJE"     th  ON th."ID_TIPO"       = h."ID_TIPO"
      JOIN "UBICACION"          u   ON u."ID_UBICACION"   = h."ID_UBICACION"
      JOIN "CIUDAD"             ci  ON ci."ID_CIUDAD"     = u."ID_CIUDAD"
      JOIN "PAIS"               pa  ON pa."ID_PAIS"       = ci."ID_PAIS"
      LEFT JOIN "IMAGEN_HOSPEDAJE" img
             ON img."ID_HOSPEDAJE" = h."ID_HOSPEDAJE"
            AND img."ORDEN" = (
                  SELECT MIN(i2."ORDEN")
                  FROM "IMAGEN_HOSPEDAJE" i2
                  WHERE i2."ID_HOSPEDAJE" = h."ID_HOSPEDAJE"
                )
      LEFT JOIN "HABITACION"    hab ON hab."ID_HOSPEDAJE" = h."ID_HOSPEDAJE"
      WHERE f."ID_CLIENTE" = $1
      GROUP BY h."ID_HOSPEDAJE", u."NOMBRE", ci."NOMBRE",
               pa."NOMBRE", h."DESCRIPCION", img."URL", th."NOMBRE_TIPO",
               f."FECHA_GUARDADO"
      ORDER BY f."FECHA_GUARDADO" DESC
    `, [idCliente])

    res.json(rows)
  } catch (e) {
    console.error('GET /favoritos error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── GET /api/favoritos/check/:idHospedaje ──────────────────────
// ¿Este hospedaje está en favoritos del cliente?
router.get('/check/:idHospedaje', authenticateToken, async (req, res) => {
  const pool = getPool()
  try {
    const idCliente   = await getIdCliente(pool, req.user.id)
    const idHospedaje = parseInt(req.params.idHospedaje)
    if (!idCliente) return res.json({ esFavorito: false })

    const { rows } = await pool.query(`
      SELECT 1 FROM "FAVORITO"
      WHERE "ID_CLIENTE" = $1 AND "ID_HOSPEDAJE" = $2
    `, [idCliente, idHospedaje])

    res.json({ esFavorito: rows.length > 0 })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/favoritos/:idHospedaje ──────────────────────────
// Agrega a favoritos
router.post('/:idHospedaje', authenticateToken, async (req, res) => {
  const pool = getPool()
  try {
    const idCliente   = await getIdCliente(pool, req.user.id)
    const idHospedaje = parseInt(req.params.idHospedaje)
    if (!idCliente) return res.status(404).json({ error: 'Cliente no encontrado' })

    await pool.query(`
      INSERT INTO "FAVORITO" ("ID_CLIENTE","ID_HOSPEDAJE")
      VALUES ($1,$2)
      ON CONFLICT ON CONSTRAINT "uq_favorito_cliente_hospedaje" DO NOTHING
    `, [idCliente, idHospedaje])

    res.json({ ok: true })
  } catch (e) {
    console.error('POST /favoritos error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── DELETE /api/favoritos/:idHospedaje ────────────────────────
// Quita de favoritos
router.delete('/:idHospedaje', authenticateToken, async (req, res) => {
  const pool = getPool()
  try {
    const idCliente   = await getIdCliente(pool, req.user.id)
    const idHospedaje = parseInt(req.params.idHospedaje)
    if (!idCliente) return res.status(404).json({ error: 'Cliente no encontrado' })

    await pool.query(`
      DELETE FROM "FAVORITO"
      WHERE "ID_CLIENTE" = $1 AND "ID_HOSPEDAJE" = $2
    `, [idCliente, idHospedaje])

    res.json({ ok: true })
  } catch (e) {
    console.error('DELETE /favoritos error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

export default router