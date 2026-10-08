import { LAYOUTS, PALETTES } from "@linkpoint/design-system/tokens";

export const VIEWER_SETTINGS_KEY = "linkpoint_viewer_settings";
const TOGGLES = ["largeType", "push", "voice", "chatCmds", "autoresponse", "pttUse", "pttToggle", "rlv", "shadows", "battery", "timestamps", "imLogs", "mediaAuto", "showOnline", "typingSent", "cacheOnExit", "notifyLocal", "notifyIM", "notifyGroup"];
const OPTIONS = {
  draw: ["20 m", "32 m", "64 m", "96 m", "128 m", "192 m", "256 m"],
  quality: ["Low", "Balanced", "High", "Ultra"], fps: ["30 fps", "45 fps", "60 fps", "Uncapped"],
  complexity: ["20 000", "40 000", "80 000", "160 000", "No limit"],
  volume: ["Muted", "25%", "50%", "70%", "100%"],
  translate: ["Off", "English", "Spanish", "French", "German", "Japanese", "Português"],
  maturity: ["General", "Moderate", "Adult"], bandwidth: ["500 kbps", "1 500 kbps", "3 000 kbps", "Unlimited"],
  cacheLimit: [256, 512, 1024, 2048], cacheLoc: ["Internal storage", "Removable storage"], fov: [40, 60, 80, 100],
};

export function sanitizeViewerSettings(saved) {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
  const result = { toggles: {}, prefs: {} };
  if (Object.hasOwn(LAYOUTS, saved.layout)) result.layout = saved.layout;
  if (Object.hasOwn(PALETTES, saved.palette)) result.palette = saved.palette;
  if (typeof saved.dense === "boolean") result.dense = saved.dense;
  if (["compact", "standard", "comfortable"].includes(saved.density)) result.density = saved.density;
  for (const key of TOGGLES) if (typeof saved.toggles?.[key] === "boolean") result.toggles[key] = saved.toggles[key];
  for (const [key, values] of Object.entries(OPTIONS)) if (values.includes(saved.prefs?.[key])) result.prefs[key] = saved.prefs[key];
  return result;
}

export function readViewerSettings() {
  try { return sanitizeViewerSettings(JSON.parse(localStorage.getItem(VIEWER_SETTINGS_KEY) || "{}")); }
  catch { return {}; }
}
export function saveViewerSettings(settings) {
  try { localStorage.setItem(VIEWER_SETTINGS_KEY, JSON.stringify(sanitizeViewerSettings(settings))); } catch { /* Storage may be disabled by the browser. */ }
}
