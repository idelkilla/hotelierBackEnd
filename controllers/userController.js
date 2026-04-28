import { getPool } from '../db.js'

export const getProfile = async (req, res) => {
  const userId = req.user?.id;
  console.log('ID de usuario intentando acceso:', userId);

  try {
    const pool = getPool();

    const query = `
      SELECT 
          u."USUARIO" AS username, 
          u."CORREO_ELECTRONICO" AS email, 
          p."NOMBRE_COMPLETO" AS nombre_completo, 
          p."APELLIDOS" AS apellidos, 
          p."NUM_VIAJERO_CONOCIDO" AS tsa_id, 
          p."CONTACTO_EMERGENCIA_NOMBRE" AS emergencia_nombre, 
          p."CONTACTO_EMERGENCIA_TEL" AS emergencia_tel, 
          db."FECHA_NACIMIENTO" AS fecha_nacimiento, 
          db."TIPO_SEXO" AS genero, 
          db."SANGRE" AS tipo_sangre, 
          db."ESTATURA" AS estatura, 
          db."PESO" AS peso, 
          c."ESTADO_CLIENTE" AS status_cuenta, 
          m."PUNTOS_FIDELIDAD" AS puntos, 
          nm."NOMBRE_NIVEL" AS nivel_membresia 
      FROM "USUARIO" u 
      JOIN "PERSONA" p ON u."ID_PERSONA" = p."ID_PERSONA" 
      LEFT JOIN "DATOS_BIOGRAFICOS" db ON p."ID_PERSONA" = db."ID_PERSONA" 
      LEFT JOIN "CLIENTE" c ON p."ID_PERSONA" = c."ID_CLIENTE" 
      LEFT JOIN "MIEMBRO" m ON c."ID_CLIENTE" = m."ID_CLIENTE" 
      LEFT JOIN "NIVEL_MEMBRESIA" nm ON m."ID_NIVEL" = nm."ID_NIVEL" 
      WHERE u."ID_USUARIO" = $1;
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('❌ Error detallado:', error.message);
    res.status(500).json({ error: 'Error al consultar perfil' });
  }
};