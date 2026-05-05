import { getPool } from '../db.js'

const metodoPagoController = {

  // GET /api/metodos-pago
  // Devuelve todas las tarjetas del usuario autenticado
  getAll: async (req, res) => {
    try {
      const db = getPool()

      // req.user.id viene del JWT (authMiddleware)
      // Primero obtenemos el ID_PERSONA vinculado a este usuario
      const { rows: personaRows } = await db.query(
        `SELECT "ID_PERSONA" FROM public."USUARIO" WHERE "ID_USUARIO" = $1`,
        [req.user.id]
      )

      if (!personaRows[0]?.ID_PERSONA) {
        // El usuario aún no tiene PERSONA vinculada, devolvemos array vacío
        return res.json([])
      }

      const idPersona = personaRows[0].ID_PERSONA

      const { rows } = await db.query(
        `SELECT 
           "ID_METODO"      AS id,
           "TIPO"           AS tipo,
           "ULTIMOS4"       AS last4,
           "NOMBRE_TITULAR" AS nombre,
           "MES_EXP"        AS mes_exp,
           "ANO_EXP"        AS ano_exp
         FROM public."METODO_PAGO"
         WHERE "ID_PERSONA" = $1
         ORDER BY "CREATED_AT" DESC`,
        [idPersona]
      )

      // Formateamos la expiración igual que el frontend espera: "MM/AA"
      const tarjetas = rows.map(t => ({
        ...t,
        expiracion: `${t.mes_exp}/${t.ano_exp}`
      }))

      res.json(tarjetas)
    } catch (error) {
      console.error('Error en getAll metodos-pago:', error)
      res.status(500).json({ message: 'Error al obtener métodos de pago' })
    }
  },

  // POST /api/metodos-pago
  // Guarda una nueva tarjeta para el usuario autenticado
  create: async (req, res) => {
    try {
      const { tipo, numero, nombre, expiracion } = req.body

      // Validaciones básicas
      if (!tipo || !numero || !nombre || !expiracion) {
        return res.status(400).json({ message: 'Todos los campos son requeridos' })
      }

      // El número viene como "1234 5678 9012 3456", sacamos los últimos 4 dígitos
      const soloDigitos = numero.replace(/\s/g, '')
      if (soloDigitos.length < 13) {
        return res.status(400).json({ message: 'Número de tarjeta inválido' })
      }
      const ultimos4 = soloDigitos.slice(-4)

      // expiracion viene como "MM/AA"
      const [mes, ano] = expiracion.split('/')
      if (!mes || !ano || mes.length !== 2 || ano.length !== 2) {
        return res.status(400).json({ message: 'Fecha de vencimiento inválida' })
      }

      const db = getPool()

      // Obtenemos ID_PERSONA del usuario autenticado
      const { rows: personaRows } = await db.query(
        `SELECT "ID_PERSONA" FROM public."USUARIO" WHERE "ID_USUARIO" = $1`,
        [req.user.id]
      )

      if (!personaRows[0]?.ID_PERSONA) {
        return res.status(400).json({ 
          message: 'Tu cuenta no tiene un perfil de persona vinculado. Completa tu perfil primero.' 
        })
      }

      const idPersona = personaRows[0].ID_PERSONA

      const { rows } = await db.query(
        `INSERT INTO public."METODO_PAGO" 
           ("ID_PERSONA", "TIPO", "ULTIMOS4", "NOMBRE_TITULAR", "MES_EXP", "ANO_EXP")
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING 
           "ID_METODO"      AS id,
           "TIPO"           AS tipo,
           "ULTIMOS4"       AS last4,
           "NOMBRE_TITULAR" AS nombre,
           "MES_EXP"        AS mes_exp,
           "ANO_EXP"        AS ano_exp`,
        [idPersona, tipo, ultimos4, nombre.trim(), mes, ano]
      )

      const nueva = rows[0]
      res.status(201).json({
        ...nueva,
        expiracion: `${nueva.mes_exp}/${nueva.ano_exp}`
      })
    } catch (error) {
      console.error('Error en create metodo-pago:', error)
      res.status(500).json({ message: 'Error al guardar método de pago' })
    }
  },

  // DELETE /api/metodos-pago/:id
  // Elimina una tarjeta — verifica que pertenezca al usuario autenticado
  remove: async (req, res) => {
    try {
      const idMetodo = parseInt(req.params.id)
      if (isNaN(idMetodo)) {
        return res.status(400).json({ message: 'ID inválido' })
      }

      const db = getPool()

      // Obtenemos ID_PERSONA del usuario autenticado
      const { rows: personaRows } = await db.query(
        `SELECT "ID_PERSONA" FROM public."USUARIO" WHERE "ID_USUARIO" = $1`,
        [req.user.id]
      )

      if (!personaRows[0]?.ID_PERSONA) {
        return res.status(403).json({ message: 'Sin permiso' })
      }

      const idPersona = personaRows[0].ID_PERSONA

      // Eliminamos SOLO si la tarjeta le pertenece a este usuario
      const { rowCount } = await db.query(
        `DELETE FROM public."METODO_PAGO"
         WHERE "ID_METODO" = $1 AND "ID_PERSONA" = $2`,
        [idMetodo, idPersona]
      )

      if (rowCount === 0) {
        return res.status(404).json({ message: 'Tarjeta no encontrada o sin permiso' })
      }

      res.json({ message: 'Tarjeta eliminada correctamente' })
    } catch (error) {
      console.error('Error en remove metodo-pago:', error)
      res.status(500).json({ message: 'Error al eliminar método de pago' })
    }
  }
}

export default metodoPagoController