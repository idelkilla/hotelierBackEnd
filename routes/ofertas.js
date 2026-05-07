// routes/ofertas.js
import express from 'express'
import pool from '../db.js'

const router = express.Router()

router.get('/ofertas-finde', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        h."ID_HOSPEDAJE"                                      AS id,
        s."NOMBRE"                                            AS nombre,
        u."NOMBRE"                                            AS ubicacion,
        ci."NOMBRE"                                           AS ciudad,
        h."CANCELACION",
        MIN(hab."PRECIO_NOCHE")::numeric(10,2)                AS precio_noche_original,
        MIN(d."PRECIO_AJUSTADO")::numeric(10,2)               AS precio_noche_oferta,
        ROUND((1 - MIN(d."PRECIO_AJUSTADO") / MIN(hab."PRECIO_NOCHE")) * 100)
                                                              AS descuento_pct,
        ROUND(MIN(hab."PRECIO_NOCHE") - MIN(d."PRECIO_AJUSTADO"))
                                                              AS ahorro_noche,
        JSON_AGG(
          DISTINCT JSONB_BUILD_OBJECT('url', img."URL", 'alt', COALESCE(img."ALT_TEXT",''))
        ) FILTER (WHERE img."ID_IMAGEN" IS NOT NULL)          AS imagenes
      FROM "DISPONIBILIDAD" d
      JOIN "HABITACION"     hab ON hab."ID_HABITACION"  = d."ID_HABITACION"
      JOIN "HOSPEDAJE"      h   ON h."ID_HOSPEDAJE"     = hab."ID_HOSPEDAJE"
      JOIN "SERVICIO"       s   ON s."ID_SERVICIO"      = h."ID_HOSPEDAJE"
      JOIN "UBICACION"      u   ON u."ID_UBICACION"     = h."ID_UBICACION"
      JOIN "CIUDAD"         ci  ON ci."ID_CIUDAD"       = u."ID_CIUDAD"
      LEFT JOIN "IMAGEN_HOSPEDAJE" img ON img."ID_HOSPEDAJE" = h."ID_HOSPEDAJE"
      WHERE
        d."FECHA" BETWEEN
          DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '5 days'
          AND DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '6 days'
        AND d."CANTIDAD_DISPONIBLE" > 0
        AND d."ESTADO" = 'A'
        AND d."PRECIO_AJUSTADO" IS NOT NULL
        AND d."PRECIO_AJUSTADO" <= hab."PRECIO_NOCHE" * 0.80
      GROUP BY h."ID_HOSPEDAJE", s."NOMBRE", u."NOMBRE", ci."NOMBRE",
               h."CANCELACION"
      ORDER BY descuento_pct DESC
      LIMIT 8
    `)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al obtener ofertas' })
  }
})

export default router