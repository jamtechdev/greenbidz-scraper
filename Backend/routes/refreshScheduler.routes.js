import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { status, runNow, pause, resume, config } from '../controllers/refreshScheduler.controller.js';

const router = Router();
router.get('/refresh-scheduler/status', asyncHandler(status));
router.post('/refresh-scheduler/run-now', asyncHandler(runNow));
router.post('/refresh-scheduler/pause', asyncHandler(pause));
router.post('/refresh-scheduler/resume', asyncHandler(resume));
router.post('/refresh-scheduler/config', asyncHandler(config));
export default router;
