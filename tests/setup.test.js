const { loadGs } = require("./helpers/load");

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
