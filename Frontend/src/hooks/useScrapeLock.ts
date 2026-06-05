import { useCallback, useEffect, useState } from 'react';

/**
 * Per-profile "scraping" lock persisted in localStorage. After a scrape is
 * triggered, the profile's scrape button stays disabled for LOCK_MS (20 min)
 * across reloads. Keyed by the profile's fileName.
 */
const PREFIX = 'scrapeLock:';
const LOCK_MS = 20 * 60 * 1000;

function readExpiry(fileName: string): number {
  try {
    const v = localStorage.getItem(PREFIX + fileName);
    const n = v ? Number(v) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function useScrapeLock(fileName: string) {
  const [now, setNow] = useState(() => Date.now());
  const [expiry, setExpiry] = useState(() => readExpiry(fileName));

  useEffect(() => {
    setExpiry(readExpiry(fileName));
  }, [fileName]);

  const locked = expiry > now;

  // Tick once per second while locked so the countdown updates and auto-clears.
  useEffect(() => {
    if (!locked) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [locked]);

  const lock = useCallback(() => {
    const exp = Date.now() + LOCK_MS;
    try {
      localStorage.setItem(PREFIX + fileName, String(exp));
    } catch {
      /* ignore storage failures */
    }
    setExpiry(exp);
    setNow(Date.now());
  }, [fileName]);

  return { locked, remainingMs: Math.max(0, expiry - now), lock };
}

/** "19m 59s" / "45s" */
export function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
