import { Router } from 'express'
import {
    getUbicaciones,
    getAeropuertos,
    postBuscarHospedaje,
    getDetalleHospedaje,
} from '../controllers/searchController.js'

const router = Router()

router.get('/ubicaciones',   getUbicaciones)
router.get('/aeropuertos',    getAeropuertos)
router.post('/hospedaje',    postBuscarHospedaje)
router.get('/hospedaje/:id', getDetalleHospedaje)

export default router