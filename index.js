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
import hospedajeDetalleRoutes from './routes/hospedajeDetalle.js'
import errorHandler from './middleware/errorHandler.js'

const app = express()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 1. PRIMERO: Headers de Seguridad para Google Auth (COOP/COEP)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups') // ← clave
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none')
  next()
})

// 2. SEGUNDO: Configuración de CORS
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5175',
  'https://hotelierfrontend-ka0o.onrender.com',
  'https://hotelierfronend-ka0o.onrender.com',
  'https://hotelierbackend-1.onrender.com',
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : [])
].filter(Boolean).map(url => url.replace(/\/$/, ''))

const corsOptions = {
  origin: allowedOrigins,
  credentials: true
}

app.use(cors(corsOptions))

// 3. TERCERO: Preflight para todas las rutas
app.options('{*path}', cors());

// 4. CUARTO: Parsers y Rutas Estáticas
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// 5. QUINTO: Rutas de la API
app.use('/api/auth', authRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/user', userRoutes)
app.use('/api/hospedajes', hospedajesRoutes)
app.use('/api/catalogos', catalogosRoutes)
app.use('/api/hospedaje', hospedajeDetalleRoutes)

// Borrador de hospedajes
const borradores = new Map()
app.post('/api/hospedajes/borrador', (req, res) => {
  const id = Date.now().toString()
  borradores.set(id, req.body)
  res.json({ id, message: 'Borrador guardado.' })
})

// Ruta de prueba
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK' })
})

app.get('/', (req, res) => {
  res.json({ message: 'API running' })
})

app.use(errorHandler)

const start = async () => {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET no definido en .env')
    }
    await connectDB()
    const PORT = process.env.PORT || 10000
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Backend listo en el puerto ${PORT}`)
    })
  } catch (error) {
    console.error('❌ Error al iniciar servidor:', error.message)
    process.exit(1)
  }
}

start()
