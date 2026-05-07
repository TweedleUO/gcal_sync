/**
 * Setup — config storage, trigger management, web app entry point, sidebar handlers.
 */

const PROP_CONFIG = "config";
const PROP_LAST_RUN = "lastRun";

// ── Web App ───────────────────────────────────────────────────────────────────

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Sidebar")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setTitle("Calendar Sync Setup");
}

// ── Config ────────────────────────────────────────────────────────────────────

function getDefaultConfig() {
  return {
    calendars: [],
    syncFlows: {
      mode: "aggregate",        // "aggregate" | "mesh" | "custom"
      aggregateTarget: null,
      customTargets: []         // [{target: id, sources: [id, ...]}]
    },
    settings: {
      timeFrameDays: 30,
      frequency: "daily",       // "every15"|"every30"|"hourly"|"every4h"|"daily"
      syncOnUpdate: true,
      enableReminder: false,
      testMode: true
    }
  };
}

function getConfig() {
  const raw = PropertiesService.getScriptProperties().getProperty(PROP_CONFIG);
  if (!raw) return getDefaultConfig();
  try {
    return JSON.parse(raw);
  } catch (_) {
    return getDefaultConfig();
  }
}

function getConfigForSidebar() {
  return getConfig();
}

function saveConfigFromSidebar(json) {
  const config = typeof json === "string" ? JSON.parse(json) : json;
  PropertiesService.getScriptProperties().setProperty(PROP_CONFIG, JSON.stringify(config));
  setupTriggers(config);
  return { ok: true };
}

// ── Flow Resolution ───────────────────────────────────────────────────────────

/**
 * Converts the syncFlows config block into a flat list of {targetCal, sourceCals} pairs.
 * Each pair drives one pass of runFlow().
 */
function resolveFlows(config) {
  const { calendars, syncFlows } = config;
  if (!calendars || !calendars.length) return [];
  const calById = Object.fromEntries(calendars.map(c => [c.id, c]));
  const flows = [];

  if (syncFlows.mode === "aggregate") {
    const targetId = syncFlows.aggregateTarget;
    if (!targetId || !calById[targetId]) return [];
    const targetCal = calById[targetId];
    const sourceCals = calendars.filter(c => c.id !== targetId);
    if (sourceCals.length) flows.push({ targetCal, sourceCals });

  } else if (syncFlows.mode === "mesh") {
    for (const targetCal of calendars) {
      const sourceCals = calendars.filter(c => c.id !== targetCal.id);
      if (sourceCals.length) flows.push({ targetCal, sourceCals });
    }

  } else if (syncFlows.mode === "custom") {
    for (const ct of (syncFlows.customTargets || [])) {
      const targetCal = calById[ct.target];
      if (!targetCal) continue;
      const sourceCals = (ct.sources || []).map(id => calById[id]).filter(Boolean);
      if (sourceCals.length) flows.push({ targetCal, sourceCals });
    }
  }

  return flows;
}

// ── Triggers ──────────────────────────────────────────────────────────────────

function setupTriggers(config) {
  clearTriggers();
  const { settings } = config;

  const freqMap = {
    every15: () => ScriptApp.newTrigger("calSync").timeBased().everyMinutes(15).create(),
    every30: () => ScriptApp.newTrigger("calSync").timeBased().everyMinutes(30).create(),
    hourly:  () => ScriptApp.newTrigger("calSync").timeBased().everyHours(1).create(),
    every4h: () => ScriptApp.newTrigger("calSync").timeBased().everyHours(4).create(),
    daily:   () => ScriptApp.newTrigger("calSync").timeBased().everyDays(1)
                     .atHour(0).inTimezone(Session.getScriptTimeZone()).create()
  };

  const createTimeTrigger = freqMap[settings.frequency] || freqMap.daily;
  createTimeTrigger();

  if (settings.syncOnUpdate) {
    for (const calId of getSourceCalendarIds(config)) {
      ScriptApp.newTrigger("calSync").forUserCalendar(calId).onEventUpdated().create();
    }
  }
}

function clearTriggers() {
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === "calSync") {
      ScriptApp.deleteTrigger(t);
    }
  }
}

function getSourceCalendarIds(config) {
  const flows = resolveFlows(config);
  const ids = new Set();
  for (const { sourceCals } of flows) {
    for (const c of sourceCals) ids.add(c.calendarId);
  }
  return [...ids];
}

// ── Run Summary ───────────────────────────────────────────────────────────────

function saveRunSummary(summary) {
  PropertiesService.getScriptProperties().setProperty(
    PROP_LAST_RUN,
    JSON.stringify({ ...summary, ts: new Date().toISOString() })
  );
}

function getLastRunSummary() {
  const raw = PropertiesService.getScriptProperties().getProperty(PROP_LAST_RUN);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

// ── Actions ───────────────────────────────────────────────────────────────────

function runSyncNow() {
  calSync();
  return getLastRunSummary();
}

/**
 * Removes all managed blocks from the given calendar IDs.
 * Respects testMode — logs only if testMode is true.
 */
function cleanupCalendars(calendarIds) {
  const config = getConfig();
  const start = new Date(2000, 0, 1).toISOString();
  const end = new Date(2100, 0, 1).toISOString();
  let removed = 0;

  for (const calId of (calendarIds || [])) {
    const events = listEvents(calId, start, end).filter(isManagedBlock);
    for (const e of events) {
      if (!config.settings.testMode) {
        retry(() => Calendar.Events.remove(calId, e.id), "remove(cleanup)");
      }
      removed++;
    }
  }

  return { removed, testMode: config.settings.testMode };
}

function resetConfig() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_CONFIG);
  props.deleteProperty(PROP_LAST_RUN);
  clearTriggers();
  return { ok: true };
}
