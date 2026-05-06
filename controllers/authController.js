import crypto from 'crypto'
import { getPool } from '../db.js'
import { sendForgotPasswordEmail, sendPasswordResetSuccessEmail } from '../utils/emailService.js'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'

const generateToken = (userId, role = 'user') => {
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, { expiresIn: '7d' })
}

const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '128715608979-nffc56ns9uagf29p7j9em6vmm6mrkidv.apps.googleusercontent.com')
  .trim().replace(/['"]/g, '')

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID)

const authController = {

  // LOGIN
  login: async (req, res) => {
    console.log('Login body recibido:', req.body)
    try {
      const { email, usuarioOrEmail, password } = req.body
      const identifier = (email || usuarioOrEmail || '').toLowerCase()

      if (!identifier || !password)
        return res.status(400).json({ message: 'Email y contraseña son requeridos' })

      const db = getPool()
      const { rows } = await db.query(
        `SELECT u."ID_USUARIO", u."USUARIO", u."CORREO_ELECTRONICO", u."CONTRASENA", u."GOOGLE_ID", e."ID_EMPLEADO"
         FROM public."USUARIO" u 
         LEFT JOIN public."EMPLEADO" e ON e."ID_EMPLEADO" = u."ID_PERSONA"
         WHERE "CORREO_ELECTRONICO" = $1 OR "USUARIO" = $1`,
        [identifier]
      )
      const user = rows[0]

      if (!user)
        return res.status(401).json({ message: 'Credenciales inválidas' })

      if (!user.CONTRASENA && user.GOOGLE_ID)
        return res.status(401).json({ message: 'Esta cuenta usa Google para iniciar sesión' })

      const isPasswordValid = await bcrypt.compare(password, user.CONTRASENA)
      if (!isPasswordValid)
        return res.status(401).json({ message: 'Credenciales inválidas' })

      const role = user.ID_EMPLEADO ? 'admin' : 'user'
      const token = generateToken(user.ID_USUARIO, role)

      res.json({
        message: 'Login exitoso',
        token,
        user: {
          id: user.ID_USUARIO,
          nombre: user.USUARIO,
          email: user.CORREO_ELECTRONICO,
          role
        }
      })
    } catch (error) {
      console.error('Error en login:', error)
      res.status(500).json({ message: 'Error en servidor' })
    }
  },

  // REGISTER
  register: async (req, res) => {
    try {
      const { nombre, email, password, confirmPassword } = req.body

      if (!nombre || !email || !password || !confirmPassword)
        return res.status(400).json({ message: 'Todos los campos son requeridos' })

      if (password !== confirmPassword)
        return res.status(400).json({ message: 'Las contraseñas no coinciden' })

      if (password.length < 6)
        return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' })

      const pool = getPool()
      const client = await pool.connect()

      try {
        await client.query('BEGIN')

        // 1. Verificar si el email o usuario ya existen
        const { rows: existing } = await client.query(
          `SELECT "ID_USUARIO" FROM public."USUARIO" 
           WHERE "CORREO_ELECTRONICO" = $1 OR "USUARIO" = $2`,
          [email.toLowerCase(), nombre.trim()]
        )
        if (existing.length > 0) {
          await client.query('ROLLBACK')
          return res.status(400).json({ message: 'El email o nombre de usuario ya está registrado' })
        }

        const hashedPassword = await bcrypt.hash(password, 10)

        // 2. ID manual seguro para PERSONA
        const { rows: [{ next_persona_id }] } = await client.query(
          `SELECT COALESCE(MAX("ID_PERSONA"), 0) + 1 AS next_persona_id FROM public."PERSONA"`
        )

        // 3. Crear PERSONA
        await client.query(
          `INSERT INTO public."PERSONA" ("ID_PERSONA", "NOMBRE_COMPLETO")
           VALUES ($1, $2)`,
          [next_persona_id, nombre]
        )

        // 4. ID manual seguro para USUARIO
        const { rows: [{ next_user_id }] } = await client.query(
          `SELECT COALESCE(MAX("ID_USUARIO"), 0) + 1 AS next_user_id FROM public."USUARIO"`
        )

        // 5. Crear USUARIO vinculado a PERSONA
        const { rows: userRows } = await client.query(
          `INSERT INTO public."USUARIO" ("ID_USUARIO", "USUARIO", "CORREO_ELECTRONICO", "CONTRASENA", "ID_PERSONA")
           VALUES ($1, $2, $3, $4, $5)
           RETURNING "ID_USUARIO", "USUARIO", "CORREO_ELECTRONICO"`,
          [next_user_id, nombre, email.toLowerCase(), hashedPassword, next_persona_id]
        )
        const newUser = userRows[0]

        // 6. Crear CLIENTE vinculado a PERSONA
        await client.query(
          `INSERT INTO public."CLIENTE" ("ID_CLIENTE", "ESTADO_CLIENTE")
           VALUES ($1, 'A')
           ON CONFLICT DO NOTHING`,
          [next_persona_id]
        )

        await client.query('COMMIT')

        const token = generateToken(newUser.ID_USUARIO)

        res.status(201).json({
          message: 'Usuario registrado exitosamente',
          token,
          user: {
            id: newUser.ID_USUARIO,
            nombre: newUser.USUARIO,
            email: newUser.CORREO_ELECTRONICO,
            role: 'user'
          }
        })
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    } catch (error) {
      console.error('Error en register:', error)
      res.status(500).json({ message: 'Error en servidor', detail: error.message })
    }
  },

  // GOOGLE LOGIN
  googleLogin: async (req, res) => {
    try {
      const { credential } = req.body

      if (!credential)
        return res.status(400).json({ message: 'Token de Google no proporcionado' })

      let ticket
      try {
        ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: GOOGLE_CLIENT_ID
        })
      } catch (verifyError) {
        console.error('Verificación Google falló:', verifyError.message)
        return res.status(400).json({
          message: 'Token de Google inválido o expirado',
          detail: verifyError.message
        })
      }

      const payload = ticket.getPayload()
      const googleId = payload.sub
      const email    = payload.email
      const nombre   = payload.name || email.split('@')[0]

      const db = getPool()

      const { rows: existing } = await db.query(
        `SELECT u."ID_USUARIO", u."USUARIO", u."CORREO_ELECTRONICO", u."GOOGLE_ID", e."ID_EMPLEADO"
         FROM public."USUARIO" u 
         LEFT JOIN public."EMPLEADO" e ON e."ID_EMPLEADO" = u."ID_PERSONA"
         WHERE u."CORREO_ELECTRONICO" = $1`,
        [email.toLowerCase()]
      )
      let user = existing[0]
      const idEmpleado = user?.ID_EMPLEADO

      if (!user) {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')

          // 1. ID manual seguro para PERSONA
          const { rows: [{ next_persona_id }] } = await client.query(
            `SELECT COALESCE(MAX("ID_PERSONA"), 0) + 1 AS next_persona_id FROM public."PERSONA"`
          )

          // 2. Crear PERSONA
          await client.query(
            `INSERT INTO public."PERSONA" ("ID_PERSONA", "NOMBRE_COMPLETO")
             VALUES ($1, $2)`,
            [next_persona_id, nombre]
          )

          // 3. ID manual seguro para USUARIO
          const { rows: [{ next_user_id }] } = await client.query(
            `SELECT COALESCE(MAX("ID_USUARIO"), 0) + 1 AS next_user_id FROM public."USUARIO"`
          )

          // 4. Crear USUARIO
          const { rows: userRows } = await client.query(
            `INSERT INTO public."USUARIO" ("ID_USUARIO", "USUARIO", "CORREO_ELECTRONICO", "GOOGLE_ID", "ID_PERSONA")
             VALUES ($1, $2, $3, $4, $5)
             RETURNING "ID_USUARIO", "USUARIO", "CORREO_ELECTRONICO"`,
            [next_user_id, nombre, email.toLowerCase(), googleId, next_persona_id]
          )
          user = userRows[0]

          // 5. Crear CLIENTE
          await client.query(
            `INSERT INTO public."CLIENTE" ("ID_CLIENTE", "ESTADO_CLIENTE")
             VALUES ($1, 'A')
             ON CONFLICT DO NOTHING`,
            [next_persona_id]
          )

          await client.query('COMMIT')
          console.log('Nuevo usuario creado con Google:', user.CORREO_ELECTRONICO)
        } catch (e) {
          await client.query('ROLLBACK')
          throw e
        } finally {
          client.release()
        }
      } else if (!user.GOOGLE_ID) {
        const { rows } = await pool.query(
          `UPDATE public."USUARIO"
           SET "GOOGLE_ID" = $1
           WHERE "ID_USUARIO" = $2
           RETURNING "ID_USUARIO", "USUARIO", "CORREO_ELECTRONICO"`,
          [googleId, user.ID_USUARIO]
        )
        user = rows[0]
        console.log('Cuenta vinculada a Google:', user.CORREO_ELECTRONICO)
      }

      const role = idEmpleado ? 'admin' : 'user'
      const token = generateToken(user.ID_USUARIO, role)

      res.json({
        message: 'Login con Google exitoso',
        token,
        user: {
          id: user.ID_USUARIO,
          nombre: user.USUARIO,
          email: user.CORREO_ELECTRONICO,
          role
        }
      })
    } catch (error) {
      console.error('Error crítico Google login:', error)
      res.status(500).json({
        message: 'Error interno al procesar el login de Google',
        detail: error.message
      })
    }
  },

  // FORGOT PASSWORD
  forgotPassword: async (req, res) => {
    try {
      const { email } = req.body
      if (!email)
        return res.status(400).json({ message: 'Email es requerido' })

      const db = getPool()
      const { rows } = await db.query(
        `SELECT "ID_USUARIO", "USUARIO", "CORREO_ELECTRONICO"
         FROM public."USUARIO" WHERE "CORREO_ELECTRONICO" = $1`,
        [email.toLowerCase()]
      )
      const user = rows[0]
      if (!user)
        return res.json({ message: 'Si el email existe, recibirás un enlace' })

      const resetToken  = crypto.randomBytes(32).toString('hex')
      const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex')
      const expiry      = new Date(Date.now() + 3600000)

      await db.query(
        `UPDATE public."USUARIO"
         SET "RESET_TOKEN" = $1, "RESET_TOKEN_EXPIRY" = $2
         WHERE "ID_USUARIO" = $3`,
        [hashedToken, expiry, user.ID_USUARIO]
      )

      try {
        await sendForgotPasswordEmail(user.CORREO_ELECTRONICO, resetToken, user.USUARIO)
      } catch (e) {
        console.error('Error enviando email:', e.message)
      }

      res.json({ message: 'Si el email existe, recibirás un enlace de recuperación' })
    } catch (error) {
      console.error('Error en forgotPassword:', error)
      res.json({ message: 'Si el email existe, recibirás un enlace de recuperación' })
    }
  },

  // VERIFY RESET TOKEN
  verifyResetToken: async (req, res) => {
    try {
      const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex')
      const db = getPool()
      const { rows } = await db.query(
        `SELECT "ID_USUARIO", "CORREO_ELECTRONICO"
         FROM public."USUARIO"
         WHERE "RESET_TOKEN" = $1 AND "RESET_TOKEN_EXPIRY" > NOW()`,
        [hashedToken]
      )
      if (!rows[0])
        return res.status(400).json({ message: 'Token inválido o expirado' })

      res.json({ message: 'Token válido', email: rows[0].CORREO_ELECTRONICO })
    } catch (error) {
      console.error('Error en verifyResetToken:', error)
      res.status(500).json({ message: 'Error al verificar token' })
    }
  },

  // RESET PASSWORD
  resetPassword: async (req, res) => {
    try {
      const { token, newPassword, confirmPassword } = req.body

      if (!token || !newPassword || !confirmPassword)
        return res.status(400).json({ message: 'Todos los campos son requeridos' })
      if (newPassword !== confirmPassword)
        return res.status(400).json({ message: 'Las contraseñas no coinciden' })
      if (newPassword.length < 6)
        return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' })

      const hashedToken = crypto.createHash('sha256').update(token).digest('hex')
      const db = getPool()
      const { rows } = await db.query(
        `SELECT "ID_USUARIO", "USUARIO", "CORREO_ELECTRONICO"
         FROM public."USUARIO"
         WHERE "RESET_TOKEN" = $1 AND "RESET_TOKEN_EXPIRY" > NOW()`,
        [hashedToken]
      )
      if (!rows[0])
        return res.status(400).json({ message: 'Token inválido o expirado' })

      const hashedPassword = await bcrypt.hash(newPassword, 10)
      await db.query(
        `UPDATE public."USUARIO"
         SET "CONTRASENA" = $1, "RESET_TOKEN" = NULL, "RESET_TOKEN_EXPIRY" = NULL
         WHERE "ID_USUARIO" = $2`,
        [hashedPassword, rows[0].ID_USUARIO]
      )

      try {
        await sendPasswordResetSuccessEmail(rows[0].CORREO_ELECTRONICO, rows[0].USUARIO)
      } catch (e) {
        console.error('Error enviando email:', e.message)
      }

      res.json({ message: 'Contraseña actualizada exitosamente' })
    } catch (error) {
      console.error('Error en resetPassword:', error)
      res.status(500).json({ message: 'Error al actualizar contraseña' })
    }
  }
}

export default authController