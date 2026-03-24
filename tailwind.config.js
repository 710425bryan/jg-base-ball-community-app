/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        orange: {
          50: '#FDF7EE',
          100: '#F9ECD6',
          200: '#F2D3A1',
          300: '#EBB96C',
          400: '#E5A037',
          500: '#D88F22', // The exact #D88F22 color string
          600: '#C27C1C',
          700: '#A16216',
          800: '#824F15',
          900: '#6E4314',
          950: '#3D2207',
        },
        primary: {
          DEFAULT: '#D88F22',
          hover: '#C27C1C',
        },
        secondary: {
          DEFAULT: 'var(--color-secondary)',
          hover: 'var(--color-secondary-hover)',
        },
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        text: 'var(--color-text)',
        'text-muted': 'var(--color-text-muted)',
      }
    },
  },
  plugins: [],
}
