import { Router } from 'express'
import { getProfile, updateProfile } from '../controllers/useerController.js'
import { authenticateToken } from '../middleware/authMiddleware.js'

const router = Router()
router.use(authenticateToken)

router.get('/profile',        getProfile)
router.put('/profile/update', updateProfile)

export default router