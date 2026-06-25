import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import {
  getChanges,
  refreshChanges,
  resyncChanges,
  baselineChanges,
} from '../controllers/changes.controller.js';

const router = Router();
router.get('/changes', asyncHandler(getChanges));
router.post('/changes/refresh', asyncHandler(refreshChanges));
router.post('/changes/resync', asyncHandler(resyncChanges));
router.post('/changes/baseline', asyncHandler(baselineChanges));
export default router;
