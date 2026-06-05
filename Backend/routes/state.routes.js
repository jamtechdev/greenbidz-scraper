import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { getState } from '../controllers/state.controller.js';

const router = Router();
router.get('/state', asyncHandler(getState));
export default router;
