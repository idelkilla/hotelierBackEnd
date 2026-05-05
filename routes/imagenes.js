/**
 * routes/imagenes.js
 * Manejo de imágenes de hospedajes
 */
import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import * as db from '../db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = Router()

// ── Configuración de Multer ──
const uploadsDir = path.join(__dirname, '../uploads/imagenes')

// Crear directorio si no existe
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    const ext = path.extname(file.originalname)
    cb(null, uniqueSuffix + ext)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Solo se permiten imágenes: JPG, PNG, WEBP'))
    }
  }
})

/**
 * GET /api/imagenes/hospedaje/:id
 * Obtener todas las imágenes de un hospedaje
 */
router.get('/hospedaje/:id_hospedaje', async (req, res, next) => {
  const { id_hospedaje } = req.params

  try {
    const { rows } = await db.query(`
      SELECT 
        "ID_IMAGEN" as id,
        "ID_HOSPEDAJE" as id_hospedaje,
        "URL" as url,
        "ORDEN" as orden,
        "ALT_TEXT" as alt_text
      FROM public."IMAGEN_HOSPEDAJE"
      WHERE "ID_HOSPEDAJE" = $1
      ORDER BY "ORDEN" ASC
    `, [id_hospedaje])

    res.json(rows)
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/imagenes
 * O
 * POST /api/hospedajes/:id/imagenes
 * Subir una imagen para un hospedaje
 */
router.post('/', upload.single('imagen'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ninguna imagen' })
    }

    const { id_hospedaje, orden, alt_text } = req.body

    if (!id_hospedaje) {
      // Limpiar archivo si no hay hospedaje
      fs.unlinkSync(req.file.path)
      return res.status(400).json({ error: 'id_hospedaje es requerido' })
    }

    // Verificar que el hospedaje existe
    const { rows: hospCheck } = await db.query(
      `SELECT "ID_HOSPEDAJE" FROM public."HOSPEDAJE" WHERE "ID_HOSPEDAJE" = $1`,
      [parseInt(id_hospedaje)]
    )

    if (!hospCheck.length) {
      fs.unlinkSync(req.file.path)
      return res.status(404).json({ error: 'Hospedaje no encontrado' })
    }

    // Guardar en base de datos
    const urlRelativa = `/uploads/imagenes/${req.file.filename}`
    const { rows: [img] } = await db.query(`
      INSERT INTO public."IMAGEN_HOSPEDAJE" 
      ("ID_HOSPEDAJE", "URL", "ORDEN", "ALT_TEXT")
      VALUES ($1, $2, $3, $4)
      RETURNING "ID_IMAGEN"
    `, [
      parseInt(id_hospedaje),
      urlRelativa,
      orden || 0,
      alt_text || ''
    ])

    res.status(201).json({
      id: img.ID_IMAGEN,
      url: img.URL,
      orden: img.ORDEN,
      alt_text: img.ALT_TEXT,
      message: 'Imagen subida correctamente'
    })
  } catch (err) {
    // Limpiar archivo en caso de error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path)
      } catch (delErr) {
        console.warn('No se pudo eliminar archivo:', delErr.message)
      }
    }
    next(err)
  }
})

/**
 * DELETE /api/imagenes/:id
 * Eliminar una imagen
 */
router.delete('/:id', async (req, res, next) => {
  const { id } = req.params

  try {
    const { rows: [img] } = await db.query(
      `SELECT "URL" FROM public."IMAGEN_HOSPEDAJE" WHERE "ID_IMAGEN" = $1`,
      [id]
    )

    if (!img) {
      return res.status(404).json({ error: 'Imagen no encontrada' })
    }

    // Eliminar archivo físico
    const filePath = path.join(__dirname, '../', img.URL)
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath)
      } catch (err) {
        console.warn('Advertencia: No se pudo eliminar archivo físico:', err.message)
      }
    }

    // Eliminar de BD
    await db.query(
      `DELETE FROM public."IMAGEN_HOSPEDAJE" WHERE "ID_IMAGEN" = $1`,
      [id]
    )

    res.json({ message: 'Imagen eliminada correctamente' })
  } catch (err) {
    next(err)
  }
})

export default router
