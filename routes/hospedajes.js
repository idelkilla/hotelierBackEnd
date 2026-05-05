import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import * as db from '../db.js'

const router = Router()

// Configuración de Multer para guardar en la carpeta /uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/')
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({ storage })

/**
 * GET /api/hospedajes
 * Listado para la tabla administrativa
 */
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        s."ID_SERVICIO"                           AS "ID_HOSPEDAJE",
        s."NOMBRE"                                AS "NOMBRE",
        th."NOMBRE_TIPO"                          AS "TIPO_HOSPEDAJE",
        u."NOMBRE"                                AS "UBICACION",
        ci."NOMBRE"                               AS "CIUDAD",
        pa."NOMBRE"                               AS "PAIS",
        hos."CHECKIN",
        hos."CHECKOUT",
        hos."MASCOTAS",
        hos."FUMAR",
        hos."DESCRIPCION",
        ROUND(AVG(re."CALIFICACION")::NUMERIC, 1) AS "CALIFICACION",
        COUNT(DISTINCT re."ID_RESENA")            AS "TOTAL_RESENAS",
        MIN(hab."PRECIO_NOCHE")                   AS "PRECIO_MIN",
        (SELECT img."URL"
         FROM public."IMAGEN_HOSPEDAJE" img
         WHERE img."ID_HOSPEDAJE" = s."ID_SERVICIO"
         ORDER BY img."ORDEN" ASC LIMIT 1)        AS "IMAGEN_PORTADA"
      FROM public."SERVICIO" s
      LEFT JOIN public."HOSPEDAJE" hos   ON hos."ID_HOSPEDAJE" = s."ID_SERVICIO"
      LEFT JOIN public."TIPO_HOSPEDAJE" th ON th."ID_TIPO"     = hos."ID_TIPO"
      LEFT JOIN public."UBICACION" u     ON u."ID_UBICACION"   = hos."ID_UBICACION"
      LEFT JOIN public."CIUDAD" ci       ON ci."ID_CIUDAD"     = u."ID_CIUDAD"
      LEFT JOIN public."PAIS" pa         ON pa."ID_PAIS"       = ci."ID_PAIS"
      LEFT JOIN public."HABITACION" hab  ON hab."ID_HOSPEDAJE" = hos."ID_HOSPEDAJE"
      LEFT JOIN public."RESENA" re       ON re."ID_SERVICIO"   = s."ID_SERVICIO"
      GROUP BY
        s."ID_SERVICIO", s."NOMBRE", th."NOMBRE_TIPO",
        u."NOMBRE", ci."NOMBRE", pa."NOMBRE",
        hos."CHECKIN", hos."CHECKOUT", hos."MASCOTAS", hos."FUMAR", hos."DESCRIPCION"
      ORDER BY s."ID_SERVICIO" DESC
    `)
    res.json(rows)
  } catch (err) { next(err) }
})

/**
 * GET /api/hospedajes/habitaciones-count
 */
router.get('/habitaciones-count', async (_req, res, next) => {
  try {
    const { rows: [r] } = await db.query(
      `SELECT COUNT(*) AS total FROM public."HABITACION"`
    )
    res.json({ total: parseInt(r.total, 10) })
  } catch (err) { next(err) }
})

/**
 * GET /api/hospedajes/:id
 * Detalle completo para el panel de edición
 */
router.get('/:id', async (req, res, next) => {
  const { id } = req.params
  try {
    const { rows: h } = await db.query(`
      SELECT s."NOMBRE", h.*, u."NOMBRE" AS "NOMBRE_UBICACION", u."LATITUD", u."LONGITUD", c."ID_PAIS"
      FROM public."HOSPEDAJE" h
      JOIN public."SERVICIO" s ON s."ID_SERVICIO" = h."ID_HOSPEDAJE"
      JOIN public."UBICACION" u ON u."ID_UBICACION" = h."ID_UBICACION"
      JOIN public."CIUDAD" c ON c."ID_CIUDAD" = u."ID_CIUDAD"
      WHERE h."ID_HOSPEDAJE" = $1`, [id])
    
    if (!h.length) return res.status(404).json({ message: 'No encontrado' })

    const { rows: habs } = await db.query('SELECT * FROM public."HABITACION" WHERE "ID_HOSPEDAJE" = $1', [id])
    const { rows: amens } = await db.query('SELECT "ID_SERVICIO_INCLUIDO" FROM public."HOSPEDAJE_SERVICIO" WHERE "ID_HOSPEDAJE" = $1', [id])
    
    res.json({
      ...h[0],
      habitaciones: habs,
      amenidades: amens
    })
  } catch (err) { next(err) }
})

/**
 * POST /api/hospedajes/:id/habitaciones
 * Creación masiva de habitaciones para un hospedaje
 */
router.post('/:id/habitaciones', async (req, res, next) => {
  const { id } = req.params
  const habitaciones = req.body // Array de habitaciones
  try {
    for (const hab of habitaciones) {
      await db.query(`
        INSERT INTO public."HABITACION" ("ID_HOSPEDAJE", "ID_TIPO_HABITACION", "CAPACIDAD_ADULTO", "CAPACIDAD_NINOS", "PRECIO_NOCHE")
        VALUES ($1, $2, $3, $4, $5)
      `, [id, hab.id_tipo_habitacion, hab.capacidad_adulto, hab.capacidad_ninos, hab.precio_noche])
    }
    res.status(201).json({ message: 'Habitaciones creadas' })
  } catch (err) { next(err) }
})

/**
 * PUT /api/hospedajes/:id
 * Actualización de datos básicos y ubicación
 */
router.put('/:id', async (req, res, next) => {
  const { id } = req.params
  const data = req.body
  const client = await db.getPool().connect()
  try {
    await client.query('BEGIN')
    await client.query('UPDATE public."SERVICIO" SET "NOMBRE" = $1 WHERE "ID_SERVICIO" = $2', [data.nombre, id])
    await client.query(`
      UPDATE public."HOSPEDAJE" 
      SET "DESCRIPCION" = $1, "CHECKIN" = $2, "CHECKOUT" = $3, "CANCELACION" = $4, "MASCOTAS" = $5, "FUMAR" = $6, "ID_TIPO" = $7
      WHERE "ID_HOSPEDAJE" = $8`, 
      [data.descripcion, data.checkin, data.checkout, data.cancelacion, data.mascotas, data.fumar, data.id_tipo_hospedaje, id])
    
    if (data.ubicacion) {
      const { rows: h } = await client.query('SELECT "ID_UBICACION" FROM public."HOSPEDAJE" WHERE "ID_HOSPEDAJE" = $1', [id])
      await client.query(`
        UPDATE public."UBICACION" SET "NOMBRE" = $1, "LATITUD" = $2, "LONGITUD" = $3, "ID_CIUDAD" = $4
        WHERE "ID_UBICACION" = $5`, [data.ubicacion.nombre, data.ubicacion.latitud, data.ubicacion.longitud, data.ubicacion.id_ciudad, h[0].ID_UBICACION])
    }
    await client.query('COMMIT')
    res.json({ message: 'Actualizado' })
  } catch (err) { await client.query('ROLLBACK'); next(err) }
  finally { client.release() }
})

/**
 * DELETE /api/hospedajes/:id
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM public."SERVICIO" WHERE "ID_SERVICIO" = $1', [req.params.id])
    res.json({ message: 'Eliminado' })
  } catch (err) { next(err) }
})

/**
 * POST /api/hospedajes
 * Crea un hospedaje completo (Servicio + Ubicación + Hospedaje)
 */
router.post('/', async (req, res, next) => {
  const client = await db.getPool().connect()
  try {
    await client.query('BEGIN')

    const data = req.body

    // 1. Insertar Ubicación primero si viene en el payload como objeto
    let idUbicacion = data.id_ubicacion
    if (data.ubicacion && !idUbicacion) {
      const { rows: ubRows } = await client.query(`
        INSERT INTO public."UBICACION" ("NOMBRE", "LATITUD", "LONGITUD", "ID_CIUDAD", "ID_TIPO")
        VALUES ($1, $2, $3, $4, $5) RETURNING "ID_UBICACION"
      `, [
        data.ubicacion.nombre,
        data.ubicacion.latitud,
        data.ubicacion.longitud,
        data.ubicacion.id_ciudad,
        2 // Tipo 2 = Hotel/Alojamiento
      ])
      idUbicacion = ubRows[0].ID_UBICACION
    }

    // 2. Insertar en SERVICIO
    const { rows: srv } = await client.query(`
      INSERT INTO public."SERVICIO" ("NOMBRE", "ID_PROVEEDOR") 
      VALUES ($1, $2) RETURNING "ID_SERVICIO"
    `, [data.nombre, data.id_proveedor || 1])

    const idHospedaje = srv[0].ID_SERVICIO

    // 3. Insertar en HOSPEDAJE
    await client.query(`
      INSERT INTO public."HOSPEDAJE" 
      ("ID_HOSPEDAJE", "DESCRIPCION", "CHECKIN", "CHECKOUT", "CANCELACION", "MASCOTAS", "FUMAR", "ID_TIPO", "ID_UBICACION")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      idHospedaje, data.descripcion, data.checkin, data.checkout, 
      data.cancelacion, data.mascotas, data.fumar, data.id_tipo_hospedaje, idUbicacion
    ])
    
    // 4. Insertar amenidades
    if (data.servicios_incluidos && Array.isArray(data.servicios_incluidos)) {
      for (const idServ of data.servicios_incluidos) {
        await client.query(`
          INSERT INTO public."HOSPEDAJE_SERVICIO" ("ID_HOSPEDAJE", "ID_SERVICIO_INCLUIDO")
          VALUES ($1, $2)
        `, [idHospedaje, idServ])
      }
    }

    await client.query('COMMIT')
    res.status(201).json({ id: idHospedaje, message: 'Hospedaje creado con éxito' })

  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
})

export default router