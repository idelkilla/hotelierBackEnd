import { Router } from 'express'
import multer from 'multer'
import { v2 as cloudinary } from 'cloudinary'
import { CloudinaryStorage } from 'multer-storage-cloudinary'
import * as db from '../db.js'

const router = Router()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'hotelier/hospedajes',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
})

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } })

router.get('/hospedaje/:id_hospedaje', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT "ID_IMAGEN" as id, "ID_HOSPEDAJE" as id_hospedaje,
             "URL" as url, "ORDEN" as orden, "ALT_TEXT" as alt_text
      FROM public."IMAGEN_HOSPEDAJE"
      WHERE "ID_HOSPEDAJE" = $1
      ORDER BY "ORDEN" ASC
    `, [req.params.id_hospedaje])
    res.json(rows)
  } catch (err) { next(err) }
})

router.post('/', upload.single('imagen'), async (req, res, next) => {
  try {
    console.log('=== DEBUG POST IMAGEN ===')
    console.log('file:', req.file)
    console.log('body:', req.body)
    console.log('query:', req.query)

    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ninguna imagen' })
    }

    const id_hospedaje = req.body.id_hospedaje || req.query.id_hospedaje
    const { orden, alt_text } = req.body

    if (!id_hospedaje) {
      return res.status(400).json({ error: 'id_hospedaje es requerido' })
    }

    const { rows: hospCheck } = await db.query(
      `SELECT "ID_HOSPEDAJE" FROM public."HOSPEDAJE" WHERE "ID_HOSPEDAJE" = $1`,
      [parseInt(id_hospedaje)]
    )
    if (!hospCheck.length) {
      return res.status(404).json({ error: 'Hospedaje no encontrado' })
    }

    // Cloudinary devuelve la URL pública directamente
    const urlPublica = req.file.path

    const { rows: [img] } = await db.query(`
      INSERT INTO public."IMAGEN_HOSPEDAJE" ("ID_HOSPEDAJE", "URL", "ORDEN", "ALT_TEXT")
      VALUES ($1, $2, $3, $4)
      RETURNING "ID_IMAGEN", "URL", "ORDEN", "ALT_TEXT"
    `, [parseInt(id_hospedaje), urlPublica, parseInt(orden) || 0, alt_text || ''])

    res.status(201).json({
      id:       img.ID_IMAGEN,
      url:      img.URL,
      orden:    img.ORDEN,
      alt_text: img.ALT_TEXT,
      message:  'Imagen subida correctamente'
    })
  } catch (err) { next(err) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows: [img] } = await db.query(
      `SELECT "URL" FROM public."IMAGEN_HOSPEDAJE" WHERE "ID_IMAGEN" = $1`,
      [req.params.id]
    )
    if (!img) return res.status(404).json({ error: 'Imagen no encontrada' })

    // Eliminar de Cloudinary
    const publicId = img.URL.split('/').slice(-2).join('/').split('.')[0]
    await cloudinary.uploader.destroy(publicId)

    await db.query(`DELETE FROM public."IMAGEN_HOSPEDAJE" WHERE "ID_IMAGEN" = $1`, [req.params.id])
    res.json({ message: 'Imagen eliminada correctamente' })
  } catch (err) { next(err) }
})

export default router