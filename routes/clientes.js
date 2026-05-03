// routes/clientes.js — nuevo
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT COUNT(*) AS total FROM public."CLIENTE"`)
    // o si quieres la lista:
    // SELECT c."ID_CLIENTE", p."NOMBRE_COMPLETO" FROM "CLIENTE" c JOIN "PERSONA" p ON p."ID_PERSONA" = c."ID_CLIENTE"
    res.json(rows)
  } catch (err) { next(err) }
})