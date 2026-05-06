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
 * Crear un hospedaje completo con validaciones mejoradas
 */
router.post('/', async (req, res, next) => {
  const client = await db.getPool().connect()
  try {
    await client.query('BEGIN')

    const data = req.body

    // ✅ VALIDACIONES CON MENSAJES ESPECÍFICOS
    const errors = []

    // Validar nombre
    if (!data.nombre || !data.nombre.trim()) {
      errors.push('El nombre del hospedaje es requerido')
    }

    // Validar nombre legal
    if (!data.nombre_legal || data.nombre_legal.trim().length < 5) {
      errors.push('El nombre legal debe tener al menos 5 caracteres')
    }

    // Validar RNC (debe ser exactamente 12 caracteres)
    if (!data.rnc || data.rnc.trim().length !== 12) {
      errors.push('El RNC debe tener exactamente 12 dígitos')
    }

    // Validar tipo proveedor
    if (!data.id_tipo_proveedor) {
      errors.push('El tipo de proveedor es requerido')
    }

    // Validar tipo hospedaje
    if (!data.id_tipo_hospedaje) {
      errors.push('El tipo de hospedaje es requerido')
    }

    // Validar ubicación
    if (!data.ubicacion) {
      errors.push('La ubicación es requerida')
    } else {
      if (!data.ubicacion.id_ciudad) {
        errors.push('Debes seleccionar una ciudad')
      }
      if (!data.ubicacion.latitud || !data.ubicacion.longitud) {
        errors.push('Latitud y longitud son requeridas')
      }
      if (isNaN(parseFloat(data.ubicacion.latitud)) || isNaN(parseFloat(data.ubicacion.longitud))) {
        errors.push('Latitud y longitud deben ser números válidos')
      }
    }

    // Si hay errores, devolverlos todos
    if (errors.length > 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        message: 'Validación fallida',
        detalles: errors
      })
    }

    // 1️⃣ Verificar o crear PROVEEDOR
    const rncLimpio = data.rnc.trim()
    const { rows: provCheck } = await client.query(
      `SELECT "ID_PROVEEDOR" FROM public."PROVEEDOR" WHERE "RNC" = $1`,
      [rncLimpio]
    )

    let idProveedor
    if (provCheck.length) {
      idProveedor = provCheck[0].ID_PROVEEDOR
      // Actualizar nombre legal si es diferente
      await client.query(
        `UPDATE public."PROVEEDOR" SET "NOMBRE_LEGAL" = $1 WHERE "ID_PROVEEDOR" = $2`,
        [data.nombre_legal.trim(), idProveedor]
      )
    } else {
      try {
        const { rows: provRows } = await client.query(`
          INSERT INTO public."PROVEEDOR" ("NOMBRE_LEGAL", "RNC", "ID_TIPO")
          VALUES ($1, $2, $3)
          RETURNING "ID_PROVEEDOR"
        `, [data.nombre_legal.trim(), rncLimpio, data.id_tipo_proveedor])
        idProveedor = provRows[0].ID_PROVEEDOR
      } catch (err) {
        if (err.constraint === 'PROVEEDOR_RNC_unique') {
          await client.query('ROLLBACK')
          return res.status(400).json({
            error: 'El RNC ya está registrado en el sistema'
          })
        }
        throw err
      }
    }

    // 2️⃣ Crear UBICACION
    const { rows: ubRows } = await client.query(`
      INSERT INTO public."UBICACION" 
      ("NOMBRE", "LATITUD", "LONGITUD", "ID_CIUDAD", "ID_TIPO", "ESTADO")
      VALUES ($1, $2, $3, $4, $5, 'A')
      RETURNING "ID_UBICACION"
    `, [
      (data.ubicacion.nombre || data.nombre).trim(),
      parseFloat(data.ubicacion.latitud),
      parseFloat(data.ubicacion.longitud),
      parseInt(data.ubicacion.id_ciudad),
      2 // ID_TIPO para Alojamiento
    ])
    const idUbicacion = ubRows[0].ID_UBICACION

    // 3️⃣ Crear SERVICIO
    const { rows: srvRows } = await client.query(`
      INSERT INTO public."SERVICIO" 
      ("NOMBRE", "ID_PROVEEDOR", "ID_TIPO") 
      VALUES ($1, $2, $3)
      RETURNING "ID_SERVICIO"
    `, [data.nombre.trim(), idProveedor, parseInt(data.id_tipo_hospedaje)])
    const idServicio = srvRows[0].ID_SERVICIO

    // 4️⃣ Crear HOSPEDAJE
    await client.query(`
      INSERT INTO public."HOSPEDAJE" 
      ("ID_HOSPEDAJE", "ID_TIPO", "ID_UBICACION", "CHECKIN", "CHECKOUT",
       "CANCELACION", "MASCOTAS", "FUMAR", "DESCRIPCION")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      idServicio, parseInt(data.id_tipo_hospedaje), idUbicacion, 
      data.checkin || '15:00:00', data.checkout || '11:00:00', 
      data.cancelacion || 'flexible', !!data.mascotas, 
      !!data.fumar, (data.descripcion || '').trim()
    ])
    
    // 5️⃣ Insertar amenidades (ignorar inválidas)
    if (Array.isArray(data.servicios_incluidos) && data.servicios_incluidos.length > 0) {
      for (const idServ of data.servicios_incluidos) {
        try {
          await client.query(`
            INSERT INTO public."HOSPEDAJE_SERVICIO" ("ID_HOSPEDAJE", "ID_SERVICIO_INCLUIDO")
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
          `, [idServicio, parseInt(idServ)])
        } catch (err) {
          console.warn('⚠️ Amenidad inválida:', idServ, err.message)
        }
      }
    }

    await client.query('COMMIT')

    res.status(201).json({
      ID_HOSPEDAJE: idServicio,
      id: idServicio,
      message: 'Hospedaje creado con éxito'
    })
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch (rbErr) {
      console.error('Error en ROLLBACK:', rbErr.message)
    }

    console.error('❌ Error en POST hospedajes:', err.message, err.constraint)

    // Devolver error específico
    res.status(500).json({
      message: 'Error al crear hospedaje',
      detalles: [err.message]
    })
  } finally {
    client.release()
  }
})

// POST /api/hospedaje/:id/resenas
router.post('/:id/resenas', authenticateToken, async (req, res, next) => {
  try {
    const idPersona = req.user.id_persona
    const { calificacion, comentario } = req.body

    if (!calificacion || calificacion < 1 || calificacion > 5)
      return res.status(400).json({ error: 'Calificación inválida (1-5)' })
    if (!comentario?.trim())
      return res.status(400).json({ error: 'El comentario es requerido' })

    // En este sistema, ID_HOSPEDAJE es igual al ID_SERVICIO
    const idServicio = req.params.id

    const { rows: [{ next: idResena }] } = await query(
      `SELECT COALESCE(MAX("ID_RESENA"), 0) + 1 AS next FROM public."RESENA"`
    )

    await query(`
      INSERT INTO public."RESENA" ("ID_RESENA","COMENTARIO","CALIFICACION","ID_CLIENTE","ID_SERVICIO")
      VALUES ($1, $2, $3, $4, $5)
    `, [idResena, comentario.trim(), calificacion, idPersona, idServicio])

    res.status(201).json({ ok: true, id_resena: idResena })
  } catch (err) { next(err) }
})

export default router