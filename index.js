import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { connectDB } from './db.js'

import authRoutes from './routes/authRoutes.js'
import searchRoutes from './routes/searchRoutes.js'

const app = express()

app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
});

app.use(cors())
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/search', searchRoutes)

app.get('/', (req, res) => {
  res.json({ message: 'API running' })
})

const start = async () => {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET no definido en .env')
    }

    await connectDB()

    app.listen(3000, () => {
      console.log('🚀 Backend listo en http://localhost:3000')
    })

  } catch (error) {
    console.error('❌ Error al iniciar servidor:', error.message)
    process.exit(1)
  }
}

start()