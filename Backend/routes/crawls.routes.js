import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { getCrawlHistory } from '../controllers/crawls.controller.js';

const router = Router();
router.get('/crawl-history', asyncHandler(getCrawlHistory));
export default router;
