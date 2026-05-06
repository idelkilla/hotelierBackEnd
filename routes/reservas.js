import { Router } from 'express'
import * as db from '../db.js'
import { authenticateToken } from '../middleware/authMiddleware.js'

const router = Router()

// ─── Existentes ──────────────────────────────────────────────────────────────

router.get('/', authenticateToken, async (req, res, next) => {
  console.log('🔍 GET /api/reservas → user:', req.user?.email || 'no-auth')
  try {
    const { rows } = await db.query(`
      SELECT
        r."ID_RESERVA",
        r."FECHA_INICIO",
        r."FECHA_FIN",
        r."ID_ESTADO",
        r."ID_EMPLEADO",
        r."ID_CLIENTE",
        r."ID_ORIGEN",
        r."ID_DESTINO",
        er."ESTADO"                           AS estado_nombre,
        p."NOMBRE_COMPLETO"                   AS cliente_nombre,
        pe."NOMBRE_COMPLETO"                  AS empleado_nombre,
        uo."NOMBRE"                           AS origen_nombre,
        ud."NOMBRE"                           AS destino_nombre
      FROM public."RESERVA" r
      LEFT JOIN public."ESTADO_RESERVA"  er ON er."ID_ESTADO"    = r."ID_ESTADO"
      LEFT JOIN public."CLIENTE"          c  ON c."ID_CLIENTE"    = r."ID_CLIENTE"
      LEFT JOIN public."PERSONA"          p  ON p."ID_PERSONA"    = c."ID_CLIENTE"
      LEFT JOIN public."EMPLEADO"        em  ON em."ID_EMPLEADO"  = r."ID_EMPLEADO"
      LEFT JOIN public."PERSONA"         pe  ON pe."ID_PERSONA"   = em."ID_EMPLEADO"
      LEFT JOIN public."UBICACION"       uo  ON uo."ID_UBICACION" = r."ID_ORIGEN"
      LEFT JOIN public."UBICACION"       ud  ON ud."ID_UBICACION" = r."ID_DESTINO"
      ORDER BY r."FECHA_INICIO" DESC
      LIMIT 50
    `)
    res.json(rows)
  } catch (err) {
    console.error('❌ /api/reservas error:', err.stack)
    res.status(500).json({ error: 'Error consultando reservas', detail: err.message })
  }
})

router.get('/:id/detalles', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        dr."ID_DETALLE",
        dr."CANTIDAD_NOCHE",
        dr."FECHA_INICIO",
        dr."FECHA_FIN",
        dr."PRECIO_TOTAL",
        dr."TIPO_PAGO",
        dr."MONTO_IMPUESTOS",
        dr."MONTO_CARGOS",
        dr."COSTO_PROTECCION",
        dr."ID_PLAN_PROTECCION",
        pp."NOMBRE" AS plan_nombre
      FROM public."DETALLE_RESERVA" dr
      LEFT JOIN public."PLAN_PROTECCION" pp ON pp."ID_PLAN" = dr."ID_PLAN_PROTECCION"
      WHERE dr."ID_RESERVA" = $1
    `, [req.params.id])
    res.json(rows)
  } catch (err) { next(err) }
})

router.patch('/:id/estado', async (req, res, next) => {
  const { id } = req.params
  const ID_ESTADO = Number(req.body?.ID_ESTADO)
  if (!id || isNaN(ID_ESTADO)) {
    return res.status(400).json({
      message: 'ID de reserva o estado faltante',
      received: { id, ID_ESTADO: req.body?.ID_ESTADO }
    })
  }
  try {
    await db.query(
      `UPDATE public."RESERVA" SET "ID_ESTADO" = $1 WHERE "ID_RESERVA" = $2`,
      [ID_ESTADO, id]
    )
    res.json({ message: 'Estado actualizado correctamente' })
  } catch (err) { next(err) }
})

// ─── Nuevos: Checkout ─────────────────────────────────────────────────────────

// GET /api/reservas/planes-proteccion
// Devuelve los planes de seguro disponibles para mostrar en el checkout
router.get('/planes-proteccion', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT "ID_PLAN", "NOMBRE", "PRECIO_POR_PERSONA", "DESCRIPCION"
      FROM public."PLAN_PROTECCION"
      WHERE "ACTIVO" = true
      ORDER BY "PRECIO_POR_PERSONA"
    `)
    res.json(rows)
  } catch (err) { next(err) }
})

// GET /api/reservas/mis-reservas
// Historial de reservas del usuario autenticado
router.get('/mis-reservas', authenticateToken, async (req, res, next) => {
  try {
    const idPersona = req.user.id_persona
    const { rows } = await db.query(`
      SELECT
        r."ID_RESERVA",
        r."FECHA_INICIO",
        r."FECHA_FIN",
        er."ESTADO"                         AS estado,
        dr."CANTIDAD_NOCHE",
        dr."PRECIO_TOTAL",
        dr."TIPO_PAGO",
        dr."MONTO_IMPUESTOS",
        dr."MONTO_CARGOS",
        hab."PRECIO_NOCHE",
        th."NOMBRE"                         AS tipo_habitacion,
        ub."NOMBRE"                         AS ubicacion,
        ih."URL"                            AS imagen_url
      FROM public."RESERVA" r
      JOIN public."ESTADO_RESERVA" er        ON er."ID_ESTADO"         = r."ID_ESTADO"
      JOIN public."DETALLE_RESERVA" dr       ON dr."ID_RESERVA"        = r."ID_RESERVA"
      LEFT JOIN public."HABITACION" hab      ON hab."ID_HABITACION"    = dr."ID_HABITACION"
      LEFT JOIN public."TIPO_HABITACION" th  ON th."ID_TIPO_HABITACION"= hab."ID_TIPO_HABITACION"
      LEFT JOIN public."HOSPEDAJE" ho        ON ho."ID_HOSPEDAJE"      = hab."ID_HOSPEDAJE"
      LEFT JOIN public."UBICACION" ub        ON ub."ID_UBICACION"      = ho."ID_UBICACION"
      LEFT JOIN public."IMAGEN_HOSPEDAJE" ih ON ih."ID_HOSPEDAJE"      = ho."ID_HOSPEDAJE"
                                            AND ih."ORDEN" = 0
      WHERE r."ID_CLIENTE" = $1
      ORDER BY r."FECHA_INICIO" DESC
    `, [idPersona])
    res.json(rows)
  } catch (err) { next(err) }
})

// POST /api/reservas/checkout
// Cuerpo esperado:
// {
//   id_habitacion, fecha_inicio, fecha_fin, noches,
//   tipo_pago: 'ahora' | 'despues',
//   huesped: { nombre, apellidos, codigo_pais, telefono },
//   pago: {
//     metodo: 'tarjeta' | 'paypal' | 'affirm' | 'applepay',
//     guardar: boolean,
//     tarjeta?: { nombre_titular, numero, mes_exp, ano_exp, codigo_postal }
//   },
//   proteccion: { id_plan: number | null }
// }
router.post('/checkout', authenticateToken, async (req, res, next) => {
  const client = await db.getClient()          // ← pool.connect() desde tu db.js
  try {
    await client.query('BEGIN')

    const idPersona = req.user.id_persona
    const {
      id_habitacion,
      fecha_inicio,
      fecha_fin,
      noches,
      tipo_pago = 'ahora',
      huesped,
      pago,
      proteccion,
    } = req.body

    // ── Validaciones ──────────────────────────────────────────────────────
    if (!id_habitacion || !fecha_inicio || !fecha_fin || !noches)
      return res.status(400).json({ error: 'Faltan datos de la reserva' })

    if (!huesped?.nombre || !huesped?.apellidos || !huesped?.telefono)
      return res.status(400).json({ error: 'Faltan datos del huésped' })

    // ── 1. Habitación y hospedaje ─────────────────────────────────────────
    const { rows: habRows } = await client.query(`
      SELECT
        hab."PRECIO_NOCHE",
        ho."ID_UBICACION",
        ub."NOMBRE" AS nombre_hospedaje
      FROM public."HABITACION" hab
      JOIN public."HOSPEDAJE" ho ON ho."ID_HOSPEDAJE" = hab."ID_HOSPEDAJE"
      JOIN public."UBICACION" ub ON ub."ID_UBICACION" = ho."ID_UBICACION"
      WHERE hab."ID_HABITACION" = $1
    `, [id_habitacion])

    if (!habRows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Habitación no encontrada' })
    }
    const { PRECIO_NOCHE, ID_UBICACION, nombre_hospedaje } = habRows[0]

    // ── 2. Cálculo de montos ──────────────────────────────────────────────
    const subtotal       = parseFloat(PRECIO_NOCHE) * noches
    const montoImpuestos = parseFloat((subtotal * 0.18).toFixed(2))   // 18% ITBIS
    const montoCargos    = parseFloat((subtotal * 0.04).toFixed(2))   // 4% cargos
    const base           = subtotal + montoImpuestos + montoCargos
    // Pagar después tiene un pequeño recargo (igual al modal)
    const precioFinal    = tipo_pago === 'despues'
      ? parseFloat((base * 1.03).toFixed(2))
      : parseFloat(base.toFixed(2))

    // ── 3. Plan de protección ─────────────────────────────────────────────
    let costoProteccion  = 0
    let idPlanProteccion = null
    if (proteccion?.id_plan) {
      const { rows: planRows } = await client.query(`
        SELECT "PRECIO_POR_PERSONA"
        FROM public."PLAN_PROTECCION"
        WHERE "ID_PLAN" = $1 AND "ACTIVO" = true
      `, [proteccion.id_plan])
      if (planRows.length) {
        idPlanProteccion = proteccion.id_plan
        costoProteccion  = parseFloat(planRows[0].PRECIO_POR_PERSONA)
      }
    }

    // ── 4. Actualizar datos del huésped ───────────────────────────────────
    await client.query(`
      UPDATE public."PERSONA"
      SET "NOMBRE_COMPLETO" = $1, "APELLIDOS" = $2
      WHERE "ID_PERSONA" = $3
    `, [huesped.nombre, huesped.apellidos, idPersona])

    // Upsert teléfono (ID_TIPO = 1 → móvil)
    const { rows: telRows } = await client.query(`
      SELECT "ID_TELEFONO" FROM public."TELEFONO"
      WHERE "ID_PERSONA" = $1 AND "ID_TIPO" = 1
      LIMIT 1
    `, [idPersona])

    if (telRows.length) {
      await client.query(`
        UPDATE public."TELEFONO"
        SET "CODIGO_PAIS" = $1, "NUMERO_TELEFONICO" = $2
        WHERE "ID_TELEFONO" = $3
      `, [huesped.codigo_pais ?? '+1', huesped.telefono, telRows[0].ID_TELEFONO])
    } else {
      const { rows: [{ next: nextTel }] } = await client.query(
        `SELECT COALESCE(MAX("ID_TELEFONO"), 0) + 1 AS next FROM public."TELEFONO"`
      )
      await client.query(`
        INSERT INTO public."TELEFONO"
          ("ID_TELEFONO","CODIGO_PAIS","NUMERO_TELEFONICO","ESTADO_TELEFONO","ID_TIPO","ID_PERSONA")
        VALUES ($1, $2, $3, 'A', 1, $4)
      `, [nextTel, huesped.codigo_pais ?? '+1', huesped.telefono, idPersona])
    }

    // ── 5. Guardar tarjeta si el usuario lo pidió ─────────────────────────
    if (pago?.metodo === 'tarjeta' && pago?.guardar && pago?.tarjeta) {
      const t       = pago.tarjeta
      const ultimos4 = String(t.numero ?? '').replace(/\s/g, '').slice(-4)
      await client.query(`
        INSERT INTO public."METODO_PAGO"
          ("ID_PERSONA","TIPO","ULTIMOS4","NOMBRE_TITULAR","MES_EXP","ANO_EXP","CODIGO_POSTAL","GUARDADA")
        VALUES ($1, 'tarjeta', $2, $3, $4, $5, $6, true)
      `, [idPersona, ultimos4, t.nombre_titular, t.mes_exp, t.ano_exp, t.codigo_postal ?? ''])
    }

    // ── 6. Obtener empleado y crear RESERVA ───────────────────────────────
    const { rows: [emp] } = await client.query(
      `SELECT "ID_EMPLEADO" FROM public."EMPLEADO" LIMIT 1`
    )
    const idEmpleado = emp?.ID_EMPLEADO ?? 1

    const { rows: [{ next: idReserva }] } = await client.query(
      `SELECT COALESCE(MAX("ID_RESERVA"), 0) + 1 AS next FROM public."RESERVA"`
    )

    // ID_ESTADO 1 = pendiente (ajusta si tu semilla usa otro valor)
    await client.query(`
      INSERT INTO public."RESERVA"
        ("ID_RESERVA","FECHA_INICIO","FECHA_FIN","ID_ESTADO","ID_EMPLEADO","ID_CLIENTE","ID_ORIGEN","ID_DESTINO")
      VALUES ($1, $2, $3, 1, $4, $5, $6, $6)
    `, [idReserva, fecha_inicio, fecha_fin, idEmpleado, idPersona, ID_UBICACION])

    // ── 7. Crear DETALLE_RESERVA ──────────────────────────────────────────
    const { rows: [{ next: idDetalle }] } = await client.query(
      `SELECT COALESCE(MAX("ID_DETALLE"), 0) + 1 AS next FROM public."DETALLE_RESERVA"`
    )

    await client.query(`
      INSERT INTO public."DETALLE_RESERVA"
        ("ID_DETALLE","CANTIDAD_NOCHE","FECHA_INICIO","FECHA_FIN","PRECIO_TOTAL",
         "ID_RESERVA","ID_HABITACION","TIPO_PAGO","MONTO_IMPUESTOS","MONTO_CARGOS",
         "ID_PLAN_PROTECCION","COSTO_PROTECCION")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [
      idDetalle, noches, fecha_inicio, fecha_fin, precioFinal,
      idReserva, id_habitacion, tipo_pago,
      montoImpuestos, montoCargos,
      idPlanProteccion, costoProteccion,
    ])

    // ── 8. Notificación automática ────────────────────────────────────────
    // ID_TIPO 1 = confirmación, ID_CANAL 1 = email (ajusta según tus datos)
    try {
      await client.query(`
        INSERT INTO public."NOTIFICACION"
          ("ID_CLIENTE","ID_TIPO","ID_CANAL","ID_RESERVA","TITULO","MENSAJE")
        VALUES ($1, 1, 1, $2, $3, $4)
      `, [
        idPersona,
        idReserva,
        `¡Reserva confirmada! #${idReserva}`,
        `Tu reserva en ${nombre_hospedaje} del ${fecha_inicio} al ${fecha_fin} fue confirmada. Total: $${precioFinal.toLocaleString()}.`,
      ])
    } catch (_) { /* no bloquear si falla la notificación */ }

    await client.query('COMMIT')

    res.status(201).json({
      ok: true,
      id_reserva:       idReserva,
      precio_total:     precioFinal,
      monto_impuestos:  montoImpuestos,
      monto_cargos:     montoCargos,
      costo_proteccion: costoProteccion,
      tipo_pago,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('❌ /api/reservas/checkout error:', err.stack)
    next(err)
  } finally {
    client.release()
  }
})

// PUT /api/reservas/:id/cancelar
router.put('/:id/cancelar', authenticateToken, async (req, res, next) => {
  const client = await db.getClient()
  try {
    await client.query('BEGIN')
    const idPersona = req.user.id_persona

    const { rows } = await client.query(`
      SELECT r."ID_RESERVA"
      FROM public."RESERVA" r
      WHERE r."ID_RESERVA" = $1 AND r."ID_CLIENTE" = $2
    `, [req.params.id, idPersona])

    if (!rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Reserva no encontrada' })
    }

    // ID_ESTADO 3 = cancelada (ajusta si tu semilla usa otro valor)
    await client.query(
      `UPDATE public."RESERVA" SET "ID_ESTADO" = 3 WHERE "ID_RESERVA" = $1`,
      [req.params.id]
    )

    try {
      await client.query(`
        INSERT INTO public."NOTIFICACION"
          ("ID_CLIENTE","ID_TIPO","ID_CANAL","ID_RESERVA","TITULO","MENSAJE")
        VALUES ($1, 2, 1, $2, $3, $4)
      `, [
        idPersona, req.params.id,
        'Reserva cancelada',
        `Tu reserva #${req.params.id} ha sido cancelada.`,
      ])
    } catch (_) {}

    await client.query('COMMIT')
    res.json({ ok: true, mensaje: 'Reserva cancelada' })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
})

export default router