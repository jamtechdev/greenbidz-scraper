import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import {
  getSyncScheduler,
  postSyncSchedulerRun,
  postSyncSchedulerPause,
  postSyncSchedulerResume,
  postSyncSchedulerConfig,
} from '../controllers/syncScheduler.controller.js';

const router = Router();
router.get('/sync/scheduler', asyncHandler(getSyncScheduler));
router.post('/sync/scheduler/run', asyncHandler(postSyncSchedulerRun));
router.post('/sync/scheduler/pause', asyncHandler(postSyncSchedulerPause));
router.post('/sync/scheduler/resume', asyncHandler(postSyncSchedulerResume));
router.post('/sync/scheduler/config', asyncHandler(postSyncSchedulerConfig));
export default router;
