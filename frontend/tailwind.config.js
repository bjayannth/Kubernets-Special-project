/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkbg: '#0B0F17',
        darkcard: '#151C28',
        darkborder: '#232D3F',
        brandblue: '#3B82F6',
        brandgold: '#F59E0B'
      }
    },
  },
  plugins: [],
}

