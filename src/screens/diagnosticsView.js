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
  if (!isNum(pct) || pct < 0) return { text: UNKNOWN, tone: "none", note: "No loss statistics from the simulator" };
  return { text: pct.toFixed(1), tone: pct === 0 ? "ok" : pct < 1.5 ? "warn" : "err", note: pct === 0 ? "No loss reported" : "Loss reported" };
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
  return v === null ? "Ping probe returned no latency measurement" : `Ping complete: ${Math.round(v)} ms latency`;
}

/** Event queue state from the connection's real flag. */
export function eventQueueState(connected, running) {
  if (!connected) return { text: "NOT CONNECTED", tone: "none" };
  return running ? { text: "RUNNING", tone: "ok" } : { text: "STOPPED", tone: "err" };
}

/** Dual-mode connection status formatting. */
export function formatConnectionStatus(isConnected, gridName, simName) {
  const grid = show(gridName);
  const sim = show(simName);
  return {
    title: "CONNECTION STATUS",
    statusText: isConnected ? "CONNECTED" : "OFFLINE",
    summary: isConnected ? `Connected to ${grid} (${sim})` : "Not connected to world",
    raw: { isConnected, grid, simName: sim },
  };
}

/** Dual-mode response time / latency formatting. */
export function formatLatencySummary(ms) {
  const band = latencyBand(ms);
  const friendlyLabel =
    band.tone === "ok"
      ? "Excellent Response"
      : band.tone === "warn"
      ? "Normal Response"
      : band.tone === "err"
      ? "Degraded Response"
      : "No Signal";
  return {
    title: "WORLD RESPONSE TIME",
    value: band.text,
    unit: "MS",
    label: band.label,
    friendlyLabel,
    tone: band.tone,
    note: "Time taken to communicate with the world",
  };
}

/** Dual-mode packet loss / stability formatting. */
export function formatLossSummary(pct) {
  const band = lossBand(pct);
  const friendlyLabel =
    band.tone === "ok"
      ? "Stable Connection"
      : band.tone === "warn"
      ? "Minor Lost Packets"
      : band.tone === "err"
      ? "Unstable Connection"
      : "No Loss Data";
  return {
    title: "CONNECTION STABILITY",
    value: band.text,
    unit: band.text !== UNKNOWN ? "%" : "",
    label: friendlyLabel,
    tone: band.tone,
    note: band.note,
  };
}

/** Dual-mode packet age / activity formatting. */
export function formatLastUpdate(lastTs, now) {
  const ageMs = packetAgeMs(lastTs, now);
  if (ageMs === null) {
    return {
      title: "LAST WORLD UPDATE",
      value: UNKNOWN,
      unit: "",
      friendlyLabel: "No Activity",
      tone: "none",
      note: "No recent activity recorded",
    };
  }
  const ageSec = (ageMs / 1000).toFixed(1);
  const tone = ageMs < 3000 ? "ok" : ageMs < 8000 ? "warn" : "err";
  const friendlyLabel = ageMs < 3000 ? "Recent Update" : ageMs < 8000 ? "Delayed Update" : "Stale Update";
  return {
    title: "LAST WORLD UPDATE",
    value: ageSec,
    unit: "SEC AGO",
    friendlyLabel,
    tone,
    note: `Updated ${new Date(lastTs).toLocaleTimeString()}`,
  };
}

/** Dual-mode raw technical parameters formatting for expandable technical view. */
export function formatTechnicalDetails(diag = {}, protocol = {}, authUser = {}) {
  const isConnected = Boolean(diag?.connected || authUser?.id);
  const eqState = eventQueueState(isConnected, protocol?.eventQueueRunning);
  return {
    protocolClass: "SLConnectionFull",
    udpPort: show(positiveOrNull(diag?.simPort)),
    circuitCode: show(positiveOrNull(diag?.circuitCode)),
    seedCapability: show(protocol?.seedCapability),
    agentUuid: show(diag?.agentId || authUser?.id),
    eventQueueState: eqState.text,
    eventQueueTone: eqState.tone,
  };
}

