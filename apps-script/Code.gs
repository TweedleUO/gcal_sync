/**
 * Calendar Busy-Only Sync (Apps Script)
 *
 * Mirrors busy time from source calendars onto target calendars as placeholder
 * blocks — without copying private event details.
 *
 * Requirements:
 *  - Advanced Google Calendar API enabled in Apps Script (Services → Calendar API)
 *  - Config saved via the Setup web app (or saveConfigFromSidebar in Setup.gs)
 */

// Lazy — Session.getEffectiveUser() returns "" on time-based/calendar triggers,
// and can throw if the userinfo.email scope was not granted at authorization time.
// Owner email is persisted at save time so trigger runs resolve the correct value.
let _managedBy = null;
function getManagedBy() {
  if (!_managedBy) {
    let email = PropertiesService.getScriptProperties().getProperty("ownerEmail") || "";
    if (!email) { try { email = Session.getEffectiveUser().getEmail(); } catch (_) {} }
    _managedBy = "gcal-sync:" + (email || "unknown");
  }
  return _managedBy;
}
const RETRY = {
  maxAttempts: 6,
  initialDelayMs: 300,
  maxDelayMs: 8000,
  jitterMs: 150
};

// Set at the start of calSync() and available to runFlow() / buildBlockBody()
let CONFIG;

// ── Entry Point ───────────────────────────────────────────────────────────────

function calSync(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) {
    console.log(JSON.stringify({ level: "WARN", msg: "Another instance already running — skipping" }));
    return { skipped: true };
  }

  const runType = e && e.calendarId ? "calendar-update"
                : e && e.triggerUid  ? "scheduled"
                : "manual";

  CONFIG = getConfig();
  const runId = `${new Date().toISOString()}:${Math.random().toString(16).slice(2)}`;
  const log = makeLogger(runId);
  const summary = { runId, runType, flows: [], totalInserts: 0, totalPatches: 0, totalDeletes: 0, totalSkips: 0, totalErrors: 0 };

  try {
    const flows = resolveFlows(CONFIG);
    if (!flows.length) {
      log.warn("No sync flows configured — nothing to do");
      saveRunSummary({ ...summary, warning: "No sync flows configured" });
      return;
    }

    const tz = Session.getScriptTimeZone() || "UTC";
    const { timeMinISO, timeMaxISO } = syncWindow(CONFIG.settings.timeFrameDays, tz);

    log.info("Starting sync", {
      flowCount: flows.length,
      timeMinISO,
      timeMaxISO,
      testMode: CONFIG.settings.testMode
    });

    for (const flow of flows) {
      log.info("Running flow", { target: flow.targetCal.id, sources: flow.sourceCals.map(c => c.id) });
      try {
        const result = runFlow({ ...flow, timeMinISO, timeMaxISO, tz, log });
        summary.flows.push({ target: flow.targetCal.id, ...result });
        summary.totalInserts += result.inserts;
        summary.totalPatches += result.patches;
        summary.totalDeletes += result.deletes;
        summary.totalSkips  += result.skips;
        summary.totalErrors += result.errors;
      } catch (flowErr) {
        const msg = flowErr.message || String(flowErr);
        log.error("Flow failed", { target: flow.targetCal.id, error: msg });
        summary.flows.push({
          target: flow.targetCal.id,
          inserts: 0, patches: 0, deletes: 0, skips: 0, errors: 1,
          flowLog: [{ o: "err", e: msg }]
        });
        summary.totalErrors++;
      }
    }

    log.info("All flows complete", {
      totalInserts: summary.totalInserts,
      totalPatches: summary.totalPatches,
      totalDeletes: summary.totalDeletes,
      totalSkips:   summary.totalSkips,
      totalErrors:  summary.totalErrors
    });

    summary.testMode = CONFIG.settings.testMode;
    saveRunSummary(summary);
  } catch (err) {
    log.error("Sync failed", { error: err.message });
    saveRunSummary({ ...summary, error: err.message, totalErrors: summary.totalErrors + 1 });
    throw err;
  } finally {
    lock.releaseLock();
  }
}

// ── Flow Runner ───────────────────────────────────────────────────────────────

function runFlow({ targetCal, sourceCals, timeMinISO, timeMaxISO, tz, log }) {
  const targetCalId = targetCal.calendarId;
  if (!targetCalId) throw new Error(`Calendar "${targetCal.name || targetCal.id}" has no ID configured — open Setup and enter its calendar ID`);

  // 1. Build desired state from source calendars
  // desired map stores body/sig plus lightweight fields for the activity log
  const desired = new Map(); // srcKey → { body, sig, srcCalId, srcTitle, startStr }
  let hasTimedCandidates = false;

  for (const srcCal of sourceCals) {
    const srcCalId = srcCal.calendarId;
    if (!srcCalId) {
      log.warn("Skipping source calendar with no ID", { cal: srcCal.name || srcCal.id });
      continue;
    }
    for (const srcEvent of listEvents(srcCalId, timeMinISO, timeMaxISO)) {
      if (isAnyManagedBlock(srcEvent)) continue; // chain prevention — skip all instances

      const norm = normalizeEvent(srcEvent);
      if (!norm || norm.transparency === "transparent") continue;
      if (targetCal.weekdayEventsOnly && isWeekend(norm)) continue;
      if (norm.allDay && !targetCal.acceptAllDayEvents) continue;

      const srcKey = buildSrcKey(srcCalId, srcEvent, norm);
      const body = buildBlockBody({ srcKey, norm, srcCalId, srcEvent, srcCal, targetCal, tz });
      const startStr = norm.allDay ? norm.startDate : norm.start.toISOString();
      desired.set(srcKey, {
        body, sig: getPrivate(body).sig,
        srcCalId, srcTitle: srcEvent.summary || null, startStr
      });

      if (!targetCal.allowDoubleBooking && !norm.allDay) hasTimedCandidates = true;
    }
  }

  log.info("Desired state built", { targetCalId, count: desired.size });

  // 2. Load existing managed blocks; remove duplicates on sight.
  //    Use privateExtendedProperty filter so only managed blocks are returned —
  //    avoids loading the full target calendar event list on each run.
  const existing = new Map(); // srcKey → eventResource (first seen wins)
  const flowLog  = [];        // per-event activity entries for the run summary

  for (const e of listManagedBlocks(targetCalId, timeMinISO, timeMaxISO)) {
    const k = readSrcKey(e);
    if (!k) continue;

    if (existing.has(k)) {
      log.warn("Removing duplicate managed event", { id: e.id, srcKey: k });
      flowLog.push({ o: "dupe", id: e.id, k });
      if (!CONFIG.settings.testMode) retry(() => Calendar.Events.remove(targetCalId, e.id), "remove(dupe)");
    } else {
      existing.set(k, e);
    }
  }

  log.info("Existing managed blocks indexed", { targetCalId, count: existing.size });

  // 3. Freebusy — only fetch when needed
  const busyRanges = (!targetCal.allowDoubleBooking && hasTimedCandidates)
    ? getBusy(targetCalId, timeMinISO, timeMaxISO, log)
    : null;

  // 4. Upsert: insert missing, patch changed
  let inserts = 0, patches = 0, deletes = 0, skips = 0, errors = 0;

  for (const [key, { body, sig, srcCalId, srcTitle, startStr }] of desired) {
    const cur = existing.get(key);

    if (!cur) {
      if (!targetCal.allowDoubleBooking && busyRanges && isTimedEvent(body)) {
        if (overlapsAny(busyRanges, body.start.dateTime, body.end.dateTime)) {
          skips++;
          flowLog.push({ o: "skip", r: "overlap", t: srcTitle, s: startStr, c: srcCalId });
          continue;
        }
      }
      inserts++;
      flowLog.push({ o: "ins", t: srcTitle, s: startStr, c: srcCalId });
      if (!CONFIG.settings.testMode) {
        try {
          retry(() => Calendar.Events.insert(body, targetCalId, { sendUpdates: "none" }), "insert");
        } catch (e) {
          errors++;
          flowLog.push({ o: "err", r: "insert", t: srcTitle, s: startStr, e: e.message });
          log.error("Insert failed", { srcKey: key, error: e.message });
        }
      }
      continue;
    }

    if (readSig(cur) === sig) { skips++; continue; }
    patches++;
    flowLog.push({ o: "patch", t: srcTitle, s: startStr, c: srcCalId });
    if (!CONFIG.settings.testMode) {
      try {
        retry(() => Calendar.Events.patch(patchBody(body), targetCalId, cur.id, { sendUpdates: "none" }), "patch");
      } catch (e) {
        errors++;
        flowLog.push({ o: "err", r: "patch", t: srcTitle, s: startStr, e: e.message });
        log.error("Patch failed", { srcKey: key, eventId: cur.id, error: e.message });
      }
    }
  }

  // 5. Delete orphans
  for (const [key, e] of existing) {
    if (!desired.has(key)) {
      deletes++;
      const s = e.start?.dateTime || e.start?.date || null;
      flowLog.push({ o: "del", t: e.summary || null, s });
      if (!CONFIG.settings.testMode) {
        try {
          retry(() => Calendar.Events.remove(targetCalId, e.id), "remove(orphan)");
        } catch (err) {
          errors++;
          flowLog.push({ o: "err", r: "delete", t: e.summary || null, s, e: err.message });
          log.error("Delete failed", { srcKey: key, eventId: e.id, error: err.message });
        }
      }
    }
  }

  log.info("Flow complete", { targetCalId, inserts, patches, deletes, skips, errors });
  return {
    inserts, patches, deletes, skips, errors,
    srcCalIds: sourceCals.map(c => c.calendarId),
    flowLog
  };
}

// ── Window ────────────────────────────────────────────────────────────────────

function syncWindow(days, tz) {
  const now = new Date();
  // Build midnight-in-script-timezone as a proper ISO offset string
  const offsetFmt = Utilities.formatDate(now, tz, "Z");              // e.g. "-0500" or "Z" for UTC
  const offsetISO = offsetFmt === "Z" ? "+00:00"
                  : offsetFmt.slice(0, 3) + ":" + offsetFmt.slice(3); // "-05:00" / "+05:30"
  const todayStr  = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  const min = new Date(todayStr + "T00:00:00" + offsetISO);
  const max = new Date(min);
  max.setDate(min.getDate() + days);
  return { timeMinISO: min.toISOString(), timeMaxISO: max.toISOString() };
}

// ── Calendar API ──────────────────────────────────────────────────────────────

function fetchEvents(calId, timeMinISO, timeMaxISO, extra, label) {
  const results = [];
  let pageToken = null;
  do {
    const resp = retry(() => Calendar.Events.list(calId, {
      timeMin: timeMinISO, timeMax: timeMaxISO,
      singleEvents: true, showDeleted: false,
      maxResults: 2500, pageToken, ...extra
    }), label);
    if (resp.items?.length) results.push(...resp.items);
    pageToken = resp.nextPageToken || null;
  } while (pageToken);
  return results;
}

function listEvents(calId, timeMinISO, timeMaxISO) {
  return fetchEvents(calId, timeMinISO, timeMaxISO, { orderBy: "startTime" }, "Events.list");
}

function listManagedBlocks(calId, timeMinISO, timeMaxISO) {
  return fetchEvents(calId, timeMinISO, timeMaxISO, { privateExtendedProperty: `managedBy=${getManagedBy()}` }, "Events.list(managed)");
}

function getBusy(calId, timeMinISO, timeMaxISO, log) {
  const resp = retry(() => Calendar.Freebusy.query({
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    items: [{ id: calId }]
  }), "Freebusy.query");
  const busy = resp.calendars?.[calId]?.busy ?? [];
  log.info("Freebusy loaded", { busyCount: busy.length });
  return busy;
}

// ── Normalize & Key ───────────────────────────────────────────────────────────

function normalizeEvent(item) {
  if (!item || item.status === "cancelled") return null;
  const transparency = item.transparency || "opaque";

  if (item.start?.dateTime) {
    if (!item.end?.dateTime) return null;
    return { start: new Date(item.start.dateTime), end: new Date(item.end.dateTime), allDay: false, transparency };
  }
  if (item.start?.date) {
    if (!item.end?.date) return null;
    return { startDate: item.start.date, endDate: item.end.date, allDay: true, transparency };
  }
  return null;
}

function buildSrcKey(calId, item, norm) {
  if (item.recurringEventId) {
    let ost;
    if (item.originalStartTime?.dateTime) {
      // Normalize to UTC — Google API can return different TZ formats for the same instant
      ost = new Date(item.originalStartTime.dateTime).toISOString();
    } else {
      ost = item.originalStartTime?.date
        || (norm.allDay ? norm.startDate : norm.start.toISOString());
    }
    return `${calId}|RI|${item.recurringEventId}|${ost}`;
  }
  return item.iCalUID
    ? `${calId}|UID|${item.iCalUID}`
    : `${calId}|ID|${item.id}`;
}

function isWeekend(norm) {
  const d = norm.allDay
    ? new Date(norm.startDate + "T12:00:00").getDay()
    : norm.start.getDay();
  return d === 0 || d === 6;
}

// ── Managed Block Helpers ─────────────────────────────────────────────────────

function getPrivate(e) {
  return e.extendedProperties?.private ?? null;
}

function isManagedBlock(e) {
  const p = getPrivate(e);
  return !!(p && p.managedBy === getManagedBy() && p.srcKey);
}

// Matches managed blocks from any account running this app — used for chain
// prevention so no instance re-syncs another instance's placeholder blocks.
function isAnyManagedBlock(e) {
  const p = getPrivate(e);
  return !!(p && typeof p.managedBy === "string" &&
            (p.managedBy === "gcal-sync" || p.managedBy.startsWith("gcal-sync:")) &&
            p.srcKey);
}

function readSrcKey(e) {
  const k = getPrivate(e)?.srcKey;
  return k ? String(k).trim() : null;
}

function readSig(e) {
  const s = getPrivate(e)?.sig;
  return s ? String(s) : null;
}

// ── Block Body ────────────────────────────────────────────────────────────────

/**
 * Builds the Calendar event resource for a managed block.
 *
 * Visibility modes:
 *  fullyPrivate — blockTitle only, marked private; no source details visible anywhere
 *  private      — blockTitle (or original title if privateShowOriginalTitle), marked private
 *  mirror       — full passthrough of source event fields; recurring instances become individual events
 */
function buildBlockBody({ srcKey, norm, srcCalId, srcEvent, srcCal, targetCal, tz }) {
  const mode = srcCal.visibility || "fullyPrivate";
  const blockTitle = srcCal.blockTitle || "Blocked";

  const priv = {
    managedBy: getManagedBy(),
    srcKey,
    sig: "",
    srcCalId: srcCalId || "",
    srcEventId: srcEvent.id || "",
    srcRecurringEventId: srcEvent.recurringEventId || "",
    srcICalUID: srcEvent.iCalUID || ""
  };

  const body = { extendedProperties: { private: priv } };

  if (norm.allDay) {
    body.start = { date: norm.startDate };
    body.end   = { date: norm.endDate };
  } else {
    body.start = { dateTime: norm.start.toISOString(), timeZone: tz };
    body.end   = { dateTime: norm.end.toISOString(),   timeZone: tz };
  }

  if (mode === "fullyPrivate") {
    body.summary    = blockTitle;
    body.visibility = "private";
    body.reminders  = { useDefault: false };

  } else if (mode === "private") {
    body.summary    = (srcCal.privateShowOriginalTitle && srcEvent.summary)
                        ? srcEvent.summary
                        : blockTitle;
    body.visibility = "private";
    body.reminders  = { useDefault: false };

  } else if (mode === "mirror") {
    body.summary = srcEvent.summary || blockTitle;
    if (srcEvent.description) body.description = srcEvent.description;
    if (srcEvent.location)    body.location    = srcEvent.location;
    if (srcEvent.visibility)  body.visibility  = srcEvent.visibility;
    if (srcEvent.colorId)     body.colorId     = srcEvent.colorId;
    body.reminders = CONFIG.settings.enableReminder
      ? (srcEvent.reminders || { useDefault: true })
      : { useDefault: false };
    if (srcEvent.attendees && srcEvent.attendees.length > 0) {
      // sendUpdates:'none' is passed at insert/patch time — attendees are copied for display only
      body.attendees = srcEvent.attendees.map(a => ({ email: a.email }));
    }
  }

  priv.sig = computeSig(body);
  return body;
}

function patchBody(b) {
  const patch = {
    summary: b.summary,
    start: b.start,
    end: b.end,
    reminders: b.reminders,
    extendedProperties: b.extendedProperties
  };
  if (b.description !== undefined) patch.description = b.description;
  if (b.location    !== undefined) patch.location    = b.location;
  if (b.visibility  !== undefined) patch.visibility  = b.visibility;
  if (b.colorId     !== undefined) patch.colorId     = b.colorId;
  if (b.attendees   !== undefined) patch.attendees   = b.attendees;
  return patch;
}

// ── Signature ─────────────────────────────────────────────────────────────────

function computeSig(body) {
  const p = getPrivate(body) ?? {};
  const payload = JSON.stringify({
    summary:     body.summary     || "",
    description: body.description || "",
    location:    body.location    || "",
    start:       body.start       || {},
    end:         body.end         || {},
    visibility:  body.visibility  || "",
    colorId:     body.colorId     || "",
    reminders:   body.reminders   || null,
    attendees:   body.attendees   || null,
    managedBy:   p.managedBy      || "",
    srcKey:      p.srcKey         || ""
  });
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload, Utilities.Charset.UTF_8)
    .map(byte => (byte & 0xFF).toString(16).padStart(2, "0"))
    .join("");
}

// ── Overlap / Timing ──────────────────────────────────────────────────────────

function isTimedEvent(body) {
  return !!body?.start?.dateTime;
}

function overlapsAny(ranges, startISO, endISO) {
  const s = Date.parse(startISO), e = Date.parse(endISO);
  return ranges.some(r => s < Date.parse(r.end) && e > Date.parse(r.start));
}

// ── Retry / Backoff ───────────────────────────────────────────────────────────

function retry(fn, label) {
  const { maxAttempts, initialDelayMs, maxDelayMs, jitterMs } = RETRY;
  let delay = initialDelayMs;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return fn();
    } catch (e) {
      const msg = e?.message ?? String(e);
      const retryable = /429|Rate Limit|rateLimitExceeded|userRateLimitExceeded|backendError|Backend Error|Internal error|503|Service unavailable|Service invoked too many times|quota/i.test(msg);
      if (!retryable || attempt === maxAttempts) {
        throw new Error(`${label} failed (attempt ${attempt}/${maxAttempts}): ${msg}`);
      }
      Utilities.sleep(delay + Math.floor(Math.random() * jitterMs));
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }
}

// ── Logger ────────────────────────────────────────────────────────────────────

function makeLogger(runId) {
  const emit = (level, msg, obj) =>
    console.log(JSON.stringify({ level, runId, msg, ts: new Date().toISOString(), ...(obj || {}) }));
  return {
    info:  (msg, obj) => emit("INFO",  msg, obj),
    warn:  (msg, obj) => emit("WARN",  msg, obj),
    error: (msg, obj) => emit("ERROR", msg, obj)
  };
}

// ── Utilities / Maintenance ───────────────────────────────────────────────────

/**
 * Removes all managed blocks from every configured target calendar.
 * Useful when resetting. Respects testMode.
 */
function removeAllManagedBlocks() {
  const config = getConfig();
  const flows  = resolveFlows(config);
  const targetCalIds = [...new Set(flows.map(f => f.targetCal.calendarId))];
  const start = new Date(2000, 0, 1).toISOString();
  const end   = new Date(2100, 0, 1).toISOString();

  for (const calId of targetCalIds) {
    const events = listManagedBlocks(calId, start, end);
    for (const e of events) {
      if (!config.settings.testMode) retry(() => Calendar.Events.remove(calId, e.id), "remove(cleanup)");
    }
    console.log(`Removed ${events.length} managed events from ${calId} (testMode=${config.settings.testMode})`);
  }
}

/**
 * Confirms the Advanced Calendar API is enabled and reachable for all configured calendars.
 */
function sanityCheckCalendarAdvancedService() {
  const config = getConfig();
  const calIds = config.calendars.map(c => c.calendarId).filter(Boolean);
  if (!calIds.length) { console.log("No calendars configured."); return; }
  for (const calId of calIds) {
    const cal = retry(() => Calendar.Calendars.get(calId), "Calendars.get");
    console.log("Advanced Calendar API OK.", cal.summary, "→", calId);
  }
}
