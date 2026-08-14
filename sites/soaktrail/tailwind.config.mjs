import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'sa-cream': '#faf8f5',
        'sa-dark': '#1a1a1a',
        'sa-copper': '#b8915f',
        'sa-copper-hover': '#9a7748',
        'sa-text': '#4a4a4a',
        'sa-divider': '#e5e0d8',
      },
      fontFamily: {
        display: ['National Park', 'sans-serif'],
        body: ['Fraunces', 'serif'],
      },
    },
  },
  plugins: [typography],
};
