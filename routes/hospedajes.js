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
 * POST /api/hospedajes
 * Crea un nuevo hospedaje con sus imágenes y habitaciones
 */
router.post('/', upload.array('imagenes', 10), async (req, res, next) => {
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