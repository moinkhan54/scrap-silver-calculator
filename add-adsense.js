#!/usr/bin/env node
/**
 * add-adsense.js
 * Injects Google AdSense script into <head> of every HTML file
 * that doesn't already have it. Covers root + all language subdirs.
 * Run: node add-adsense.js
 */

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const ADSENSE_TAG = `  <!-- Google AdSense -->
 
const LANG_DIRS = ['ar','de','es','fr','hi','it','pt','ru','tr','ur','zh'];

// Skip utility/scratch files
const SKIP = new Set([
  'add-schema.js','add-adsense.js','add-schema.html',
  'audit-report.html','debug.html','scrapsilver-masterpiece.html',
  'modern-dashboard-calculator.html','silver-market-analysis-may18.html',
]);

function processFile(filePath) {
  let html;
  try { html = fs.readFileSync(filePath, 'utf8'); } catch { return; }

  // Skip if already has AdSense
  if (html.includes('adsbygoogle') || html.includes('ca-pub-5307005898686879')) return;

  // Skip redirect-only pages (no real <head>)
  if (!html.includes('</head>')) return;

  // Inject just before </head>
  const updated = html.replace('</head>', ADSENSE_TAG + '\n</head>');
  if (updated === html) return;

  fs.writeFileSync(filePath, updated, 'utf8');
  console.log(`✅  ${path.relative(ROOT, filePath)}`);
}

let count = 0;

// Root-level HTML files
fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.html') && !SKIP.has(f))
  .forEach(f => { processFile(path.join(ROOT, f)); count++; });

// Language subdirectories
LANG_DIRS.forEach(lang => {
  const dir = path.join(ROOT, lang);
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir)
    .filter(f => f.endsWith('.html'))
    .forEach(f => { processFile(path.join(dir, f)); count++; });
});

// Also the /ur subfolder (current working dir)
const urDir = path.join(ROOT, 'ur');
if (fs.existsSync(urDir)) {
  fs.readdirSync(urDir)
    .filter(f => f.endsWith('.html'))
    .forEach(f => { processFile(path.join(urDir, f)); count++; });
}

console.log(`\n✨  Done — processed ${count} files.`);
