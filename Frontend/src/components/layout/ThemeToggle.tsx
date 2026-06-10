import { useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { getStoredTheme, applyTheme, type Theme } from '@/lib/theme';

/** Header button that toggles between the dark and light themes. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  const isDark = theme === 'dark';
  return (
    <button
      onClick={toggle}
      className="rounded-lg border border-line bg-panel p-2 text-muted transition-colors hover:bg-panel2 hover:text-ink"
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
