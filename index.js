import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { connectDB } from './db.js'

import authRoutes from './routes/authRoutes.js'
import searchRoutes from './routes/searchRoutes.js'
import userRoutes from './routes/userRoutes.js'
import hospedajesRouter from './routes/hospedajes.js'
import dashboardRouter from './routes/dashboard.js'
import catalogosRouter from './routes/catalogos.js'
import usuariosRouter from './routes/usuarios.js'
import hospedajeDetalleRoutes from './routes/hospedajeDetalle.js'
import reservasRouter from './routes/reservas.js'
import habitacionesRoutes from './routes/habitaciones.js'
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
  'https://hotelierfronend-ka0o.onrender.com',
  'https://hotelierbackend-1.onrender.com',
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : [])
].filter(Boolean).map(url => url.trim().replace(/\/$/, ''))

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}

// 3. TERCERO: Aplicar CORS globalmente
app.use(cors(corsOptions))
app.options('*', cors()) // Habilitar preflight para todas las rutas

// 4. CUARTO: Parsers y Rutas Estáticas
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// 5. QUINTO: Rutas de la API — ✅ CORRECT — all under /api/*
app.use('/api/auth', authRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/user', userRoutes)
app.use('/api/hospedajes', hospedajesRouter)
app.use('/api/catalogos', catalogosRouter)
app.use('/api/hospedaje', hospedajeDetalleRoutes)
app.use('/api/reservas', reservasRouter)
app.use('/api/usuarios', usuariosRouter) // ✅ CORRECTO - Solo una ruta
app.use('/api/dashboard', dashboardRouter)
app.use('/api/habitaciones', habitacionesRoutes)

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

app.get('/api/admin-config', (req, res) => {
  // Provee el email de admin al frontend para consistencia en la validación
  res.json({ adminEmail: 'admin@gmail.com' })
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
