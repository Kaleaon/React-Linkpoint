/**
 * Feature capability registry tracking support status for viewer preferences.
 */

export const CAPABILITY_STATES = {
  SUPPORTED: 'SUPPORTED',
  UNSUPPORTED: 'UNSUPPORTED',
  EXPERIMENTAL: 'EXPERIMENTAL',
};

export const FEATURE_CAPABILITIES = {
  // Toggles (Unsupported / Experimental in standard mode)
  shadows: CAPABILITY_STATES.EXPERIMENTAL,
  'voice-indicator': CAPABILITY_STATES.UNSUPPORTED,
  'media-auto': CAPABILITY_STATES.UNSUPPORTED,
  'chat-cmds': CAPABILITY_STATES.UNSUPPORTED,
  typing: CAPABILITY_STATES.UNSUPPORTED,
  push: CAPABILITY_STATES.UNSUPPORTED,
  'show-online': CAPABILITY_STATES.UNSUPPORTED,
  rlv: CAPABILITY_STATES.UNSUPPORTED,
  'cache-exit': CAPABILITY_STATES.UNSUPPORTED,

  // Select inputs (Unsupported in standard mode)
  quality: CAPABILITY_STATES.UNSUPPORTED,
  complexity: CAPABILITY_STATES.UNSUPPORTED,
  bandwidth: CAPABILITY_STATES.UNSUPPORTED,
  translate: CAPABILITY_STATES.UNSUPPORTED,
  maturity: CAPABILITY_STATES.UNSUPPORTED,
  cacheLimit: CAPABILITY_STATES.UNSUPPORTED,
  cacheLoc: CAPABILITY_STATES.UNSUPPORTED,

  // Supported Toggles
  'large-type': CAPABILITY_STATES.SUPPORTED,
  largeType: CAPABILITY_STATES.SUPPORTED,
  battery: CAPABILITY_STATES.SUPPORTED,
  gamepad: CAPABILITY_STATES.SUPPORTED,
  'ptt-use': CAPABILITY_STATES.SUPPORTED,
  pttUse: CAPABILITY_STATES.SUPPORTED,
  'ptt-toggle': CAPABILITY_STATES.SUPPORTED,
  pttToggle: CAPABILITY_STATES.SUPPORTED,
  timestamps: CAPABILITY_STATES.SUPPORTED,
  'im-logs': CAPABILITY_STATES.SUPPORTED,
  imLogs: CAPABILITY_STATES.SUPPORTED,
  autoresponse: CAPABILITY_STATES.SUPPORTED,
  'notify-local': CAPABILITY_STATES.SUPPORTED,
  notifyLocal: CAPABILITY_STATES.SUPPORTED,
  'notify-im': CAPABILITY_STATES.SUPPORTED,
  notifyIM: CAPABILITY_STATES.SUPPORTED,
  'notify-group': CAPABILITY_STATES.SUPPORTED,
  notifyGroup: CAPABILITY_STATES.SUPPORTED,
  devMode: CAPABILITY_STATES.SUPPORTED,

  // Supported Selects
  draw: CAPABILITY_STATES.SUPPORTED,
  fov: CAPABILITY_STATES.SUPPORTED,
  fps: CAPABILITY_STATES.SUPPORTED,
  volume: CAPABILITY_STATES.SUPPORTED,
  voiceVolume: CAPABILITY_STATES.SUPPORTED,
  sfxVolume: CAPABILITY_STATES.SUPPORTED,
  uiVolume: CAPABILITY_STATES.SUPPORTED,
  ambientVolume: CAPABILITY_STATES.SUPPORTED,
  layout: CAPABILITY_STATES.SUPPORTED,
  palette: CAPABILITY_STATES.SUPPORTED,
  format: CAPABILITY_STATES.SUPPORTED,
  density: CAPABILITY_STATES.SUPPORTED,
};

/**
 * Retrieves capability state for a preference or feature control.
 * Defaults to SUPPORTED for unlisted functional options.
 */
export function getFeatureCapability(featureId) {
  return FEATURE_CAPABILITIES[featureId] || CAPABILITY_STATES.SUPPORTED;
}

/**
 * Returns whether a feature control should be visible in the UI.
 * Unsupported or experimental features are only shown when developer mode is enabled.
 */
export function isFeatureVisible(featureId, devMode = false) {
  const capability = getFeatureCapability(featureId);
  if (capability === CAPABILITY_STATES.SUPPORTED) return true;
  return Boolean(devMode);
}
