import express from 'express'
import metodoPagoController from '../controllers/metodoPagoController.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

const router = express.Router()

// Todas las rutas de métodos de pago requieren autenticación
router.use(authMiddleware)

router.get('/',       metodoPagoController.getAll)   // Listar tarjetas
router.post('/',      metodoPagoController.create)    // Agregar tarjeta
router.delete('/:id', metodoPagoController.remove)    // Eliminar tarjeta

export default router