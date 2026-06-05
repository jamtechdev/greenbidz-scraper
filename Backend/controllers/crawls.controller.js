/**
 * @file controllers/crawls.controller.js — GET /api/crawl-history
 */
import { listCrawlHistory } from '../database/queries.js';

export async function getCrawlHistory(req, res) {
  const limit = Number.parseInt(req.query.limit, 10) || 100;
  const history = await listCrawlHistory({ limit });
  res.json({ history });
}
