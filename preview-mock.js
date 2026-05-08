/**
 * preview-mock.js — injected by build-preview.js into Sidebar.html to produce preview.html.
 *
 * Defines the google.script.run shim and all mock server responses.
 * Edit MOCK_CONFIG and MOCK_RUNS to update what the preview displays.
 */

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_CONFIG = {
  _scriptEmail: "em.montero@gmail.com",
  calendars: [
    {
      id: "cal_1", name: "Personal", provider: "google",
      calendarId: "em.montero@gmail.com",
      blockTitle: "Busy", visibility: "fullyPrivate",
      privateShowOriginalTitle: false, weekdayEventsOnly: false,
      acceptAllDayEvents: true, allowDoubleBooking: true
    },
    {
      id: "cal_2", name: "Work", provider: "google",
      calendarId: "em.montero@work.com",
      blockTitle: "Blocked", visibility: "private",
      privateShowOriginalTitle: true, weekdayEventsOnly: true,
      acceptAllDayEvents: false, allowDoubleBooking: false
    },
    {
      id: "cal_3", name: "Shared (read-only)", provider: "google",
      calendarId: "shared@example.com",
      blockTitle: "Busy", visibility: "fullyPrivate",
      privateShowOriginalTitle: false, weekdayEventsOnly: false,
      acceptAllDayEvents: true, allowDoubleBooking: true
    }
  ],
  syncFlows: { mode: "custom", aggregateTarget: null, customTargets: [
    { target: "cal_2", sources: ["cal_1"] }
  ]},
  settings: {
    timeFrameDays: 30, frequency: "daily",
    syncOnUpdate: true, enableReminder: false, testMode: true
  }
};

const MOCK_VALIDATE = {
  "em.montero@gmail.com":  { ok: true,  name: "Personal",           accessRole: "owner",  canWrite: true  },
  "em.montero@work.com":   { ok: true,  name: "Work",               accessRole: "writer", canWrite: true  },
  "shared@example.com":    { ok: true,  name: "Shared (read-only)", accessRole: "reader", canWrite: false }
};

const MOCK_RUNS = [
  {
    runId: "2026-05-07T10:00:00.000Z:abc1",
    runType: "manual", testMode: true,
    ts: "2026-05-07T10:00:00.000Z",
    totalInserts: 3, totalPatches: 1, totalDeletes: 0, totalSkips: 2, totalErrors: 0,
    flows: [{
      target: "cal_2",
      inserts: 3, patches: 1, deletes: 0, skips: 2, errors: 0,
      flowLog: [
        { o: "ins",   t: "Team standup",  s: "2026-05-08T09:00:00Z", c: "em.montero@gmail.com" },
        { o: "ins",   t: "Lunch",         s: "2026-05-08T12:00:00Z", c: "em.montero@gmail.com" },
        { o: "ins",   t: "Doctor appt",   s: "2026-05-09T14:00:00Z", c: "em.montero@gmail.com" },
        { o: "patch", t: "Gym",           s: "2026-05-10T07:00:00Z", c: "em.montero@gmail.com" },
        { o: "skip",  t: "All hands",     s: "2026-05-08T15:00:00Z", r: "overlap"              },
        { o: "skip",  t: "Happy hour",    s: "2026-05-09T17:00:00Z", r: "overlap"              }
      ]
    }]
  },
  {
    runId: "2026-05-07T06:00:00.000Z:def2",
    runType: "scheduled", testMode: false,
    ts: "2026-05-07T06:00:00.000Z",
    totalInserts: 1, totalPatches: 0, totalDeletes: 1, totalSkips: 4, totalErrors: 1,
    flows: [{
      target: "cal_2",
      inserts: 1, patches: 0, deletes: 1, skips: 4, errors: 1,
      flowLog: [
        { o: "ins",   t: "Dentist",       s: "2026-05-11T11:00:00Z", c: "em.montero@gmail.com" },
        { o: "del",   t: "Busy",          s: "2026-05-06T09:00:00Z"                             },
        { o: "skip",  t: "Weekend hike",  s: "2026-05-10T08:00:00Z", r: "overlap"              },
        { o: "err",   t: "Birthday party",s: "2026-05-11T19:00:00Z", e: "insert failed: quota" }
      ]
    }]
  },
  {
    runId: "2026-05-06T18:30:00.000Z:ghi3",
    runType: "calendar-update", testMode: false,
    ts: "2026-05-06T18:30:00.000Z",
    totalInserts: 0, totalPatches: 2, totalDeletes: 0, totalSkips: 1, totalErrors: 0,
    flows: [{
      target: "cal_2",
      inserts: 0, patches: 2, deletes: 0, skips: 1, errors: 0,
      flowLog: [
        { o: "patch", t: "Team standup",  s: "2026-05-08T09:00:00Z", c: "em.montero@gmail.com" },
        { o: "patch", t: "Lunch",         s: "2026-05-08T12:00:00Z", c: "em.montero@gmail.com" },
        { o: "skip",  t: "All hands",     s: "2026-05-08T15:00:00Z", r: "overlap"              }
      ]
    }]
  },
  {
    runId: "2026-05-06T00:00:00.000Z:jkl4",
    runType: "cleanup", testMode: false,
    ts: "2026-05-06T00:00:00.000Z",
    removed: 5, totalInserts: 0, totalPatches: 0, totalDeletes: 5, totalSkips: 0, totalErrors: 0,
    flows: []
  }
];

// ── google.script.run shim ────────────────────────────────────────────────────

const MOCK_DELAY = 180;

const MOCK_HANDLERS = {
  getConfigForSidebar:    ()      => structuredClone(MOCK_CONFIG),
  getLastRunSummary:      ()      => structuredClone(MOCK_RUNS),
  validateCalendar:       (id)    => structuredClone(MOCK_VALIDATE[id] || { ok: false, reason: "not-found" }),
  subscribeToCalendar:    (id)    => structuredClone(MOCK_VALIDATE[id] || { ok: false, reason: "no-access", error: "This calendar is private." }),
  saveConfigFromSidebar:  ()      => ({ ok: true }),
  runSyncNow:             ()      => { MOCK_RUNS.unshift({ ...MOCK_RUNS[0], ts: new Date().toISOString(), runType: "manual" }); return structuredClone(MOCK_RUNS); },
  cleanupCalendars:       ()      => ({ removed: 3, testMode: true }),
  resetConfig:            ()      => ({ ok: true }),
};

function _makeMockRunner() {
  let _s = null, _f = null;
  const runner = {
    withSuccessHandler(fn) { _s = fn; return runner; },
    withFailureHandler(fn) { _f = fn; return runner; },
  };
  for (const [name, fn] of Object.entries(MOCK_HANDLERS)) {
    runner[name] = (...args) => {
      const s = _s, f = _f;
      setTimeout(() => {
        try { if (s) s(fn(...args)); }
        catch (e) { if (f) f(e instanceof Error ? e : { message: String(e) }); }
      }, MOCK_DELAY);
    };
  }
  return runner;
}

const google = {
  script: {
    run: new Proxy({}, {
      get(_, prop) { return _makeMockRunner()[prop]; }
    })
  }
};
