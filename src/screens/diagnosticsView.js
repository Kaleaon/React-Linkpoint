// Display rules for the Diagnostics screen. Anything the session has not
// reported is shown as "—"; nothing is substituted with a plausible default.

export const UNKNOWN = "—";

export const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Text for any value, "—" when unknown. */
export const show = (v) => (v === null || v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v)) ? UNKNOWN : String(v));

/** Ports, circuit codes and similar identifiers use 0 to mean "not set". */
export const positiveOrNull = (v) => (isNum(v) && v > 0 ? v : null);

/** A latency in ms is only real when it is a positive number. */
export const realLatency = (ms) => (isNum(ms) && ms > 0 ? ms : null);

export function latencyBand(ms) {
  const v = realLatency(ms);
  if (v === null) return { label: "NO DATA", tone: "none", text: UNKNOWN };
  if (v < 90) return { label: "EXCELLENT", tone: "ok", text: String(Math.round(v)) };
  if (v < 200) return { label: "NORMAL", tone: "warn", text: String(Math.round(v)) };
  return { label: "DEGRADED", tone: "err", text: String(Math.round(v)) };
}

export function lossBand(pct) {
  if (!isNum(pct) || pct < 0) return { text: UNKNOWN, tone: "none", note: "No connection stability statistics available" };
  return { text: pct.toFixed(1), tone: pct === 0 ? "ok" : pct < 1.5 ? "warn" : "err", note: pct === 0 ? "Connection stable (no packet loss)" : "Intermittent data loss detected" };
}

/** Append a latency sample, keeping only real ones and the most recent `max`. */
export function pushLatency(history, ms, max = 24) {
  const v = realLatency(ms);
  if (v === null) return history;
  const next = [...history, v];
  return next.length > max ? next.slice(-max) : next;
}

/** Min/max of the samples, or null when there are none. */
export function latencyRange(history) {
  return history.length ? { min: Math.min(...history), max: Math.max(...history) } : null;
}

/** Seconds since a timestamp, or null when no packet has been seen. */
export function packetAgeMs(lastTs, now) {
  return isNum(lastTs) && lastTs > 0 ? Math.max(0, now - lastTs) : null;
}

/** Notification text for a ping probe result. */
export function describePing(result) {
  const v = realLatency(result?.latencyMs);
  return v === null ? "Response check returned no measurement" : `Response check complete: ${Math.round(v)} ms response time`;
}

/** Event queue state from the connection's real flag. */
export function eventQueueState(connected, running) {
  if (!connected) return { text: "Not connected", tone: "none" };
  return running ? { text: "Active", tone: "ok" } : { text: "Inactive", tone: "err" };
}
