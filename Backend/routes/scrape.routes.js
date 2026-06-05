import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import {
  analyze,
  detect,
  runScrape,
  scrapeProgress,
  scrapeCancel,
  urlPattern,
  proxyPage,
} from '../controllers/scrape.controller.js';

const router = Router();
router.post('/analyze', asyncHandler(analyze));
router.post('/detect', asyncHandler(detect));
router.post('/scrape', asyncHandler(runScrape));
router.get('/scrape-progress', asyncHandler(scrapeProgress));
router.post('/scrape-cancel', asyncHandler(scrapeCancel));
router.post('/url-pattern', asyncHandler(urlPattern));
router.get('/proxy-page', asyncHandler(proxyPage));
export default router;
