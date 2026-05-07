/**
 * Tests for client-side logic in Sidebar.html.
 * Extracts the <script> block and runs it in a vm context with minimal DOM mocks.
 */
const fs   = require("fs");
const path = require("path");
const vm   = require("vm");

function loadSidebarScript() {
  const html = fs.readFileSync(
    path.join(__dirname, "../apps-script/Sidebar.html"),
    "utf8"
  );
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (!matches.length) throw new Error("No <script> block found in Sidebar.html");
  // Last <script> block is the app logic
  const src = matches[matches.length - 1][1];

  // Minimal DOM and Google APIs to allow the script to load without throwing
  const ctx = vm.createContext({
    document: {
      addEventListener: () => {},
      getElementById: () => ({
        style: {},
        classList: { toggle: () => {}, add: () => {}, remove: () => {} },
        innerHTML: "",
        textContent: "",
        value: "",
        checked: false,
        querySelectorAll: () => []
      }),
      querySelectorAll: () => []
    },
    google: {
      script: {
        run: new Proxy({}, {
          get: () => () => ({ withSuccessHandler: () => ({ withFailureHandler: () => ({}) }) })
        })
      }
    },
    clearTimeout: () => {},
    setTimeout:   () => 0,
    alert:        () => {},
    confirm:      () => false,
    console
  });

  vm.runInContext(src, ctx);
  return ctx;
}

// ── parseCalendarId ───────────────────────────────────────────────────────────

describe("parseCalendarId", () => {
  let parseCalendarId;

  beforeAll(() => {
    const ctx = loadSidebarScript();
    parseCalendarId = ctx.parseCalendarId;
  });

  test("empty string → empty string", () => {
    expect(parseCalendarId("")).toBe("");
  });

  test("plain email address returned as-is", () => {
    expect(parseCalendarId("user@gmail.com")).toBe("user@gmail.com");
  });

  test("'primary' returned as-is", () => {
    expect(parseCalendarId("primary")).toBe("primary");
  });

  test("whitespace is trimmed", () => {
    expect(parseCalendarId("  user@gmail.com  ")).toBe("user@gmail.com");
  });

  test("extracts ID from ?src= query param (Google Calendar embed URL)", () => {
    const url = "https://calendar.google.com/calendar/embed?src=work%40gmail.com&ctz=America%2FNew_York";
    expect(parseCalendarId(url)).toBe("work@gmail.com");
  });

  test("extracts ID from &src= query param (URL-encoded)", () => {
    const url = "https://example.com/embed?foo=bar&src=group%40company.com";
    expect(parseCalendarId(url)).toBe("group@company.com");
  });

  test("extracts ID from ?cid= query param", () => {
    const url = "https://calendar.google.com/calendar/r?cid=user%40gmail.com";
    expect(parseCalendarId(url)).toBe("user@gmail.com");
  });

  test("extracts ID from calendar settings path", () => {
    const url = "https://calendar.google.com/calendar/r/settings/calendar/user%40gmail.com";
    expect(parseCalendarId(url)).toBe("user@gmail.com");
  });

  test("returns input unchanged when no pattern matches", () => {
    const raw = "some-opaque-id";
    expect(parseCalendarId(raw)).toBe("some-opaque-id");
  });

  test("prefers src over cid when both present", () => {
    const url = "https://calendar.google.com/?src=first%40gmail.com&cid=second%40gmail.com";
    expect(parseCalendarId(url)).toBe("first@gmail.com");
  });
});

// ── esc (XSS safety) ─────────────────────────────────────────────────────────

describe("esc", () => {
  let esc;

  beforeAll(() => {
    const ctx = loadSidebarScript();
    esc = ctx.esc;
  });

  test("escapes & < > \"", () => {
    expect(esc('<script>alert("xss")&done</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&amp;done&lt;/script&gt;"
    );
  });

  test("null/undefined → empty string (no throw)", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });

  test("safe strings pass through unchanged", () => {
    expect(esc("Hello, World!")).toBe("Hello, World!");
  });
});
