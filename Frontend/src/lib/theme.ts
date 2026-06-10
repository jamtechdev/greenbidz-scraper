/** Light/dark theme persistence + application. Dark is the default. */

export type Theme = 'dark' | 'light';

const KEY = 'gb_theme';

export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Apply a theme to <html> and persist the choice. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('light', theme === 'light');
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore storage failures (private mode etc.) */
  }
}
