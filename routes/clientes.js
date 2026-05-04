// routes/clientes.js
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import * as db from '../db.js'

const router = Router()

// ── GET /api/clientes — Lista unificada para la tabla de Usuarios ──────────────
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        c."ID_CLIENTE"                        AS id,
        p."NOMBRE_COMPLETO"                   AS nombre,
        u."CORREO_ELECTRONICO"                AS correo,
        c."ESTADO_CLIENTE"                    AS estado,
        c."FECHA_REGISTRO"                    AS fecha_registro,
        c."GENERO"                            AS genero,
        c."FECHA_NACIMIENTO"                  AS fecha_nacimiento,
        nm."NOMBRE_NIVEL"                     AS nivel_membresia,
        CASE 
          WHEN m."ID_CLIENTE" IS NOT NULL THEN 'Miembro'
          ELSE 'Cliente'
        END                                   AS tipo
      FROM public."CLIENTE" c
      LEFT JOIN public."PERSONA"  p ON p."ID_PERSONA"  = c."ID_CLIENTE"
      LEFT JOIN public."USUARIO"  u ON u."ID_PERSONA"  = c."ID_CLIENTE"
      LEFT JOIN public."MIEMBRO" m          ON m."ID_CLIENTE"  = c."ID_CLIENTE"
      LEFT JOIN public."NIVEL_MEMBRESIA" nm ON nm."ID_NIVEL"   = m."ID_NIVEL"
      ORDER BY p."NOMBRE_COMPLETO"
    `)
    res.json(rows)
  } catch (err) { next(err) }
})

// ── GET /api/clientes/buscar?q=texto — Búsqueda para AgregarMiembro ───────────
router.get('/buscar', async (req, res, next) => {
  const q = (req.query.q || '').trim()
  if (!q) return res.json([])

  try {
    const { rows } = await db.query(`
      SELECT
        c."ID_CLIENTE",
        p."NOMBRE_COMPLETO"    AS "NOMBRE",
        u."CORREO_ELECTRONICO" AS "CORREO",
        c."ESTADO_CLIENTE",
        CASE WHEN m."ID_CLIENTE" IS NOT NULL THEN true ELSE false END AS tiene_membresia
      FROM public."CLIENTE"  c
      JOIN public."PERSONA"  p ON p."ID_PERSONA" = c."ID_CLIENTE"
      JOIN public."USUARIO"  u ON u."ID_PERSONA" = c."ID_CLIENTE"
      LEFT JOIN public."MIEMBRO" m ON m."ID_CLIENTE" = c."ID_CLIENTE"
      WHERE
        p."NOMBRE_COMPLETO" ILIKE $1
        OR u."CORREO_ELECTRONICO" ILIKE $1
        OR c."ID_CLIENTE"::text = $2
      ORDER BY p."NOMBRE_COMPLETO"
      LIMIT 10
    `, [`%${q}%`, q])
    res.json(rows)
  } catch (err) { next(err) }
})

// ── GET /api/clientes/:id?tipo=cliente — Detalle para edición ─────────────────
router.get('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido' })

  try {
    const { rows } = await db.query(`
      SELECT
        c."ID_CLIENTE",
        p."NOMBRE_COMPLETO",
        p."APELLIDOS",
        p."SEGUNDO_NOMBRE",
        p."NUM_VIAJERO_CONOCIDO",
        p."NUM_DHS_TRIP",
        p."CONTACTO_EMERGENCIA_NOMBRE",
        p."CONTACTO_EMERGENCIA_TEL",
        c."ESTADO_CLIENTE",
        c."FECHA_REGISTRO",
        c."GENERO",
        c."FECHA_NACIMIENTO",
        c."DESCRIPCION_PERSONAL",
        u."ID_USUARIO",
        u."USUARIO",
        u."CORREO_ELECTRONICO",
        u."GOOGLE_ID",
        doc."NUMERO_DOCUMENTACION",
        doc."FECHA_EMISION",
        doc."FECHA_EXPIRACION",
        doc."EMISOR",
        doc."ID_TIPO"   AS id_tipo_documento,
        tel."CODIGO_PAIS",
        tel."NUMERO_TELEFONICO",
        tel."ID_TIPO"   AS id_tipo_telefono
      FROM public."CLIENTE" c
      LEFT JOIN public."PERSONA" p  ON p."ID_PERSONA" = c."ID_CLIENTE"
      LEFT JOIN public."USUARIO" u  ON u."ID_PERSONA" = c."ID_CLIENTE"
      LEFT JOIN public."DOCUMENTACION" doc ON doc."ID_PERSONA" = c."ID_CLIENTE"
      LEFT JOIN public."TELEFONO" tel      ON tel."ID_PERSONA" = c."ID_CLIENTE"
      WHERE c."ID_CLIENTE" = $1
      LIMIT 1
    `, [id])

    if (!rows.length) return res.status(404).json({ message: 'Cliente no encontrado' })
    res.json(rows[0])
  } catch (err) { next(err) }
})

// ── POST /api/clientes — Crear cliente completo ───────────────────────────────
router.post('/', async (req, res, next) => {
  const { persona, cliente, documentacion, cuenta, telefono } = req.body

  if (!persona?.nombre_completo) return res.status(400).json({ message: 'Nombre completo requerido' })
  if (!cuenta?.correo)           return res.status(400).json({ message: 'Correo requerido' })
  if (!cuenta?.usuario)          return res.status(400).json({ message: 'Usuario requerido' })

  const pool = db.getPool ? db.getPool() : db  // soporte para ambas exportaciones
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // 1. Persona
    const { rows: [p] } = await client.query(`
      INSERT INTO public."PERSONA"
        ("NOMBRE_COMPLETO", "APELLIDOS", "SEGUNDO_NOMBRE",
         "NUM_VIAJERO_CONOCIDO", "NUM_DHS_TRIP")
      VALUES ($1, $2, $3, $4, $5)
      RETURNING "ID_PERSONA"
    `, [
      persona.nombre_completo,
      persona.apellidos        || null,
      persona.segundo_nombre   || null,
      persona.num_viajero_conocido || null,
      persona.num_dhs_trip         || null,
    ])
    const idPersona = p.ID_PERSONA

    // 2. Cliente
    await client.query(`
      INSERT INTO public."CLIENTE"
        ("ID_CLIENTE", "ESTADO_CLIENTE", "FECHA_REGISTRO", "GENERO",
         "FECHA_NACIMIENTO", "DESCRIPCION_PERSONAL")
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      idPersona,
      cliente?.estado_cliente       || 'A',
      cliente?.fecha_registro       || new Date().toISOString().slice(0, 10),
      cliente?.genero               || null,
      cliente?.fecha_nacimiento     || null,
      cliente?.descripcion_personal || null,
    ])

    // 3. Usuario / cuenta
    await client.query(`
      INSERT INTO public."USUARIO"
        ("USUARIO", "CORREO_ELECTRONICO", "GOOGLE_ID", "CONTRASENA", "ID_PERSONA")
      VALUES ($1, $2, $3, $4, $5)
    `, [
      cuenta.usuario,
      cuenta.correo,
      cuenta.google_id   || null,
      cuenta.contrasena  || null,
      idPersona,
    ])

    // 4. Documentación (opcional)
    if (documentacion?.numero_documentacion) {
      await client.query(`
        INSERT INTO public."DOCUMENTACION"
          ("ID_PERSONA", "NUMERO_DOCUMENTACION", "FECHA_EMISION",
           "FECHA_EXPIRACION", "EMISOR", "ID_TIPO")
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        idPersona,
        documentacion.numero_documentacion,
        documentacion.fecha_emision    || null,
        documentacion.fecha_expiracion || null,
        documentacion.emisor           || '',
        documentacion.id_tipo          || null,
      ])
    }

    // 5. Teléfono (opcional)
    if (telefono?.numero_telefonico) {
      const { rows: [tel] } = await client.query(`
        INSERT INTO public."TELEFONO"
          ("CODIGO_PAIS", "NUMERO_TELEFONICO", "ESTADO_TELEFONO", "ID_TIPO", "ID_PERSONA")
        VALUES ($1, $2, $3, $4, $5)
        RETURNING "ID_TELEFONO"
      `, [
        telefono.codigo_pais      || '+1',
        telefono.numero_telefonico,
        telefono.estado_telefono  || 'A',
        telefono.id_tipo          || null,
        idPersona,
      ])
    }

    await client.query('COMMIT')
    res.status(201).json({ message: 'Cliente registrado', id_cliente: idPersona })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
})

// ── PATCH /api/clientes/:id — Actualizar cliente ──────────────────────────────
router.patch('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido' })

  const { persona, cliente, cuenta } = req.body
  const pool = db.getPool ? db.getPool() : db
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    if (persona) {
      await client.query(`
        UPDATE public."PERSONA"
        SET "NOMBRE_COMPLETO" = COALESCE($1, "NOMBRE_COMPLETO"),
            "APELLIDOS"       = COALESCE($2, "APELLIDOS"),
            "SEGUNDO_NOMBRE"  = COALESCE($3, "SEGUNDO_NOMBRE")
        WHERE "ID_PERSONA" = $4
      `, [persona.nombre_completo, persona.apellidos, persona.segundo_nombre, id])
    }

    if (cliente) {
      await client.query(`
        UPDATE public."CLIENTE"
        SET "ESTADO_CLIENTE"       = COALESCE($1, "ESTADO_CLIENTE"),
            "GENERO"               = COALESCE($2, "GENERO"),
            "FECHA_NACIMIENTO"     = COALESCE($3, "FECHA_NACIMIENTO"),
            "DESCRIPCION_PERSONAL" = COALESCE($4, "DESCRIPCION_PERSONAL")
        WHERE "ID_CLIENTE" = $5
      `, [cliente.estado_cliente, cliente.genero, cliente.fecha_nacimiento, cliente.descripcion_personal, id])
    }

    if (cuenta) {
      await client.query(`
        UPDATE public."USUARIO"
        SET "CORREO_ELECTRONICO" = COALESCE($1, "CORREO_ELECTRONICO"),
            "USUARIO"            = COALESCE($2, "USUARIO")
        WHERE "ID_PERSONA" = $3
      `, [cuenta.correo, cuenta.usuario, id])
    }

    await client.query('COMMIT')
    res.json({ message: 'Cliente actualizado' })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
})

// ── DELETE /api/clientes/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido' })

  try {
    await db.query(`DELETE FROM public."CLIENTE" WHERE "ID_CLIENTE" = $1`, [id])
    res.json({ message: 'Cliente eliminado' })
  } catch (err) { next(err) }
})

export default router