import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read source
let source = fs.readFileSync(
  path.join(__dirname, 'src/index.js'),
  'utf8'
);

// Remove ES6 export statements (they cause errors in browser script tags)
source = source.replace(/export\s+default\s+Vizme;?\s*/g, '');
source = source.replace(/export\s*{\s*Vizme\s*};?\s*/g, '');

// Wrap in IIFE for browser compatibility
const wrappedSource = `(function() {
${source}
// Expose to global scope
if (typeof window !== 'undefined') {
  window.Vizme = Vizme;
}
})();`;

// Create dist directory if it doesn't exist
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Write to dist
fs.writeFileSync(
  path.join(distDir, 'vizme.js'),
  wrappedSource,
  'utf8'
);

const fileSize = fs.statSync(path.join(distDir, 'vizme.js')).size;
console.log('✅ Built vizme.js (browser-compatible)');
console.log(`📦 Size: ${(fileSize / 1024).toFixed(2)} KB`);