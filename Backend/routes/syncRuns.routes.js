import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import {
  postSyncRunPreview,
  postSyncRun,
  getSyncRuns,
  getSyncRun,
  getActiveSyncRuns,
  postResyncFailed,
  postCancelSyncRun,
  getSyncCandidates,
  getSyncCandidateIds,
  getMappedCategories,
} from '../controllers/syncRuns.controller.js';

const router = Router();
router.get('/sync/candidates', asyncHandler(getSyncCandidates));
router.get('/sync/candidate-ids', asyncHandler(getSyncCandidateIds));
router.get('/sync/mapped-categories', asyncHandler(getMappedCategories));
router.post('/sync/run/preview', asyncHandler(postSyncRunPreview));
router.post('/sync/run', asyncHandler(postSyncRun));
router.get('/sync/runs', asyncHandler(getSyncRuns));
router.get('/sync/active', asyncHandler(getActiveSyncRuns));
router.get('/sync/runs/:id', asyncHandler(getSyncRun));
router.post('/sync/runs/:id/resync-failed', asyncHandler(postResyncFailed));
router.post('/sync/runs/:id/cancel', asyncHandler(postCancelSyncRun));
export default router;
