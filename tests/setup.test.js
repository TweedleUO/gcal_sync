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
    ctx.saveConfigFromSidebar(saved);
    expect(ctx.getConfig()).toEqual(saved);
  });
});
