/**
 * Setup — config storage, trigger management, web app entry point, sidebar handlers.
 */

const PROP_CONFIG    = "config";
const PROP_LAST_RUN  = "lastRun";   // legacy — kept for migration reads only
const PROP_RUN_PFX   = "run_";
const MAX_RUNS       = 5;

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
  const config = getConfig();
  try { config._scriptEmail = Session.getEffectiveUser().getEmail(); } catch (_) {}
  return config;
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
  const data = { ...summary, ts: new Date().toISOString() };
  // Cap flowLog to stay within the 9KB per-property limit
  let str = JSON.stringify(data);
  if (str.length > 8000) {
    for (const flow of (data.flows || [])) {
      if (flow.flowLog && flow.flowLog.length > 15) {
        flow.flowLog = flow.flowLog.slice(0, 15);
        flow.flowLogTruncated = true;
      }
    }
    str = JSON.stringify(data);
    if (str.length > 8000) {
      for (const flow of (data.flows || [])) {
        delete flow.flowLog;
        flow.flowLogTruncated = true;
      }
    }
  }
  // Shift run slots: run_3→run_4, run_2→run_3, run_1→run_2, run_0→run_1
  const prop = PropertiesService.getScriptProperties();
  for (let i = MAX_RUNS - 1; i > 0; i--) {
    const prev = prop.getProperty(PROP_RUN_PFX + (i - 1));
    if (prev) prop.setProperty(PROP_RUN_PFX + i, prev);
    else prop.deleteProperty(PROP_RUN_PFX + i);
  }
  prop.setProperty(PROP_RUN_PFX + "0", JSON.stringify(data));
}

function getLastRunSummary() {
  const prop = PropertiesService.getScriptProperties();
  const runs = [];
  for (let i = 0; i < MAX_RUNS; i++) {
    const raw = prop.getProperty(PROP_RUN_PFX + i);
    if (!raw) break;
    try { runs.push(JSON.parse(raw)); } catch (_) { break; }
  }
  if (runs.length) return runs;
  // Migrate from old single-property format
  try {
    const raw = prop.getProperty(PROP_LAST_RUN);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (_) { return []; }
}

// ── Actions ───────────────────────────────────────────────────────────────────

function runSyncNow(configJson) {
  if (configJson) {
    const config = typeof configJson === "string" ? JSON.parse(configJson) : configJson;
    PropertiesService.getScriptProperties().setProperty(PROP_CONFIG, JSON.stringify(config));
  }
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

  const result = { removed, testMode: config.settings.testMode };
  saveRunSummary({
    runType: "cleanup",
    flows: [],
    removed,
    testMode: config.settings.testMode,
    totalInserts: 0, totalPatches: 0, totalDeletes: removed,
    totalSkips: 0, totalErrors: 0
  });
  return result;
}

function subscribeToCalendar(calId) {
  if (!calId || !calId.trim()) return { ok: false, reason: "no-id" };
  try {
    Calendar.CalendarList.insert({ id: calId.trim() });
    return validateCalendar(calId.trim());
  } catch (e) {
    const msg = (e.message || "").toLowerCase();
    const reason = (msg.includes("not found") || msg.includes("404")) ? "not-found"
                 : (msg.includes("forbidden") || msg.includes("403")) ? "no-access"
                 : "error";
    return { ok: false, reason, error: e.message };
  }
}

function validateCalendar(calId) {
  if (!calId || !calId.trim()) return { ok: false, reason: "no-id" };
  const id = calId.trim();
  try {
    // CalendarList.get returns the user's calendar list entry, which includes accessRole.
    // Calendar.Calendars.get returns the bare calendar resource and omits accessRole.
    const entry = Calendar.CalendarList.get(id);
    const canWrite = ["owner", "writer"].includes(entry.accessRole);
    return { ok: true, name: entry.summary || id, accessRole: entry.accessRole, canWrite };
  } catch (e) {
    const msg = (e.message || "").toLowerCase();
    if (msg.includes("not found") || msg.includes("404")) {
      // Not in user's calendar list — check if the calendar exists at all
      try {
        Calendar.Calendars.get(id);
        // Exists but not subscribed — surface a subscribe prompt
        return { ok: false, reason: "not-subscribed" };
      } catch (e2) {
        const m2 = (e2.message || "").toLowerCase();
        return { ok: false, reason: m2.includes("forbidden") || m2.includes("403") ? "no-access" : "not-found" };
      }
    }
    if (msg.includes("forbidden") || msg.includes("403")) return { ok: false, reason: "no-access" };
    return { ok: false, reason: "error", error: e.message };
  }
}

function resetConfig() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_CONFIG);
  props.deleteProperty(PROP_LAST_RUN);
  for (let i = 0; i < MAX_RUNS; i++) props.deleteProperty(PROP_RUN_PFX + i);
  clearTriggers();
  return { ok: true };
}
