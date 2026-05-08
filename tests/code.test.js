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
  beforeAll(() => { ctx = loadGs("Code.gs"); });

  test("returns true for a managed block", () => {
    const e = { extendedProperties: { private: { managedBy: "gcal-sync", srcKey: "cal|ID|123" } } };
    expect(ctx.isManagedBlock(e)).toBe(true);
  });

  test("returns false when managedBy is wrong", () => {
    const e = { extendedProperties: { private: { managedBy: "other-tool", srcKey: "cal|ID|123" } } };
    expect(ctx.isManagedBlock(e)).toBe(false);
  });

  test("returns false when srcKey is missing", () => {
    const e = { extendedProperties: { private: { managedBy: "gcal-sync" } } };
    expect(ctx.isManagedBlock(e)).toBe(false);
  });

  test("returns false when extendedProperties is absent", () => {
    expect(ctx.isManagedBlock({})).toBe(false);
  });
});
