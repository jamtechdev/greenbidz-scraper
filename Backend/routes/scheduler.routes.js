import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import {
  getScheduler,
  postSchedulerRun,
  postSchedulerPause,
  postSchedulerResume,
} from '../controllers/scheduler.controller.js';

const router = Router();
router.get('/scheduler', asyncHandler(getScheduler));
router.post('/scheduler/run', asyncHandler(postSchedulerRun));
router.post('/scheduler/pause', asyncHandler(postSchedulerPause));
router.post('/scheduler/resume', asyncHandler(postSchedulerResume));
export default router;
