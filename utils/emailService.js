// emailService.js
import { Resend } from 'resend';

const resend = new Resend('re_J56oyXjY_AaoWDWgnfEvomxJByY5pLxWQ');

/**
 * Envía un correo de recuperación de contraseña
 */
export const sendForgotPasswordEmail = async (email, token, nombre) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${token}`;
  
  try {
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: 'Recuperación de Contraseña - Hotelier',
      html: `<p>Hola ${nombre},</p><p>Haz clic en el siguiente enlace para restablecer tu contraseña:</p><a href="${resetUrl}">${resetUrl}</a>`
    });
  } catch (error) {
    console.error('Error enviando email de recuperación:', error);
    throw error;
  }
};

/**
 * Envía un correo de confirmación de cambio de contraseña exitoso
 */
export const sendPasswordResetSuccessEmail = async (email, nombre) => {
  try {
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: 'Contraseña Actualizada - Hotelier',
      html: `<p>Hola ${nombre},</p><p>Tu contraseña ha sido actualizada exitosamente. Si no realizaste este cambio, contacta a soporte.</p>`
    });
  } catch (error) {
    console.error('Error enviando email de éxito:', error);
    throw error;
  }
};