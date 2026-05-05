// routes/userRoutes.js
import express from 'express'
import { getProfile, updateProfile } from '../controllers/useerController.js'
import { verifyToken } from '../middleware/auth.js'

const router = express.Router()

router.use(verifyToken)

// GET  /api/user/profile
// PUT  /api/user/profile/update
router.get('/profile',        getProfile)
router.put('/profile/update', updateProfile)

export default router