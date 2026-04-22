import jwt from 'jsonwebtoken'

const ADMIN_EMAIL = 'admin@gmail.com';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded // { id: ..., email: ... }
    next()
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado' })
  }
}

export const authenticateAdmin = (req, res, next) => {
  authenticateToken(req, res, () => {
    if (req.user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Acceso denegado: Se requiere rol de administrador' });
    }
    next();
  });
};