// filtros.routes.js  –  Express router
import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

/**
 * GET /api/vuelos/filtros
 * Devuelve todos los datos necesarios para la sidebar de filtros de vuelos.
 * Parámetros opcionales de query: id_origen, id_destino, fecha_salida
 */
router.get('/filtros', async (req, res) => {
  const { id_origen, id_destino, fecha_salida } = req.query;

  try {
    // ── 1. AEROLÍNEAS ─────────────────────────────────────────────────────────
    // Proveedores cuyo tipo es "Aerolínea" que tienen vuelos disponibles.
    // Ajusta el ID_TIPO según tu tabla TIPO_PROVEEDOR (ej. 1 = Aerolínea).
    const aerolineasQuery = await query(`
      SELECT
        p."ID_PROVEEDOR",
        p."NOMBRE_LEGAL"                        AS nombre,
        COUNT(DISTINCT v."ID_VUELO")             AS vuelos,
        MIN(vc."PRECIO")                         AS precio_minimo
      FROM "PROVEEDOR"    p
      JOIN "SERVICIO"     s  ON s."ID_PROVEEDOR" = p."ID_PROVEEDOR"
      JOIN "TIPO_PROVEEDOR" tp ON tp."ID_TIPO"   = p."ID_TIPO"
      JOIN "VUELO"        v  ON v."ID_VUELO"     = s."ID_SERVICIO"   -- ajusta si el join es distinto
      JOIN "VUELO_CLASE"  vc ON vc."ID_VUELO"    = v."ID_VUELO"
      WHERE UPPER(tp."NOMBRE_TIPO") LIKE '%AEROL%'
        AND vc."ASIENTOS_DISPONIBLES" > 0
        ${id_origen  ? 'AND v."ID_ORIGEN"  = $1' : ''}
        ${id_destino ? `AND v."ID_DESTINO" = $${id_origen ? 2 : 1}` : ''}
      GROUP BY p."ID_PROVEEDOR", p."NOMBRE_LEGAL"
      ORDER BY vuelos DESC
    `, [id_origen, id_destino].filter(Boolean));

    // ── 2. CLASES DE CABINA ───────────────────────────────────────────────────
    const clasesQuery = await query(`
      SELECT
        cc."ID_CLASE"   AS id,
        cc."NOMBRE"     AS label
      FROM "CLASE_CABINA" cc
      ORDER BY cc."ID_CLASE"
    `);

    // ── 3. DURACIÓN MÁXIMA disponible (para el slider) ────────────────────────
    const duracionQuery = await query(`
      SELECT
        CEIL(MAX("DURACION_MINUTOS") / 60.0) AS max_horas,
        CEIL(MIN("DURACION_MINUTOS") / 60.0) AS min_horas
      FROM "VUELO"
      WHERE "DURACION_MINUTOS" IS NOT NULL
        ${id_origen  ? 'AND "ID_ORIGEN"  = $1' : ''}
        ${id_destino ? `AND "ID_DESTINO" = $${id_origen ? 2 : 1}` : ''}
    `, [id_origen, id_destino].filter(Boolean));

    // ── 4. ESCALAS – conteo de vuelos por reserva ─────────────────────────────
    // Una reserva con ORDER 1 y 2 tiene 1 escala; con ORDER 3+, 2 o más.
    const escalasQuery = await query(`
      SELECT
        SUM(CASE WHEN max_orden = 1 THEN 1 ELSE 0 END) AS directo,
        SUM(CASE WHEN max_orden = 2 THEN 1 ELSE 0 END) AS una_escala,
        SUM(CASE WHEN max_orden >= 3 THEN 1 ELSE 0 END) AS dos_o_mas
      FROM (
        SELECT "ID_RESERVA", MAX("ORDEN") AS max_orden
        FROM   "RESERVA_VUELO"
        GROUP  BY "ID_RESERVA"
      ) sub
    `);

    res.json({
      aerolineas: aerolineasQuery.rows.map(r => ({
        id:       r.ID_PROVEEDOR,
        nombre:   r.nombre,
        vuelos:   Number(r.vuelos),
        precio:   Number(r.precio_minimo),
      })),
      clases: clasesQuery.rows,
      duracion: {
        minHoras: Number(duracionQuery.rows[0]?.min_horas ?? 1),
        maxHoras: Number(duracionQuery.rows[0]?.max_horas ?? 35),
      },
      escalas: escalasQuery.rows[0],
    });

  } catch (err) {
    console.error('[filtros/vuelos]', err);
    res.status(500).json({ error: 'Error al obtener filtros' });
  }
});

/**
 * GET /api/vuelos
 * Devuelve vuelos filtrados según los parámetros del sidebar.
 */
router.get('/', async (req, res) => {
  const {
    id_origen,
    id_destino,
    clase,          // ID_CLASE de CLASE_CABINA
    aerolineas,     // CSV de ID_PROVEEDOR  ej. "1,3,7"
    escalas,        // "0" | "1" | "2+"
    tiempo_max,     // horas
    fecha_salida,
  } = req.query;

  const params = [];
  const conditions = ['vc."ASIENTOS_DISPONIBLES" > 0'];

  if (id_origen)  { params.push(id_origen);  conditions.push(`v."ID_ORIGEN"  = $${params.length}`); }
  if (id_destino) { params.push(id_destino); conditions.push(`v."ID_DESTINO" = $${params.length}`); }
  if (clase)      { params.push(clase);       conditions.push(`rv."ID_CLASE"  = $${params.length}`); }
  if (tiempo_max) {
    params.push(Number(tiempo_max) * 60);
    conditions.push(`v."DURACION_MINUTOS" <= $${params.length}`);
  }
  if (fecha_salida) {
    params.push(fecha_salida);
    conditions.push(`DATE(v."FECHA_SALIDA") = $${params.length}`);
  }
  if (aerolineas) {
    const ids = aerolineas.split(',').map(Number).filter(Boolean);
    if (ids.length) {
      params.push(ids);
      conditions.push(`p."ID_PROVEEDOR" = ANY($${params.length}::int[])`);
    }
  }

  // Filtro de escalas: subquery sobre RESERVA_VUELO
  let escalasCondition = '';
  if (escalas === '0') {
    escalasCondition = `AND rv."ID_RESERVA" IN (
      SELECT "ID_RESERVA" FROM "RESERVA_VUELO" GROUP BY "ID_RESERVA" HAVING MAX("ORDEN") = 1
    )`;
  } else if (escalas === '1') {
    escalasCondition = `AND rv."ID_RESERVA" IN (
      SELECT "ID_RESERVA" FROM "RESERVA_VUELO" GROUP BY "ID_RESERVA" HAVING MAX("ORDEN") = 2
    )`;
  } else if (escalas === '2+') {
    escalasCondition = `AND rv."ID_RESERVA" IN (
      SELECT "ID_RESERVA" FROM "RESERVA_VUELO" GROUP BY "ID_RESERVA" HAVING MAX("ORDEN") >= 3
    )`;
  }

  try {
    const result = await query(`
      SELECT
        v."ID_VUELO",
        v."NUMERO_VUELO",
        v."FECHA_SALIDA",
        v."FECHA_LLEGADA",
        v."DURACION_MINUTOS",
        vc."PRECIO",
        vc."ASIENTOS_DISPONIBLES",
        cc."NOMBRE"              AS clase,
        p."NOMBRE_LEGAL"         AS aerolinea,
        u_orig."NOMBRE"          AS origen,
        u_orig."CODIGO_IATA"     AS iata_origen,
        u_dest."NOMBRE"          AS destino,
        u_dest."CODIGO_IATA"     AS iata_destino
      FROM  "VUELO"        v
      JOIN  "VUELO_CLASE"  vc   ON vc."ID_VUELO"    = v."ID_VUELO"
      JOIN  "CLASE_CABINA" cc   ON cc."ID_CLASE"     = vc."ID_CLASE"
      JOIN  "SERVICIO"     s    ON s."ID_SERVICIO"   = v."ID_VUELO"
      JOIN  "PROVEEDOR"    p    ON p."ID_PROVEEDOR"  = s."ID_PROVEEDOR"
      LEFT JOIN "UBICACION" u_orig ON u_orig."ID_UBICACION" = v."ID_ORIGEN"
      LEFT JOIN "UBICACION" u_dest ON u_dest."ID_UBICACION" = v."ID_DESTINO"
      WHERE ${conditions.length > 0 ? conditions.join(' AND ') : '1=1'}
      ${escalasCondition}
      ORDER BY vc."PRECIO" ASC
      LIMIT 100
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error('[vuelos]', err);
    res.status(500).json({ error: 'Error al buscar vuelos' });
  }
});

export default router;