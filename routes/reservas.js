import { Router } from 'express'
import { getPool } from '../db.js'
import { authenticateToken } from '../middleware/authMiddleware.js'

const router = Router()

// ─────────────────────────────────────────────────────────────
// GET /api/reservas/planes-proteccion
// Devuelve todos los planes de protección disponibles.
// Usado por CheckoutReserva.vue en onMounted para mostrar
// el plan en el paso 2 (Protección).
// ─────────────────────────────────────────────────────────────
router.get('/planes-proteccion', async (req, res) => {
  try {
    const pool = getPool()
    const { rows } = await pool.query(
      `SELECT "ID_PLAN", "NOMBRE", "PRECIO_POR_PERSONA", "DESCRIPCION"
       FROM "PLAN_PROTECCION"
       ORDER BY "PRECIO_POR_PERSONA" ASC`
    )
    res.json(rows)
  } catch (err) {
    console.error('Error al obtener planes de protección:', err)
    res.status(500).json({ message: 'Error al obtener planes de protección.' })
  }
})

// ─────────────────────────────────────────────────────────────
// POST /api/reservas/checkout
// Procesa el checkout completo desde CheckoutReserva.vue.
//
// Payload esperado:
// {
//   id_habitacion,
//   fecha_inicio, fecha_fin, noches,
//   tipo_pago: 'ahora' | 'despues',
//   huesped: { nombre, apellidos, codigo_pais, telefono },
//   pago: {
//     metodo: 'tarjeta' | 'paypal' | 'affirm' | 'applepay',
//     guardar: boolean,
//     tarjeta: { nombre_titular, numero, mes_exp, ano_exp, codigo_postal } | null
//   },
//   proteccion: { id_plan: number | null }
// }
// ─────────────────────────────────────────────────────────────
router.post('/checkout', authenticateToken, async (req, res) => {
  const pool = getPool()
  const client = await pool.connect()

  try {
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

    // ── Validaciones básicas ───────────────────────────────
    if (!id_habitacion || !fecha_inicio || !fecha_fin || !huesped || !pago) {
      return res.status(400).json({ message: 'Faltan campos obligatorios.' })
    }
    if (!['ahora', 'despues'].includes(tipo_pago)) {
      return res.status(400).json({ message: 'tipo_pago inválido.' })
    }

    // Obtener ID_PERSONA del usuario para usarlo como ID_CLIENTE
    const { rows: userRows } = await client.query(
      `SELECT "ID_PERSONA" FROM public."USUARIO" WHERE "ID_USUARIO" = $1`,
      [req.user.id]
    )

    if (!userRows.length || !userRows[0].ID_PERSONA) {
      return res.status(401).json({ message: 'Usuario no autenticado como cliente.' })
    }

    const idCliente = userRows[0].ID_PERSONA

    await client.query('BEGIN')

    // ── 1. Verificar que la habitación existe y obtener precio ─
    const { rows: habRows } = await client.query(
      `SELECT h."ID_HABITACION", h."PRECIO_NOCHE", h."ID_HOSPEDAJE"
       FROM "HABITACION" h
       WHERE h."ID_HABITACION" = $1`,
      [id_habitacion]
    )
    if (!habRows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ message: 'Habitación no encontrada.' })
    }
    const habitacion = habRows[0]
    const precioNoche = parseFloat(habitacion.PRECIO_NOCHE)

    // ── 2. Calcular montos ──────────────────────────────────
    const cantidadNoches = noches || calcularNoches(fecha_inicio, fecha_fin)
    if (cantidadNoches === 0) {
      return res.status(400).json({ message: 'Las fechas seleccionadas resultan en 0 noches.' })
    }
    const subtotal       = precioNoche * cantidadNoches
    const montoImpuestos = parseFloat((subtotal * 0.18).toFixed(2))
    const montoCargos    = parseFloat((subtotal * 0.04).toFixed(2))
    const precioBase     = parseFloat((subtotal + montoImpuestos + montoCargos).toFixed(2))
    const montoRecargo   = tipo_pago === 'despues'
                           ? parseFloat((precioBase * 0.03).toFixed(2))
                           : 0

    // Costo de protección
    let costoProteccion = 0
    let idPlanProteccion = null
    if (proteccion?.id_plan) {
      const { rows: planRows } = await client.query(
        `SELECT "ID_PLAN", "PRECIO_POR_PERSONA"
         FROM "PLAN_PROTECCION"
         WHERE "ID_PLAN" = $1`,
        [proteccion.id_plan]
      )
      if (planRows.length) {
        idPlanProteccion = planRows[0].ID_PLAN
        costoProteccion  = parseFloat(planRows[0].PRECIO_POR_PERSONA)
      }
    }

    const precioTotal = parseFloat(
      (precioBase + montoRecargo + costoProteccion).toFixed(2)
    )

    // Fecha límite de cancelación = fecha_inicio - 1 día
    const fechaLimiteCancelacion = restarUnDia(fecha_inicio)

    // ── 3. Obtener ubicación origen/destino desde hospedaje ─
    const { rows: ubicRows } = await client.query(
      `SELECT ho."ID_UBICACION"
       FROM "HOSPEDAJE" ho
       WHERE ho."ID_HOSPEDAJE" = $1`,
      [habitacion.ID_HOSPEDAJE]
    )
    const idUbicacion = ubicRows[0]?.ID_UBICACION ?? 1

    // ── 4. Obtener el ID_EMPLEADO de soporte (empleado por defecto) ─
    const { rows: empRows } = await client.query(
      `SELECT "ID_EMPLEADO" FROM "EMPLEADO" LIMIT 1`
    )
    const idEmpleado = empRows[0]?.ID_EMPLEADO
    if (!idEmpleado) {
      await client.query('ROLLBACK')
      return res.status(500).json({ message: 'No hay empleados registrados en el sistema.' })
    }

    // ── 5. Obtener estado "Confirmada" ──────────────────────
    const { rows: estadoRows } = await client.query(
      `SELECT "ID_ESTADO" FROM "ESTADO_RESERVA"
       WHERE LOWER("ESTADO") IN ('confirmada', 'confirmado')
       LIMIT 1`
    )
    const idEstado = estadoRows[0]?.ID_ESTADO ?? 1

    // ── 6. Obtener ID_ORIGEN del cliente (ubicación personal) ─
    const { rows: personaRows } = await client.query(
      `SELECT p."ID_UBICACION"
       FROM "PERSONA" p
       JOIN "USUARIO" u ON u."ID_PERSONA" = p."ID_PERSONA"
       WHERE u."ID_USUARIO" = $1`,
      [req.user.id]
    )
    const idOrigen  = personaRows[0]?.ID_UBICACION ?? idUbicacion
    const idDestino = idUbicacion

    // ── 7. Insertar RESERVA principal ───────────────────────
    const { rows: maxReservaRows } = await client.query(
      `SELECT COALESCE(MAX("ID_RESERVA"), 0) + 1 AS next_id FROM "RESERVA"`
    )
    const nextIdReserva = maxReservaRows[0].next_id

    await client.query(
      `INSERT INTO "RESERVA"
         ("ID_RESERVA", "FECHA_INICIO", "FECHA_FIN",
          "ID_ESTADO", "ID_EMPLEADO", "ID_CLIENTE",
          "ID_ORIGEN", "ID_DESTINO")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        nextIdReserva, fecha_inicio, fecha_fin, idEstado, idEmpleado, idCliente, idOrigen, idDestino
      ]
    )
    const idReserva = nextIdReserva

    // ── 8. Insertar DETALLE_RESERVA ─────────────────────────
    const { rows: maxDetalleRows } = await client.query(
      `SELECT COALESCE(MAX("ID_DETALLE"), 0) + 1 AS next_id FROM "DETALLE_RESERVA"`
    )
    const nextIdDetalle = maxDetalleRows[0].next_id

    const { rows: detalleRows } = await client.query(
      `INSERT INTO "DETALLE_RESERVA"
         ("ID_DETALLE", "CANTIDAD_NOCHE", "FECHA_INICIO", "FECHA_FIN",
          "PRECIO_TOTAL", "ID_RESERVA", "ID_PLAN_PROTECCION",
          "COSTO_PROTECCION", "TIPO_PAGO", "MONTO_IMPUESTOS",
          "MONTO_CARGOS", "MONTO_RECARGO", "FECHA_LIMITE_CANCELACION",
          "ID_HABITACION")
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING "ID_DETALLE"`,
      [
        nextIdDetalle, cantidadNoches, fecha_inicio, fecha_fin,
        precioTotal, idReserva, idPlanProteccion,
        costoProteccion, tipo_pago, montoImpuestos,
        montoCargos, montoRecargo, fechaLimiteCancelacion,
        id_habitacion,
      ]
    )
    const idDetalle = detalleRows[0].ID_DETALLE

    // ── 9. Insertar HUESPED_RESERVA ─────────────────────────
    await client.query(
      `INSERT INTO "HUESPED_RESERVA"
         ("ID_DETALLE", "NOMBRE", "APELLIDOS", "CODIGO_PAIS", "TELEFONO")
       VALUES ($1, $2, $3, $4, $5)`,
      [
        idDetalle,
        huesped.nombre.trim(),
        huesped.apellidos.trim(),
        huesped.codigo_pais,
        huesped.telefono.replace(/\D/g, ''),
      ]
    )

    // ── 10. Guardar método de pago (si aplica) ──────────────
    let idMetodoPago = null

    if (pago.metodo === 'tarjeta' && pago.tarjeta) {
      const t = pago.tarjeta
      const ultimos4 = t.numero.replace(/\s/g, '').slice(-4)

      if (pago.guardar) {
        // Guardar tarjeta para uso futuro
        const { rows: metRows } = await client.query(
          `INSERT INTO "METODO_PAGO"
             ("ID_PERSONA", "TIPO", "ULTIMOS4", "NOMBRE_TITULAR",
              "MES_EXP", "ANO_EXP", "CODIGO_POSTAL", "GUARDADA")
           SELECT p."ID_PERSONA", 'tarjeta', $1, $2, $3, $4, $5, true
           FROM "USUARIO" u
           JOIN "PERSONA" p ON p."ID_PERSONA" = u."ID_PERSONA"
           WHERE u."ID_USUARIO" = $6
           RETURNING "ID_METODO"`,
          [ultimos4, t.nombre_titular, t.mes_exp, t.ano_exp, t.codigo_postal, req.user.id]
        )
        idMetodoPago = metRows[0]?.ID_METODO ?? null
      } else {
        // Registro temporal (no guardada) para trazabilidad
        const { rows: metRows } = await client.query(
          `INSERT INTO "METODO_PAGO"
             ("ID_PERSONA", "TIPO", "ULTIMOS4", "NOMBRE_TITULAR",
              "MES_EXP", "ANO_EXP", "CODIGO_POSTAL", "GUARDADA")
           SELECT p."ID_PERSONA", 'tarjeta', $1, $2, $3, $4, $5, false
           FROM "USUARIO" u
           JOIN "PERSONA" p ON p."ID_PERSONA" = u."ID_PERSONA"
           WHERE u."ID_USUARIO" = $6
           RETURNING "ID_METODO"`,
          [ultimos4, t.nombre_titular, t.mes_exp, t.ano_exp, t.codigo_postal, req.user.id]
        )
        idMetodoPago = metRows[0]?.ID_METODO ?? null
      }
    } else if (['paypal', 'affirm', 'applepay'].includes(pago.metodo)) {
      // Métodos alternativos: sin datos de tarjeta
      const { rows: metRows } = await client.query(
        `INSERT INTO "METODO_PAGO"
           ("ID_PERSONA", "TIPO", "GUARDADA")
         SELECT p."ID_PERSONA", $1, false
         FROM "USUARIO" u
         JOIN "PERSONA" p ON p."ID_PERSONA" = u."ID_PERSONA"
         WHERE u."ID_USUARIO" = $2
         RETURNING "ID_METODO"`,
        [pago.metodo, req.user.id]
      )
      idMetodoPago = metRows[0]?.ID_METODO ?? null
    }

    // ── 11. Vincular método de pago al detalle ──────────────
    if (idMetodoPago) {
      await client.query(
        `UPDATE "DETALLE_RESERVA"
         SET "ID_METODO_PAGO" = $1
         WHERE "ID_DETALLE" = $2`,
        [idMetodoPago, idDetalle]
      )
    }

    // ── 12. Actualizar disponibilidad de la habitación ──────
    await client.query(
      `UPDATE "DISPONIBILIDAD"
       SET "CANTIDAD_DISPONIBLE" = GREATEST("CANTIDAD_DISPONIBLE" - 1, 0)
       WHERE "ID_HABITACION" = $1
         AND "FECHA" >= $2::date
         AND "FECHA" < $3::date
         AND "CANTIDAD_DISPONIBLE" > 0`,
      [id_habitacion, fecha_inicio, fecha_fin]
    )

    // ── 13. Notificación de confirmación ────────────────────
    await client.query(
      `INSERT INTO "NOTIFICACION"
         ("ID_CLIENTE", "ID_TIPO", "ID_CANAL",
          "ID_RESERVA", "TITULO", "MENSAJE")
       SELECT $1, t."ID_TIPO", c."ID_CANAL", $2::integer,
              'Reserva confirmada',
              'Tu reserva #' || $2::text || ' fue procesada exitosamente.'
       FROM "TIPO_NOTIFICACION" t, "CANAL_NOTIFICACION" c
       WHERE LOWER(t."NOMBRE")  LIKE '%reserva%'
         AND LOWER(c."NOMBRE")  LIKE '%sistema%'
       LIMIT 1`,
      [idCliente, idReserva]
    )

    await client.query('COMMIT')

    // ── Respuesta ───────────────────────────────────────────
    res.status(201).json({
      success: true,
      id_reserva:  idReserva,
      id_detalle:  idDetalle,
      precio_total: precioTotal,
      fecha_limite_cancelacion: fechaLimiteCancelacion,
      message: 'Reserva confirmada exitosamente.',
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error en checkout:', err)

    if (err.code === '23503') {
      return res.status(400).json({ message: 'Referencia inválida en los datos enviados.' })
    }
    if (err.code === '23514') {
      return res.status(400).json({ message: 'Valor fuera del rango permitido.' })
    }
    res.status(500).json({
      message: 'Ocurrió un error al procesar tu reserva. Intenta de nuevo.',
    })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────
// GET /api/reservas/mis-reservas
// Devuelve las reservas del cliente autenticado.
// ─────────────────────────────────────────────────────────────
router.get('/mis-reservas', authenticateToken, async (req, res) => {
  try {
    const pool = getPool()
    // Obtener ID_PERSONA del usuario
    const { rows: userRows } = await pool.query(
      `SELECT "ID_PERSONA" FROM public."USUARIO" WHERE "ID_USUARIO" = $1`,
      [req.user.id]
    )

    if (!userRows.length || !userRows[0]?.ID_PERSONA) {
      return res.status(401).json({ message: 'No autenticado como cliente.' })
    }

    const idCliente = userRows[0].ID_PERSONA

    const { rows } = await pool.query(
      `SELECT
         r."ID_RESERVA",
         r."FECHA_INICIO",
         r."FECHA_FIN",
         er."ESTADO",
         dr."CANTIDAD_NOCHE",
         dr."PRECIO_TOTAL",
         dr."TIPO_PAGO",
         dr."FECHA_LIMITE_CANCELACION",
         dr."MONTO_RECARGO",
         th."NOMBRE"          AS tipo_habitacion,
         ho."ID_HOSPEDAJE",
         ub."NOMBRE"          AS ubicacion,
         hr."NOMBRE"          AS huesped_nombre,
         hr."APELLIDOS"       AS huesped_apellidos,
         (SELECT ih."URL"
          FROM "IMAGEN_HOSPEDAJE" ih
          WHERE ih."ID_HOSPEDAJE" = ho."ID_HOSPEDAJE"
          ORDER BY ih."ORDEN" LIMIT 1) AS imagen_portada
       FROM "RESERVA" r
       JOIN "ESTADO_RESERVA"  er ON er."ID_ESTADO"   = r."ID_ESTADO"
       JOIN "DETALLE_RESERVA" dr ON dr."ID_RESERVA"  = r."ID_RESERVA"
       JOIN "HABITACION"       h  ON h."ID_HABITACION" = dr."ID_HABITACION"
       JOIN "TIPO_HABITACION" th  ON th."ID_TIPO_HABITACION" = h."ID_TIPO_HABITACION"
       JOIN "HOSPEDAJE"       ho  ON ho."ID_HOSPEDAJE" = h."ID_HOSPEDAJE"
       JOIN "UBICACION"       ub  ON ub."ID_UBICACION" = ho."ID_UBICACION"
       LEFT JOIN "HUESPED_RESERVA" hr ON hr."ID_DETALLE" = dr."ID_DETALLE"
       WHERE r."ID_CLIENTE" = $1
       ORDER BY r."FECHA_INICIO" DESC`,
      [idCliente]
    )
    res.json(rows)
  } catch (err) {
    console.error('Error al obtener reservas:', err)
    res.status(500).json({ message: 'Error al obtener tus reservas.' })
  }
})

// ─────────────────────────────────────────────────────────────
// GET /api/reservas/:id
// Detalle completo de una reserva específica.
// ─────────────────────────────────────────────────────────────
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = getPool()
    const idReserva = parseInt(req.params.id, 10)

    // Obtener ID_PERSONA del usuario
    const { rows: userRows } = await pool.query(
      `SELECT "ID_PERSONA" FROM public."USUARIO" WHERE "ID_USUARIO" = $1`,
      [req.user.id]
    )

    if (!userRows.length || !userRows[0]?.ID_PERSONA) {
      return res.status(401).json({ message: 'No autenticado como cliente.' })
    }
    const idCliente = userRows[0]?.ID_PERSONA

    const { rows } = await pool.query(
      `SELECT
         r."ID_RESERVA",
         r."FECHA_INICIO",
         r."FECHA_FIN",
         er."ESTADO",
         dr."ID_DETALLE",
         dr."CANTIDAD_NOCHE",
         dr."PRECIO_TOTAL",
         dr."TIPO_PAGO",
         dr."MONTO_IMPUESTOS",
         dr."MONTO_CARGOS",
         dr."MONTO_RECARGO",
         dr."COSTO_PROTECCION",
         dr."FECHA_LIMITE_CANCELACION",
         pp."NOMBRE"          AS plan_proteccion,
         h."ID_HABITACION",
         th."NOMBRE"          AS tipo_habitacion,
         h."PRECIO_NOCHE",
         ho."ID_HOSPEDAJE",
         ho."CHECKIN",
         ho."CHECKOUT",
         ub."NOMBRE"          AS ubicacion,
         hr."NOMBRE"          AS huesped_nombre,
         hr."APELLIDOS"       AS huesped_apellidos,
         hr."CODIGO_PAIS",
         hr."TELEFONO"
       FROM "RESERVA" r
       JOIN "ESTADO_RESERVA"  er ON er."ID_ESTADO"   = r."ID_ESTADO"
       JOIN "DETALLE_RESERVA" dr ON dr."ID_RESERVA"  = r."ID_RESERVA"
       JOIN "HABITACION"       h  ON h."ID_HABITACION" = dr."ID_HABITACION"
       JOIN "TIPO_HABITACION" th  ON th."ID_TIPO_HABITACION" = h."ID_TIPO_HABITACION"
       JOIN "HOSPEDAJE"       ho  ON ho."ID_HOSPEDAJE" = h."ID_HOSPEDAJE"
       JOIN "UBICACION"       ub  ON ub."ID_UBICACION" = ho."ID_UBICACION"
       LEFT JOIN "PLAN_PROTECCION"  pp ON pp."ID_PLAN"    = dr."ID_PLAN_PROTECCION"
       LEFT JOIN "HUESPED_RESERVA"  hr ON hr."ID_DETALLE" = dr."ID_DETALLE"
       WHERE r."ID_RESERVA" = $1
         AND r."ID_CLIENTE" = $2`,
      [idReserva, idCliente]
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'Reserva no encontrada.' })
    }
    res.json(rows[0])
  } catch (err) {
    console.error('Error al obtener reserva:', err)
    res.status(500).json({ message: 'Error al obtener la reserva.' })
  }
})

// ─────────────────────────────────────────────────────────────
// DELETE /api/reservas/:id/cancelar
// Cancela una reserva si está dentro del período de cancelación.
// ─────────────────────────────────────────────────────────────
router.delete('/:id/cancelar', authenticateToken, async (req, res) => {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const idReserva = parseInt(req.params.id, 10)

    // Obtener ID_PERSONA del usuario
    const { rows: userRows } = await client.query(
      `SELECT "ID_PERSONA" FROM public."USUARIO" WHERE "ID_USUARIO" = $1`,
      [req.user.id]
    )
    if (!userRows.length || !userRows[0].ID_PERSONA) {
      return res.status(401).json({ message: 'No autenticado como cliente.' })
    }
    const idCliente = userRows[0].ID_PERSONA

    await client.query('BEGIN')

    // Verificar que la reserva pertenece al cliente
    const { rows } = await client.query(
      `SELECT r."ID_RESERVA", dr."FECHA_LIMITE_CANCELACION", dr."ID_HABITACION",
              dr."FECHA_INICIO", dr."FECHA_FIN"
       FROM "RESERVA" r
       JOIN "DETALLE_RESERVA" dr ON dr."ID_RESERVA" = r."ID_RESERVA"
       WHERE r."ID_RESERVA" = $1 AND r."ID_CLIENTE" = $2`,
      [idReserva, idCliente]
    )
    if (!rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ message: 'Reserva no encontrada.' })
    }

    const reserva = rows[0]
    const hoy     = new Date().toISOString().split('T')[0]

    if (reserva.FECHA_LIMITE_CANCELACION && reserva.FECHA_LIMITE_CANCELACION < hoy) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        message: 'El período de cancelación gratuita ha vencido.',
      })
    }

    // Cambiar estado a "Cancelada"
    const { rows: estadoRows } = await client.query(
      `SELECT "ID_ESTADO" FROM "ESTADO_RESERVA"
       WHERE LOWER("ESTADO") IN ('cancelada', 'cancelado') LIMIT 1`
    )
    const idEstadoCancelada = estadoRows[0]?.ID_ESTADO
    if (!idEstadoCancelada) {
      await client.query('ROLLBACK')
      return res.status(500).json({ message: 'Estado "Cancelada" no configurado.' })
    }

    await client.query(
      `UPDATE "RESERVA" SET "ID_ESTADO" = $1 WHERE "ID_RESERVA" = $2`,
      [idEstadoCancelada, idReserva]
    )

    // Restaurar disponibilidad
    await client.query(
      `UPDATE "DISPONIBILIDAD"
       SET "CANTIDAD_DISPONIBLE" = "CANTIDAD_DISPONIBLE" + 1
       WHERE "ID_HABITACION" = $1
         AND "FECHA" >= $2::date
         AND "FECHA" < $3::date`,
      [reserva.ID_HABITACION, reserva.FECHA_INICIO, reserva.FECHA_FIN]
    )

    await client.query('COMMIT')
    res.json({ success: true, message: 'Reserva cancelada exitosamente.' })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error al cancelar reserva:', err)
    res.status(500).json({ message: 'Error al cancelar la reserva.' })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function calcularNoches(fechaInicio, fechaFin) {
  const msDay = 1000 * 60 * 60 * 24
  const d1    = new Date(fechaInicio + 'T00:00:00')
  const d2    = new Date(fechaFin    + 'T00:00:00')
  const diff  = Math.round((d2 - d1) / msDay)
  return diff > 0 ? diff : 0
}

function restarUnDia(fechaStr) {
  const d = new Date(fechaStr + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

export default router