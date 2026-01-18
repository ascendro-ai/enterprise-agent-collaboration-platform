/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light grays from screenshots
        'gray-light': '#F5F5F5',
        'gray-lighter': '#E5E5E5',
        // Dark grays
        'gray-dark': '#333333',
        'gray-darker': '#666666',
        // Accent colors
        'accent-blue': '#3B82F6',
        'accent-pink': '#EC4899',
        'pink-light': '#FCE7F3',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
