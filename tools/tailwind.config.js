// Tailwind config for the CSS inlined into index.html (regenerate with: node tools/build-css.mjs)
const fs = require('fs');
const path = require('path');

// Scan the page markup and app code only, not the inlined libraries and CSS
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
  .replace(/<script id="lib-[^"]*">[\s\S]*?<\/script>/g, '')
  .replace(/<style id="inline-[^"]*">[\s\S]*?<\/style>/g, '');

module.exports = {
  content: [{ raw: html, extension: 'html' }],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        }
      }
    }
  }
};
