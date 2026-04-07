import { Router } from 'express'
import {
    getUbicaciones,
    postBuscarHospedaje,
    getDetalleHospedaje,
} from '../controllers/searchController.js'

const router = Router()

router.get('/ubicaciones',   getUbicaciones)
router.post('/hospedaje',    postBuscarHospedaje)
router.get('/hospedaje/:id', getDetalleHospedaje)

export default router