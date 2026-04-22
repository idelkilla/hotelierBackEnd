// src/middleware/errorHandler.js
// Middleware global de errores. Siempre debe ser el último app.use().

const errorHandler = (err, req, res, _next) => {
  console.error(`[ERROR] ${req.method} ${req.path} →`, err.message)

  // Error de Multer
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'El archivo supera el tamaño máximo permitido (10 MB).' })
  }

  // Error de validación de negocio (lanzado manualmente con status)
  if (err.status) {
    return res.status(err.status).json({ message: err.message })
  }

  // Error de PostgreSQL
  if (err.code?.startsWith('2') || err.code?.startsWith('4')) {
    return res.status(400).json({ message: 'Error en los datos enviados.', detail: err.detail })
  }

  // Error genérico
  res.status(500).json({ message: 'Error interno del servidor.' })
}

export default errorHandler;