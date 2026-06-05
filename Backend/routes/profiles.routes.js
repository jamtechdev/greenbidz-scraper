import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import {
  listProfiles,
  saveProfile,
  updateSettings,
  removeProfile,
  runProfile,
} from '../controllers/profiles.controller.js';

const router = Router();
router.get('/profiles', asyncHandler(listProfiles));
router.post('/save-profile', asyncHandler(saveProfile));
router.post('/profile-settings', asyncHandler(updateSettings));
router.post('/delete-profile', asyncHandler(removeProfile));
router.post('/run-profile', asyncHandler(runProfile));
export default router;
