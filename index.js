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

// 1. PRIMERO: Headers de Seguridad para Google Auth
app.use((req, res, next) => {
  // Cambia esto a 'unsafe-none' para permitir la comunicación con el popup de Google
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. SEGUNDO: Configuración de CORS con manejo explícito de OPTIONS
app.use(cors({
  origin: (origin, callback) => {
    // Si es local o producción (OJO al typo en 'fronend' si así está en Render)
    const allowed = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'https://hotelierfronend-ka0o.onrender.com',
      process.env.FRONTEND_URL
    ].filter(Boolean).map(url => url.replace(/\/$/, ''));

    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      console.error('🔴 Bloqueado por CORS:', origin);
      callback(new Error('CORS Error'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200 // CRÍTICO: Asegura que el Preflight responda 200 OK
}))

// 3. TERCERO: Forzar respuesta a peticiones de verificación (Preflight)
app.options('*', cors());

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