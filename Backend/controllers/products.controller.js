/**
 * @file controllers/products.controller.js — /api/products
 */
import { listRecentProducts, countProducts, getProductById } from '../database/queries.js';

/** GET /api/products?limit=&scrapedOnly= */
export async function listProducts(req, res) {
  const limit = Number.parseInt(req.query.limit, 10) || 50;
  const scrapedOnly = req.query.scrapedOnly === 'true';
  const products = await listRecentProducts({ limit, scrapedOnly });
  const counts = await countProducts();
  res.json({ counts, products });
}

/** GET /api/products/:id */
export async function getProduct(req, res) {
  const numId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(numId)) {
    return res.status(400).json({ error: 'Invalid product id.' });
  }
  const product = await getProductById(numId);
  if (!product) {
    return res.status(404).json({ error: 'Product not found.' });
  }
  res.json({ product });
}
