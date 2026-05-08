/**
 * Minimal mocks for the Apps Script global APIs used by Code.gs and Setup.gs.
 * Each mock factory returns a fresh instance for test isolation.
 */
const crypto = require("crypto");

function makeMockUtilities() {
  return {
    DigestAlgorithm: { SHA_256: "SHA_256" },
    Charset: { UTF_8: "UTF_8" },

    // Replicate Apps Script's SHA-256 using Node crypto.
    // Returns an array of signed bytes (same as AS), which computeSig converts via (byte & 0xFF).
    computeDigest(_algo, payload) {
      const buf = crypto.createHash("sha256").update(payload, "utf8").digest();
      return [...buf].map(b => (b > 127 ? b - 256 : b));
    },

    // Returns a formatted date string for the given timezone and format pattern.
    // Only the patterns actually used in Code.gs are implemented.
    formatDate(date, tz, format) {
      const d = new Date(date);
      if (format === "Z") {
        // Apps Script returns offset as "+0530" or "-0500".
        // For UTC we return "+0000"; for named zones in tests use a fixed offset.
        const tzOffsets = { UTC: "+0000", "America/New_York": "-0500", "America/Los_Angeles": "-0800" };
        return tzOffsets[tz] || "+0000";
      }
      if (format === "yyyy-MM-dd") {
        // Format date in given timezone. Tests use UTC, so toISOString().slice works.
        return d.toISOString().slice(0, 10);
      }
      return d.toISOString();
    },

    sleep: jest.fn()
  };
}

function makeMockCalendar() {
  return {
    Events: {
      list:   jest.fn(() => ({ items: [] })),
      insert: jest.fn(),
      patch:  jest.fn(),
      remove: jest.fn()
    },
    Freebusy: {
      query: jest.fn(() => ({ calendars: {} }))
    },
    Calendars: {
      get: jest.fn()
    }
  };
}

function makeMockLockService() {
  return {
    getScriptLock: () => ({
      tryLock:     jest.fn(() => true),
      releaseLock: jest.fn()
    })
  };
}

function makeMockPropertiesService(initialStore = {}) {
  const store = { ...initialStore };
  const api = {
    getProperty:    (key)      => store[key] ?? null,
    setProperty:    (key, val) => { store[key] = val; },
    deleteProperty: (key)      => { delete store[key]; },
    _store: store
  };
  return { getScriptProperties: () => api };
}

function makeMockSession(tz = "UTC") {
  return { getScriptTimeZone: () => tz };
}

function makeMockScriptApp() {
  const triggers = [];
  const builder = {
    timeBased:        () => builder,
    forUserCalendar:  () => builder,
    everyMinutes:     () => builder,
    everyHours:       () => builder,
    everyDays:        () => builder,
    atHour:           () => builder,
    inTimezone:       () => builder,
    onEventUpdated:   () => builder,
    create:           jest.fn(() => { triggers.push({ getHandlerFunction: () => "calSync" }); })
  };
  return {
    getProjectTriggers: () => [...triggers],
    deleteTrigger:      jest.fn(),
    newTrigger:         () => builder,
    _triggers:          triggers
  };
}

module.exports = {
  makeMockUtilities,
  makeMockCalendar,
  makeMockLockService,
  makeMockPropertiesService,
  makeMockSession,
  makeMockScriptApp
};
