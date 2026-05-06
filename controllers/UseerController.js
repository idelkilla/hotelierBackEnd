import * as db from '../db.js'

// GET /api/perfil/profile
export async function getProfile(req, res, next) {
  try {
    const idUsuario = req.user.id

    const { rows: usuarioRows } = await db.query(
      `SELECT "ID_PERSONA", "CORREO_ELECTRONICO"
       FROM public."USUARIO"
       WHERE "ID_USUARIO" = $1`,
      [idUsuario]
    )
    if (!usuarioRows.length) return res.status(404).json({ error: 'Usuario no encontrado' })

    const idPersona = usuarioRows[0].ID_PERSONA
    const email     = usuarioRows[0].CORREO_ELECTRONICO

    const { rows: personaRows } = await db.query(
      `SELECT
         p."ID_PERSONA",
         p."NOMBRE_COMPLETO",
         p."APELLIDOS",
         p."SEGUNDO_NOMBRE",
         p."NUM_VIAJERO_CONOCIDO",
         p."NUM_DHS_TRIP",
         p."CONTACTO_EMERGENCIA_NOMBRE",
         p."CONTACTO_EMERGENCIA_TEL",
         p."ID_UBICACION",
         u."NOMBRE"      AS "UBICACION_NOMBRE",
         ci."ID_CIUDAD",
         ci."NOMBRE"     AS "CIUDAD_NOMBRE",
         pa."ID_PAIS",
         pa."NOMBRE"     AS "PAIS_NOMBRE"
       FROM public."PERSONA" p
       LEFT JOIN public."UBICACION" u  ON u."ID_UBICACION" = p."ID_UBICACION"
       LEFT JOIN public."CIUDAD"    ci ON ci."ID_CIUDAD"   = u."ID_CIUDAD"
       LEFT JOIN public."PAIS"      pa ON pa."ID_PAIS"     = ci."ID_PAIS"
       WHERE p."ID_PERSONA" = $1`,
      [idPersona]
    )
    const persona = personaRows[0] ?? {}

    const { rows: telRows } = await db.query(
      `SELECT "NUMERO_TELEFONICO"
       FROM public."TELEFONO"
       WHERE "ID_PERSONA" = $1 AND "ESTADO_TELEFONO" = 'A'
       LIMIT 1`,
      [idPersona]
    )
    const telefonoNumero = telRows[0]?.NUMERO_TELEFONICO ?? ''

    const { rows: clienteRows } = await db.query(
      `SELECT "GENERO", "FECHA_NACIMIENTO", "DESCRIPCION_PERSONAL"
       FROM public."CLIENTE"
       WHERE "ID_CLIENTE" = $1`,
      [idPersona]
    )
    const cliente = clienteRows[0] ?? {}

    const { rows: miembroRows } = await db.query(
      `SELECT m."NUMERO_MIEMBRO", m."PUNTOS_FIDELIDAD", n."NOMBRE_NIVEL"
       FROM public."MIEMBRO" m
       LEFT JOIN public."NIVEL_MEMBRESIA" n ON n."ID_NIVEL" = m."ID_NIVEL"
       WHERE m."ID_CLIENTE" = $1`,
      [idPersona]
    )
    const miembro = miembroRows[0] ?? {}

    const { rows: bioRows } = await db.query(
      `SELECT
         db."SANGRE",
         db."ESTATURA",
         db."PESO",
         o."NOMBRE"               AS "OCUPACION",
         n."NOMBRE_NACIONALIDAD"  AS "NACIONALIDAD",
         ec."NOMBRE_ESTADO"       AS "ESTADO_CIVIL"
       FROM public."DATOS_BIOGRAFICOS" db
       LEFT JOIN public."OCUPACION"    o  ON o."ID_OCUPACION"    = db."ID_OCUPACION"
       LEFT JOIN public."NACIONALIDAD" n  ON n."ID_NACIONALIDAD" = db."ID_NACIONALIDAD"
       LEFT JOIN public."ESTADO_CIVIL" ec ON ec."ID_ESTADO_CIVIL"= db."ID_ESTADO_CIVIL"
       WHERE db."ID_PERSONA" = $1`,
      [idPersona]
    )
    const bio = bioRows[0] ?? {}

    const { rows: docRows } = await db.query(
      `SELECT
         "NUMERO_DOCUMENTACION",
         TO_CHAR("FECHA_EMISION",    'YYYY-MM-DD') AS "FECHA_EMISION",
         TO_CHAR("FECHA_EXPIRACION", 'YYYY-MM-DD') AS "FECHA_EXPIRACION",
         "EMISOR"
       FROM public."DOCUMENTACION"
       WHERE "ID_PERSONA" = $1`,
      [idPersona]
    )
    const doc = docRows[0] ?? {}

    return res.json({
      id_persona:                   idPersona,
      nombre_completo:              persona.NOMBRE_COMPLETO              ?? '',
      apellidos:                    persona.APELLIDOS                    ?? '',
      segundo_nombre:               persona.SEGUNDO_NOMBRE               ?? '',
      num_viajero_conocido:         persona.NUM_VIAJERO_CONOCIDO         ?? '',
      num_dhs_trip:                 persona.NUM_DHS_TRIP                 ?? '',
      contacto_emergencia_nombre:   persona.CONTACTO_EMERGENCIA_NOMBRE   ?? '',
      contacto_emergencia_tel:      persona.CONTACTO_EMERGENCIA_TEL      ?? '',
      id_ubicacion:                 persona.ID_UBICACION                 ?? null,
      id_ciudad:                    persona.ID_CIUDAD                    ?? null,
      id_pais:                      persona.ID_PAIS                      ?? null,
      ubicacion_nombre:             persona.UBICACION_NOMBRE             ?? '',
      ciudad_nombre:                persona.CIUDAD_NOMBRE                ?? '',
      pais_nombre:                  persona.PAIS_NOMBRE                  ?? '',
      email,
      telefono_numero:              telefonoNumero,
      genero:                       cliente.GENERO                       ?? '',
      fecha_nacimiento:             cliente.FECHA_NACIMIENTO
                                      ? cliente.FECHA_NACIMIENTO.toISOString().slice(0, 10)
                                      : '',
      descripcion_personal:         cliente.DESCRIPCION_PERSONAL         ?? '',
      puntos:                       miembro.PUNTOS_FIDELIDAD             ?? 0,
      nivel_membresia:              miembro.NOMBRE_NIVEL                 ?? 'Blue',
      numero_miembro:               miembro.NUMERO_MIEMBRO               ?? '',
      SANGRE:                       bio.SANGRE                           ?? '',
      ESTATURA:                     bio.ESTATURA                         ?? '',
      PESO:                         bio.PESO                             ?? '',
      OCUPACION:                    bio.OCUPACION                        ?? '',
      NACIONALIDAD:                 bio.NACIONALIDAD                     ?? '',
      ESTADO_CIVIL:                 bio.ESTADO_CIVIL                     ?? '',
      DOCUMENTACION: {
        NUMERO_DOCUMENTACION: doc.NUMERO_DOCUMENTACION ?? '',
        FECHA_EMISION:        doc.FECHA_EMISION        ?? '',
        FECHA_EXPIRACION:     doc.FECHA_EXPIRACION     ?? '',
        EMISOR:               doc.EMISOR               ?? ''
      }
    })
  } catch (err) {
    next(err)
  }
}

// PUT /api/perfil/profile/update
export async function updateProfile(req, res, next) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')

    const idUsuario = req.user.id

    const { rows: uRows } = await client.query(
      `SELECT "ID_PERSONA" FROM public."USUARIO" WHERE "ID_USUARIO" = $1`,
      [idUsuario]
    )
    if (!uRows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }
    const idPersona = uRows[0].ID_PERSONA

    const {
      nombre_completo, apellidos, segundo_nombre,
      num_viajero_conocido, num_dhs_trip,
      contacto_emergencia_nombre, contacto_emergencia_tel,
      id_ubicacion,
      email,
      telefono_numero,
      genero, fecha_nacimiento, descripcion_personal,
      sangre, estatura, peso,
      numero_documento, fecha_emision, fecha_expiracion, emisor
    } = req.body

    // 1. PERSONA — upsert
    const personaFields = {
      nombre_completo, apellidos, segundo_nombre,
      num_viajero_conocido, num_dhs_trip,
      contacto_emergencia_nombre, contacto_emergencia_tel
    }
    const hasPersona = Object.values(personaFields).some(v => v !== undefined) || id_ubicacion !== undefined

    if (hasPersona) {
      if (id_ubicacion !== undefined && id_ubicacion !== null) {
        const { rows: ubRows } = await client.query(
          `SELECT "ID_UBICACION" FROM public."UBICACION" WHERE "ID_UBICACION" = $1`,
          [id_ubicacion]
        )
        if (!ubRows.length) {
          await client.query('ROLLBACK')
          return res.status(400).json({ error: 'Ubicación no válida' })
        }
      }

      await client.query(
        `INSERT INTO public."PERSONA"
           ("ID_PERSONA", "NOMBRE_COMPLETO", "APELLIDOS", "SEGUNDO_NOMBRE",
            "NUM_VIAJERO_CONOCIDO", "NUM_DHS_TRIP",
            "CONTACTO_EMERGENCIA_NOMBRE", "CONTACTO_EMERGENCIA_TEL", "ID_UBICACION")
         VALUES ($9, $1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT ("ID_PERSONA") DO UPDATE SET
           "NOMBRE_COMPLETO"            = COALESCE(EXCLUDED."NOMBRE_COMPLETO",            "PERSONA"."NOMBRE_COMPLETO"),
           "APELLIDOS"                  = COALESCE(EXCLUDED."APELLIDOS",                  "PERSONA"."APELLIDOS"),
           "SEGUNDO_NOMBRE"             = COALESCE(EXCLUDED."SEGUNDO_NOMBRE",             "PERSONA"."SEGUNDO_NOMBRE"),
           "NUM_VIAJERO_CONOCIDO"       = COALESCE(EXCLUDED."NUM_VIAJERO_CONOCIDO",       "PERSONA"."NUM_VIAJERO_CONOCIDO"),
           "NUM_DHS_TRIP"               = COALESCE(EXCLUDED."NUM_DHS_TRIP",               "PERSONA"."NUM_DHS_TRIP"),
           "CONTACTO_EMERGENCIA_NOMBRE" = COALESCE(EXCLUDED."CONTACTO_EMERGENCIA_NOMBRE", "PERSONA"."CONTACTO_EMERGENCIA_NOMBRE"),
           "CONTACTO_EMERGENCIA_TEL"    = COALESCE(EXCLUDED."CONTACTO_EMERGENCIA_TEL",    "PERSONA"."CONTACTO_EMERGENCIA_TEL"),
           "ID_UBICACION"               = COALESCE(EXCLUDED."ID_UBICACION",               "PERSONA"."ID_UBICACION")`,
        [
          nombre_completo            ?? null,
          apellidos                  ?? null,
          segundo_nombre             ?? null,
          num_viajero_conocido       ?? null,
          num_dhs_trip               ?? null,
          contacto_emergencia_nombre ?? null,
          contacto_emergencia_tel    ?? null,
          id_ubicacion               ?? null,
          idPersona
        ]
      )
    }

    // 2. USUARIO — email
    if (email !== undefined) {
      await client.query(
        `UPDATE public."USUARIO"
         SET "CORREO_ELECTRONICO" = COALESCE($1, "CORREO_ELECTRONICO")
         WHERE "ID_USUARIO" = $2`,
        [email ?? null, idUsuario]
      )
    }

    // 3. TELEFONO — upsert
    if (telefono_numero !== undefined) {
      const { rows: telRows } = await client.query(
        `SELECT "ID_TELEFONO" FROM public."TELEFONO"
         WHERE "ID_PERSONA" = $1 AND "ESTADO_TELEFONO" = 'A'
         LIMIT 1`,
        [idPersona]
      )
      if (telRows.length) {
        await client.query(
          `UPDATE public."TELEFONO"
           SET "NUMERO_TELEFONICO" = $1
           WHERE "ID_TELEFONO" = $2`,
          [telefono_numero, telRows[0].ID_TELEFONO]
        )
      } else {
        await client.query(
          `INSERT INTO public."TELEFONO"
             ("CODIGO_PAIS", "NUMERO_TELEFONICO", "ESTADO_TELEFONO", "ID_TIPO", "ID_PERSONA")
           VALUES ('1', $1, 'A', 1, $2)`,
          [telefono_numero, idPersona]
        )
      }
    }

    // 4. CLIENTE — genero, fecha_nacimiento, descripcion_personal
    const hasCliente = [genero, fecha_nacimiento, descripcion_personal].some(v => v !== undefined)
    if (hasCliente) {
      const { rows: cliRows } = await client.query(
        `SELECT 1 FROM public."CLIENTE" WHERE "ID_CLIENTE" = $1`,
        [idPersona]
      )
      if (cliRows.length) {
        await client.query(
          `UPDATE public."CLIENTE" SET
             "GENERO"               = COALESCE($1, "GENERO"),
             "FECHA_NACIMIENTO"     = COALESCE($2::date, "FECHA_NACIMIENTO"),
             "DESCRIPCION_PERSONAL" = COALESCE($3, "DESCRIPCION_PERSONAL")
           WHERE "ID_CLIENTE" = $4`,
          [
            genero               ?? null,
            fecha_nacimiento     ?? null,
            descripcion_personal ?? null,
            idPersona
          ]
        )
      }
    }

    // 5. DATOS_BIOGRAFICOS
    const hasBio = [sangre, estatura, peso].some(v => v !== undefined)
    if (hasBio) {
      const { rows: bioRows } = await client.query(
        `SELECT 1 FROM public."DATOS_BIOGRAFICOS" WHERE "ID_PERSONA" = $1`,
        [idPersona]
      )
      if (bioRows.length) {
        await client.query(
          `UPDATE public."DATOS_BIOGRAFICOS" SET
             "SANGRE"   = COALESCE($1, "SANGRE"),
             "ESTATURA" = COALESCE($2, "ESTATURA"),
             "PESO"     = COALESCE($3, "PESO")
           WHERE "ID_PERSONA" = $4`,
          [sangre ?? null, estatura ?? null, peso ?? null, idPersona]
        )
      }
    }

    // 6. DOCUMENTACION — upsert
    const hasDoc = [numero_documento, fecha_emision, fecha_expiracion, emisor].some(v => v !== undefined)
    if (hasDoc) {
      const { rows: docRows } = await client.query(
        `SELECT 1 FROM public."DOCUMENTACION" WHERE "ID_PERSONA" = $1`,
        [idPersona]
      )
      if (docRows.length) {
        await client.query(
          `UPDATE public."DOCUMENTACION" SET
             "NUMERO_DOCUMENTACION" = COALESCE($1, "NUMERO_DOCUMENTACION"),
             "FECHA_EMISION"        = COALESCE($2::date, "FECHA_EMISION"),
             "FECHA_EXPIRACION"     = COALESCE($3::date, "FECHA_EXPIRACION"),
             "EMISOR"               = COALESCE($4, "EMISOR")
           WHERE "ID_PERSONA" = $5`,
          [
            numero_documento ?? null,
            fecha_emision    ?? null,
            fecha_expiracion ?? null,
            emisor           ?? null,
            idPersona
          ]
        )
      } else {
        await client.query(
          `INSERT INTO public."DOCUMENTACION"
             ("ID_PERSONA", "NUMERO_DOCUMENTACION", "FECHA_EMISION", "FECHA_EXPIRACION", "EMISOR", "ID_TIPO")
           VALUES ($1, $2, $3::date, $4::date, $5, 1)`,
          [
            idPersona,
            numero_documento ?? null,
            fecha_emision    ?? null,
            fecha_expiracion ?? null,
            emisor           ?? null
          ]
        )
      }
    }

    await client.query('COMMIT')
    return res.json({ message: 'Perfil actualizado correctamente' })

  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}