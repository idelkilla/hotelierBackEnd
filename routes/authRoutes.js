import express from 'express'
import authController from '../controllers/authController.js'

const router = express.Router()

// ✅ Todas estas rutas DEBEN existir
router.post('/login', authController.login)
router.post('/register', authController.register)
router.post('/google-login', authController.googleLogin)
router.get('/google-login', (req, res) => {
  res.json({ message: 'Google login endpoint ready. Use POST method.' })
})
router.post('/forgot-password', authController.forgotPassword) // ← CRÍTICO
router.post('/reset-password', authController.resetPassword)
router.get('/verify-reset-token/:token', authController.verifyResetToken)

export default router
