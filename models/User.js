import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const UserSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  googleId: { type: String },
  resetToken: { type: String },
  resetTokenExpiry: { type: Date },
  createdAt: { type: Date, default: Date.now }
})

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next()
  try {
    const salt = await bcrypt.genSalt(10)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// Compare password method
UserSchema.methods.comparePassword = async function(passwordIngresada) {
  return await bcrypt.compare(passwordIngresada, this.password)
}

// Generate reset token
UserSchema.methods.generateResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex')
  this.resetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex')
  this.resetTokenExpiry = Date.now() + 60 * 60 * 1000 // 1 hora
  return resetToken
}

export default mongoose.model('User', UserSchema)
