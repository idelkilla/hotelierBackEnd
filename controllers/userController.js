import { getPool } from '../db.js'

// ─────────────────────────────────────────────
// GET /api/user/profile
// ─────────────────────────────────────────────
export const getProfile = async (req, res) => {
  const userId = req.user?.id
  console.log('📋 getProfile → userId:', userId)

  try {
    const pool = getPool()

    const { rows } = await pool.query(
      `SELECT
        u."USUARIO"                        AS username,
        u."CORREO_ELECTRONICO"             AS email,
        p."NOMBRE_COMPLETO"                AS nombre_completo,
        p."APELLIDOS"                      AS apellidos,
        p."SEGUNDO_NOMBRE"                 AS segundo_nombre,
        p."NUM_VIAJERO_CONOCIDO"           AS num_viajero_conocido,
        p."NUM_DHS_TRIP"                   AS num_dhs_trip,
        p."CONTACTO_EMERGENCIA_NOMBRE"     AS contacto_emergencia_nombre,
        p."CONTACTO_EMERGENCIA_TEL"        AS contacto_emergencia_tel,
        -- Ubicacion de la persona (ciudad/pais como texto via UBICACION)
        ub."NOMBRE"                        AS ubicacion_nombre,
        -- Telefono principal activo
        t."NUMERO_TELEFONICO"              AS telefono_numero,
        -- Datos biograficos
        db."FECHA_NACIMIENTO"              AS fecha_nacimiento,
        db."TIPO_SEXO"                     AS genero,
        db."SANGRE"                        AS "SANGRE",
        db."ESTATURA"                      AS "ESTATURA",
        db."PESO"                          AS "PESO",
        -- Ocupacion y nacionalidad son FKs en DATOS_BIOGRAFICOS
        oc."NOMBRE"                        AS "OCUPACION",
        na."NOMBRE_NACIONALIDAD"           AS "NACIONALIDAD",
        ec."NOMBRE_ESTADO"                 AS "ESTADO_CIVIL",
        -- Descripcion personal vive en CLIENTE
        cl."DESCRIPCION_PERSONAL"          AS descripcion_personal,
        -- Membresia
        cl."ESTADO_CLIENTE"                AS status_cuenta,
        mi."PUNTOS_FIDELIDAD"              AS puntos,
        nm."NOMBRE_NIVEL"                  AS nivel_membresia,
        mi."NUMERO_MIEMBRO"                AS numero_miembro,
        -- Documentacion
        doc."NUMERO_DOCUMENTACION"         AS doc_numero,
        doc."FECHA_EMISION"                AS doc_fecha_emision,
        doc."FECHA_EXPIRACION"             AS doc_fecha_expiracion,
        doc."EMISOR"                       AS doc_emisor,
        td."TIPO"                          AS doc_tipo
      FROM public."USUARIO" u
      LEFT JOIN public."PERSONA"           p   ON u."ID_PERSONA"    = p."ID_PERSONA"
      LEFT JOIN public."UBICACION"         ub  ON p."ID_UBICACION"  = ub."ID_UBICACION"
      LEFT JOIN public."TELEFONO"          t   ON p."ID_PERSONA"    = t."ID_PERSONA"
                                              AND t."ESTADO_TELEFONO" = 'A'
      LEFT JOIN public."DATOS_BIOGRAFICOS" db  ON p."ID_PERSONA"    = db."ID_PERSONA"
      LEFT JOIN public."OCUPACION"         oc  ON db."ID_OCUPACION" = oc."ID_OCUPACION"
      LEFT JOIN public."NACIONALIDAD"      na  ON db."ID_NACIONALIDAD" = na."ID_NACIONALIDAD"
      LEFT JOIN public."ESTADO_CIVIL"      ec  ON db."ID_ESTADO_CIVIL" = ec."ID_ESTADO_CIVIL"
      LEFT JOIN public."CLIENTE"           cl  ON p."ID_PERSONA"    = cl."ID_CLIENTE"
      LEFT JOIN public."MIEMBRO"           mi  ON cl."ID_CLIENTE"   = mi."ID_CLIENTE"
      LEFT JOIN public."NIVEL_MEMBRESIA"   nm  ON mi."ID_NIVEL"     = nm."ID_NIVEL"
      LEFT JOIN public."DOCUMENTACION"     doc ON p."ID_PERSONA"    = doc."ID_PERSONA"
      LEFT JOIN public."TIPO_DOCUMENTACION" td ON doc."ID_TIPO"     = td."ID_TIPO"
      WHERE u."ID_USUARIO" = $1
      LIMIT 1`,
      [userId]
    )

    if (rows.length === 0)
      return res.status(404).json({ error: 'Perfil no encontrado' })

    const row = rows[0]

    // Devolver estructura que espera el frontend Vue
    res.json({
      username:                   row.username,
      email:                      row.email,
      nombre_completo:            row.nombre_completo,
      apellidos:                  row.apellidos,
      segundo_nombre:             row.segundo_nombre,
      num_viajero_conocido:       row.num_viajero_conocido,
      num_dhs_trip:               row.num_dhs_trip,
      contacto_emergencia_nombre: row.contacto_emergencia_nombre,
      contacto_emergencia_tel:    row.contacto_emergencia_tel,
      ubicacion_nombre:           row.ubicacion_nombre,
      telefono_numero:            row.telefono_numero,
      fecha_nacimiento:           row.fecha_nacimiento
        ? new Date(row.fecha_nacimiento).toISOString().split('T')[0]
        : null,
      genero:                     row.genero,
      descripcion_personal:       row.descripcion_personal,
      SANGRE:                     row.SANGRE,
      ESTATURA:                   row.ESTATURA,
      PESO:                       row.PESO,
      OCUPACION:                  row.OCUPACION,
      NACIONALIDAD:               row.NACIONALIDAD,
      ESTADO_CIVIL:               row.ESTADO_CIVIL,
      status_cuenta:              row.status_cuenta,
      puntos:                     row.puntos    ?? 0,
      nivel_membresia:            row.nivel_membresia ?? 'Blue',
      numero_miembro:             row.numero_miembro,
      DOCUMENTACION: {
        NUMERO_DOCUMENTACION: row.doc_numero,
        FECHA_EMISION:        row.doc_fecha_emision
          ? new Date(row.doc_fecha_emision).toISOString().split('T')[0]
          : null,
        FECHA_EXPIRACION:     row.doc_fecha_expiracion
          ? new Date(row.doc_fecha_expiracion).toISOString().split('T')[0]
          : null,
        EMISOR:               row.doc_emisor,
        TIPO:                 row.doc_tipo,
      }
    })

  } catch (error) {
    console.error('❌ getProfile error:', error.message)
    res.status(500).json({ error: 'Error al consultar perfil' })
  }
}

// ─────────────────────────────────────────────
// PUT /api/user/profile/update
// ─────────────────────────────────────────────
export const updateProfile = async (req, res) => {
  const userId = req.user?.id
  const data   = req.body
  console.log('✏️  updateProfile → userId:', userId, '| payload:', data)

  try {
    const pool = getPool()

    // 1. Obtener ID_PERSONA del usuario
    const { rows: userRows } = await pool.query(
      `SELECT "ID_PERSONA" FROM public."USUARIO" WHERE "ID_USUARIO" = $1`,
      [userId]
    )
    if (userRows.length === 0)
      return res.status(404).json({ error: 'Usuario no encontrado' })

    const idPersona = userRows[0].ID_PERSONA

    // ── PERSONA ──────────────────────────────────────────────────────────────
    // Solo columnas que realmente existen en la tabla PERSONA del esquema
    const personaCols = {
      nombre_completo:            '"NOMBRE_COMPLETO"',
      apellidos:                  '"APELLIDOS"',
      num_viajero_conocido:       '"NUM_VIAJERO_CONOCIDO"',
      num_dhs_trip:               '"NUM_DHS_TRIP"',
      contacto_emergencia_nombre: '"CONTACTO_EMERGENCIA_NOMBRE"',
      contacto_emergencia_tel:    '"CONTACTO_EMERGENCIA_TEL"',
    }

    const personaFields = []
    const personaValues = []
    let idx = 1

    for (const [key, col] of Object.entries(personaCols)) {
      if (data[key] !== undefined) {
        personaFields.push(`${col} = $${idx++}`)
        personaValues.push(data[key])
      }
    }

    if (personaFields.length > 0) {
      // Upsert: insertar si no existe, actualizar si existe
      const existsP = await pool.query(
        `SELECT "ID_PERSONA" FROM public."PERSONA" WHERE "ID_PERSONA" = $1`,
        [idPersona]
      )
      if (existsP.rows.length === 0) {
        await pool.query(
          `INSERT INTO public."PERSONA" ("ID_PERSONA", "NOMBRE_COMPLETO")
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [idPersona, data.nombre_completo || '']
        )
      }
      personaValues.push(idPersona)
      await pool.query(
        `UPDATE public."PERSONA"
         SET ${personaFields.join(', ')}
         WHERE "ID_PERSONA" = $${idx}`,
        personaValues
      )
    }

    // ── EMAIL en USUARIO ──────────────────────────────────────────────────────
    if (data.email !== undefined) {
      await pool.query(
        `UPDATE public."USUARIO" SET "CORREO_ELECTRONICO" = $1 WHERE "ID_USUARIO" = $2`,
        [data.email, userId]
      )
    }

    // ── CLIENTE.DESCRIPCION_PERSONAL ──────────────────────────────────────────
    if (data.descripcion_personal !== undefined) {
      const existsCl = await pool.query(
        `SELECT "ID_CLIENTE" FROM public."CLIENTE" WHERE "ID_CLIENTE" = $1`,
        [idPersona]
      )
      if (existsCl.rows.length > 0) {
        await pool.query(
          `UPDATE public."CLIENTE"
           SET "DESCRIPCION_PERSONAL" = $1
           WHERE "ID_CLIENTE" = $2`,
          [data.descripcion_personal, idPersona]
        )
      }
    }

    // ── DATOS_BIOGRAFICOS ────────────────────────────────────────────────────
    // NOTA: OCUPACION, NACIONALIDAD y ESTADO_CIVIL son IDs foráneos.
    // El frontend actualmente manda texto; si quieres resolverlos por nombre
    // descomenta los bloques correspondientes abajo.
    const bioCols = {
      fecha_nacimiento: '"FECHA_NACIMIENTO"',
      genero:           '"TIPO_SEXO"',
      sangre:           '"SANGRE"',
      estatura:         '"ESTATURA"',
      peso:             '"PESO"',
    }

    const bioFields = []
    const bioValues = []
    idx = 1

    for (const [key, col] of Object.entries(bioCols)) {
      if (data[key] !== undefined) {
        bioFields.push(`${col} = $${idx++}`)
        bioValues.push(data[key] || null)
      }
    }

    // Resolver OCUPACION por nombre → ID
    if (data.ocupacion !== undefined) {
      const { rows: ocRows } = await pool.query(
        `SELECT "ID_OCUPACION" FROM public."OCUPACION" WHERE "NOMBRE" ILIKE $1 LIMIT 1`,
        [data.ocupacion]
      )
      if (ocRows.length > 0) {
        bioFields.push(`"ID_OCUPACION" = $${idx++}`)
        bioValues.push(ocRows[0].ID_OCUPACION)
      }
    }

    // Resolver NACIONALIDAD por nombre → ID
    if (data.nacionalidad !== undefined) {
      const { rows: naRows } = await pool.query(
        `SELECT "ID_NACIONALIDAD" FROM public."NACIONALIDAD" WHERE "NOMBRE_NACIONALIDAD" ILIKE $1 LIMIT 1`,
        [data.nacionalidad]
      )
      if (naRows.length > 0) {
        bioFields.push(`"ID_NACIONALIDAD" = $${idx++}`)
        bioValues.push(naRows[0].ID_NACIONALIDAD)
      }
    }

    // Resolver ESTADO_CIVIL por nombre → ID
    if (data.estado_civil !== undefined) {
      const { rows: ecRows } = await pool.query(
        `SELECT "ID_ESTADO_CIVIL" FROM public."ESTADO_CIVIL" WHERE "NOMBRE_ESTADO" ILIKE $1 LIMIT 1`,
        [data.estado_civil]
      )
      if (ecRows.length > 0) {
        bioFields.push(`"ID_ESTADO_CIVIL" = $${idx++}`)
        bioValues.push(ecRows[0].ID_ESTADO_CIVIL)
      }
    }

    if (bioFields.length > 0) {
      const existsBio = await pool.query(
        `SELECT "ID_PERSONA" FROM public."DATOS_BIOGRAFICOS" WHERE "ID_PERSONA" = $1`,
        [idPersona]
      )
      if (existsBio.rows.length === 0) {
        // No insertamos si no existe — DATOS_BIOGRAFICOS tiene muchos NOT NULL
        // que no podemos satisfacer desde el perfil básico
        console.warn('⚠️  DATOS_BIOGRAFICOS no existe para ID_PERSONA', idPersona, '— update omitido')
      } else {
        bioValues.push(idPersona)
        await pool.query(
          `UPDATE public."DATOS_BIOGRAFICOS"
           SET ${bioFields.join(', ')}
           WHERE "ID_PERSONA" = $${idx}`,
          bioValues
        )
      }
    }

    // ── TELEFONO ─────────────────────────────────────────────────────────────
    // TELEFONO es tabla separada: (ID_TELEFONO, CODIGO_PAIS, NUMERO_TELEFONICO,
    //                               ESTADO_TELEFONO, ID_TIPO, ID_PERSONA)
    if (data.telefono_numero !== undefined && idPersona) {
      const existsTel = await pool.query(
        `SELECT "ID_TELEFONO" FROM public."TELEFONO"
         WHERE "ID_PERSONA" = $1 AND "ESTADO_TELEFONO" = 'A'
         LIMIT 1`,
        [idPersona]
      )
      if (existsTel.rows.length > 0) {
        await pool.query(
          `UPDATE public."TELEFONO"
           SET "NUMERO_TELEFONICO" = $1
           WHERE "ID_TELEFONO" = $2`,
          [data.telefono_numero, existsTel.rows[0].ID_TELEFONO]
        )
      }
      // Si no existe teléfono activo no insertamos porque ID_TIPO y
      // CODIGO_PAIS son NOT NULL y no los tenemos aquí.
    }

    // ── DOCUMENTACION ────────────────────────────────────────────────────────
    // Columna correcta: NUMERO_DOCUMENTACION (no NUMERO_DOCUMENTO)
    const hasDoc = data.numero_documento || data.fecha_emision ||
                   data.fecha_expiracion || data.emisor

    if (hasDoc && idPersona) {
      const existsDoc = await pool.query(
        `SELECT "ID_PERSONA" FROM public."DOCUMENTACION" WHERE "ID_PERSONA" = $1`,
        [idPersona]
      )

      if (existsDoc.rows.length === 0) {
        // Necesitamos ID_TIPO — tomamos el primero disponible como fallback
        const { rows: tipoRows } = await pool.query(
          `SELECT "ID_TIPO" FROM public."TIPO_DOCUMENTACION" LIMIT 1`
        )
        const idTipo = tipoRows[0]?.ID_TIPO ?? 1

        await pool.query(
          `INSERT INTO public."DOCUMENTACION"
             ("ID_PERSONA", "NUMERO_DOCUMENTACION", "FECHA_EMISION",
              "FECHA_EXPIRACION", "EMISOR", "ID_TIPO")
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            idPersona,
            data.numero_documento  || '',
            data.fecha_emision     || null,
            data.fecha_expiracion  || null,
            data.emisor            || '',
            idTipo,
          ]
        )
      } else {
        const docFields = []
        const docValues = []
        idx = 1

        if (data.numero_documento  !== undefined) { docFields.push(`"NUMERO_DOCUMENTACION" = $${idx++}`); docValues.push(data.numero_documento) }
        if (data.fecha_emision     !== undefined) { docFields.push(`"FECHA_EMISION" = $${idx++}`);        docValues.push(data.fecha_emision || null) }
        if (data.fecha_expiracion  !== undefined) { docFields.push(`"FECHA_EXPIRACION" = $${idx++}`);     docValues.push(data.fecha_expiracion || null) }
        if (data.emisor            !== undefined) { docFields.push(`"EMISOR" = $${idx++}`);               docValues.push(data.emisor) }

        if (docFields.length > 0) {
          docValues.push(idPersona)
          await pool.query(
            `UPDATE public."DOCUMENTACION"
             SET ${docFields.join(', ')}
             WHERE "ID_PERSONA" = $${idx}`,
            docValues
          )
        }
      }
    }

    console.log('✅ Perfil actualizado — userId:', userId)
    res.json({ message: 'Perfil actualizado correctamente', success: true })

  } catch (error) {
    console.error('❌ updateProfile error:', error.message)
    console.error(error)
    res.status(500).json({ error: 'Error al actualizar perfil', detail: error.message })
  }
}