/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Ported from the prototype design system (assets/styles.css).
        ink: {
          900: '#0a0f1c',
          850: '#0e1424',
          800: '#121a2e',
          700: '#1a2640',
        },
        paper: { DEFAULT: '#f6f7fb', 2: '#eef1f7' },
        surface: { DEFAULT: '#ffffff', 2: '#fbfcfe' },
        gold: { DEFAULT: '#d8a23a', soft: '#f4e4c0', deep: '#a9781f' },
        teal: { DEFAULT: '#0e8c8c', 600: '#0a6f70', soft: '#d4ecec' },
         tx: { DEFAULT: '#131a2b', soft: '#475069', mute: '#8590a8' },
      },
      fontFamily: {
        sans: ['Heebo', 'Assistant', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Heebo', 'Assistant', 'system-ui', 'sans-serif'],
      },
      borderRadius: { sm: '6px', DEFAULT: '10px', lg: '16px', xl: '22px' },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 4px 16px rgba(16,24,40,.06)',
        lg: '0 12px 40px rgba(16,24,40,.16)',
      },
    },
  },
  plugins: [],
};
