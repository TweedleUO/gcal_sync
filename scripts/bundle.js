#!/usr/bin/env node
/**
 * Bundles apps-script/ files into dist/ for paste-into-editor distribution.
 *
 * Output:
 *   dist/Code.gs      — Code.gs + Setup.gs concatenated (paste into a .gs file)
 *   dist/Sidebar.html — copied as-is (create an HTML file named "Sidebar", paste this)
 */
const fs = require('fs');
const path = require('path');

const SRC  = path.join(__dirname, '../apps-script');
const DIST = path.join(__dirname, '../dist');

const GS_ORDER = ['Code.gs', 'Setup.gs'];

// Concatenate .gs files
const bundle = GS_ORDER
  .map(f => {
    const file = path.join(SRC, f);
    if (!fs.existsSync(file)) { console.warn(`Skipping missing file: ${f}`); return ''; }
    return `// ── ${f} ${'─'.repeat(60 - f.length)}\n\n${fs.readFileSync(file, 'utf8')}`;
  })
  .filter(Boolean)
  .join('\n\n');

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'Code.gs'), bundle);
console.log(`Bundled  → dist/Code.gs`);

// Copy Sidebar.html
const htmlSrc = path.join(SRC, 'Sidebar.html');
if (fs.existsSync(htmlSrc)) {
  fs.copyFileSync(htmlSrc, path.join(DIST, 'Sidebar.html'));
  console.log(`Copied   → dist/Sidebar.html`);
} else {
  console.warn('Skipping missing file: Sidebar.html');
}
