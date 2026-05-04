import { getPool } from '../db.js'

const validateSearchQuery = (q) => {
    if (!q || typeof q !== 'string' || q.trim() === '') return ''
    return q.trim()
}

const validateId = (id) => {
    const parsed = parseInt(id, 10)
    if (isNaN(parsed) || parsed <= 0) return null
    return parsed
}

// GET /api/search/ubicaciones?q=texto
export const getUbicaciones = async (req, res) => {
    const { q } = req.query
    const query = validateSearchQuery(q)

    try {
        const pool = getPool()
        
        let searchText = '%'
        if (query) {
            searchText = `%${query}%`
        }
        
        console.log(`🔍 Buscando ubicaciones: "${query || 'todas'}"`)

        const { rows } = await pool.query(`
            SELECT
                u."ID_UBICACION" as id,
                u."NOMBRE"       as ubicacion,
                c."NOMBRE"       as ciudad,
                p."NOMBRE"       as pais,
                u."ID_TIPO"      as id_tipo,
                COALESCE(tu."NOMBRE", 'Ubicación') as tipo_nombre,
                u."LATITUD",
                u."LONGITUD"
            FROM public."UBICACION" u
            LEFT JOIN public."CIUDAD" c ON u."ID_CIUDAD" = c."ID_CIUDAD"
            LEFT JOIN public."PAIS"   p ON c."ID_PAIS"   = p."ID_PAIS"
            LEFT JOIN public."TIPO_UBICACION" tu ON u."ID_TIPO" = tu."ID_TIPO"
            WHERE (u."NOMBRE" ILIKE $1 
               OR COALESCE(c."NOMBRE", '') ILIKE $1 
               OR COALESCE(p."NOMBRE", '') ILIKE $1)
            ORDER BY u."ID_TIPO" DESC, u."NOMBRE" ASC
            LIMIT 20
        `, [searchText])
        
        console.log(`✅ ${rows.length} resultado(s) encontrado(s)`)
        
        // Debug mejorado
        if (rows.length > 0) {
            console.log('✅ Primeros 3 resultados:')
            rows.slice(0, 3).forEach(r => {
                console.log(`  - ${r.ubicacion} (Tipo: ${r.tipo_nombre})`)
            })
        }
        
        res.json(rows)
    } catch (err) {
        console.error('❌ Error CRÍTICO en getUbicaciones:', err)
        res.status(500).json({ error: err.message, stack: err.stack })
    }
}

// GET /api/search/aeropuertos?q=texto
export const getAeropuertos = async (req, res) => {
    const { q } = req.query
    const query = validateSearchQuery(q)

    try {
        const pool = getPool()
        
        let searchText = '%'
        if (query) {
            searchText = `%${query}%`
        }
        
        console.log(`🔍 Buscando aeropuertos: "${query || 'todos'}"`)
        
        const { rows } = await pool.query(`
            SELECT
                u."ID_UBICACION" as id,
                u."NOMBRE"       as ubicacion,
                c."NOMBRE"       as ciudad,
                p."NOMBRE"       as pais,
                u."ID_TIPO"      as id_tipo,
                COALESCE(tu."NOMBRE", 'Aeropuerto') as tipo_nombre
            FROM public."UBICACION" u
            LEFT JOIN public."CIUDAD" c ON u."ID_CIUDAD" = c."ID_CIUDAD"
            LEFT JOIN public."PAIS"   p ON c."ID_PAIS"   = p."ID_PAIS"
            LEFT JOIN public."TIPO_UBICACION" tu ON u."ID_TIPO" = tu."ID_TIPO"
            WHERE (u."ID_TIPO" = 1 OR tu."NOMBRE" ILIKE '%aeropuerto%' OR u."NOMBRE" ILIKE '%aeropuerto%')
              AND (u."NOMBRE" ILIKE $1 
                   OR COALESCE(c."NOMBRE", '') ILIKE $1 
                   OR COALESCE(p."NOMBRE", '') ILIKE $1)
            ORDER BY u."NOMBRE"
            LIMIT 20
        `, [searchText])
        
        console.log(`✅ ${rows.length} resultado(s) encontrado(s)`)
        res.json(rows)
    } catch (err) {
        console.error('❌ Error CRÍTICO en getAeropuertos:', err)
        res.status(500).json({ error: err.message, stack: err.stack })
    }
}

// POST /api/search/hospedaje
export const postBuscarHospedaje = async (req, res) => {
    const { destino, habitaciones, fecha_inicio, fecha_fin } = req.body

    try {
        if (!habitaciones || !Array.isArray(habitaciones) || habitaciones.length === 0) {
            return res.status(400).json({ error: 'Parámetro habitaciones requerido y no vacío' })
        }

        if (fecha_inicio && fecha_fin) {
            const fechaInicio = new Date(fecha_inicio)
            const fechaFin = new Date(fecha_fin)

            if (isNaN(fechaInicio.getTime()) || isNaN(fechaFin.getTime())) {
                return res.status(400).json({ error: 'Formato de fecha inválido' })
            }

            if (fechaFin <= fechaInicio) {
                return res.status(400).json({ error: 'La fecha fin debe ser posterior a la fecha inicio' })
            }
        }

        const pool = getPool()

        if (!habitaciones.every(h => h.adultos !== undefined && h.ninos !== undefined)) {
            return res.status(400).json({ error: 'Cada habitación debe tener adultos y niños' })
        }

        const maxAdultos = Math.max(...habitaciones.map(h => parseInt(h.adultos) || 0))
        const maxNinos = Math.max(...habitaciones.map(h => parseInt(h.ninos) || 0))

        const rawDestino = (destino || '').toString().trim()
        const primeraParte = rawDestino.split(',')[0].trim()
        const textoBusqueda = primeraParte ? `%${primeraParte}%` : '%'

        console.log('=== BÚSQUEDA DE HOSPEDAJE ===')
        console.log('Destino:', destino)
        console.log('Adultos:', maxAdultos, '| Niños:', maxNinos)

        const { rows } = await pool.query(`
            SELECT
                s."ID_SERVICIO"                          AS id_servicio,
                s."NOMBRE"                               AS hotel,
                u."NOMBRE"                               AS ubicacion_nombre,
                c."NOMBRE"                               AS ciudad,
                p."NOMBRE"                               AS pais,
                hos."ID_TIPO"                            AS id_tipo_hospedaje,
                th."NOMBRE_TIPO"                         AS tipo_hospedaje,
                MIN(hab."PRECIO_NOCHE")                  AS precio_min,
                ROUND(AVG(r."CALIFICACION")::NUMERIC, 1) AS calificacion_promedio,
                COUNT(DISTINCT r."ID_RESENA")            AS total_resenas,
                COUNT(DISTINCT hab."ID_HABITACION")      AS habitaciones_disponibles
            FROM public."SERVICIO" s
            INNER JOIN public."HOSPEDAJE" hos ON hos."ID_HOSPEDAJE" = s."ID_SERVICIO"
            INNER JOIN public."TIPO_HOSPEDAJE" th ON th."ID_TIPO" = hos."ID_TIPO"
            INNER JOIN public."UBICACION" u ON u."ID_UBICACION" = hos."ID_UBICACION"
            LEFT JOIN public."CIUDAD" c ON u."ID_CIUDAD" = c."ID_CIUDAD"
            LEFT JOIN public."PAIS" p ON c."ID_PAIS" = p."ID_PAIS"
            LEFT JOIN public."HABITACION" hab ON hab."ID_HOSPEDAJE" = hos."ID_HOSPEDAJE"
            LEFT JOIN public."RESENA" r ON r."ID_SERVICIO" = s."ID_SERVICIO"
            WHERE 
                (
                    $1 = '%' 
                    OR s."NOMBRE" ILIKE $1 
                    OR u."NOMBRE" ILIKE $1 
                    OR c."NOMBRE" ILIKE $1 
                    OR p."NOMBRE" ILIKE $1
                )
                AND (hab."CAPACIDAD_ADULTO" >= $2 OR hab."CAPACIDAD_ADULTO" IS NULL)
                AND (hab."CAPACIDAD_NINOS" >= $3 OR hab."CAPACIDAD_NINOS" IS NULL)
            GROUP BY 
                s."ID_SERVICIO", s."NOMBRE", u."NOMBRE", hos."ID_TIPO",
                c."NOMBRE", p."NOMBRE", th."NOMBRE_TIPO"
            ORDER BY precio_min ASC
            LIMIT 50
        `, [textoBusqueda, maxAdultos, maxNinos])

        if (rows.length === 0) {
            console.log('⚠️ Sin resultados')
            return res.json([])
        }

        console.log(`✅ ${rows.length} hospedaje(s) encontrado(s)`)

        const ids = rows.map(r => r.id_servicio)

        let amenidadesMap = {}
        try {
            const { rows: srvRows } = await pool.query(`
                SELECT hs."ID_HOSPEDAJE" AS id_hospedaje, si."NOMBRE" AS nombre
                FROM public."HOSPEDAJE_SERVICIO" hs
                JOIN public."SERVICIO_INCLUIDO" si ON si."ID_SERVICIO_INCLUIDO" = hs."ID_SERVICIO_INCLUIDO"
                WHERE hs."ID_HOSPEDAJE" = ANY($1)
            `, [ids])
            
            srvRows.forEach(({ id_hospedaje, nombre }) => {
                if (!amenidadesMap[id_hospedaje]) amenidadesMap[id_hospedaje] = []
                amenidadesMap[id_hospedaje].push(nombre)
            })
        } catch (e) {
            console.error('⚠️ Error en amenidades:', e.message)
        }

        let imagenesMap = {}
        try {
            const { rows: imgRows } = await pool.query(`
                SELECT "ID_HOSPEDAJE" AS id_hospedaje, "URL" AS url
                FROM public."IMAGEN_HOSPEDAJE"
                WHERE "ID_HOSPEDAJE" = ANY($1)
                ORDER BY "ID_HOSPEDAJE", "ORDEN" ASC
            `, [ids])
            
            imgRows.forEach(({ id_hospedaje, url }) => {
                if (!imagenesMap[id_hospedaje]) imagenesMap[id_hospedaje] = []
                imagenesMap[id_hospedaje].push(url)
            })
        } catch (e) {
            console.error('⚠️ Error en imágenes:', e.message)
        }

        const resultado = rows.map(r => ({
            id_servicio: r.id_servicio,
            hotel: r.hotel,
            ubicacion: [r.ubicacion_nombre, r.ciudad, r.pais]
                .filter(Boolean)
                .join(', ') || 'Ubicación no disponible',
            tipo_hospedaje: r.tipo_hospedaje,
            id_tipo_hospedaje: r.id_tipo_hospedaje,
            precio_min: parseFloat(r.precio_min) || 0,
            calificacion_promedio: r.calificacion_promedio 
                ? parseFloat(r.calificacion_promedio) 
                : null,
            total_resenas: parseInt(r.total_resenas) || 0,
            habitaciones_disponibles: parseInt(r.habitaciones_disponibles) || 0,
            amenidades: amenidadesMap[r.id_servicio] || [],
            imagen_portada: imagenesMap[r.id_servicio]?.[0] || null,
            imagenes: imagenesMap[r.id_servicio] || [],
        }))

        res.json(resultado)

    } catch (err) {
        console.error('SEARCH_ERROR:', err.message)
        res.status(500).json({ error: 'Error en la búsqueda' })
    }
}

// GET /api/search/hospedaje/:id
export const getDetalleHospedaje = async (req, res) => {
    const { id } = req.params
    const hospedajeId = validateId(id)

    if (!hospedajeId) {
        return res.status(400).json({ error: 'ID inválido' })
    }

    try {
        const pool = getPool()

        const { rows } = await pool.query(`
            SELECT
                s."ID_SERVICIO"   AS id_servicio,
                s."NOMBRE"        AS hotel,
                c."NOMBRE"        AS ciudad,
                p."NOMBRE"        AS pais,
                u."NOMBRE"        AS ubicacion_nombre,
                th."NOMBRE_TIPO"  AS tipo_hospedaje,
                pr."NOMBRE_LEGAL" AS proveedor,
                hos."CHECKIN",
                hos."CHECKOUT",
                hos."CANCELACION",
                hos."MASCOTAS",
                hos."FUMAR",
                hos."DESCRIPCION"
            FROM public."SERVICIO" s
            JOIN public."HOSPEDAJE" hos ON hos."ID_HOSPEDAJE" = s."ID_SERVICIO"
            JOIN public."TIPO_HOSPEDAJE" th ON th."ID_TIPO" = hos."ID_TIPO"
            JOIN public."UBICACION" u ON u."ID_UBICACION" = hos."ID_UBICACION"
            JOIN public."CIUDAD" c ON c."ID_CIUDAD" = u."ID_CIUDAD"
            JOIN public."PAIS" p ON p."ID_PAIS" = c."ID_PAIS"
            JOIN public."PROVEEDOR" pr ON pr."ID_PROVEEDOR" = s."ID_PROVEEDOR"
            WHERE s."ID_SERVICIO" = $1
        `, [hospedajeId])

        if (!rows.length) {
            return res.status(404).json({ error: 'Hospedaje no encontrado' })
        }

        const { rows: habitaciones } = await pool.query(`
            SELECT
                hab."ID_HABITACION"    AS id_habitacion,
                tph."NOMBRE"           AS tipo,
                hab."CAPACIDAD_ADULTO" AS capacidad_adulto,
                hab."CAPACIDAD_NINOS"  AS capacidad_ninos,
                hab."PRECIO_NOCHE"     AS precio_noche
            FROM public."HABITACION" hab
            JOIN public."TIPO_HABITACION" tph ON tph."ID_TIPO_HABITACION" = hab."ID_TIPO_HABITACION"
            WHERE hab."ID_HOSPEDAJE" = $1
            ORDER BY hab."PRECIO_NOCHE" ASC
        `, [hospedajeId])

        const { rows: imagenes } = await pool.query(`
            SELECT "URL", "ORDEN", "ALT_TEXT"
            FROM public."IMAGEN_HOSPEDAJE"
            WHERE "ID_HOSPEDAJE" = $1
            ORDER BY "ORDEN" ASC
        `, [hospedajeId])

        const { rows: amenidades } = await pool.query(`
            SELECT si."NOMBRE"
            FROM public."HOSPEDAJE_SERVICIO" hs
            JOIN public."SERVICIO_INCLUIDO" si ON si."ID_SERVICIO_INCLUIDO" = hs."ID_SERVICIO_INCLUIDO"
            WHERE hs."ID_HOSPEDAJE" = $1
        `, [hospedajeId])

        const det = rows[0]
        res.json({
            id_servicio: det.id_servicio,
            hotel: det.hotel,
            ciudad: det.ciudad,
            pais: det.pais,
            ubicacion_nombre: det.ubicacion_nombre,
            tipo_hospedaje: det.tipo_hospedaje,
            proveedor: det.proveedor,
            checkin: det.CHECKIN,
            checkout: det.CHECKOUT,
            cancelacion: det.CANCELACION,
            mascotas: !!det.MASCOTAS,
            fumar: !!det.FUMAR,
            descripcion: det.DESCRIPCION,
            habitaciones,
            imagenes,
            amenidades: amenidades.map(a => a.NOMBRE),
        })

    } catch (err) {
        console.error('getDetalleHospedaje ERROR:', err.message)
        res.status(500).json({ error: 'Error al obtener detalles' })
    }
}
