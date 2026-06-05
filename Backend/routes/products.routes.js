import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { listProducts, getProduct } from '../controllers/products.controller.js';

const router = Router();
router.get('/products', asyncHandler(listProducts));
router.get('/products/:id', asyncHandler(getProduct));
export default router;
