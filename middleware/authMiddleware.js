import jwt from 'jsonwebtoken'

export const authenticateToken = (req, res, next) => { //

  console.log('🔍 [AUTH] Header:', authHeader ? 'Present' : 'MISSING')
  console.log('🔍 [AUTH] Token:', token ? `${token.slice(0,20)}...` : 'NO TOKEN')

  if (!token) {
    console.log('❌ [401] No token provided')
    return res.status(401).json({ error: 'Token no proporcionado' })
  }

  console.log('🔑 [AUTH] JWT_SECRET:', process.env.JWT_SECRET ? 'SET ✅' : 'MISSING ⚠️')

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    console.log('✅ [AUTH] Token valid → user:', decoded.id, decoded.role) //
    req.user = decoded // { id: ..., role: ... }
    next()
  } catch (err) {
    console.error('❌ [403] JWT verify failed:', {
      message: err.message,
      name: err.name,
      expiredAt: err.expiredAt,
      secretMissing: !process.env.JWT_SECRET
    })
    return res.status(403).json({ error: 'Token inválido o expirado' })
  }
}

export const authenticateAdmin = (req, res, next) => {
  authenticateToken(req, res, () => {
    if (req.user.role !== 'admin') { //
      return res.status(403).json({ error: 'Acceso denegado: Se requiere rol de administrador' });
    }
    next();
  });
};