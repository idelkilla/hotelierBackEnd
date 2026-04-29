import express from 'express'
import { getProfile, updateProfile } from '../controllers/userController.js'
import { authenticateToken } from '../middleware/authMiddleware.js' 

const router = express.Router()

router.get('/profile', authenticateToken, getProfile);
router.put('/profile/update', authenticateToken, updateProfile);

export default router
