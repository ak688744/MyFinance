import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#1463F3', 600: '#1463F3' },
        gain: '#0E9F6E',
        loss: '#E02424',
        ai: '#7C5CFC',
        canvas: '#F7F8FA',
      },
      fontFamily: {
        heading: ['Manrope', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      borderRadius: { card: '12px' },
      boxShadow: { card: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)' },
    },
  },
  plugins: [],
} satisfies Config;
