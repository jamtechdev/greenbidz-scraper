/**
 * @file lib/http.js — small Express helpers shared by controllers.
 */

/** Wrap an async controller so rejected promises reach the error handler. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** Send a raw HTML response (used by the Mapping Studio proxy snapshot). */
export function sendHtml(res, status, html) {
  res
    .status(status)
    .set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    .send(html);
}
