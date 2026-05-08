const { loadGs } = require("./helpers/load");

// Load once per describe block — each suite gets a fresh context
// to avoid test-order coupling.

// ── normalizeEvent ────────────────────────────────────────────────────────────

describe("normalizeEvent", () => {
  let ctx;
  beforeAll(() => { ctx = loadGs("Code.gs"); });

  test("null input → null", () => {
    expect(ctx.normalizeEvent(null)).toBeNull();
  });

  test("cancelled event → null", () => {
    expect(ctx.normalizeEvent({
      status: "cancelled",
      start: { dateTime: "2024-01-15T09:00:00Z" },
      end:   { dateTime: "2024-01-15T10:00:00Z" }
    })).toBeNull();
  });

  test("timed event → allDay false, Date objects", () => {
    const result = ctx.normalizeEvent({
      start: { dateTime: "2024-01-15T09:00:00-05:00" },
      end:   { dateTime: "2024-01-15T10:00:00-05:00" }
    });
    expect(result).not.toBeNull();
    expect(result.allDay).toBe(false);
    expect(result.start).toBeInstanceOf(Date);
    expect(result.end).toBeInstanceOf(Date);
    expect(result.start.toISOString()).toBe("2024-01-15T14:00:00.000Z");
  });

  test("all-day event → allDay true, date strings", () => {
    const result = ctx.normalizeEvent({
      start: { date: "2024-01-15" },
      end:   { date: "2024-01-16" }
    });
    expect(result).toEqual({
      startDate: "2024-01-15",
      endDate:   "2024-01-16",
      allDay:    true,
      transparency: "opaque"
    });
  });

  test("timed event missing end → null", () => {
    expect(ctx.normalizeEvent({ start: { dateTime: "2024-01-15T09:00:00Z" } })).toBeNull();
  });

  test("all-day event missing end → null", () => {
    expect(ctx.normalizeEvent({ start: { date: "2024-01-15" } })).toBeNull();
  });

  test("transparency is preserved", () => {
    const result = ctx.normalizeEvent({
      start: { dateTime: "2024-01-15T09:00:00Z" },
      end:   { dateTime: "2024-01-15T10:00:00Z" },
      transparency: "transparent"
    });
    expect(result.transparency).toBe("transparent");
  });

  test("missing transparency defaults to opaque", () => {
    const result = ctx.normalizeEvent({
      start: { dateTime: "2024-01-15T09:00:00Z" },
      end:   { dateTime: "2024-01-15T10:00:00Z" }
    });
    expect(result.transparency).toBe("opaque");
  });
});

// ── buildSrcKey ───────────────────────────────────────────────────────────────

describe("buildSrcKey", () => {
  let ctx;
  beforeAll(() => { ctx = loadGs("Code.gs"); });

  test("recurring event: dateTime originalStartTime normalized to UTC", () => {
    const item = {
      recurringEventId: "rec123",
      originalStartTime: { dateTime: "2024-01-15T09:00:00-05:00" }
    };
    const key = ctx.buildSrcKey("cal@gmail.com", item, {});
    expect(key).toBe("cal@gmail.com|RI|rec123|2024-01-15T14:00:00.000Z");
  });

  test("recurring event: different TZ representations of the same instant → same key", () => {
    const item1 = { recurringEventId: "rec123", originalStartTime: { dateTime: "2024-01-15T09:00:00-05:00" } };
    const item2 = { recurringEventId: "rec123", originalStartTime: { dateTime: "2024-01-15T14:00:00Z" } };
    expect(ctx.buildSrcKey("cal", item1, {})).toBe(ctx.buildSrcKey("cal", item2, {}));
  });

  test("recurring event: date originalStartTime used as-is", () => {
    const item = { recurringEventId: "rec123", originalStartTime: { date: "2024-01-15" } };
    const key = ctx.buildSrcKey("cal@gmail.com", item, {});
    expect(key).toBe("cal@gmail.com|RI|rec123|2024-01-15");
  });

  test("recurring event: falls back to norm.startDate when no originalStartTime", () => {
    const item = { recurringEventId: "rec123" };
    const norm = { allDay: true, startDate: "2024-01-15" };
    const key = ctx.buildSrcKey("cal@gmail.com", item, norm);
    expect(key).toBe("cal@gmail.com|RI|rec123|2024-01-15");
  });

  test("non-recurring with iCalUID → UID key", () => {
    const key = ctx.buildSrcKey("cal@gmail.com", { iCalUID: "abc@google.com" }, {});
    expect(key).toBe("cal@gmail.com|UID|abc@google.com");
  });

  test("non-recurring without iCalUID → ID key", () => {
    const key = ctx.buildSrcKey("cal@gmail.com", { id: "eventId123" }, {});
    expect(key).toBe("cal@gmail.com|ID|eventId123");
  });

  test("calendarId is part of the key (no collisions across calendars)", () => {
    const item = { iCalUID: "uid@google.com" };
    const k1 = ctx.buildSrcKey("work@gmail.com", item, {});
    const k2 = ctx.buildSrcKey("personal@gmail.com", item, {});
    expect(k1).not.toBe(k2);
  });
});

// ── overlapsAny ───────────────────────────────────────────────────────────────

describe("overlapsAny", () => {
  let ctx;
  beforeAll(() => { ctx = loadGs("Code.gs"); });

  const busy = [{ start: "2024-01-15T10:00:00Z", end: "2024-01-15T11:00:00Z" }];

  test("no overlap — event ends before range starts", () => {
    expect(ctx.overlapsAny(busy, "2024-01-15T08:00:00Z", "2024-01-15T09:00:00Z")).toBe(false);
  });

  test("no overlap — event starts after range ends", () => {
    expect(ctx.overlapsAny(busy, "2024-01-15T11:00:00Z", "2024-01-15T12:00:00Z")).toBe(false);
  });

  test("adjacent — event ends exactly when range starts (no overlap)", () => {
    expect(ctx.overlapsAny(busy, "2024-01-15T09:00:00Z", "2024-01-15T10:00:00Z")).toBe(false);
  });

  test("adjacent — event starts exactly when range ends (no overlap)", () => {
    expect(ctx.overlapsAny(busy, "2024-01-15T11:00:00Z", "2024-01-15T12:00:00Z")).toBe(false);
  });

  test("overlap — event fully inside range", () => {
    expect(ctx.overlapsAny(busy, "2024-01-15T10:15:00Z", "2024-01-15T10:45:00Z")).toBe(true);
  });

  test("overlap — event straddles range start", () => {
    expect(ctx.overlapsAny(busy, "2024-01-15T09:30:00Z", "2024-01-15T10:30:00Z")).toBe(true);
  });

  test("overlap — event straddles range end", () => {
    expect(ctx.overlapsAny(busy, "2024-01-15T10:30:00Z", "2024-01-15T11:30:00Z")).toBe(true);
  });

  test("overlap — event fully contains range", () => {
    expect(ctx.overlapsAny(busy, "2024-01-15T09:00:00Z", "2024-01-15T12:00:00Z")).toBe(true);
  });

  test("empty ranges array → never overlaps", () => {
    expect(ctx.overlapsAny([], "2024-01-15T10:00:00Z", "2024-01-15T11:00:00Z")).toBe(false);
  });

  test("matches second range when first does not overlap", () => {
    const ranges = [
      { start: "2024-01-15T08:00:00Z", end: "2024-01-15T09:00:00Z" },
      { start: "2024-01-15T10:00:00Z", end: "2024-01-15T11:00:00Z" }
    ];
    expect(ctx.overlapsAny(ranges, "2024-01-15T10:30:00Z", "2024-01-15T11:30:00Z")).toBe(true);
  });
});

// ── isWeekend ─────────────────────────────────────────────────────────────────

describe("isWeekend", () => {
  let ctx;
  beforeAll(() => { ctx = loadGs("Code.gs"); });

  // 2024-01-13 = Saturday, 2024-01-14 = Sunday, 2024-01-15 = Monday
  test("Saturday timed event → true", () => {
    expect(ctx.isWeekend({ start: new Date("2024-01-13T12:00:00Z"), allDay: false })).toBe(true);
  });

  test("Sunday timed event → true", () => {
    expect(ctx.isWeekend({ start: new Date("2024-01-14T12:00:00Z"), allDay: false })).toBe(true);
  });

  test("Monday timed event → false", () => {
    expect(ctx.isWeekend({ start: new Date("2024-01-15T12:00:00Z"), allDay: false })).toBe(false);
  });

  test("Saturday all-day event → true", () => {
    expect(ctx.isWeekend({ startDate: "2024-01-13", allDay: true })).toBe(true);
  });

  test("Monday all-day event → false", () => {
    expect(ctx.isWeekend({ startDate: "2024-01-15", allDay: true })).toBe(false);
  });
});

// ── isManagedBlock ────────────────────────────────────────────────────────────

describe("isManagedBlock", () => {
  let ctx;
  // MANAGED_BY is "gcal-sync:" + Session.getEffectiveUser().getEmail()
  // The mock returns "test@example.com", so MANAGED_BY = "gcal-sync:test@example.com"
  beforeAll(() => { ctx = loadGs("Code.gs"); });

  test("returns true for a managed block matching this account", () => {
    const e = { extendedProperties: { private: { managedBy: "gcal-sync:test@example.com", srcKey: "cal|ID|123" } } };
    expect(ctx.isManagedBlock(e)).toBe(true);
  });

  test("returns false for a block from a different account", () => {
    const e = { extendedProperties: { private: { managedBy: "gcal-sync:other@example.com", srcKey: "cal|ID|123" } } };
    expect(ctx.isManagedBlock(e)).toBe(false);
  });

  test("returns false when managedBy is a different tool", () => {
    const e = { extendedProperties: { private: { managedBy: "other-tool", srcKey: "cal|ID|123" } } };
    expect(ctx.isManagedBlock(e)).toBe(false);
  });

  test("returns false when srcKey is missing", () => {
    const e = { extendedProperties: { private: { managedBy: "gcal-sync:test@example.com" } } };
    expect(ctx.isManagedBlock(e)).toBe(false);
  });

  test("returns false when extendedProperties is absent", () => {
    expect(ctx.isManagedBlock({})).toBe(false);
  });
});

// ── syncWindow ────────────────────────────────────────────────────────────────

describe("syncWindow", () => {
  test("returns ISO strings spanning the requested number of days", () => {
    const ctx = loadGs("Code.gs");
    const { timeMinISO, timeMaxISO } = ctx.syncWindow(30, "UTC");
    const min = new Date(timeMinISO);
    const max = new Date(timeMaxISO);
    expect(isNaN(min)).toBe(false);
    expect(isNaN(max)).toBe(false);
    const diffDays = (max - min) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(30);
  });

  test("UTC timezone produces a valid date (not Invalid Date)", () => {
    const ctx = loadGs("Code.gs", {
      Session: { getScriptTimeZone: () => "UTC", getEffectiveUser: () => ({ getEmail: () => "t@example.com" }) },
      Utilities: {
        DigestAlgorithm: { SHA_256: "SHA_256" }, Charset: { UTF_8: "UTF_8" },
        computeDigest: () => [],
        sleep: jest.fn(),
        formatDate: (d, tz, fmt) => {
          if (fmt === "Z") return "Z";           // simulate GAS returning literal "Z" for UTC
          if (fmt === "yyyy-MM-dd") return new Date(d).toISOString().slice(0, 10);
          return new Date(d).toISOString();
        }
      }
    });
    const { timeMinISO, timeMaxISO } = ctx.syncWindow(7, "UTC");
    expect(new Date(timeMinISO).toString()).not.toBe("Invalid Date");
    expect(new Date(timeMaxISO).toString()).not.toBe("Invalid Date");
  });
});

// ── retry ─────────────────────────────────────────────────────────────────────

describe("retry", () => {
  test("retries on 'Backend Error' (spaced, capital B)", () => {
    const ctx = loadGs("Code.gs");
    let calls = 0;
    const fn = () => { calls++; if (calls < 2) throw new Error("Backend Error occurred"); return "ok"; };
    expect(ctx.retry(fn, "test")).toBe("ok");
    expect(calls).toBe(2);
  });

  test("retries on quota error message", () => {
    const ctx = loadGs("Code.gs");
    let calls = 0;
    const fn = () => { calls++; if (calls < 2) throw new Error("Quota exceeded for quota metric"); return "done"; };
    expect(ctx.retry(fn, "test")).toBe("done");
    expect(calls).toBe(2);
  });

  test("does not retry non-retryable errors", () => {
    const ctx = loadGs("Code.gs");
    let calls = 0;
    const fn = () => { calls++; throw new Error("Not Found"); };
    expect(() => ctx.retry(fn, "test")).toThrow("Not Found");
    expect(calls).toBe(1);
  });
});

// ── computeSig ────────────────────────────────────────────────────────────────

describe("computeSig", () => {
  let ctx;
  beforeAll(() => { ctx = loadGs("Code.gs"); });

  const base = {
    summary: "Meeting",
    start: { dateTime: "2024-03-10T10:00:00Z" },
    end:   { dateTime: "2024-03-10T11:00:00Z" },
    reminders: { useDefault: false },
    extendedProperties: { private: { managedBy: "gcal-sync:a@b.com", srcKey: "abc123", sig: "" } }
  };

  test("same body produces the same signature", () => {
    expect(ctx.computeSig(base)).toBe(ctx.computeSig(base));
  });

  test("returns a 64-char hex string", () => {
    expect(ctx.computeSig(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("different summary → different sig", () => {
    const other = { ...base, summary: "Different" };
    expect(ctx.computeSig(base)).not.toBe(ctx.computeSig(other));
  });

  test("different srcKey → different sig", () => {
    const other = {
      ...base,
      extendedProperties: { private: { ...base.extendedProperties.private, srcKey: "xyz999" } }
    };
    expect(ctx.computeSig(base)).not.toBe(ctx.computeSig(other));
  });

  test("sig field inside extendedProperties is excluded from hash", () => {
    const withSig = {
      ...base,
      extendedProperties: { private: { ...base.extendedProperties.private, sig: "somepreviousvalue" } }
    };
    expect(ctx.computeSig(base)).toBe(ctx.computeSig(withSig));
  });

  test("missing optional fields treated as empty — same sig as explicit empty", () => {
    const noOpts    = { ...base };
    const withEmpty = { ...base, description: "", location: "", visibility: "" };
    expect(ctx.computeSig(noOpts)).toBe(ctx.computeSig(withEmpty));
  });
});

// ── patchBody ─────────────────────────────────────────────────────────────────

describe("patchBody", () => {
  let ctx;
  beforeAll(() => { ctx = loadGs("Code.gs"); });

  test("always includes core fields", () => {
    const body = {
      summary: "X", start: { date: "2024-01-01" }, end: { date: "2024-01-02" },
      reminders: { useDefault: false }, extendedProperties: { private: {} }
    };
    const patch = ctx.patchBody(body);
    expect(patch).toHaveProperty("summary", "X");
    expect(patch).toHaveProperty("start");
    expect(patch).toHaveProperty("end");
    expect(patch).toHaveProperty("reminders");
    expect(patch).toHaveProperty("extendedProperties");
  });

  test("optional fields included only when present on body", () => {
    const body = {
      summary: "X", start: {}, end: {}, reminders: {}, extendedProperties: {},
      description: "desc", location: "loc", visibility: "private",
      colorId: "3", attendees: [{ email: "a@x.com" }]
    };
    const patch = ctx.patchBody(body);
    expect(patch.description).toBe("desc");
    expect(patch.location).toBe("loc");
    expect(patch.visibility).toBe("private");
    expect(patch.colorId).toBe("3");
    expect(patch.attendees).toEqual([{ email: "a@x.com" }]);
  });

  test("optional fields absent when not on body", () => {
    const body = { summary: "X", start: {}, end: {}, reminders: {}, extendedProperties: {} };
    const patch = ctx.patchBody(body);
    expect(patch).not.toHaveProperty("description");
    expect(patch).not.toHaveProperty("location");
    expect(patch).not.toHaveProperty("visibility");
    expect(patch).not.toHaveProperty("colorId");
    expect(patch).not.toHaveProperty("attendees");
  });
});

// ── buildBlockBody (R4: mirror mode attendees) ────────────────────────────────

describe("buildBlockBody mirror mode", () => {
  let ctx;
  const targetCal = { id: "t", calendarId: "target@gmail.com", name: "Target", visibility: "mirror", blockTitle: "Blocked" };
  const norm = { allDay: false, start: new Date("2024-03-10T10:00:00Z"), end: new Date("2024-03-10T11:00:00Z") };
  const baseArgs = { srcKey: "k1", norm, srcCalId: "src@gmail.com", targetCal, tz: "UTC" };

  beforeAll(() => {
    // buildBlockBody reads module-level CONFIG (set inside calSync). Inject mocks so
    // a calSync() call short-circuits after CONFIG = getConfig() without side effects.
    const mockConfig = {
      settings: { enableReminder: false, testMode: false, timeFrameDays: 30, frequency: "daily", syncOnUpdate: false },
      calendars: [], syncFlows: { mode: "aggregate", aggregateTarget: null, customTargets: [] }
    };
    ctx = loadGs("Code.gs", {
      getConfig:      () => mockConfig,
      resolveFlows:   () => [],
      saveRunSummary: () => {}
    });
    ctx.calSync(); // primes CONFIG
  });

  test("srcEvent with populated attendees → attendees copied", () => {
    const body = ctx.buildBlockBody({
      ...baseArgs,
      srcEvent: { id: "e1", summary: "Meeting", attendees: [{ email: "a@x.com" }, { email: "b@x.com" }] }
    });
    expect(body.attendees).toEqual([{ email: "a@x.com" }, { email: "b@x.com" }]);
  });

  test("srcEvent with empty attendees array → attendees not set on body", () => {
    const body = ctx.buildBlockBody({
      ...baseArgs,
      srcEvent: { id: "e2", summary: "Solo", attendees: [] }
    });
    expect(body.attendees).toBeUndefined();
  });

  test("srcEvent with no attendees property → attendees not set on body", () => {
    const body = ctx.buildBlockBody({
      ...baseArgs,
      srcEvent: { id: "e3", summary: "Solo" }
    });
    expect(body.attendees).toBeUndefined();
  });
});
