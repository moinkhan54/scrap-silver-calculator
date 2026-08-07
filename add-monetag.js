#!/usr/bin/env node
/**
 * add-monetag.js
 * Injects Monetag meta tag at the VERY TOP of <head> in every HTML file
 * run: node add-monetag.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MONETAG_CODE = 'cfd5c720a79c91dd97ee394b8febec27';
const MONETAG_TAG = `  <meta name="monetag" content="${MONETAG_CODE}">`;

// Skip utility/scratch files
const SKIP_FILES = new Set([
  'audit-report.html',
  'seo-audit-report.html'
]);

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.vercel',
  '.vscode'
]);

let modifiedCount = 0;

function getAllHtmlFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (!SKIP_DIRS.has(file)) {
        results = results.concat(getAllHtmlFiles(filePath));
      }
    } else if (file.endsWith('.html') && !SKIP_FILES.has(file)) {
      results.push(filePath);
    }
  }
  return results;
}

const htmlFiles = getAllHtmlFiles(ROOT);

htmlFiles.forEach(filePath => {
  let html;
  try { html = fs.readFileSync(filePath, 'utf8'); } catch { return; }

  // First, strip out any existing monetag tags anywhere in the file
  let cleaned = html.replace(/<meta\s+name=["']monetag["']\s+content=["'][^"']*["']\s*\/?>\r?\n?/gi, '');

  // Inject at the VERY TOP of <head> (right after <head>)
  let updated = cleaned;
  if (cleaned.includes('<head>')) {
    updated = cleaned.replace('<head>', `<head>\n${MONETAG_TAG}`);
  } else if (cleaned.includes('<head ')) {
    updated = cleaned.replace(/<head([^>]*)>/i, `<head$1>\n${MONETAG_TAG}`);
  }

  if (updated !== html) {
    fs.writeFileSync(filePath, updated, 'utf8');
    modifiedCount++;
  }
});

// Also create Monetag verification file in root for the file upload method
try {
  fs.writeFileSync(path.join(ROOT, `${MONETAG_CODE}.html`), `${MONETAG_CODE}`, 'utf8');
  fs.writeFileSync(path.join(ROOT, `${MONETAG_CODE}.txt`), `${MONETAG_CODE}`, 'utf8');
  console.log(`✅ Created verification files ${MONETAG_CODE}.html and ${MONETAG_CODE}.txt in root.`);
} catch (e) {
  console.error('Error creating verification file:', e.message);
}

console.log(`✨ Monetag placement updated to top of <head>.`);
console.log(`Total HTML files updated: ${modifiedCount}`);
