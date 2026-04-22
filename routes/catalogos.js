// src/routes/catalogos.js
// Endpoints de solo lectura para llenar los <select> del frontend.
// Todos los datos vienen directamente de las tablas maestras del schema.
import { Router } from 'express';
import * as db from '../db.js';
const router = Router();

// ── GET /api/tipos-hospedaje ─────────────────────────────────────
// → TIPO_HOSPEDAJE
router.get('/tipos-hospedaje', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT "ID_TIPO", "NOMBRE_TIPO"
       FROM public."TIPO_HOSPEDAJE"
       ORDER BY "NOMBRE_TIPO"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// ── GET /api/tipos-habitacion ────────────────────────────────────
// → TIPO_HABITACION
router.get('/tipos-habitacion', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT "ID_TIPO_HABITACION", "NOMBRE"
       FROM public."TIPO_HABITACION"
       ORDER BY "NOMBRE"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// ── GET /api/paises ──────────────────────────────────────────────
// → PAIS (con nombre del continente incluido, útil para agrupar)
router.get('/paises', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT p."ID_PAIS", p."NOMBRE", p."ISO_CODE", p."MONEDA_LOCAL",
              p."CODIGO_TELEFONO", cont."NOMBRE" AS "CONTINENTE"
       FROM public."PAIS" p
       JOIN public."CONTINENTE" cont ON cont."ID_CONTINENTE" = p."ID_CONTINENTE"
       ORDER BY p."NOMBRE"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// ── GET /api/ciudades?id_pais=X ──────────────────────────────────
// → CIUDAD filtradas por país
router.get('/ciudades', async (req, res, next) => {
  const idPais = req.query.id_pais
  if (!idPais) {
    return res.status(400).json({ message: 'El parámetro id_pais es requerido.' })
  }
  try {
    const { rows } = await db.query(
      `SELECT "ID_CIUDAD", "NOMBRE"
       FROM public."CIUDAD"
       WHERE "ID_PAIS" = $1
       ORDER BY "NOMBRE"`,
      [idPais]
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// ── GET /api/servicios-incluidos ─────────────────────────────────
// → SERVICIO_INCLUIDO (amenidades para los checkboxes)
router.get('/servicios-incluidos', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT "ID_SERVICIO_INCLUIDO", "NOMBRE"
       FROM public."SERVICIO_INCLUIDO"
       ORDER BY "NOMBRE"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// ── GET /api/proveedores ─────────────────────────────────────────
// → PROVEEDOR (para seleccionar a qué proveedor pertenece el hospedaje)
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

// ── GET /api/catalogos/tipos-proveedor ───────────────────────────
// → TIPO_PROVEEDOR
router.get('/tipos-proveedor', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT "ID_TIPO", "NOMBRE_TIPO"
       FROM public."TIPO_PROVEEDOR"
       ORDER BY "NOMBRE_TIPO"`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

export default router;