/**
 * build-preview.js
 *
 * Generates preview.html from apps-script/Sidebar.html by injecting
 * the google.script.run shim and mock data from preview-mock.js.
 *
 * Usage:  node build-preview.js
 *         npm run preview
 */

const fs   = require("fs");
const path = require("path");

const SIDEBAR = path.join(__dirname, "apps-script", "Sidebar.html");
const MOCK    = path.join(__dirname, "preview-mock.js");
const OUTPUT  = path.join(__dirname, "preview.html");

const sidebar = fs.readFileSync(SIDEBAR, "utf8");
const mock    = fs.readFileSync(MOCK,    "utf8");

const injection = `<script>\n/* === preview-mock.js (injected by build-preview.js) === */\n${mock}\n</script>\n`;

// Insert mock script block before the first <script> tag in Sidebar.html
const result = sidebar.replace("<script>", injection + "<script>");

if (!result.includes(injection)) {
  console.error("Could not find <script> tag in Sidebar.html — injection failed.");
  process.exit(1);
}

fs.writeFileSync(OUTPUT, result, "utf8");
console.log(`preview.html generated from Sidebar.html (${result.length} bytes)`);
