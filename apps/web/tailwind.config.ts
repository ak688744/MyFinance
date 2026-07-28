import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#1E40AF', dark: '#1E3A8A', light: '#EFF6FF' },
        gain: '#059669',
        loss: '#DC2626',
        ai: '#7C5CFC',
        canvas: '#F1F5F9',
        surface: '#FFFFFF',
        ink: { DEFAULT: '#0F172A', muted: '#64748B', subtle: '#94A3B8' },
        border: { DEFAULT: '#E2E8F0', strong: '#CBD5E1' },
      },
      fontFamily: {
        heading: ['"Fira Sans"', 'system-ui', 'sans-serif'],
        body: ['"Fira Sans"', 'system-ui', 'sans-serif'],
        mono: ['"Fira Code"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '12px', lg: '16px' },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
        'card-hover': '0 4px 12px rgba(15, 23, 42, 0.08), 0 2px 4px rgba(15, 23, 42, 0.04)',
        nav: '1px 0 0 0 rgba(226, 232, 240, 0.8)',
      },
      transitionDuration: { DEFAULT: '200ms' },
    },
  },
  plugins: [],
} satisfies Config;
