import pkg from 'pg'
const { Pool } = pkg

let pool

export const connectDB = async () => {
  if (pool) return pool

  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL no está definida en .env')
  }

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  })

  pool.on('error', (err) => {
    console.error('Pool error (ignorado):', err.message)
  })

  // 👇 Agrega esto
  pool.on('connect', (client) => {
    client.query("SET client_encoding = 'UTF8'")
  })

  await pool.query('SELECT NOW()')
  console.log('✅ Conectado a PostgreSQL')

  return pool
}

// src/db.js
// Pool de conexiones a PostgreSQL. Importa este módulo en cualquier ruta
// y llama a db.query(sql, params) o db.getClient() para transacciones.
export const query = (text, params) => pool.query(text, params)
export const connect = () => pool.connect()

export const getPool = () => {
  if (!pool) throw new Error('Pool no inicializado.')
  return pool
}