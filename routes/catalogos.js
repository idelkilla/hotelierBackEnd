// src/routes/catalogos.js
import { Router } from 'express'
import * as db from '../db.js'

const router = Router()

// ── Hospedaje ────────────────────────────────────────────────────

router.get('/tipos-hospedaje', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT "ID_TIPO", "NOMBRE_TIPO" FROM public."TIPO_HOSPEDAJE" ORDER BY "NOMBRE_TIPO"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/tipos-habitacion', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT "ID_TIPO_HABITACION", "NOMBRE" FROM public."TIPO_HABITACION" ORDER BY "NOMBRE"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/servicios-incluidos', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT "ID_SERVICIO_INCLUIDO", "NOMBRE" FROM public."SERVICIO_INCLUIDO" ORDER BY "NOMBRE"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// ── Geografía ────────────────────────────────────────────────────

router.get('/paises', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT p."ID_PAIS", p."NOMBRE", p."ISO_CODE", p."MONEDA_LOCAL",
              p."CODIGO_TELEFONO", c."NOMBRE" AS "CONTINENTE"
       FROM public."PAIS" p
       JOIN public."CONTINENTE" c ON c."ID_CONTINENTE" = p."ID_CONTINENTE"
       ORDER BY p."NOMBRE"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/ciudades', async (req, res, next) => {
  const idPais = req.query.id_pais
  if (!idPais) return res.status(400).json({ message: 'El parámetro id_pais es requerido.' })
  try {
    const { rows } = await db.query(
      `SELECT "ID_CIUDAD", "NOMBRE" FROM public."CIUDAD"
       WHERE "ID_PAIS" = $1 ORDER BY "NOMBRE"`,
      [idPais]
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// ── Proveedores ──────────────────────────────────────────────────

router.get('/proveedores', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT p."ID_PROVEEDOR", p."NOMBRE_LEGAL", p."RNC",
              t."NOMBRE_TIPO" AS "TIPO_PROVEEDOR"
       FROM public."PROVEEDOR" p
       JOIN public."TIPO_PROVEEDOR" t ON t."ID_TIPO" = p."ID_TIPO"
       ORDER BY p."NOMBRE_LEGAL"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/tipos-proveedor', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT "ID_TIPO", "NOMBRE_TIPO" FROM public."TIPO_PROVEEDOR" ORDER BY "NOMBRE_TIPO"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// ── Empleados ────────────────────────────────────────────────────

router.get('/puestos', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT "ID_PUESTO", "NOMBRE_PUESTO", "SUELDO_BASE"
       FROM public."PUESTO" ORDER BY "NOMBRE_PUESTO"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/idiomas', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT "ID_IDIOMA", "NOMBRE_IDIOMA" FROM public."IDIOMA" ORDER BY "NOMBRE_IDIOMA"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/estados-civiles', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT "ID_ESTADO_CIVIL", "NOMBRE_ESTADO" FROM public."ESTADO_CIVIL" ORDER BY "NOMBRE_ESTADO"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// ── Documentación ────────────────────────────────────────────────

router.get('/tipos-documentacion', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT "ID_TIPO", "TIPO" FROM public."TIPO_DOCUMENTACION" ORDER BY "TIPO"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// ── Contacto ─────────────────────────────────────────────────────

router.get('/tipos-telefono', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT "ID_TIPO", "NOMBRE" FROM public."TIPO_TELEFONO" ORDER BY "NOMBRE"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/tipos-correo', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT "ID_TIPO", "NOMBRE" FROM public."TIPO_CORREO_ELECTRONICO" ORDER BY "NOMBRE"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// ── Membresía ────────────────────────────────────────────────────

router.get('/niveles-membresia', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT "ID_NIVEL", "NOMBRE_NIVEL", "PUNTOS_MINIMOS", "DESCRIPCION"
       FROM public."NIVEL_MEMBRESIA" ORDER BY "PUNTOS_MINIMOS"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

export default router