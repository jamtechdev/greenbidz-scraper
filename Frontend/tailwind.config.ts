import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

// Semantic palette driven by CSS variables (see src/index.css). The dark theme
// is the default (:root); a `light` class on <html> overrides the variables.
// Colors are stored as "R G B" channels so Tailwind's opacity modifiers
// (e.g. bg-accent/40) keep working via rgb(var(--x) / <alpha-value>).
const withVar = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: withVar('--c-bg'),
        panel: withVar('--c-panel'),
        panel2: withVar('--c-panel2'),
        line: withVar('--c-line'),
        ink: withVar('--c-ink'),
        muted: withVar('--c-muted'),
        accent: {
          DEFAULT: withVar('--c-accent'),
          ink: withVar('--c-accent-ink'),
        },
        sky2: {
          DEFAULT: withVar('--c-sky2'),
          ink: withVar('--c-sky2-ink'),
        },
        warn: withVar('--c-warn'),
        danger: withVar('--c-danger'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl: '14px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        glow: '0 0 0 1px rgba(56,189,248,0.4), 0 0 20px -4px rgba(56,189,248,0.4)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        indeterminate: {
          '0%': { left: '-40%', width: '40%' },
          '100%': { left: '100%', width: '40%' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'slide-in': 'slide-in 0.25s cubic-bezier(0.16,1,0.3,1)',
        indeterminate: 'indeterminate 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [
    // `light:` targets elements only when <html> has the `light` class, so the
    // few intentionally-dark utilities (badges, status text) can be overridden
    // for the light theme without touching every call site.
    plugin(({ addVariant }) => {
      addVariant('light', 'html.light &');
    }),
  ],
} satisfies Config;
