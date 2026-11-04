/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette of the light theme in the UX prototype (blm-prototype): violet accent, violet-tinted
        // neutrals, dark indigo chrome, and one green / amber / red for status.
        ink: {
          900: '#1e1b3a',
          850: '#25224a',
          800: '#2c2958',
          700: '#37336b',
        },
        paper: { DEFAULT: '#f6f6fa', 2: '#ebebf3' },
        surface: { DEFAULT: '#ffffff', 2: '#fafafd' },
        // Warm colour kept for warnings and the logo; actions are violet.
        gold: { DEFAULT: '#d8a23a', soft: '#fdf3e1', deep: '#b9760f' },
        // Links and focus rings follow the accent (the prototype has no teal). The numbered shades the app
        // uses are listed so they don't fall back to Tailwind's default teal.
        teal: { DEFAULT: '#5b3fd1', 200: '#d9d1f7', 500: '#5b3fd1', 600: '#4a31b5', 700: '#4a31b5', soft: '#efecfc' },
        // Same for violet / emerald: mapped onto the accent and the "approved" green.
        violet: { 50: '#f6f4fe', 100: '#efecfc', 700: '#4a31b5', 900: '#2e1f78' },
        emerald: { 50: '#e6f6ef', 300: '#a3dcc4', 600: '#1d9a6c', 900: '#0f5a3e' },
        accent: { DEFAULT: '#5b3fd1', hover: '#4a31b5', soft: '#efecfc' },
        tx: { DEFAULT: '#1c1b33', soft: '#6c6b86', mute: '#8a89a3' },
        // Status colours: done / waiting / problem (the shades the app uses).
        green: { 50: '#e6f6ef', 100: '#e6f6ef', 500: '#1d9a6c', 600: '#1d9a6c', 700: '#177a55' },
        amber: { 50: '#fdf3e1', 100: '#fdf3e1', 300: '#f0d29a', 400: '#d9a443', 500: '#d99a2b', 700: '#b9760f', 800: '#8f5a0a' },
        red: { 50: '#faeceb', 100: '#fbe9e8', 200: '#f1c6c4', 400: '#e07b7b', 500: '#d64545', 600: '#d64545', 700: '#b83535' },
      },
      // The prototype's system font stack (line 927): no web font to download, which also works on the
      // air-gapped network.
      fontFamily: {
        sans: ['-apple-system', '"Segoe UI Variable Text"', '"Segoe UI"', 'Arial', 'sans-serif'],
        display: ['-apple-system', '"Segoe UI Variable Text"', '"Segoe UI"', 'Arial', 'sans-serif'],
      },
      // 4px corners everywhere, as in the prototype; xl/2xl are its rounder side panels (12px).
      borderRadius: { sm: '4px', DEFAULT: '4px', md: '4px', lg: '4px', xl: '12px', '2xl': '12px' },
      // The three bouncing dots of the agent's typing indicator (UX prototype).
      keyframes: {
        rcdot: {
          '0%, 60%, 100%': { opacity: '.25', transform: 'translateY(0)' },
          '30%': { opacity: '1', transform: 'translateY(-3px)' },
        },
      },
      animation: { rcdot: 'rcdot 1.2s infinite ease-in-out' },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 4px 16px rgba(16,24,40,.06)',
        lg: '0 12px 40px rgba(16,24,40,.16)',
      },
    },
  },
  plugins: [],
};
