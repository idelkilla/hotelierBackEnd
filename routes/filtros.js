// routes/filtros.js
import { Router } from 'express'
import { query } from '../db.js'

const router = Router()

/**
 * GET /api/filtros/vuelos
 * Devuelve los datos que necesita FiltrosSidebar.vue
 * Query params opcionales: id_origen, id_destino
 */
router.get('/vuelos', async (req, res) => {
  const { id_origen, id_destino } = req.query

  try {
    // ── Aerolíneas: proveedores con vuelos disponibles ──────────────────────
    // Conecta PROVEEDOR → SERVICIO (tipo vuelo) → VUELO → VUELO_CLASE
    const aerolineasParams = []
    let aerolineasWhere = 'WHERE vc."ASIENTOS_DISPONIBLES" > 0'

    if (id_origen) {
      aerolineasParams.push(id_origen)
      aerolineasWhere += ` AND v."ID_ORIGEN" = $${aerolineasParams.length}`
    }
    if (id_destino) {
      aerolineasParams.push(id_destino)
      aerolineasWhere += ` AND v."ID_DESTINO" = $${aerolineasParams.length}`
    }

    const { rows: aerolineas } = await query(`
      SELECT
        p."ID_PROVEEDOR"                         AS id,
        p."NOMBRE_LEGAL"                         AS nombre,
        COUNT(DISTINCT v."ID_VUELO")             AS vuelos,
        MIN(vc."PRECIO")                         AS precio
      FROM "VUELO"       v
      JOIN "VUELO_CLASE" vc ON vc."ID_VUELO"    = v."ID_VUELO"
      JOIN "SERVICIO"    s  ON s."ID_SERVICIO"  = v."ID_VUELO"
      JOIN "PROVEEDOR"   p  ON p."ID_PROVEEDOR" = s."ID_PROVEEDOR"
      ${aerolineasWhere}
      GROUP BY p."ID_PROVEEDOR", p."NOMBRE_LEGAL"
      ORDER BY vuelos DESC
    `, aerolineasParams)

    // ── Clases de cabina desde CLASE_CABINA ─────────────────────────────────
    const { rows: clases } = await query(`
      SELECT "ID_CLASE" AS id, "NOMBRE" AS label
      FROM "CLASE_CABINA"
      ORDER BY "ID_CLASE"
    `)

    // ── Rango de duración real desde VUELO ──────────────────────────────────
    const durParams = []
    let durWhere = 'WHERE "DURACION_MINUTOS" IS NOT NULL'
    if (id_origen) { durParams.push(id_origen); durWhere += ` AND "ID_ORIGEN" = $${durParams.length}` }
    if (id_destino) { durParams.push(id_destino); durWhere += ` AND "ID_DESTINO" = $${durParams.length}` }

    const { rows: dur } = await query(`
      SELECT
        CEIL(MIN("DURACION_MINUTOS") / 60.0)::int AS min_horas,
        CEIL(MAX("DURACION_MINUTOS") / 60.0)::int AS max_horas
      FROM "VUELO"
      ${durWhere}
    `, durParams)

    // ── Conteo de escalas desde RESERVA_VUELO ───────────────────────────────
    const { rows: esc } = await query(`
      SELECT
        SUM(CASE WHEN max_orden = 1 THEN 1 ELSE 0 END)  AS directo,
        SUM(CASE WHEN max_orden = 2 THEN 1 ELSE 0 END)  AS una_escala,
        SUM(CASE WHEN max_orden >= 3 THEN 1 ELSE 0 END) AS dos_o_mas
      FROM (
        SELECT "ID_RESERVA", MAX("ORDEN") AS max_orden
        FROM "RESERVA_VUELO"
        GROUP BY "ID_RESERVA"
      ) sub
    `)

    res.json({
      aerolineas: aerolineas.map(a => ({
        id:     Number(a.id),
        nombre: a.nombre,
        vuelos: Number(a.vuelos),
        precio: Number(a.precio),
      })),
      clases,
      duracion: {
        minHoras: dur[0]?.min_horas ?? 1,
        maxHoras: dur[0]?.max_horas ?? 35,
      },
      escalas: {
        directo:    Number(esc[0]?.directo    ?? 0),
        una_escala: Number(esc[0]?.una_escala ?? 0),
        dos_o_mas:  Number(esc[0]?.dos_o_mas  ?? 0),
      },
    })
  } catch (err) {
    console.error('[GET /api/filtros/vuelos]', err.message)
    res.status(500).json({ error: 'Error al obtener filtros' })
  }
})

export default router