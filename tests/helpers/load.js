/**
 * Loads a .gs file into a vm context so its function declarations are accessible
 * as properties of the returned context object.
 *
 * Function declarations in the script (function foo() {}) become properties of the
 * vm context (global object). const/let are lexically scoped within the script but
 * remain accessible to those functions via closure, so cross-references within the
 * same file work correctly without any extra wiring.
 *
 * Usage:
 *   const ctx = loadGs('Code.gs');
 *   ctx.normalizeEvent({ ... });
 *
 *   // Pre-populate globals before loading (e.g. mock cross-file functions):
 *   const ctx = loadGs('Code.gs', { getConfig: jest.fn(() => myConfig) });
 */
const vm   = require("vm");
const fs   = require("fs");
const path = require("path");
const mocks = require("./gas");

function loadGs(filename, extraGlobals = {}) {
  const src = fs.readFileSync(
    path.join(__dirname, "../../apps-script", filename),
    "utf8"
  );

  const ctx = vm.createContext({
    // Share the outer context's built-in constructors so instanceof checks work in tests
    Date, Array, Object, Map, Set, JSON, Math, RegExp, Error, parseInt, parseFloat,
    decodeURIComponent, encodeURIComponent,
    // Apps Script built-ins
    Utilities:          mocks.makeMockUtilities(),
    Calendar:           mocks.makeMockCalendar(),
    LockService:        mocks.makeMockLockService(),
    PropertiesService:  mocks.makeMockPropertiesService(),
    Session:            mocks.makeMockSession(),
    ScriptApp:          mocks.makeMockScriptApp(),
    HtmlService:        { createHtmlOutputFromFile: jest.fn(), XFrameOptionsMode: { ALLOWALL: 1, DEFAULT: 0 } },
    // Node globals needed by some scripts
    console,
    // Allow tests to override or inject any global before the script runs
    ...extraGlobals
  });

  vm.runInContext(src, ctx);
  return ctx;
}

module.exports = { loadGs };
