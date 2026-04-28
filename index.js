import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { connectDB } from './db.js'

import authRoutes from './routes/authRoutes.js'
import searchRoutes from './routes/searchRoutes.js'
import userRoutes from './routes/userRoutes.js'
import hospedajesRoutes from './routes/hospedajes.js'
import catalogosRoutes from './routes/catalogos.js'
import errorHandler from './middleware/errorHandler.js'

const app = express()

app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.use('/api/auth', authRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/user', userRoutes)
app.use('/api/hospedajes', hospedajesRoutes)
app.use('/api/catalogos', catalogosRoutes)

const borradores = new Map()
app.post('/api/hospedajes/borrador', (req, res) => {
  const id = Date.now().toString()
  borradores.set(id, req.body)
  res.json({ id, message: 'Borrador guardado.' })
})

app.get('/', (req, res) => {
  res.json({ message: 'API running' })
})

// El errorHandler siempre debe ir después de las rutas
app.use(errorHandler)

const start = async () => {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET no definido en .env')
    }

    await connectDB()


    const PORT = process.env.PORT || 10000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Backend listo en el puerto ${PORT}`)
    })

  } catch (error) {
    console.error('❌ Error al iniciar servidor:', error.message)
    process.exit(1)
  }
}

start()