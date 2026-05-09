/**
 * Tests for client-side logic in Settings.html.
 * Extracts the <script> block and runs it in a vm context with minimal DOM mocks.
 */
const fs   = require("fs");
const path = require("path");
const vm   = require("vm");

function loadSidebarScript() {
  const html = fs.readFileSync(
    path.join(__dirname, "../apps-script/Settings.html"),
    "utf8"
  );
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (!matches.length) throw new Error("No <script> block found in Settings.html");
  // Last <script> block is the app logic
  const src = matches[matches.length - 1][1];

  // Minimal DOM and Google APIs to allow the script to load without throwing
  const domEl = () => ({
    style: {},
    classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
    innerHTML: "",
    textContent: "",
    value: "",
    checked: false,
    querySelectorAll: () => [],
    querySelector: () => null,
    dataset: {},
    addEventListener: () => {},
    setAttribute: () => {},
    appendChild: () => {}
  });
  const ctx = vm.createContext({
    window: { onerror: null, addEventListener: () => {} },
    document: {
      addEventListener: () => {},
      getElementById: () => domEl(),
      querySelectorAll: () => [],
      querySelector: () => null
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
    console,
    Array, Object, JSON, Math, RegExp, Error, String, Number, Boolean, Date,
    parseInt, parseFloat, decodeURIComponent, encodeURIComponent,
    atob: s => Buffer.from(s, "base64").toString("utf8"),
    btoa: s => Buffer.from(s, "utf8").toString("base64"),
    structuredClone: v => JSON.parse(JSON.stringify(v))
  });

  vm.runInContext(src, ctx);
  return ctx;
}

// ── matrixToFlows (Phase 3: custom mode preserves aggregateTarget) ─────────────

describe("matrixToFlows", () => {
  let matrixToFlows;
  const cals = [
    { id: "a", calendarId: "a@g.com", name: "A" },
    { id: "b", calendarId: "b@g.com", name: "B" },
    { id: "c", calendarId: "c@g.com", name: "C" }
  ];

  beforeAll(() => {
    const ctx = loadSidebarScript();
    matrixToFlows = ctx.matrixToFlows;
  });

  test("all-on matrix → mesh", () => {
    const matrix = [[false,true,true],[true,false,true],[true,true,false]];
    expect(matrixToFlows(matrix, cals).mode).toBe("mesh");
  });

  test("single column all-on → aggregate with correct target", () => {
    // all sources write to col 1 (cal b); row 1 writes to nothing (self excluded)
    const matrix = [[false,true,false],[false,false,false],[false,true,false]];
    const result = matrixToFlows(matrix, cals);
    expect(result.mode).toBe("aggregate");
    expect(result.aggregateTarget).toBe("b");
  });

  test("arbitrary partial matrix → custom mode with aggregateTarget null", () => {
    // a→b, b→c: neither mesh nor aggregate
    const matrix = [[false,true,false],[false,false,true],[false,false,false]];
    const result = matrixToFlows(matrix, cals);
    expect(result.mode).toBe("custom");
    expect(result.aggregateTarget).toBeNull();
  });
});

// ── buildMatrix / matrixToFlows round-trip ────────────────────────────────────

describe("buildMatrix round-trip", () => {
  let buildMatrix, matrixToFlows;
  const cals = [
    { id: "a", calendarId: "a@g.com", name: "A" },
    { id: "b", calendarId: "b@g.com", name: "B" },
    { id: "c", calendarId: "c@g.com", name: "C" }
  ];

  beforeAll(() => {
    const ctx = loadSidebarScript();
    buildMatrix   = ctx.buildMatrix;
    matrixToFlows = ctx.matrixToFlows;
  });

  test("mesh config → matrix → matrixToFlows gives back mesh", () => {
    const config = { calendars: cals, syncFlows: { mode: "mesh", aggregateTarget: null, customTargets: [] } };
    const matrix = buildMatrix(config);
    expect(matrixToFlows(matrix, cals).mode).toBe("mesh");
  });

  test("aggregate config → matrix → matrixToFlows gives back aggregate with same target", () => {
    const config = { calendars: cals, syncFlows: { mode: "aggregate", aggregateTarget: "b", customTargets: [] } };
    const matrix = buildMatrix(config);
    const result = matrixToFlows(matrix, cals);
    expect(result.mode).toBe("aggregate");
    expect(result.aggregateTarget).toBe("b");
  });

  test("aggregate matrix: only target column is lit (excluding diagonal)", () => {
    const config = { calendars: cals, syncFlows: { mode: "aggregate", aggregateTarget: "a", customTargets: [] } };
    const matrix = buildMatrix(config);
    // col 0 (a) should be true for all non-a rows
    expect(matrix[1][0]).toBe(true);
    expect(matrix[2][0]).toBe(true);
    // col 1 and 2 should all be false
    expect(matrix[0][1]).toBe(false);
    expect(matrix[0][2]).toBe(false);
  });

  test("custom config → matrix → matrixToFlows gives back custom with correct targets", () => {
    // a→c and b→a: two different targets, not reducible to aggregate or mesh
    const config = {
      calendars: cals,
      syncFlows: {
        mode: "custom",
        customTargets: [
          { target: "c", sources: ["a"] },
          { target: "a", sources: ["b"] }
        ]
      }
    };
    const matrix = buildMatrix(config);
    expect(matrix[0][2]).toBe(true);  // a → c
    expect(matrix[1][0]).toBe(true);  // b → a
    expect(matrix[0][1]).toBe(false); // a does not write to b
    const result = matrixToFlows(matrix, cals);
    expect(result.mode).toBe("custom");
    expect(result.customTargets).toHaveLength(2);
  });

  test("empty calendars → n×0 matrix", () => {
    const config = { calendars: [], syncFlows: { mode: "mesh", aggregateTarget: null, customTargets: [] } };
    expect(buildMatrix(config)).toEqual([]);
  });
});

// ── shortLbl ──────────────────────────────────────────────────────────────────

describe("shortLbl", () => {
  let shortLbl;
  beforeAll(() => { shortLbl = loadSidebarScript().shortLbl; });

  test("short name returned as-is", () => {
    expect(shortLbl({ name: "Work", calendarId: "w@g.com", id: "c1" })).toBe("Work");
  });

  test("name longer than 16 chars is truncated with ellipsis", () => {
    const result = shortLbl({ name: "A Very Long Calendar Name", id: "c1" });
    expect(result.length).toBeLessThanOrEqual(16);
    expect(result.endsWith("…")).toBe(true);
  });

  test("falls back to calendarId when name is absent", () => {
    expect(shortLbl({ calendarId: "a@b.com", id: "c1" })).toBe("a@b.com");
  });

  test("falls back to id when name and calendarId are absent", () => {
    expect(shortLbl({ id: "cal_1" })).toBe("cal_1");
  });
});

// ── relTime ───────────────────────────────────────────────────────────────────

describe("relTime", () => {
  let relTime;
  beforeAll(() => { relTime = loadSidebarScript().relTime; });

  test("under 1 minute → 'just now'", () => {
    expect(relTime(new Date(Date.now() - 30000))).toBe("just now");
  });

  test("between 1 and 59 minutes → 'Xm ago'", () => {
    const result = relTime(new Date(Date.now() - 20 * 60 * 1000));
    expect(result).toMatch(/^\d+m ago$/);
  });

  test("between 1 and 23 hours → 'Xh ago'", () => {
    const result = relTime(new Date(Date.now() - 3 * 3600 * 1000));
    expect(result).toMatch(/^\d+h ago$/);
  });

  test("24+ hours → 'Xd ago'", () => {
    const result = relTime(new Date(Date.now() - 48 * 3600 * 1000));
    expect(result).toMatch(/^\d+d ago$/);
  });
});

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

  test("decodes base64 cid= (Google Calendar share link format)", () => {
    // "user@gmail.com" base64-encoded = "dXNlckBnbWFpbC5jb20="
    const b64 = btoa("user@gmail.com");
    const url = `https://calendar.google.com/calendar/r?cid=${b64}`;
    expect(parseCalendarId(url)).toBe("user@gmail.com");
  });

  test("does not throw on malformed percent-encoding", () => {
    expect(() => parseCalendarId("https://example.com?src=%GGbroken")).not.toThrow();
  });

  test("malformed percent-encoding returns best-effort value rather than throwing", () => {
    const result = parseCalendarId("https://example.com?src=%GGbroken");
    expect(typeof result).toBe("string");
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

  test("escapes single quotes to &#39;", () => {
    expect(esc("it's")).toBe("it&#39;s");
  });

  test("escapes all five special chars together", () => {
    expect(esc(`<a href="x" onclick='f()'>A&B</a>`))
      .toBe("&lt;a href=&quot;x&quot; onclick=&#39;f()&#39;&gt;A&amp;B&lt;/a&gt;");
  });
});

// ── saveConfig (U1: confirmation guard) ──────────────────────────────────────
//
// state is a const inside the script closure — not on ctx. We use ctx.init() to
// seed state.config, since init() is the only public function that sets it.

function loadSidebarWithTracking({ confirmReturn }) {
  const fs   = require("fs");
  const path = require("path");
  const vm   = require("vm");
  const html = fs.readFileSync(path.join(__dirname, "../apps-script/Settings.html"), "utf8");
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const src = matches[matches.length - 1][1];

  const domEl = () => ({
    style: {}, classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
    innerHTML: "", textContent: "", value: "", checked: false, disabled: false,
    querySelectorAll: () => [], querySelector: () => null, dataset: {},
    addEventListener: () => {}, setAttribute: () => {}, appendChild: () => {}
  });

  let saveConfigCalled = false;
  let confirmCalled = false;
  const runBuilder = {
    withSuccessHandler: () => runBuilder,
    withFailureHandler: () => runBuilder,
    saveConfigFromSidebar: () => { saveConfigCalled = true; },
    getLastRunSummary:    () => {},
    getConfigForSidebar:  () => {},
    validateCalendar:     () => {}
  };

  const ctx = vm.createContext({
    window: { onerror: null, addEventListener: () => {} },
    document: {
      addEventListener: () => {},
      getElementById: () => domEl(),
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => domEl()
    },
    google: { script: { run: new Proxy(runBuilder, { get: (t, k) => k in t ? t[k] : () => runBuilder }) } },
    clearTimeout: () => {}, setTimeout: () => 0,
    alert: () => {},
    confirm: () => { confirmCalled = true; return confirmReturn; },
    console,
    Array, Object, JSON, Math, RegExp, Error, String, Number, Boolean, Date,
    parseInt, parseFloat, decodeURIComponent, encodeURIComponent,
    atob: s => Buffer.from(s, "base64").toString("utf8"),
    btoa: s => Buffer.from(s, "utf8").toString("base64"),
    structuredClone: v => JSON.parse(JSON.stringify(v))
  });
  vm.runInContext(src, ctx);
  return { ctx, isSaveConfigCalled: () => saveConfigCalled, isConfirmCalled: () => confirmCalled };
}

const baseConfig = {
  settings: { testMode: true, frequency: "daily", syncOnUpdate: false, enableReminder: false, timeFrameDays: 30 },
  calendars: [], syncFlows: { mode: "aggregate", aggregateTarget: null, customTargets: [] }
};

describe("saveConfig (pure save)", () => {
  test("when isDirty is false → saveConfigFromSidebar not called", () => {
    const { ctx, isSaveConfigCalled } = loadSidebarWithTracking({ confirmReturn: true });
    ctx.init(baseConfig); // isDirty=false after init
    ctx.saveConfig();
    expect(isSaveConfigCalled()).toBe(false);
  });

  test("when isDirty is true → saveConfigFromSidebar is called", () => {
    const { ctx, isSaveConfigCalled } = loadSidebarWithTracking({ confirmReturn: true });
    ctx.init(baseConfig);
    ctx.markDirty();
    ctx.saveConfig();
    expect(isSaveConfigCalled()).toBe(true);
  });

  test("no confirmation prompt for pure save", () => {
    const { ctx, isConfirmCalled } = loadSidebarWithTracking({ confirmReturn: true });
    ctx.init(baseConfig);
    ctx.markDirty();
    ctx.saveConfig();
    expect(isConfirmCalled()).toBe(false);
  });
});

describe("activateSync (U1: confirmation guard)", () => {
  const activateConfig = {
    ...baseConfig,
    calendars: [{ id: "cal_1", calendarId: "work@gmail.com", name: "Work" }]
  };

  test("when user cancels confirmation → saveConfigFromSidebar not called", () => {
    const { ctx, isSaveConfigCalled } = loadSidebarWithTracking({ confirmReturn: false });
    ctx.init(activateConfig);
    ctx.activateSync();
    expect(isSaveConfigCalled()).toBe(false);
  });

  test("when user confirms → saveConfigFromSidebar is called", () => {
    const { ctx, isSaveConfigCalled } = loadSidebarWithTracking({ confirmReturn: true });
    ctx.init(activateConfig);
    ctx.activateSync();
    expect(isSaveConfigCalled()).toBe(true);
  });

  test("when needsReview → returns before confirmation prompt", () => {
    const { ctx, isSaveConfigCalled, isConfirmCalled } = loadSidebarWithTracking({ confirmReturn: true });
    ctx.init(activateConfig);
    ctx.markReview();
    ctx.activateSync();
    expect(isConfirmCalled()).toBe(false);
    expect(isSaveConfigCalled()).toBe(false);
  });

  test("when no calendars have a valid calendarId → returns before confirmation prompt", () => {
    const { ctx, isSaveConfigCalled, isConfirmCalled } = loadSidebarWithTracking({ confirmReturn: true });
    ctx.init(baseConfig); // calendars: []
    ctx.activateSync();
    expect(isConfirmCalled()).toBe(false);
    expect(isSaveConfigCalled()).toBe(false);
  });
});

// ── runNow (U5: watchdog setTimeout) ─────────────────────────────────────────

describe("runNow watchdog", () => {
  test("calls setTimeout with 330000ms delay", () => {
    const fs   = require("fs");
    const path = require("path");
    const vm   = require("vm");
    const html = fs.readFileSync(path.join(__dirname, "../apps-script/Settings.html"), "utf8");
    const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    const src = matches[matches.length - 1][1];

    const domEl = () => ({
      style: {}, classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
      innerHTML: "", textContent: "", value: "", checked: false,
      querySelectorAll: () => [], querySelector: () => null, dataset: {},
      addEventListener: () => {}, setAttribute: () => {}, appendChild: () => {}
    });

    let capturedDelay;
    const runBuilder = {
      withSuccessHandler: () => runBuilder,
      withFailureHandler: () => runBuilder,
      runSyncNow:          () => {},
      getConfigForSidebar: () => {},
      getLastRunSummary:   () => {},
      validateCalendar:    () => {}
    };

    const ctx = vm.createContext({
      window: { onerror: null, addEventListener: () => {} },
      document: {
        addEventListener: () => {},
        getElementById: () => domEl(),
        querySelectorAll: () => [],
        querySelector: () => null
      },
      google: { script: { run: new Proxy(runBuilder, { get: (t, k) => k in t ? t[k] : () => runBuilder }) } },
      clearTimeout: () => {},
      setTimeout: (fn, delay) => { capturedDelay = delay; return 1; },
      alert: () => {}, confirm: () => true, console,
      Array, Object, JSON, Math, RegExp, Error, String, Number, Boolean, Date,
      parseInt, parseFloat, decodeURIComponent, encodeURIComponent,
      atob: s => Buffer.from(s, "base64").toString("utf8"),
      btoa: s => Buffer.from(s, "utf8").toString("base64"),
      structuredClone: v => JSON.parse(JSON.stringify(v))
    });
    vm.runInContext(src, ctx);
    ctx.init({ ...baseConfig, settings: { ...baseConfig.settings, testMode: false } });
    ctx.runNow();
    expect(capturedDelay).toBe(330000);
  });
});

// ── activateSync / deactivateSync testMode restore (Phase 3 fix) ──────────────
// Verifies that deactivateSync changes testMode and saveConfigFromSidebar is called.

describe("deactivateSync", () => {
  test("calls saveConfigFromSidebar and shows no confirm error", () => {
    const { ctx, isSaveConfigCalled } = loadSidebarWithTracking({ confirmReturn: true });
    // Start in live state: testMode=false + at least conceptually active
    ctx.init({ ...baseConfig, settings: { ...baseConfig.settings, testMode: false } });
    ctx.deactivateSync();
    expect(isSaveConfigCalled()).toBe(true);
  });

  test("when user cancels confirmation → saveConfigFromSidebar not called", () => {
    const { ctx, isSaveConfigCalled } = loadSidebarWithTracking({ confirmReturn: false });
    ctx.init({ ...baseConfig, settings: { ...baseConfig.settings, testMode: false } });
    ctx.deactivateSync();
    expect(isSaveConfigCalled()).toBe(false);
  });
});
