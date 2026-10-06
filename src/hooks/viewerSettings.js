export const VIEWER_SETTINGS_KEY = "linkpoint_viewer_settings";
export function readViewerSettings() {
  try { const saved = JSON.parse(localStorage.getItem(VIEWER_SETTINGS_KEY) || "{}"); return saved && typeof saved === "object" ? saved : {}; }
  catch { return {}; }
}
export function saveViewerSettings(settings) {
  try { localStorage.setItem(VIEWER_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Storage may be disabled by the browser. */ }
}
