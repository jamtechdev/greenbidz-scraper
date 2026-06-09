import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { postLogin } from '../controllers/auth.controller.js';

const router = Router();
router.post('/auth/login', asyncHandler(postLogin));
export default router;
