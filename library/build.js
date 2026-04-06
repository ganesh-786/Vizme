/**
 * Production build: ESM + CJS for npm consumers, IIFE for script-tag / CDN usage.
 * No changes to src/index.js behavior — only bundling.
 */
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(__dirname, 'src/index.js');
const distDir = path.join(__dirname, 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const common = {
  entryPoints: [entry],
  bundle: true,
  platform: 'browser',
  target: ['es2018'],
  logLevel: 'info',
};

await esbuild.build({
  ...common,
  format: 'esm',
  outfile: path.join(distDir, 'vizme.esm.js'),
});

await esbuild.build({
  ...common,
  format: 'cjs',
  // Must use .cjs extension: package has "type":"module", so .js is treated as ESM.
  outfile: path.join(distDir, 'vizme.cjs'),
});

await esbuild.build({
  ...common,
  format: 'iife',
  globalName: 'Vizme',
  outfile: path.join(distDir, 'vizme.js'),
});

const iifeSize = fs.statSync(path.join(distDir, 'vizme.js')).size;
console.log('✅ Built dist/vizme.esm.js (ESM), dist/vizme.cjs (CJS), dist/vizme.js (IIFE)');
console.log(`📦 IIFE size: ${(iifeSize / 1024).toFixed(2)} KB`);
