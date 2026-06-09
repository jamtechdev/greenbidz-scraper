/**
 * @file controllers/auth.controller.js — /api/auth
 *   Thin proxy to the main 101lab API's user/login so the admin UI can sign in
 *   without hitting CORS (the main API isn't open to arbitrary browser origins).
 *   This does NOT protect any scraper route — it only forwards credentials and
 *   returns the upstream response; the frontend enforces "admin only".
 */
import { logger } from '../utils/logger.js';

const MAIN_API_BASE_URL = process.env.MAIN_API_BASE_URL || 'https://api.101recycle.greenbidz.com';

/** POST /api/auth/login { email, password } → forwards to main API user/login. */
export async function postLogin(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required.' });
  }

  const url = `${MAIN_API_BASE_URL}/api/v1/user/login`;
  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    logger.warn(`Login proxy could not reach main API: ${err.message}`);
    return res.status(502).json({ error: `Could not reach the auth server: ${err.message}` });
  }

  const text = await upstream.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text };
  }
  // Pass the upstream status + body straight through (success or error).
  return res.status(upstream.status).json(body);
}
