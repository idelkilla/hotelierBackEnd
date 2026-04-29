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
          p."NUM_VIAJERO_CONOCIDO" AS num_viajero_conocido, 
          p."CONTACTO_EMERGENCIA_NOMBRE" AS contacto_emergencia_nombre, 
          p."CONTACTO_EMERGENCIA_TEL" AS contacto_emergencia_tel, 
          db."FECHA_NACIMIENTO" AS fecha_nacimiento, 
          db."TIPO_SEXO" AS genero, 
          db."SANGRE" AS "SANGRE", 
          db."ESTATURA" AS "ESTATURA", 
          db."PESO" AS "PESO", 
          c."ESTADO_CLIENTE" AS status_cuenta, 
          m."PUNTOS_FIDELIDAD" AS puntos, 
          nm."NOMBRE_NIVEL" AS nivel_membresia 
      FROM public."USUARIO" u 
      LEFT JOIN public."PERSONA" p ON u."ID_PERSONA" = p."ID_PERSONA" 
      LEFT JOIN public."DATOS_BIOGRAFICOS" db ON p."ID_PERSONA" = db."ID_PERSONA" 
      LEFT JOIN public."CLIENTE" c ON p."ID_PERSONA" = c."ID_CLIENTE" 
      LEFT JOIN public."MIEMBRO" m ON c."ID_CLIENTE" = m."ID_CLIENTE" 
      LEFT JOIN public."NIVEL_MEMBRESIA" nm ON m."ID_NIVEL" = nm."ID_NIVEL" 
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

export const updateProfile = async (req, res) => {
  const userId = req.user?.id;
  const data = req.body;

  console.log('Actualizando perfil para usuario:', userId);
  console.log('Datos recibidos:', data);

  try {
    const pool = getPool();

    // First, get the person's ID associated with this user
    const userQuery = `SELECT "ID_PERSONA" FROM public."USUARIO" WHERE "ID_USUARIO" = $1`;
    const userResult = await pool.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const idPersona = userResult.rows[0].ID_PERSONA;

    // Check if PERSONA record exists for this user
    const personaCheck = await pool.query(`SELECT "ID_PERSONA" FROM public."PERSONA" WHERE "ID_PERSONA" = $1`, [idPersona]);
    
    // Create PERSONA record if it doesn't exist
    if (personaCheck.rows.length === 0) {
      await pool.query(
        `INSERT INTO public."PERSONA" ("ID_PERSONA", "NOMBRE_COMPLETO") VALUES ($1, $2)`,
        [idPersona, data.nombre_completo || '']
      );
    }

    // Check if DATOS_BIOGRAFICOS exists
    const bioCheck = await pool.query(`SELECT "ID_PERSONA" FROM public."DATOS_BIOGRAFICOS" WHERE "ID_PERSONA" = $1`, [idPersona]);
    
    // Create DATOS_BIOGRAFICOS record if it doesn't exist
    if (bioCheck.rows.length === 0) {
      await pool.query(
        `INSERT INTO public."DATOS_BIOGRAFICOS" ("ID_PERSONA") VALUES ($1)`,
        [idPersona]
      );
    }

    // Build dynamic update query for PERSONA
    const personaFields = [];
    const personaValues = [];
    let paramIndex = 1;

    if (data.nombre_completo !== undefined) {
      personaFields.push(`"NOMBRE_COMPLETO" = $${paramIndex++}`);
      personaValues.push(data.nombre_completo);
    }
    if (data.apellidos !== undefined) {
      personaFields.push(`"APELLIDOS" = $${paramIndex++}`);
      personaValues.push(data.apellidos);
    }
    if (data.num_viajero_conocido !== undefined) {
      personaFields.push(`"NUM_VIAJERO_CONOCIDO" = $${paramIndex++}`);
      personaValues.push(data.num_viajero_conocido);
    }
    if (data.num_dhs_trip !== undefined) {
      personaFields.push(`"NUM_DHS_TRIP" = $${paramIndex++}`);
      personaValues.push(data.num_dhs_trip);
    }
    if (data.contacto_emergencia_nombre !== undefined) {
      personaFields.push(`"CONTACTO_EMERGENCIA_NOMBRE" = $${paramIndex++}`);
      personaValues.push(data.contacto_emergencia_nombre);
    }
    if (data.contacto_emergencia_tel !== undefined) {
      personaFields.push(`"CONTACTO_EMERGENCIA_TEL" = $${paramIndex++}`);
      personaValues.push(data.contacto_emergencia_tel);
    }
    if (data.ubicacion_nombre !== undefined) {
      personaFields.push(`"UBICACION_NOMBRE" = $${paramIndex++}`);
      personaValues.push(data.ubicacion_nombre);
    }

    // Update PERSONA table
    if (personaFields.length > 0) {
      personaValues.push(idPersona);
      const personaUpdateQuery = `
        UPDATE public."PERSONA" 
        SET ${personaFields.join(', ')} 
        WHERE "ID_PERSONA" = $${paramIndex}
      `;
      await pool.query(personaUpdateQuery, personaValues);
    }

    // Build dynamic update query for DATOS_BIOGRAFICOS
    const bioFields = [];
    const bioValues = [];
    paramIndex = 1;

    if (data.fecha_nacimiento !== undefined) {
      bioFields.push(`"FECHA_NACIMIENTO" = $${paramIndex++}`);
      bioValues.push(data.fecha_nacimiento);
    }
    if (data.genero !== undefined) {
      bioFields.push(`"TIPO_SEXO" = $${paramIndex++}`);
      bioValues.push(data.genero);
    }
    if (data.sangre !== undefined) {
      bioFields.push(`"SANGRE" = $${paramIndex++}`);
      bioValues.push(data.sangre);
    }
    if (data.estatura !== undefined) {
      bioFields.push(`"ESTATURA" = $${paramIndex++}`);
      bioValues.push(data.estatura);
    }
    if (data.peso !== undefined) {
      bioFields.push(`"PESO" = $${paramIndex++}`);
      bioValues.push(data.peso);
    }
    if (data.ocupacion !== undefined) {
      bioFields.push(`"OCUPACION" = $${paramIndex++}`);
      bioValues.push(data.ocupacion);
    }
    if (data.nacionalidad !== undefined) {
      bioFields.push(`"NACIONALIDAD" = $${paramIndex++}`);
      bioValues.push(data.nacionalidad);
    }
    if (data.estado_civil !== undefined) {
      bioFields.push(`"ESTADO_CIVIL" = $${paramIndex++}`);
      bioValues.push(data.estado_civil);
    }
    if (data.descripcion_personal !== undefined) {
      bioFields.push(`"DESCRIPCION_PERSONAL" = $${paramIndex++}`);
      bioValues.push(data.descripcion_personal);
    }

    // Update DATOS_BIOGRAFICOS table
    if (bioFields.length > 0) {
      bioValues.push(idPersona);
      const bioUpdateQuery = `
        UPDATE public."DATOS_BIOGRAFICOS" 
        SET ${bioFields.join(', ')} 
        WHERE "ID_PERSONA" = $${paramIndex}
      `;
      await pool.query(bioUpdateQuery, bioValues);
    }

    // Handle DOCUMENTACION (Pasaporte/ID)
    if (data.numero_documento || data.fecha_emision || data.fecha_expiracion || data.emisor) {
      // Check if DOCUMENTACION exists
      const docCheck = await pool.query(
        `SELECT "ID_PERSONA" FROM public."DOCUMENTACION" WHERE "ID_PERSONA" = $1`,
        [idPersona]
      );

      if (docCheck.rows.length === 0) {
        // Insert new document
        await pool.query(
          `INSERT INTO public."DOCUMENTACION" ("ID_PERSONA", "NUMERO_DOCUMENTO", "FECHA_EMISION", "FECHA_EXPIRACION", "EMISOR") 
           VALUES ($1, $2, $3, $4, $5)`,
          [idPersona, data.numero_documento || '', data.fecha_emision || null, data.fecha_expiracion || null, data.emisor || '']
        );
      } else {
        // Update existing document
        const docFields = [];
        const docValues = [];
        paramIndex = 1;

        if (data.numero_documento !== undefined) {
          docFields.push(`"NUMERO_DOCUMENTO" = $${paramIndex++}`);
          docValues.push(data.numero_documento);
        }
        if (data.fecha_emision !== undefined) {
          docFields.push(`"FECHA_EMISION" = $${paramIndex++}`);
          docValues.push(data.fecha_emision);
        }
        if (data.fecha_expiracion !== undefined) {
          docFields.push(`"FECHA_EXPIRACION" = $${paramIndex++}`);
          docValues.push(data.fecha_expiracion);
        }
        if (data.emisor !== undefined) {
          docFields.push(`"EMISOR" = $${paramIndex++}`);
          docValues.push(data.emisor);
        }

        if (docFields.length > 0) {
          docValues.push(idPersona);
          const docUpdateQuery = `
            UPDATE public."DOCUMENTACION" 
            SET ${docFields.join(', ')} 
            WHERE "ID_PERSONA" = $${paramIndex}
          `;
          await pool.query(docUpdateQuery, docValues);
        }
      }
    }

    // Handle email update in USUARIO table
    if (data.email !== undefined) {
      await pool.query(
        `UPDATE public."USUARIO" SET "CORREO_ELECTRONICO" = $1 WHERE "ID_USUARIO" = $2`,
        [data.email, userId]
      );
    }

    // Handle telefono update (stored in PERSONA)
    if (data.telefono_numero !== undefined) {
      await pool.query(
        `UPDATE public."PERSONA" SET "TELEFONO_NUMERO" = $1 WHERE "ID_PERSONA" = $2`,
        [data.telefono_numero, idPersona]
      );
    }

    console.log('✅ Perfil actualizado exitosamente');
    res.json({ message: 'Perfil actualizado correctamente', success: true });

  } catch (error) {
    console.error('❌ Error al actualizar perfil:', error.message);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
};
