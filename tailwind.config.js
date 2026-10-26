/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          base: '#000000',
          raised: '#111111',
          elevated: '#1A1A1A',
        },
        accent: {
          DEFAULT: '#E50914',
          hover: '#F6121D',
        },
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'sans-serif'],
      },
      spacing: {
        '18': '4.5rem',
      },
      borderRadius: {
        card: '8px',
      },
      touchTarget: {
        min: '44px',
      },
      scrollSnapStop: {
        always: 'always',
        normal: 'normal',
      },
    },
  },
  plugins: [],
};
