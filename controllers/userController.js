import { getPool } from '../db.js'

export const getProfile = async (req, res) => {
  const userId = req.user?.id;
  console.log('ID de usuario intentando acceso:', userId);

  try {
    const pool = getPool();

    const query = `
      SELECT 
          u."USUARIO" AS nombre_login, 
          u."CORREO_ELECTRONICO" AS email, 
          COALESCE(m."PUNTOS_FIDELIDAD", 0) AS puntos_actuales,
          -- Buscamos el nombre del nivel basado en puntos
          (SELECT "NOMBRE_NIVEL" 
           FROM public."NIVEL_MEMBRESIA" 
           WHERE COALESCE(m."PUNTOS_FIDELIDAD", 0) >= "PUNTOS_MINIMOS" 
           ORDER BY "PUNTOS_MINIMOS" DESC 
           LIMIT 1) AS nivel_nombre,
          -- Buscamos el siguiente escalón
          (SELECT MIN("PUNTOS_MINIMOS") 
           FROM public."NIVEL_MEMBRESIA" 
           WHERE "PUNTOS_MINIMOS" > COALESCE(m."PUNTOS_FIDELIDAD", 0)) AS proximo_nivel
      FROM public."USUARIO" u
      LEFT JOIN public."PERSONA" p ON u."ID_PERSONA" = p."ID_PERSONA"
      LEFT JOIN public."CLIENTE" c ON p."ID_PERSONA" = c."ID_CLIENTE"
      LEFT JOIN public."MIEMBRO" m ON c."ID_CLIENTE" = m."ID_CLIENTE"
      WHERE u."ID_USUARIO" = $1;
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado en la BD' });
    }

    const row = result.rows[0];

    res.json({
      nombre: row.nombre_login || 'Usuario',
      email: row.email,
      nivel: row.nivel_nombre || 'Blue',
      puntos: row.puntos_actuales,
      componentes_actuales: row.puntos_actuales,
      componentes_requeridos: row.proximo_nivel || row.puntos_actuales
    });

  } catch (error) {
    console.error('❌ Error detallado:', error.message);
    res.status(500).json({ error: 'Error al consultar perfil' });
  }
};