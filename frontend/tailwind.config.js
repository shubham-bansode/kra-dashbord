/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'gov-blue': '#003366',
        'gov-blue-light': '#004d99',
        'gov-orange': '#ff6600',
        'gov-green': '#006633',
        'gov-red': '#cc0000',
      },
      fontFamily: {
        'marathi': ['Noto Sans Devanagari', 'Mangal', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
