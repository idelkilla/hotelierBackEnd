import nodemailer from 'nodemailer'
import dotenv from 'dotenv'

dotenv.config()

// Configurar transporte de correo
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,        // false = STARTTLS
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS   // App Password de Google, no tu contraseña normal
  }
})

// Verificar conexión al iniciar
transporter.verify((error) => {
  if (error) {
    console.error('❌ Error en email service:', error.message)
    console.error('❌ Detalle completo:', error)
  } else {
    console.log('✅ Email service listo y autenticado')
    console.log('📧 Usando cuenta:', process.env.EMAIL_USER)
  }
})

// Plantilla HTML para email de recuperación
const forgotPasswordEmailTemplate = (resetLink, userName) => `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body { 
        font-family: 'Segoe UI', Arial, sans-serif; 
        background-color: #f3f4f6; 
        margin: 0; 
        padding: 20px;
      }
      .container { 
        max-width: 600px; 
        margin: 0 auto; 
        background-color: #ffffff; 
        padding: 40px; 
        border-radius: 8px; 
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .header { 
        text-align: center; 
        color: #3b82f6; 
        margin-bottom: 30px; 
      }
      .header h2 { margin: 0; font-size: 28px; }
      .content { 
        color: #333; 
        line-height: 1.8;
        font-size: 16px;
      }
      .button { 
        display: inline-block; 
        background-color: #3b82f6; 
        color: white; 
        padding: 14px 32px; 
        border-radius: 5px; 
        text-decoration: none; 
        margin: 30px 0; 
        font-weight: bold;
      }
      .button:hover { background-color: #2563eb; }
      .link-section {
        background-color: #f0f9ff;
        padding: 15px;
        border-radius: 5px;
        margin: 20px 0;
        word-break: break-all;
        border-left: 4px solid #3b82f6;
      }
      .warning { 
        color: #dc2626; 
        font-size: 14px;
        background-color: #fee2e2;
        padding: 12px;
        border-radius: 5px;
        margin: 20px 0;
        border-left: 4px solid #dc2626;
      }
      .footer { 
        text-align: center; 
        color: #999; 
        font-size: 12px; 
        margin-top: 30px;
        border-top: 1px solid #eee;
        padding-top: 20px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h2>🔐 Recuperar Contraseña</h2>
      </div>
      <div class="content">
        <p>Hola <strong>${userName || 'Usuario'}</strong>,</p>
        <p>Recibimos una solicitud para resetear tu contraseña. Haz clic en el botón de abajo:</p>
        <center>
          <a href="${resetLink}" class="button">Resetear Contraseña</a>
        </center>
        <p><strong>O copia este enlace:</strong></p>
        <div class="link-section">
          ${resetLink}
        </div>
        <div class="warning">
          ⚠️ Este enlace vence en <strong>1 hora</strong>. Si no solicitaste esto, ignora este email.
        </div>
      </div>
      <div class="footer">
        <p>&copy; 2026 Hotel. Todos los derechos reservados.</p>
      </div>
    </div>
  </body>
  </html>
`

// Plantilla para email de éxito
const passwordResetSuccessTemplate = (userName) => `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <style>
      body { font-family: Arial, sans-serif; background-color: #f3f4f6; padding: 20px; }
      .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 40px; border-radius: 8px; }
      .success { color: #10b981; text-align: center; font-size: 28px; margin: 0; }
      .content { color: #333; line-height: 1.8; font-size: 16px; }
      .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; }
    </style>
  </head>
  <body>
    <div class="container">
      <h2 class="success">✅ Contraseña Actualizada</h2>
      <div class="content">
        <p>Hola <strong>${userName || 'Usuario'}</strong>,</p>
        <p>Tu contraseña ha sido actualizada exitosamente. Puedes iniciar sesión con tu nueva contraseña.</p>
        <p>Si no realizaste esta acción, contacta a soporte inmediatamente.</p>
        <p>Saludos,<br><strong>Hotel</strong></p>
      </div>
      <div class="footer">
        <p>&copy; 2026 Hotel. Todos los derechos reservados.</p>
      </div>
    </div>
  </body>
  </html>
`

// Función para enviar email de recuperación
export const sendForgotPasswordEmail = async (email, resetToken, userName) => {
  try {
    console.log('📧 Intentando enviar email a:', email)
    console.log('👤 EMAIL_USER configurado:', process.env.EMAIL_USER)
    console.log('🔑 EMAIL_PASS existe:', !!process.env.EMAIL_PASS)
    console.log('🔑 EMAIL_PASS longitud:', process.env.EMAIL_PASS?.length)

    let frontendBase = process.env.VITE_FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:5173'

    const urls = frontendBase.split(',')
    frontendBase = urls.find(u => u.includes('onrender.com')) || urls[0]
    frontendBase = frontendBase.trim().replace(/\/$/, '')

    console.log('🌐 Frontend URL:', frontendBase)

    const resetLink = `${frontendBase}/reset-password/${resetToken}`
    console.log('🔗 Reset link generado:', resetLink)

    const mailOptions = {
      from: `"Hotelier Support" <${process.env.EMAIL_USER || 'no-reply@hotelier.com'}>`,
      to: email,
      subject: '🔐 Recuperar tu contraseña',
      html: forgotPasswordEmailTemplate(resetLink, userName),
    }

    const info = await transporter.sendMail(mailOptions)
    console.log('✅ Email de recuperación enviado a:', email)
    console.log('📨 Message ID:', info.messageId)
    return true
  } catch (error) {
    console.error('❌ Error enviando email — mensaje:', error.message)
    console.error('❌ Error enviando email — código:', error.code)
    console.error('❌ Error completo:', error)
    throw new Error('Servicio de correo no disponible')
  }
}

// Función para enviar email de éxito
export const sendPasswordResetSuccessEmail = async (email, userName) => {
  try {
    console.log('📧 Enviando email de confirmación a:', email)

    const mailOptions = {
      from: `"Hotelier Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '✅ Contraseña Actualizada Exitosamente',
      html: passwordResetSuccessTemplate(userName),
    }

    const info = await transporter.sendMail(mailOptions)
    console.log('✅ Email de confirmación enviado a:', email)
    console.log('📨 Message ID:', info.messageId)
    return true
  } catch (error) {
    console.error('❌ Error email éxito — mensaje:', error.message)
    console.error('❌ Error email éxito — código:', error.code)
    console.error('❌ Error completo:', error)
    throw error
  }
}

export default { sendForgotPasswordEmail, sendPasswordResetSuccessEmail }