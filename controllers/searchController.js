import { getPool } from '../db.js'

// GET /api/search/ubicaciones?q=texto
export const getUbicaciones = async (req, res) => {
    const { q } = req.query
    // Si no hay búsqueda, devolvemos array vacío rápido
    if (!q || q.trim() === '') return res.json([]);

    try {
        const pool = getPool()
        const searchText = `%${q.trim()}%`
        console.log(`🔍 Buscando ubicaciones con: "${searchText}"`);

        const { rows } = await pool.query(`
            SELECT
                u."ID_UBICACION" AS id,
                u."NOMBRE"       AS ubicacion,
                u."ID_TIPO"      AS id_tipo, 
                COALESCE(c."NOMBRE", '') AS ciudad,
                COALESCE(p."NOMBRE", '') AS pais
            FROM public."UBICACION" u
            LEFT JOIN public."CIUDAD" c ON u."ID_CIUDAD" = c."ID_CIUDAD"
            LEFT JOIN public."PAIS"   p ON c."ID_PAIS"   = p."ID_PAIS"
            WHERE (u."NOMBRE" ILIKE $1 OR c."NOMBRE" ILIKE $1 OR p."NOMBRE" ILIKE $1)
            ORDER BY u."NOMBRE"
            LIMIT 10
        `, [searchText])
        res.json(rows)
    } catch (err) {
        console.error('getUbicaciones:', err.message)
        res.status(500).json([])
    }
}

// GET /api/search/aeropuertos?q=texto
export const getAeropuertos = async (req, res) => {
    const { q } = req.query
    // Salida temprana si la búsqueda está vacía
    if (!q || q.trim() === '') return res.json([]);

    try {
        const pool = getPool()
        const searchText = `%${q}%`
        const { rows } = await pool.query(`
            SELECT
                u."ID_UBICACION" AS id,
                u."NOMBRE"       AS ubicacion,
                u."ID_TIPO"      AS id_tipo,
                c."NOMBRE"       AS ciudad,
                p."NOMBRE"       AS pais
            FROM public."UBICACION" u
            LEFT JOIN public."CIUDAD" c ON u."ID_CIUDAD" = c."ID_CIUDAD"
            LEFT JOIN public."PAIS"   p ON c."ID_PAIS"   = p."ID_PAIS"
            WHERE u."ID_TIPO" = 3
              AND (u."NOMBRE" ILIKE $1 OR c."NOMBRE" ILIKE $1 OR p."NOMBRE" ILIKE $1)
            ORDER BY u."NOMBRE"
            LIMIT 10
        `, [searchText])
        res.json(rows)
    } catch (err) {
        console.error('getAeropuertos:', err.message)
        res.status(500).json([])
    }
}

export const postBuscarHospedaje = async (req, res) => {
    const { destino, habitaciones, fecha_inicio, fecha_fin } = req.body

    try {
        const pool = getPool()

        if (!habitaciones || !Array.isArray(habitaciones)) {
            return res.status(400).json({ error: 'Parámetro habitaciones requerido' })
        }

        // Evitar error de -Infinity si el array está vacío
        const maxAdultos = habitaciones.length > 0 ? Math.max(...habitaciones.map(h => parseInt(h.adultos) || 0)) : 0
        const maxNinos   = habitaciones.length > 0 ? Math.max(...habitaciones.map(h => parseInt(h.ninos)   || 0)) : 0

        // LIMPIEZA CRÍTICA: 
        // Si el destino es "Punta Cana, La Altagracia, RD", solo buscamos "Punta Cana"
        const rawDestino = (destino || '').toString().trim();
        const primeraParte = rawDestino.split(',')[0].trim();
        const textoBusqueda = primeraParte ? `%${primeraParte}%` : '%';

        console.log('=== BÚSQUEDA ===')
        console.log('destino recibido:', destino)
        console.log('textoBusqueda:', textoBusqueda)
        console.log('maxAdultos:', maxAdultos, '| maxNinos:', maxNinos)

        // ── 1. Query principal ──────────────────────────────────────────────
        const { rows } = await pool.query(`
            SELECT
                s."ID_SERVICIO"                          AS id_servicio,
                s."NOMBRE"                               AS hotel,
                u."NOMBRE"                               AS ubicacion_nombre,
                c."NOMBRE"                               AS ciudad,
                p."NOMBRE"                               AS pais,
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
            INNER JOIN public."HABITACION" hab ON hab."ID_HOSPEDAJE" = hos."ID_HOSPEDAJE"
            LEFT JOIN public."RESENA" r ON r."ID_SERVICIO" = s."ID_SERVICIO"
            WHERE 
                (
                    $1 = '%' 
                    OR s."NOMBRE" ILIKE $1 
                    OR u."NOMBRE" ILIKE $1 
                    OR c."NOMBRE" ILIKE $1 
                    OR p."NOMBRE" ILIKE $1
                )
                AND hab."CAPACIDAD_ADULTO" >= $2
                AND hab."CAPACIDAD_NINOS"  >= $3
            GROUP BY 
                s."ID_SERVICIO", s."NOMBRE", u."NOMBRE", 
                c."NOMBRE", p."NOMBRE", th."NOMBRE_TIPO"
            HAVING COUNT(hab."ID_HABITACION") > 0
            ORDER BY precio_min ASC
            LIMIT 50
        `, [textoBusqueda, maxAdultos, maxNinos])

        console.log('Hospedajes encontrados:', rows.length)
        if (rows.length === 0) {
            console.log('⚠️ Sin resultados — verificar datos en BD')
            return res.json([])
        }

        const ids = rows.map(r => r.id_servicio)
        console.log('IDs encontrados:', ids)

        // ── 2. Amenidades (tabla HOSPEDAJE_SERVICIO) ────────────────────────
        let amenidadesMap = {}
        try {
            const { rows: srvRows } = await pool.query(`
                SELECT hs."ID_HOSPEDAJE" AS id_hospedaje, si."NOMBRE" AS nombre
                FROM public."HOSPEDAJE_SERVICIO" hs
                JOIN public."SERVICIO_INCLUIDO"  si ON si."ID_SERVICIO_INCLUIDO" = hs."ID_SERVICIO_INCLUIDO"
                WHERE hs."ID_HOSPEDAJE" = ANY($1)
            `, [ids])
            srvRows.forEach(({ id_hospedaje, nombre }) => {
                if (!amenidadesMap[id_hospedaje]) amenidadesMap[id_hospedaje] = []
                amenidadesMap[id_hospedaje].push(nombre)
            })
            console.log('Amenidades OK:', srvRows.length, 'registros')
        } catch (e) {
            console.error('⚠️ Error en amenidades (no crítico):', e.message)
        }

        // ── 3. Imágenes (tabla IMAGEN_HOSPEDAJE — puede no existir aún) ─────
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
            console.log('Imágenes OK:', imgRows.length, 'registros')
        } catch (e) {
            console.error('⚠️ Error en imágenes (tabla puede no existir):', e.message)
            // No es crítico — los hoteles se muestran sin foto
        }

        // ── 4. Respuesta ────────────────────────────────────────────────────
        const resultado = rows.map(r => ({
            id_servicio:              r.id_servicio,
            hotel:                    r.hotel,
            // Limpieza de la cadena de ubicación para evitar "null" visibles
            ubicacion:                [r.ubicacion_nombre, r.ciudad, r.pais].filter(Boolean).join(', '),
            tipo_hospedaje:           r.tipo_hospedaje,
            precio_min:               parseFloat(r.precio_min) || 0,
            calificacion_promedio:    r.calificacion_promedio
                                        ? parseFloat(r.calificacion_promedio)
                                        : null,
            total_resenas:            parseInt(r.total_resenas) || 0,
            habitaciones_disponibles: parseInt(r.habitaciones_disponibles) || 0,
            amenidades:               amenidadesMap[r.id_servicio] || [],
            imagen_portada:           imagenesMap[r.id_servicio]?.[0] || null,
            imagenes:                 imagenesMap[r.id_servicio]   || [],
        }))

        console.log('Enviando', resultado.length, 'hospedajes al frontend')
        res.json(resultado)

    } catch (err) {
        console.error('SEARCH_ERROR CRÍTICO:', err.message)
        console.error(err.stack)
        res.status(500).json({ error: err.message })
    }
}

// GET /api/search/hospedaje/:id
export const getDetalleHospedaje = async (req, res) => {
    const { id } = req.params
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
            FROM public."SERVICIO"       s
            JOIN public."HOSPEDAJE"      hos ON hos."ID_HOSPEDAJE"  = s."ID_SERVICIO"
            JOIN public."TIPO_HOSPEDAJE" th  ON th."ID_TIPO"        = hos."ID_TIPO"
            JOIN public."UBICACION"      u   ON u."ID_UBICACION"    = hos."ID_UBICACION"
            JOIN public."CIUDAD"         c   ON c."ID_CIUDAD"       = u."ID_CIUDAD"
            JOIN public."PAIS"           p   ON p."ID_PAIS"         = c."ID_PAIS"
            JOIN public."PROVEEDOR"      pr  ON pr."ID_PROVEEDOR"   = s."ID_PROVEEDOR"
            WHERE s."ID_SERVICIO" = $1
        `, [id])

        if (!rows.length) return res.status(404).json({ error: 'No encontrado' })

        const { rows: habitaciones } = await pool.query(`
            SELECT
                hab."ID_HABITACION"    AS id_habitacion,
                tph."NOMBRE"           AS tipo,
                hab."CAPACIDAD_ADULTO" AS capacidad_adulto,
                hab."CAPACIDAD_NINOS"  AS capacidad_ninos,
                hab."PRECIO_NOCHE"     AS precio_noche
            FROM public."HABITACION"      hab
            JOIN public."TIPO_HABITACION" tph ON tph."ID_TIPO_HABITACION" = hab."ID_TIPO_HABITACION"
            WHERE hab."ID_HOSPEDAJE" = $1
            ORDER BY hab."PRECIO_NOCHE" ASC
        `, [id])

        const { rows: imagenes } = await pool.query(`
            SELECT "URL", "ORDEN", "ALT_TEXT"
            FROM public."IMAGEN_HOSPEDAJE"
            WHERE "ID_HOSPEDAJE" = $1
            ORDER BY "ORDEN" ASC
        `, [id])

        const { rows: amenidades } = await pool.query(`
            SELECT si."NOMBRE"
            FROM public."HOSPEDAJE_SERVICIO" hs
            JOIN public."SERVICIO_INCLUIDO" si ON si."ID_SERVICIO_INCLUIDO" = hs."ID_SERVICIO_INCLUIDO"
            WHERE hs."ID_HOSPEDAJE" = $1
        `, [id])

        res.json({ 
            ...rows[0], 
            habitaciones, 
            imagenes, 
            amenidades: amenidades.map(a => a.NOMBRE) 
        })

    } catch (err) {
        console.error('getDetalleHospedaje:', err.message)
        res.status(500).json({ error: err.message })
    }
}