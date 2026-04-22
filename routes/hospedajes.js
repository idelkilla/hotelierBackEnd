// src/routes/hospedajes.js
// Endpoints principales del módulo de hospedaje.
//
// Flujo de inserción (POST /hospedajes):
//   Transacción única:
//     1. INSERT → UBICACION
//     2. INSERT → SERVICIO        (tabla base de herencia)
//     3. INSERT → HOSPEDAJE       (especialización, FK a SERVICIO y UBICACION)
//     4. INSERT → HOSPEDAJE_SERVICIO  (amenidades, N:M)
//
// Habitaciones  → POST /hospedajes/:id/habitaciones  (bulk)
// Imágenes      → POST /hospedajes/:id/imagenes      (multipart/form-data)

import { Router } from 'express';
import path from 'path';
import * as db from '../db.js';
import upload from '../config/upload.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import dotenv from 'dotenv';

dotenv.config();
const router = Router();
const SERVER_URL                  = process.env.SERVER_URL || 'http://localhost:3000'
const ID_TIPO_SERVICIO_HOSPEDAJE  = parseInt(process.env.ID_TIPO_SERVICIO_HOSPEDAJE || '1')
const ID_TIPO_UBICACION_HOTEL     = parseInt(process.env.ID_TIPO_UBICACION_HOTEL    || '1')

// ── Helpers ──────────────────────────────────────────────────────
const requerido = (valor, campo) => {
  if (valor === undefined || valor === null || valor === '') {
    const err = new Error(`El campo "${campo}" es requerido.`)
    err.status = 400
    throw err
  }
  return valor
}

// ─────────────────────────────────────────────────────────────────
// GET /api/hospedajes  — listado con datos básicos
// ─────────────────────────────────────────────────────────────────
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT
         h."ID_HOSPEDAJE",
         s."NOMBRE",
         th."NOMBRE_TIPO"   AS "TIPO_HOSPEDAJE",
         u."NOMBRE"         AS "UBICACION",
         ci."NOMBRE"        AS "CIUDAD",
         pa."NOMBRE"        AS "PAIS",
         u."LATITUD",
         u."LONGITUD",
         -- Primera imagen (portada)
         (SELECT img."URL"
          FROM public."IMAGEN_HOSPEDAJE" img
          WHERE img."ID_HOSPEDAJE" = h."ID_HOSPEDAJE"
          ORDER BY img."ORDEN"
          LIMIT 1)          AS "IMAGEN_PORTADA"
       FROM public."HOSPEDAJE"      h
       JOIN public."SERVICIO"       s  ON s."ID_SERVICIO"  = h."ID_HOSPEDAJE"
       JOIN public."TIPO_HOSPEDAJE" th ON th."ID_TIPO"     = h."ID_TIPO"
       JOIN public."UBICACION"      u  ON u."ID_UBICACION" = h."ID_UBICACION"
       JOIN public."CIUDAD"         ci ON ci."ID_CIUDAD"   = u."ID_CIUDAD"
       JOIN public."PAIS"           pa ON pa."ID_PAIS"     = ci."ID_PAIS"
       ORDER BY h."ID_HOSPEDAJE" DESC`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// ─────────────────────────────────────────────────────────────────
// GET /api/hospedajes/:id  — detalle completo
// ─────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  const { id } = req.params
  try {
    // Datos principales
    const { rows } = await db.query(
      `SELECT
         h."ID_HOSPEDAJE",
         s."NOMBRE",
         th."NOMBRE_TIPO"   AS "TIPO_HOSPEDAJE",
         u."NOMBRE"         AS "NOMBRE_UBICACION",
         u."LATITUD",
         u."LONGITUD",
         ci."ID_CIUDAD",
         ci."NOMBRE"        AS "CIUDAD",
         pa."ID_PAIS",
         pa."NOMBRE"        AS "PAIS",
         h."CHECKIN",
         h."CHECKOUT",
         h."CANCELACION",
         h."MASCOTAS",
         h."FUMAR",
         h."DESCRIPCION"
       FROM public."HOSPEDAJE"      h
       JOIN public."SERVICIO"       s  ON s."ID_SERVICIO"  = h."ID_HOSPEDAJE"
       JOIN public."TIPO_HOSPEDAJE" th ON th."ID_TIPO"     = h."ID_TIPO"
       JOIN public."UBICACION"      u  ON u."ID_UBICACION" = h."ID_UBICACION"
       JOIN public."CIUDAD"         ci ON ci."ID_CIUDAD"   = u."ID_CIUDAD"
       JOIN public."PAIS"           pa ON pa."ID_PAIS"     = ci."ID_PAIS"
       WHERE h."ID_HOSPEDAJE" = $1`,
      [id]
    )
    if (!rows.length) return res.status(404).json({ message: 'Hospedaje no encontrado.' })

    // Amenidades
    const { rows: amenidades } = await db.query(
      `SELECT si."ID_SERVICIO_INCLUIDO", si."NOMBRE"
       FROM public."HOSPEDAJE_SERVICIO" hs
       JOIN public."SERVICIO_INCLUIDO"  si ON si."ID_SERVICIO_INCLUIDO" = hs."ID_SERVICIO_INCLUIDO"
       WHERE hs."ID_HOSPEDAJE" = $1`,
      [id]
    )

    // Habitaciones
    const { rows: habitaciones } = await db.query(
      `SELECT
         h."ID_HABITACION",
         t."NOMBRE"            AS "TIPO_HABITACION",
         h."CAPACIDAD_ADULTO",
         h."CAPACIDAD_NINOS",
         h."PRECIO_NOCHE"
       FROM public."HABITACION"       h
       JOIN public."TIPO_HABITACION"  t ON t."ID_TIPO_HABITACION" = h."ID_TIPO_HABITACION"
       WHERE h."ID_HOSPEDAJE" = $1
       ORDER BY h."PRECIO_NOCHE"`,
      [id]
    )

    // Imágenes
    const { rows: imagenes } = await db.query(
      `SELECT "ID_IMAGEN", "URL", "ORDEN", "ALT_TEXT"
       FROM public."IMAGEN_HOSPEDAJE"
       WHERE "ID_HOSPEDAJE" = $1
       ORDER BY "ORDEN"`,
      [id]
    )

    res.json({ ...rows[0], amenidades, habitaciones, imagenes })
  } catch (err) { next(err) }
})

// ─────────────────────────────────────────────────────────────────
// POST /api/hospedajes  — crear hospedaje completo (transacción)
// ─────────────────────────────────────────────────────────────────
router.post('/', authenticateToken, async (req, res, next) => {
  const {
    nombre,
    descripcion        = '',
    id_tipo_hospedaje,
    nombre_legal,
    rnc,
    id_tipo_proveedor,
    ubicacion  = {},
    servicios_incluidos = [],
    checkin    = '15:00',
    checkout   = '11:00',
    cancelacion= 'flexible',
    mascotas   = false,
    fumar      = false,
  } = req.body

  const id_proveedor = req.user.id // Obtenido de forma segura desde el token JWT

  // Validaciones básicas
  try {
    requerido(nombre,            'nombre')
    requerido(id_tipo_hospedaje, 'id_tipo_hospedaje')
    requerido(ubicacion.id_ciudad, 'ubicacion.id_ciudad')
    requerido(ubicacion.latitud,   'ubicacion.latitud')
    requerido(ubicacion.longitud,  'ubicacion.longitud')
  } catch (err) { return next(err) }

  const client = await db.connect()
  try {
    await client.query('BEGIN')

    // 1. VERIFICAR O INSERTAR UBICACION ───────────────────────────
    const { rows: existingUbic } = await client.query(
      `SELECT "ID_UBICACION" FROM public."UBICACION"
       WHERE "NOMBRE" = $1 AND "LATITUD" = $2 AND "LONGITUD" = $3`,
      [ubicacion.nombre || nombre, ubicacion.latitud, ubicacion.longitud]
    );

    let idUbicacion;

    if (existingUbic.length > 0) {
      // Ya existe, usamos el ID que encontramos
      idUbicacion = existingUbic[0].ID_UBICACION;
    } else {
      // No existe, lo insertamos
      const { rows: [newUbic] } = await client.query(
        `INSERT INTO public."UBICACION" ("NOMBRE", "LATITUD", "LONGITUD", "ESTADO", "ID_TIPO", "ID_CIUDAD")
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING "ID_UBICACION"`,
        [ubicacion.nombre || nombre, ubicacion.latitud, ubicacion.longitud, 'A', ID_TIPO_UBICACION_HOTEL, ubicacion.id_ciudad]
      );
      if (!newUbic) throw new Error('Error al crear la ubicación'); // Fallback por si no retorna el ID
      idUbicacion = newUbic.ID_UBICACION;
    }

    // 2. INSERT/GET PROVEEDOR ─────────────────────────────────────
    const { rows: [provRow] } = await client.query(
      `INSERT INTO public."PROVEEDOR" ("NOMBRE_LEGAL", "RNC", "ID_TIPO")
       VALUES ($1, $2, $3)
       ON CONFLICT ("RNC") DO UPDATE SET "NOMBRE_LEGAL" = EXCLUDED."NOMBRE_LEGAL"
       RETURNING "ID_PROVEEDOR"`,
      [nombre_legal, rnc, id_tipo_proveedor || 1]
    )
    const idProveedor = provRow.ID_PROVEEDOR

    // 3. INSERT SERVICIO (tabla base de herencia) ─────────────────
    const { rows: [srvRow] } = await client.query(
      `INSERT INTO public."SERVICIO"
         ("NOMBRE", "ID_PROVEEDOR", "ID_TIPO")
       VALUES ($1, $2, $3)
       RETURNING "ID_SERVICIO"`,
      [nombre, idProveedor, ID_TIPO_SERVICIO_HOSPEDAJE]
    )

    if (!srvRow) throw new Error('Error al crear el servicio');
    const idServicio = srvRow.ID_SERVICIO

    // 4. INSERT HOSPEDAJE (con todos los campos de políticas) ─────
    // Volvemos a usar el ID de servicio para mantener la herencia 1:1
    await client.query(
      `INSERT INTO public."HOSPEDAJE"
         ("ID_HOSPEDAJE", "ID_TIPO", "ID_UBICACION",
          "CHECKIN", "CHECKOUT", "CANCELACION", "MASCOTAS", "FUMAR", "DESCRIPCION")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        idServicio, id_tipo_hospedaje, idUbicacion,
        checkin, checkout, cancelacion, mascotas, fumar, descripcion
      ]
    )
    const idHospedaje = idServicio

    // 5. INSERT HOSPEDAJE_SERVICIO (amenidades) ───────────────────
    if (servicios_incluidos.length) {
      const values = servicios_incluidos
        .map((_, i) => `($1, $${i + 2})`)
        .join(', ')
      await client.query(
        `INSERT INTO public."HOSPEDAJE_SERVICIO"
           ("ID_HOSPEDAJE", "ID_SERVICIO_INCLUIDO")
         VALUES ${values}
         ON CONFLICT DO NOTHING`,
        [idHospedaje, ...servicios_incluidos]
      )
    }

    await client.query('COMMIT')

    res.status(201).json({
      ID_HOSPEDAJE: idHospedaje,
      message:      'Hospedaje creado exitosamente.',
    })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────────
// POST /api/hospedajes/:id/habitaciones  — agregar habitaciones (bulk)
// ─────────────────────────────────────────────────────────────────
router.post('/:id/habitaciones', authenticateToken, async (req, res, next) => {
  const { id } = req.params
  const habitaciones = req.body  // array de objetos

  if (!Array.isArray(habitaciones) || !habitaciones.length) {
    return res.status(400).json({ message: 'Se esperaba un arreglo de habitaciones.' })
  }

  // Verificar que el hospedaje existe
  const { rows } = await db.query(
    'SELECT "ID_HOSPEDAJE" FROM public."HOSPEDAJE" WHERE "ID_HOSPEDAJE" = $1',
    [id]
  )
  if (!rows.length) return res.status(404).json({ message: 'Hospedaje no encontrado.' })

  const client = await db.connect()
  try {
    await client.query('BEGIN')

    const insertadas = []
    for (const hab of habitaciones) {
      const { id_tipo_habitacion, capacidad_adulto, capacidad_ninos, precio_noche } = hab

      // Validación por habitación
      if (!id_tipo_habitacion) throw Object.assign(new Error('id_tipo_habitacion requerido.'), { status: 400 })
      if (!capacidad_adulto || capacidad_adulto < 1) throw Object.assign(new Error('La capacidad de adultos debe ser al menos 1.'), { status: 400 })
      if (precio_noche    <= 0) throw Object.assign(new Error('precio_noche debe ser > 0.'),  { status: 400 })

      const { rows: [row] } = await client.query(
        `INSERT INTO public."HABITACION"
           ("CAPACIDAD_ADULTO", "CAPACIDAD_NINOS", "PRECIO_NOCHE",
            "ID_HOSPEDAJE", "ID_TIPO_HABITACION")
         VALUES ($1, $2, $3, $4, $5)
         RETURNING "ID_HABITACION"`,
        [capacidad_adulto, capacidad_ninos ?? 0, precio_noche, id, id_tipo_habitacion]
      )
      insertadas.push(row.ID_HABITACION)
    }

    await client.query('COMMIT')
    res.status(201).json({
      ids:     insertadas,
      message: `${insertadas.length} habitación(es) creada(s).`,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────────
// POST /api/hospedajes/:id/imagenes  — subir una imagen (multipart)
// ─────────────────────────────────────────────────────────────────
router.post('/:id/imagenes', authenticateToken, upload.single('imagen'), async (req, res, next) => {
  const { id }     = req.params
  const { orden = 0, alt_text = '' } = req.body

  if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo.' })

  // URL pública de la imagen subida
  const url = `${SERVER_URL}/uploads/${req.file.filename}`

  try {
    const { rows: [row] } = await db.query(
      `INSERT INTO public."IMAGEN_HOSPEDAJE"
         ("URL", "ORDEN", "ALT_TEXT", "ID_HOSPEDAJE")
       VALUES ($1, $2, $3, $4)
       RETURNING "ID_IMAGEN", "URL", "ORDEN"`,
      [url, orden, alt_text, id]
    )
    res.status(201).json(row)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────
// DELETE /api/hospedajes/:id  — eliminar hospedaje (cascade en BD)
// ─────────────────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, async (req, res, next) => {
  const { id } = req.params
  try {
    // ON DELETE CASCADE en HOSPEDAJE → SERVICIO se encarga de todo
    const { rowCount } = await db.query(
      'DELETE FROM public."SERVICIO" WHERE "ID_SERVICIO" = $1',
      [id]
    )
    if (!rowCount) return res.status(404).json({ message: 'Hospedaje no encontrado.' })
    res.json({ message: 'Hospedaje eliminado.' })
  } catch (err) { next(err) }
})

export default router;