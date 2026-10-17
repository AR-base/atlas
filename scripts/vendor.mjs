// Copies the browser builds of the dependencies into public/vendor so the app
// serves them itself (no third-party CDN at demo time). Run after npm install.
import { copyFileSync, mkdirSync } from 'node:fs';

const FILES = [
  ['sql.js/dist/sql-wasm.js', 'sql-wasm.js'],
  ['sql.js/dist/sql-wasm.wasm', 'sql-wasm.wasm'],
  ['chart.js/dist/chart.umd.js', 'chart.umd.js'],
  ['pdfjs-dist/build/pdf.min.mjs', 'pdf.min.mjs'],
  ['pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs'],
  ['mammoth/mammoth.browser.min.js', 'mammoth.browser.min.js'],
  ['papaparse/papaparse.min.js', 'papaparse.min.js'],
  ['read-excel-file/bundle/read-excel-file.min.js', 'read-excel-file.min.js'],
];

mkdirSync('public/vendor', { recursive: true });
for (const [from, to] of FILES) copyFileSync(`node_modules/${from}`, `public/vendor/${to}`);
console.log(`Copied ${FILES.length} files to public/vendor`);
