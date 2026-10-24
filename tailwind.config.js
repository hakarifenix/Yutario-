/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--c-surface-2) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-2': 'rgb(var(--c-accent-2) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
      },
      fontFamily: {
        sans: [
          'Inter',
          'SF Pro Text',
          'Segoe UI',
          'Roboto',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        lift: 'var(--shadow-lift)',
        glow: '0 0 0 1px rgb(var(--c-accent) / 0.28), 0 14px 34px -18px rgb(var(--c-accent) / 0.55)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.94)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.55', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.04)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 260ms cubic-bezier(0.2, 0.9, 0.25, 1) both',
        'fade-in': 'fade-in 180ms ease-out both',
        'scale-in': 'scale-in 200ms cubic-bezier(0.2, 0.9, 0.25, 1) both',
        'slide-up': 'slide-up 280ms cubic-bezier(0.2, 0.9, 0.25, 1) both',
        'pulse-soft': 'pulse-soft 1.8s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 7s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
