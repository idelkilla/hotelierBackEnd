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
        s."ID_SERVICIO"                           AS id_hospedaje,
        s."NOMBRE"                                AS nombre,
        th."NOMBRE_TIPO"                          AS tipo_hospedaje,
        u."NOMBRE"                                AS ubicacion,
        ci."NOMBRE"                               AS ciudad,
        pa."NOMBRE"                               AS pais,
        hos."CHECKIN",
        hos."CHECKOUT",
        hos."MASCOTAS",
        hos."FUMAR",
        hos."DESCRIPCION",
        ROUND(AVG(re."CALIFICACION")::NUMERIC, 1) AS calificacion,
        COUNT(DISTINCT re."ID_RESENA")            AS total_resenas,
        MIN(hab."PRECIO_NOCHE")                   AS precio_min,
        (SELECT img."URL"
         FROM public."IMAGEN_HOSPEDAJE" img
         WHERE img."ID_HOSPEDAJE" = s."ID_SERVICIO"
         ORDER BY img."ORDEN" ASC LIMIT 1)        AS imagen_portada
      FROM public."SERVICIO" s
      JOIN public."HOSPEDAJE" hos        ON hos."ID_HOSPEDAJE" = s."ID_SERVICIO"
      JOIN public."TIPO_HOSPEDAJE" th    ON th."ID_TIPO"       = hos."ID_TIPO"
      JOIN public."UBICACION" u          ON u."ID_UBICACION"   = hos."ID_UBICACION"
      JOIN public."CIUDAD" ci            ON ci."ID_CIUDAD"     = u."ID_CIUDAD"
      JOIN public."PAIS" pa              ON pa."ID_PAIS"       = ci."ID_PAIS"
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
      SELECT s."NOMBRE", h.*, c."ID_PAIS"
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
 * Compatible con adminAgregarHotel.vue (JSON)
 */
router.post('/', async (req, res, next) => {
  const client = await db.getPool().connect()
  
  try {
    await client.query('BEGIN')
    
    // 1. Extraer datos (Multer pone los campos de texto en req.body)
    const data = JSON.parse(req.body.data)
    
    // 2. Insertar en SERVICIO y HOSPEDAJE
    const { rows: srv } = await client.query(`
      INSERT INTO public."SERVICIO" ("NOMBRE", "ID_PROVEEDOR") 
      VALUES ($1, $2) RETURNING "ID_SERVICIO"
    `, [data.nombre, data.id_proveedor || 1])

    const idHospedaje = srv[0].ID_SERVICIO

    await client.query(`
      INSERT INTO public."HOSPEDAJE" 
      ("ID_HOSPEDAJE", "DESCRIPCION", "CHECKIN", "CHECKOUT", "CANCELACION", "MASCOTAS", "FUMAR", "ID_TIPO", "ID_UBICACION")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      idHospedaje, data.descripcion, data.checkin, data.checkout, 
      data.cancelacion, data.mascotas, data.fumar, data.id_tipo_hospedaje, data.id_ubicacion
    ])

    // 3. Guardar URLs de las imágenes en IMAGEN_HOSPEDAJE
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const url = `${req.protocol}://${req.get('host')}/uploads/${req.files[i].filename}`
        await client.query(`
          INSERT INTO public."IMAGEN_HOSPEDAJE" ("ID_HOSPEDAJE", "URL", "ORDEN")
          VALUES ($1, $2, $3)
        `, [idHospedaje, url, i])
      }
    }

    // 4. Insertar habitaciones
    if (data.habitaciones && data.habitaciones.length > 0) {
      for (const hab of data.habitaciones) {
        await client.query(`
          INSERT INTO public."HABITACION" 
          ("ID_HOSPEDAJE", "ID_TIPO_HABITACION", "CAPACIDAD_ADULTO", "CAPACIDAD_NINOS", "PRECIO_NOCHE")
          VALUES ($1, $2, $3, $4, $5)
        `, [idHospedaje, hab.id_tipo_habitacion, hab.capacidad_adulto, hab.capacidad_ninos, hab.precio_noche])
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