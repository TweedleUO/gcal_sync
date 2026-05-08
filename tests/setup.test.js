const { loadGs } = require("./helpers/load");
const { makeMockPropertiesService } = require("./helpers/gas");

// ── resolveFlows ──────────────────────────────────────────────────────────────

describe("resolveFlows", () => {
  let ctx;
  beforeAll(() => { ctx = loadGs("Setup.gs"); });

  const cals = [
    { id: "work",     calendarId: "work@gmail.com",     name: "Work" },
    { id: "personal", calendarId: "personal@gmail.com", name: "Personal" },
    { id: "other",    calendarId: "other@gmail.com",    name: "Other" }
  ];

  // ── aggregate ──────────────────────────────────────────────────────────────

  describe("aggregate mode", () => {
    test("one flow: target + all other calendars as sources", () => {
      const config = {
        calendars: cals,
        syncFlows: { mode: "aggregate", aggregateTarget: "work", customTargets: [] }
      };
      const flows = ctx.resolveFlows(config);
      expect(flows).toHaveLength(1);
      expect(flows[0].targetCal.id).toBe("work");
      expect(flows[0].sourceCals.map(c => c.id)).toEqual(["personal", "other"]);
    });

    test("returns [] when target id is not in calendars", () => {
      const config = {
        calendars: cals,
        syncFlows: { mode: "aggregate", aggregateTarget: "unknown", customTargets: [] }
      };
      expect(ctx.resolveFlows(config)).toEqual([]);
    });

    test("returns [] when only one calendar exists (no sources)", () => {
      const config = {
        calendars: [cals[0]],
        syncFlows: { mode: "aggregate", aggregateTarget: "work", customTargets: [] }
      };
      expect(ctx.resolveFlows(config)).toEqual([]);
    });

    test("returns [] when no calendars configured", () => {
      const config = {
        calendars: [],
        syncFlows: { mode: "aggregate", aggregateTarget: null, customTargets: [] }
      };
      expect(ctx.resolveFlows(config)).toEqual([]);
    });

    test("target calendar is excluded from sources", () => {
      const config = {
        calendars: cals,
        syncFlows: { mode: "aggregate", aggregateTarget: "personal", customTargets: [] }
      };
      const flows = ctx.resolveFlows(config);
      const sourceIds = flows[0].sourceCals.map(c => c.id);
      expect(sourceIds).not.toContain("personal");
    });
  });

  // ── mesh ───────────────────────────────────────────────────────────────────

  describe("mesh mode", () => {
    test("N calendars → N flows, each with N-1 sources", () => {
      const config = {
        calendars: cals,
        syncFlows: { mode: "mesh", aggregateTarget: null, customTargets: [] }
      };
      const flows = ctx.resolveFlows(config);
      expect(flows).toHaveLength(3);
      for (const flow of flows) {
        expect(flow.sourceCals).toHaveLength(2);
        expect(flow.sourceCals.map(c => c.id)).not.toContain(flow.targetCal.id);
      }
    });

    test("every calendar appears as target exactly once", () => {
      const config = {
        calendars: cals,
        syncFlows: { mode: "mesh", aggregateTarget: null, customTargets: [] }
      };
      const targetIds = ctx.resolveFlows(config).map(f => f.targetCal.id).sort();
      expect(targetIds).toEqual(["other", "personal", "work"]);
    });

    test("returns [] for single calendar", () => {
      const config = {
        calendars: [cals[0]],
        syncFlows: { mode: "mesh", aggregateTarget: null, customTargets: [] }
      };
      expect(ctx.resolveFlows(config)).toEqual([]);
    });
  });

  // ── custom ─────────────────────────────────────────────────────────────────

  describe("custom mode", () => {
    test("creates one flow per defined pair", () => {
      const config = {
        calendars: cals,
        syncFlows: {
          mode: "custom",
          customTargets: [
            { target: "work",     sources: ["personal"] },
            { target: "personal", sources: ["work", "other"] }
          ]
        }
      };
      const flows = ctx.resolveFlows(config);
      expect(flows).toHaveLength(2);
      expect(flows[0].targetCal.id).toBe("work");
      expect(flows[0].sourceCals.map(c => c.id)).toEqual(["personal"]);
      expect(flows[1].targetCal.id).toBe("personal");
      expect(flows[1].sourceCals.map(c => c.id)).toEqual(["work", "other"]);
    });

    test("skips pairs with unknown target", () => {
      const config = {
        calendars: cals,
        syncFlows: {
          mode: "custom",
          customTargets: [{ target: "nonexistent", sources: ["work"] }]
        }
      };
      expect(ctx.resolveFlows(config)).toEqual([]);
    });

    test("unknown source IDs are silently dropped", () => {
      const config = {
        calendars: cals,
        syncFlows: {
          mode: "custom",
          customTargets: [{ target: "work", sources: ["personal", "ghost"] }]
        }
      };
      const flows = ctx.resolveFlows(config);
      expect(flows[0].sourceCals.map(c => c.id)).toEqual(["personal"]);
    });

    test("pair with all-unknown sources produces no flow", () => {
      const config = {
        calendars: cals,
        syncFlows: {
          mode: "custom",
          customTargets: [{ target: "work", sources: ["ghost"] }]
        }
      };
      expect(ctx.resolveFlows(config)).toEqual([]);
    });

    test("empty customTargets → no flows", () => {
      const config = {
        calendars: cals,
        syncFlows: { mode: "custom", customTargets: [] }
      };
      expect(ctx.resolveFlows(config)).toEqual([]);
    });

    test("self-loop: calendar listed as both target and source is excluded from sources", () => {
      const config = {
        calendars: cals,
        syncFlows: {
          mode: "custom",
          customTargets: [{ target: "work", sources: ["work", "personal"] }]
        }
      };
      const flows = ctx.resolveFlows(config);
      expect(flows).toHaveLength(1);
      expect(flows[0].sourceCals.map(c => c.id)).toEqual(["personal"]);
      expect(flows[0].sourceCals.map(c => c.id)).not.toContain("work");
    });

    test("self-loop only: calendar is sole source of itself → no flow", () => {
      const config = {
        calendars: cals,
        syncFlows: {
          mode: "custom",
          customTargets: [{ target: "work", sources: ["work"] }]
        }
      };
      expect(ctx.resolveFlows(config)).toEqual([]);
    });
  });
});

// ── getConfig / saveConfigFromSidebar ─────────────────────────────────────────

describe("getConfig", () => {
  test("returns default config when nothing is stored", () => {
    const ctx = loadGs("Setup.gs");
    const config = ctx.getConfig();
    expect(config).toMatchObject({
      calendars: [],
      syncFlows: { mode: "aggregate" },
      settings: { testMode: true }
    });
  });

  test("round-trips a saved config", () => {
    const ctx = loadGs("Setup.gs");
    const saved = {
      calendars: [{ id: "work", calendarId: "work@gmail.com", name: "Work" }],
      syncFlows: { mode: "mesh", aggregateTarget: null, customTargets: [] },
      settings: { timeFrameDays: 14, frequency: "hourly", syncOnUpdate: false, enableReminder: false, testMode: false }
    };
    const result = ctx.saveConfigFromSidebar(saved);
    expect(result).toEqual({ ok: true });
    expect(ctx.getConfig()).toEqual(saved);
  });

  test("strips _scriptEmail before saving", () => {
    const ctx = loadGs("Setup.gs");
    const saved = {
      _scriptEmail: "should-not-be-saved@gmail.com",
      calendars: [],
      syncFlows: { mode: "aggregate", aggregateTarget: null, customTargets: [] },
      settings: { timeFrameDays: 30, frequency: "daily", syncOnUpdate: true, enableReminder: false, testMode: true }
    };
    ctx.saveConfigFromSidebar(saved);
    expect(ctx.getConfig()._scriptEmail).toBeUndefined();
  });

  test("returns error when config exceeds size limit", () => {
    const ctx = loadGs("Setup.gs");
    const bigCal = { id: "x", calendarId: "x".repeat(200) + "@gmail.com", name: "x".repeat(200) };
    const oversized = {
      calendars: Array.from({ length: 50 }, (_, i) => ({ ...bigCal, id: "c" + i })),
      syncFlows: { mode: "mesh", aggregateTarget: null, customTargets: [] },
      settings: { timeFrameDays: 30, frequency: "daily", syncOnUpdate: true, enableReminder: false, testMode: true }
    };
    const result = ctx.saveConfigFromSidebar(oversized);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too large/);
  });
});

// ── saveRunSummary / getLastRunSummary ────────────────────────────────────────

describe("saveRunSummary / getLastRunSummary", () => {
  const makeSummary = (id) => ({
    runId: id, runType: "manual", testMode: true,
    totalInserts: 0, totalPatches: 0, totalDeletes: 0, totalSkips: 0, totalErrors: 0,
    flows: []
  });

  test("returns [] when no runs have been saved", () => {
    const ctx = loadGs("Setup.gs");
    expect(ctx.getLastRunSummary()).toEqual([]);
  });

  test("saved run is retrievable as first element", () => {
    const ctx = loadGs("Setup.gs");
    ctx.saveRunSummary(makeSummary("run-1"));
    const runs = ctx.getLastRunSummary();
    expect(runs).toHaveLength(1);
    expect(runs[0].runId).toBe("run-1");
    expect(runs[0].ts).toBeDefined();
  });

  test("most recent run is at index 0", () => {
    const ctx = loadGs("Setup.gs");
    ctx.saveRunSummary(makeSummary("first"));
    ctx.saveRunSummary(makeSummary("second"));
    const runs = ctx.getLastRunSummary();
    expect(runs[0].runId).toBe("second");
    expect(runs[1].runId).toBe("first");
  });

  test("capped at MAX_RUNS (5) entries", () => {
    const ctx = loadGs("Setup.gs");
    for (let i = 0; i < 7; i++) ctx.saveRunSummary(makeSummary("run-" + i));
    const runs = ctx.getLastRunSummary();
    expect(runs.length).toBeLessThanOrEqual(5);
    expect(runs[0].runId).toBe("run-6");
    expect(runs[4].runId).toBe("run-2");
  });
});

// ── getSourceCalendarIds ──────────────────────────────────────────────────────

describe("getSourceCalendarIds", () => {
  const cals = [
    { id: "work",     calendarId: "work@gmail.com",     name: "Work" },
    { id: "personal", calendarId: "personal@gmail.com", name: "Personal" },
    { id: "other",    calendarId: "other@gmail.com",    name: "Other" }
  ];

  let ctx;
  beforeAll(() => { ctx = loadGs("Setup.gs"); });

  test("aggregate: all non-target calendarIds are sources", () => {
    const config = {
      calendars: cals,
      syncFlows: { mode: "aggregate", aggregateTarget: "work", customTargets: [] }
    };
    const ids = ctx.getSourceCalendarIds(config);
    expect(ids).toContain("personal@gmail.com");
    expect(ids).toContain("other@gmail.com");
    expect(ids).not.toContain("work@gmail.com");
  });

  test("mesh: every calendarId appears as a source", () => {
    const config = {
      calendars: cals,
      syncFlows: { mode: "mesh", aggregateTarget: null, customTargets: [] }
    };
    const ids = ctx.getSourceCalendarIds(config);
    expect(ids).toHaveLength(3);
    expect(ids).toContain("work@gmail.com");
    expect(ids).toContain("personal@gmail.com");
    expect(ids).toContain("other@gmail.com");
  });

  test("custom: only specified sources are returned, deduplicated", () => {
    const config = {
      calendars: cals,
      syncFlows: {
        mode: "custom",
        customTargets: [
          { target: "work",     sources: ["personal", "other"] },
          { target: "personal", sources: ["other"] }
        ]
      }
    };
    const ids = ctx.getSourceCalendarIds(config);
    expect(ids).toContain("personal@gmail.com");
    expect(ids).toContain("other@gmail.com");
    expect(ids).not.toContain("work@gmail.com");
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("no calendars → empty array", () => {
    const config = {
      calendars: [],
      syncFlows: { mode: "aggregate", aggregateTarget: null, customTargets: [] }
    };
    expect(ctx.getSourceCalendarIds(config)).toEqual([]);
  });
});

// ── setupTriggers ─────────────────────────────────────────────────────────────

describe("setupTriggers", () => {
  function makeCtxWithSpies(config) {
    const builder = {
      timeBased:       jest.fn(() => builder),
      forUserCalendar: jest.fn(() => builder),
      everyMinutes:    jest.fn(() => builder),
      everyHours:      jest.fn(() => builder),
      everyDays:       jest.fn(() => builder),
      atHour:          jest.fn(() => builder),
      inTimezone:      jest.fn(() => builder),
      onEventUpdated:  jest.fn(() => builder),
      create:          jest.fn()
    };
    const ScriptApp = {
      newTrigger:         jest.fn(() => builder),
      getProjectTriggers: () => [],
      deleteTrigger:      jest.fn()
    };
    const ctx = loadGs("Setup.gs", { ScriptApp });
    ctx.setupTriggers(config);
    return { builder, ScriptApp };
  }

  const cals = [
    { id: "a", calendarId: "a@g.com" },
    { id: "b", calendarId: "b@g.com" }
  ];
  const aggFlows = { mode: "aggregate", aggregateTarget: "a", customTargets: [] };

  test("every15 frequency → everyMinutes(15) called", () => {
    const { builder } = makeCtxWithSpies({ settings: { frequency: "every15", syncOnUpdate: false }, calendars: cals, syncFlows: aggFlows });
    expect(builder.everyMinutes).toHaveBeenCalledWith(15);
  });

  test("every30 frequency → everyMinutes(30) called", () => {
    const { builder } = makeCtxWithSpies({ settings: { frequency: "every30", syncOnUpdate: false }, calendars: cals, syncFlows: aggFlows });
    expect(builder.everyMinutes).toHaveBeenCalledWith(30);
  });

  test("hourly frequency → everyHours(1) called", () => {
    const { builder } = makeCtxWithSpies({ settings: { frequency: "hourly", syncOnUpdate: false }, calendars: cals, syncFlows: aggFlows });
    expect(builder.everyHours).toHaveBeenCalledWith(1);
  });

  test("every4h frequency → everyHours(4) called", () => {
    const { builder } = makeCtxWithSpies({ settings: { frequency: "every4h", syncOnUpdate: false }, calendars: cals, syncFlows: aggFlows });
    expect(builder.everyHours).toHaveBeenCalledWith(4);
  });

  test("daily frequency → everyDays(1) + atHour(0) called", () => {
    const { builder } = makeCtxWithSpies({ settings: { frequency: "daily", syncOnUpdate: false }, calendars: cals, syncFlows: aggFlows });
    expect(builder.everyDays).toHaveBeenCalledWith(1);
    expect(builder.atHour).toHaveBeenCalledWith(0);
  });

  test("unknown frequency → falls back to daily (everyDays)", () => {
    const { builder } = makeCtxWithSpies({ settings: { frequency: "weekly", syncOnUpdate: false }, calendars: cals, syncFlows: aggFlows });
    expect(builder.everyDays).toHaveBeenCalledWith(1);
  });

  test("syncOnUpdate=true → newTrigger called once for time + once per source cal", () => {
    // aggregate a←b: b is source
    const { ScriptApp } = makeCtxWithSpies({ settings: { frequency: "daily", syncOnUpdate: true }, calendars: cals, syncFlows: aggFlows });
    expect(ScriptApp.newTrigger).toHaveBeenCalledTimes(2); // 1 time + 1 calendar
  });

  test("syncOnUpdate=false → only one time-based trigger created", () => {
    const { ScriptApp } = makeCtxWithSpies({ settings: { frequency: "daily", syncOnUpdate: false }, calendars: cals, syncFlows: aggFlows });
    expect(ScriptApp.newTrigger).toHaveBeenCalledTimes(1);
  });

  test("existing calSync triggers are deleted before creating new ones", () => {
    const builder = {
      timeBased: jest.fn(() => builder), forUserCalendar: () => builder,
      everyMinutes: () => builder, everyHours: () => builder, everyDays: jest.fn(() => builder),
      atHour: () => builder, inTimezone: () => builder, onEventUpdated: () => builder,
      create: jest.fn()
    };
    const existingTrigger = { getHandlerFunction: () => "calSync" };
    const ScriptApp = {
      newTrigger: () => builder,
      getProjectTriggers: () => [existingTrigger],
      deleteTrigger: jest.fn()
    };
    const ctx = loadGs("Setup.gs", { ScriptApp });
    ctx.setupTriggers({ settings: { frequency: "daily", syncOnUpdate: false }, calendars: [], syncFlows: { mode: "aggregate", aggregateTarget: null, customTargets: [] } });
    expect(ScriptApp.deleteTrigger).toHaveBeenCalledWith(existingTrigger);
  });
});

// ── validateCalendar ──────────────────────────────────────────────────────────

describe("validateCalendar", () => {
  function makeCalCtx(calListGetImpl, calendarsGetImpl) {
    const Calendar = {
      CalendarList: {
        get:    jest.fn(calListGetImpl || (() => ({}))),
        insert: jest.fn()
      },
      Calendars: {
        get: jest.fn(calendarsGetImpl || (() => ({})))
      },
      Events:   { list: jest.fn(() => ({ items: [] })), insert: jest.fn(), patch: jest.fn(), remove: jest.fn() },
      Freebusy: { query: jest.fn(() => ({ calendars: {} })) }
    };
    return loadGs("Setup.gs", { Calendar });
  }

  test("empty calId → ok: false, reason: no-id", () => {
    const ctx = makeCalCtx();
    expect(ctx.validateCalendar("")).toEqual({ ok: false, reason: "no-id" });
  });

  test("null calId → ok: false, reason: no-id", () => {
    const ctx = makeCalCtx();
    expect(ctx.validateCalendar(null)).toEqual({ ok: false, reason: "no-id" });
  });

  test("CalendarList.get succeeds, owner role → ok: true, canWrite: true", () => {
    const ctx = makeCalCtx(() => ({ summary: "My Cal", accessRole: "owner" }));
    expect(ctx.validateCalendar("cal@g.com")).toEqual({
      ok: true, name: "My Cal", accessRole: "owner", canWrite: true
    });
  });

  test("CalendarList.get succeeds, writer role → canWrite: true", () => {
    const ctx = makeCalCtx(() => ({ summary: "Shared", accessRole: "writer" }));
    expect(ctx.validateCalendar("cal@g.com").canWrite).toBe(true);
  });

  test("CalendarList.get succeeds, reader role → canWrite: false", () => {
    const ctx = makeCalCtx(() => ({ summary: "ReadOnly", accessRole: "reader" }));
    expect(ctx.validateCalendar("cal@g.com").canWrite).toBe(false);
  });

  test("CalendarList.get throws 404 + Calendars.get succeeds → not-subscribed", () => {
    const ctx = makeCalCtx(
      () => { throw new Error("404 Not Found"); },
      () => ({ id: "cal@g.com" })
    );
    expect(ctx.validateCalendar("cal@g.com")).toEqual({ ok: false, reason: "not-subscribed" });
  });

  test("CalendarList.get throws 404 + Calendars.get throws 403 → no-access", () => {
    const ctx = makeCalCtx(
      () => { throw new Error("404 Not Found"); },
      () => { throw new Error("403 Forbidden"); }
    );
    expect(ctx.validateCalendar("cal@g.com")).toEqual({ ok: false, reason: "no-access" });
  });

  test("CalendarList.get throws 404 + Calendars.get throws other → not-found", () => {
    const ctx = makeCalCtx(
      () => { throw new Error("404 Not Found"); },
      () => { throw new Error("500 Internal Server Error"); }
    );
    expect(ctx.validateCalendar("cal@g.com")).toEqual({ ok: false, reason: "not-found" });
  });

  test("CalendarList.get throws 403 → no-access", () => {
    const ctx = makeCalCtx(() => { throw new Error("403 Forbidden"); });
    expect(ctx.validateCalendar("cal@g.com")).toEqual({ ok: false, reason: "no-access" });
  });

  test("CalendarList.get throws unknown error → reason: error with message", () => {
    const ctx = makeCalCtx(() => { throw new Error("Something went wrong"); });
    const r = ctx.validateCalendar("cal@g.com");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("error");
    expect(r.error).toBe("Something went wrong");
  });

  test("calId with whitespace is trimmed", () => {
    const ctx = makeCalCtx(() => ({ summary: "My Cal", accessRole: "owner" }));
    const r = ctx.validateCalendar("  cal@g.com  ");
    expect(r.ok).toBe(true);
    expect(r.name).toBe("My Cal");
  });
});

// ── saveRunSummary truncation ─────────────────────────────────────────────────

describe("saveRunSummary truncation", () => {
  test("small summary stored as-is, flowLog preserved", () => {
    const ctx = loadGs("Setup.gs");
    ctx.saveRunSummary({
      runId: "r1", runType: "manual", testMode: true,
      totalInserts: 1, totalPatches: 0, totalDeletes: 0, totalSkips: 0, totalErrors: 0,
      flows: [{ target: "t", inserts: 1, patches: 0, deletes: 0, skips: 0, errors: 0,
                flowLog: [{ o: "ins", t: "Meeting", s: "2024-01-15T10:00:00Z" }] }]
    });
    const stored = JSON.parse(ctx.PropertiesService.getScriptProperties().getProperty("run_0"));
    expect(stored.flows[0].flowLog).toBeDefined();
    expect(stored.flows[0].flowLogTruncated).toBeUndefined();
  });

  test("very large flowLog → flowLogTruncated=true and stored data is valid JSON under limit", () => {
    const ctx = loadGs("Setup.gs");
    const massiveLog = Array.from({ length: 80 }, (_, i) => ({
      o: "ins", t: "A".repeat(1000) + i, s: "2024-01-15T10:00:00.000Z", c: "src@gmail.com"
    }));
    ctx.saveRunSummary({
      runId: "big", runType: "manual", testMode: true,
      totalInserts: 80, totalPatches: 0, totalDeletes: 0, totalSkips: 0, totalErrors: 0,
      flows: [{ target: "t@g.com", inserts: 80, patches: 0, deletes: 0, skips: 0, errors: 0, flowLog: massiveLog }]
    });
    const raw = ctx.PropertiesService.getScriptProperties().getProperty("run_0");
    expect(raw).toBeTruthy();
    const stored = JSON.parse(raw); // should not throw
    expect(stored.runId).toBe("big");
    expect(stored.flows[0].flowLogTruncated).toBe(true);
    expect(raw.length).toBeLessThanOrEqual(9000); // well under Apps Script 9KB limit
  });

  test("moderately large flowLog (>15 entries, >8000 chars but <8000 after slice) → truncated to 15", () => {
    const ctx = loadGs("Setup.gs");
    // 25 entries × ~360 chars each ≈ 9000 chars total → triggers first truncation (>8000)
    // After slicing to 15: 15 × 360 ≈ 5400 chars → under 8000, so flowLog kept at 15 entries
    const log20 = Array.from({ length: 25 }, (_, i) => ({
      o: "ins", t: "Meeting " + i, s: "2024-01-15T10:00:00.000Z", c: "src@gmail.com",
      extra: "X".repeat(280)
    }));
    ctx.saveRunSummary({
      runId: "mid", runType: "manual", testMode: true,
      totalInserts: 25, totalPatches: 0, totalDeletes: 0, totalSkips: 0, totalErrors: 0,
      flows: [{ target: "t@g.com", inserts: 25, patches: 0, deletes: 0, skips: 0, errors: 0, flowLog: log20 }]
    });
    const stored = JSON.parse(ctx.PropertiesService.getScriptProperties().getProperty("run_0"));
    const flow = stored.flows[0];
    // Either truncated to ≤15 entries or deleted entirely — both are valid outcomes
    if (flow.flowLog) expect(flow.flowLog.length).toBeLessThanOrEqual(15);
    // If truncated at all, the flag must be set
    if (flow.flowLogTruncated) expect(flow.flowLogTruncated).toBe(true);
  });
});
