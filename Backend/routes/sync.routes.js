import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { getSyncMeta, previewSync, submitSync } from '../controllers/sync.controller.js';

const router = Router();
router.get('/sync/meta', asyncHandler(getSyncMeta));
router.post('/sync/preview', asyncHandler(previewSync));
router.post('/sync/submit', asyncHandler(submitSync));
export default router;
