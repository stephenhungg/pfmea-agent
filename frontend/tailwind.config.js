/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        risk: {
          low: '#10b981',    // green
          medium: '#f59e0b', // yellow
          high: '#ef4444',   // red
        },
      },
    },
  },
  plugins: [],
}






