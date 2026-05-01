import crypto from 'crypto'
import User from '../models/User.js'
import { sendForgotPasswordEmail, sendPasswordResetSuccessEmail } from '../utils/emailService.js'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' })
}

// Google OAuth client - with fallback to default client ID
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '128715608979-nffc56ns9uagf29p7j9em6vmm6mrkidv.apps.googleusercontent.com')
  .trim()
  .replace(/['"]/g, '');

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID)

const authController = {
  // ✅ FUNCIÓN LOGIN (FALTABA)
  login: async (req, res) => {
    try {
      const { email, password } = req.body

      // Validaciones
      if (!email || !password) {
        return res.status(400).json({ message: 'Email y contraseña son requeridos' })
      }

      // Buscar usuario
      const user = await User.findOne({ email: email.toLowerCase() })

      if (!user) {
        return res.status(401).json({ message: 'Credenciales inválidas' })
      }

      // Comparar contraseña
      const isPasswordValid = await user.comparePassword(password)
      if (!isPasswordValid) {
        return res.status(401).json({ message: 'Credenciales inválidas' })
      }

      // Generar token
      const token = generateToken(user._id)

      res.json({
        message: 'Login exitoso',
        token,
        user: {
          id: user._id,
          nombre: user.nombre,
          email: user.email,
          telefono: user.telefono
        }
      })
    } catch (error) {
      console.error('Error en login:', error)
      res.status(500).json({ message: 'Error en servidor' })
    }
  },

  // ✅ FUNCIÓN REGISTER
  register: async (req, res) => {
    try {
      const { nombre, email, password, confirmPassword } = req.body

      // Validaciones
      if (!nombre || !email || !password || !confirmPassword) {
        return res.status(400).json({ message: 'Todos los campos son requeridos' })
      }

      if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Las contraseñas no coinciden' })
      }

      if (password.length < 6) {
        return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' })
      }

      // Verificar si el usuario ya existe
      const userExists = await User.findOne({ email: email.toLowerCase() })
      if (userExists) {
        return res.status(400).json({ message: 'El email ya está registrado' })
      }

      // Crear nuevo usuario
      const newUser = new User({
        nombre,
        email: email.toLowerCase(),
        password
      })

      await newUser.save()

      const token = generateToken(newUser._id)

      res.status(201).json({
        message: 'Usuario registrado exitosamente',
        token,
        user: {
          id: newUser._id,
          nombre: newUser.nombre,
          email: newUser.email
        }
      })
    } catch (error) {
      console.error('Error en register:', error)
      res.status(500).json({ message: 'Error en servidor' })
    }
  },

// ✅ FUNCIÓN GOOGLE LOGIN
  googleLogin: async (req, res) => {
    try {
      const { credential } = req.body

      // Debug: Log incoming request info
      console.log('📨 Google Login Request:', {
        headers: req.headers,
        origin: req.get('origin'),
        hasCredential: !!credential,
        credentialLength: credential ? credential.length : 0
      })

      // Validar que se recibió el token de credential
      if (!credential) {
        console.log('❌ No credential provided')
        return res.status(400).json({ message: 'Token de Google no proporcionado' })
      }

      // Use the client ID (from env or fallback)
      const clientId = GOOGLE_CLIENT_ID
      console.log('🔐 Using client ID:', clientId)

      // Verificar el token de Google con opciones mejoradas
      let ticket
      try {
        // google-auth-library v9+ requiere verifyIdToken con opciones específicas
        ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: clientId
        })
        console.log('✅ Google token verified successfully')
      } catch (verifyError) {
        // Error detallado para debugging
        console.error('❌ Falló verificación de Google:', {
          message: verifyError.message,
          code: verifyError.code,
          errors: verifyError.errors,
          toString: verifyError.toString()
        })
        
        let errorMessage = 'Token de Google inválido o expirado'
        
        // Proporcionar mensajes más específicos según el tipo de error
        if (verifyError.message && verifyError.message.includes('INVALID_ARGUMENT')) {
          errorMessage = 'El formato del token de Google es inválido'
        } else if (verifyError.message && verifyError.message.includes('id_token audience')) {
          errorMessage = 'El Client ID de Google no coincide'
        }
        
        return res.status(400).json({ 
          message: errorMessage,
          detail: verifyError.message || verifyError.toString()
        })
      }

      const payload = ticket.getPayload()
      console.log('📧 Google payload:', { email: payload.email, name: payload.name, sub: payload.sub })
      
      const googleId = payload.sub
      const email = payload.email
      const nombre = payload.name || email.split('@')[0]

      // Buscar o crear usuario en la base de datos
      let user = await User.findOne({ email: email.toLowerCase() })

      if (!user) {
        // Crear nuevo usuario desde Google
        user = new User({
          nombre: nombre,
          email: email.toLowerCase(),
          googleId,
          password: 'google_' + googleId // Contraseña dummy
        })
        await user.save()
        console.log('👤 Nuevo usuario creado con Google:', user.email)
      } else if (!user.googleId) {
        // Vincular Google a cuenta existente
        user.googleId = googleId
        await user.save()
        console.log('🔗 Cuenta vinculada a Google:', user.email)
      } else {
        console.log('✅ Usuario existente con Google:', user.email)
      }

      const token = generateToken(user._id)

      res.json({
        message: 'Login con Google exitoso',
        token,
        user: {
          id: user._id,
          nombre: user.nombre,
          email: user.email
        }
      })
    } catch (error) {
      console.error('❌ Error crítico en Google login (DB/JWT):', error)
      // Si llegamos aquí, la verificación del token fue exitosa, pero falló la DB o el JWT interno
      res.status(500).json({ 
        message: 'Error interno al procesar el login de Google',
        detail: error.message || 'Error desconocido en el servidor'
      })
    }
  },

  // ✅ FORGOT PASSWORD
  forgotPassword: async (req, res) => {
    try {
      const { email } = req.body

      if (!email) {
        return res.status(400).json({ message: 'Email es requerido' })
      }

      const user = await User.findOne({ email: email.toLowerCase() })
      if (!user) {
        // Retornamos 200 por seguridad (evita enumeración de correos)
        // y para evitar errores 404 confusos si el endpoint funciona.
        return res.json({ message: 'Si el email existe, recibirás un enlace' })
      }

      const resetToken = user.generateResetToken()
      await user.save()

      // Enviar email - manejar error gracefully
      try {
        await sendForgotPasswordEmail(user.email, resetToken, user.nombre)
      } catch (emailError) {
        // Log error internamente pero NO fallar la solicitud
        // El token ya está generado, el usuario puede intentar de nuevo
        // o el admin puede reenviar manualmente
        console.error('❌ Error enviando email de recuperación:', emailError.message)
        // No lanzamos el error - continuamos y retornamos éxito de todas formas
        // Esto evita que usuarios maliciosos descubran qué emails están registrados
      }

      res.json({
        message: 'Si el email existe, recibirás un enlace de recuperación'
      })
    } catch (error) {
      console.error('Error en forgotPassword:', error)
      // Por seguridad, siempre retornamos mensaje positivo
      res.json({ message: 'Si el email existe, recibirás un enlace de recuperación' })
    }
  },

  // ✅ VERIFY RESET TOKEN
  verifyResetToken: async (req, res) => {
    try {
      const { token } = req.params

      const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex')

      const user = await User.findOne({
        resetToken: hashedToken,
        resetTokenExpiry: { $gt: new Date() }
      })

      if (!user) {
        return res.status(400).json({ message: 'Token inválido o expirado' })
      }

      res.json({ message: 'Token válido', email: user.email })
    } catch (error) {
      console.error('Error en verifyResetToken:', error)
      res.status(500).json({ message: 'Error al verificar token' })
    }
  },

  // ✅ RESET PASSWORD
  resetPassword: async (req, res) => {
    try {
      const { token, newPassword, confirmPassword } = req.body

      if (!token || !newPassword || !confirmPassword) {
        return res.status(400).json({ message: 'Todos los campos son requeridos' })
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ message: 'Las contraseñas no coinciden' })
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          message: 'La contraseña debe tener al menos 6 caracteres'
        })
      }

      const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex')

      const user = await User.findOne({
        resetToken: hashedToken,
        resetTokenExpiry: { $gt: new Date() }
      })

      if (!user) {
        return res.status(400).json({ message: 'Token inválido o expirado' })
      }

      user.password = newPassword
      user.resetToken = null
      user.resetTokenExpiry = null
      await user.save()

      // Enviar email de confirmación - manejar error graceful
      try {
        await sendPasswordResetSuccessEmail(user.email, user.nombre)
      } catch (emailError) {
        // Log error pero NO fallar - la contraseña ya fue cambiada
        console.error('❌ Error enviando email de confirmación:', emailError.message)
      }

      res.json({ message: 'Contraseña actualizada exitosamente' })
    } catch (error) {
      console.error('Error en resetPassword:', error)
      res.status(500).json({ message: 'Error al actualizar contraseña' })
    }
  }
}

export default authController
