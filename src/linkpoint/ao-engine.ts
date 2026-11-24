/**
 * Client-side Animation Overrider (AO) Engine.
 *
 * Modeled after Firestorm's native client-side AO (`fsaoengine.cpp` / `floater_ao.xml`)
 * and Second Life's canonical `llanimationstates.cpp` system animation table:
 * - Intercepts default Linden locomotion animation UUIDs for the local avatar in O(1) time.
 * - Replaces intercepted animations locally in `WorldViewer` / `AvatarAnimator` with zero frame cost.
 * - Sends outbound `AgentAnimation` start/stop packets to the simulator immediately (<100ms)
 *   so nearby residents observe custom poses without worn scripted HUD attachments.
 * - Cycles multiple standing animations sequentially or randomly on a configurable timer.
 * - Persists user animation sets (profiles) and preference toggles in `localStorage`.
 * - Tracks animation download and binary `.anim` parse failures for clear UI feedback.
 */

import { Utils } from './utils';
import type { AnimationRequest } from './avatar-animator';
import { LLAssetType } from './inventory';

export type AOStateKey =
  | 'stand'
  | 'walk'
  | 'run'
  | 'sit'
  | 'sit_ground'
  | 'crouch'
  | 'crouchwalk'
  | 'hover'
  | 'fly'
  | 'flyup'
  | 'flydown'
  | 'flyslow'
  | 'jump'
  | 'prejump'
  | 'fall'
  | 'land'
  | 'softland'
  | 'standup'
  | 'turnleft'
  | 'turnright'
  | 'stride'
  | 'float'
  | 'swim_forward'
  | 'swim_up'
  | 'swim_down'
  | 'typing';

export interface AOStateDefinition {
  key: AOStateKey;
  label: string;
  primary: boolean;
  priority: number;
  notecardTokens: readonly string[];
  systemUuids: readonly string[];
}

export const DEFAULT_STAND_ANIMATION_UUID = '2408fe9e-df1d-1d7d-f4ff-1384fa7b350f';

/**
 * Complete Second Life / Firestorm locomotion state catalog.
 * System UUIDs match official `indra/llcharacter/llanimationstates.cpp` and `public/anims/`.
 */
export const AO_STATE_DEFINITIONS: readonly AOStateDefinition[] = [
  {
    key: 'stand',
    label: 'Standing',
    primary: true,
    priority: 10,
    notecardTokens: ['Standing'],
    systemUuids: [
      '2408fe9e-df1d-1d7d-f4ff-1384fa7b350f', // ANIM_AGENT_STAND
      '15468e00-3400-bb66-cecc-646d7c14458e', // ANIM_AGENT_STAND_1
      '370f3a20-6ca6-9971-848c-9a01bc42ae3c', // ANIM_AGENT_STAND_2
      '42b46214-4b44-79ae-deb8-0df61424ff4b', // ANIM_AGENT_STAND_3
      'f22fed8b-a5ed-2c93-64d5-bdd8b93c889f', // ANIM_AGENT_STAND_4
    ],
  },
  {
    key: 'walk',
    label: 'Walking',
    primary: true,
    priority: 50,
    notecardTokens: ['Walking'],
    systemUuids: [
      '6ed24bd8-91aa-4b12-ccc7-c97c857ab4e0', // ANIM_AGENT_WALK
      'f5fc7433-043d-e819-8298-f519a119b688', // ANIM_AGENT_FEMALE_WALK
    ],
  },
  {
    key: 'run',
    label: 'Running',
    primary: true,
    priority: 60,
    notecardTokens: ['Running'],
    systemUuids: [
      '05ddbff8-aaa9-92a1-2b74-8fe77a29b445', // ANIM_AGENT_RUN
    ],
  },
  {
    key: 'sit',
    label: 'Sitting',
    primary: true,
    priority: 20,
    notecardTokens: ['Sitting'],
    systemUuids: [
      '1a5fe8ac-a804-8a5d-7cbd-56bd83184568', // ANIM_AGENT_SIT
      'b1709c8d-ecd3-54a1-4f28-d55ac0840782', // ANIM_AGENT_SIT_FEMALE
      '245f3c54-f1c0-bf2e-811f-46d8eeb386e7', // ANIM_AGENT_SIT_GENERIC
    ],
  },
  {
    key: 'sit_ground',
    label: 'Sitting on Ground',
    primary: true,
    priority: 25,
    notecardTokens: ['Sitting On Ground', 'Sitting on Ground'],
    systemUuids: [
      '1c7600d6-661f-b87b-efe2-d7421eb93c86', // ANIM_AGENT_SIT_GROUND
      '1a2bd58e-87ff-0df8-0b4c-53e047b0bb6e', // ANIM_AGENT_SIT_GROUND_CONSTRAINED
    ],
  },
  {
    key: 'crouch',
    label: 'Crouching',
    primary: true,
    priority: 40,
    notecardTokens: ['Crouching'],
    systemUuids: [
      '201f3fdf-cb1f-dbec-201f-7333e328ae7c', // ANIM_AGENT_CROUCH
    ],
  },
  {
    key: 'crouchwalk',
    label: 'Crouch Walking',
    primary: true,
    priority: 55,
    notecardTokens: ['Crouch Walking', 'Crouching Walk'],
    systemUuids: [
      '47f5f6fb-22e5-ae44-f871-73aaaf4a6022', // ANIM_AGENT_CROUCHWALK
    ],
  },
  {
    key: 'hover',
    label: 'Hovering',
    primary: true,
    priority: 70,
    notecardTokens: ['Hovering'],
    systemUuids: [
      '4ae8016b-31b9-03bb-c401-b1ea941db41d', // ANIM_AGENT_HOVER
    ],
  },
  {
    key: 'fly',
    label: 'Flying',
    primary: true,
    priority: 80,
    notecardTokens: ['Flying'],
    systemUuids: [
      'aec4610c-757f-bc4e-c092-c6e9caf18daf', // ANIM_AGENT_FLY
    ],
  },
  {
    key: 'flyup',
    label: 'Flying Up',
    primary: true,
    priority: 78,
    notecardTokens: ['Flying Up', 'Hovering Up'],
    systemUuids: [
      '62c5de58-cb33-5743-3d07-9e4cd4352864', // ANIM_AGENT_HOVER_UP
    ],
  },
  {
    key: 'flydown',
    label: 'Flying Down',
    primary: true,
    priority: 78,
    notecardTokens: ['Flying Down', 'Hovering Down'],
    systemUuids: [
      '20f063ea-8306-2562-0b07-5c853b37b31e', // ANIM_AGENT_HOVER_DOWN
    ],
  },
  {
    key: 'flyslow',
    label: 'Flying Slow',
    primary: false,
    priority: 79,
    notecardTokens: ['Flying Slow'],
    systemUuids: [
      '2b5a38b2-5e00-3a97-a495-4c826bc443e6', // ANIM_AGENT_FLYSLOW
    ],
  },
  {
    key: 'jump',
    label: 'Jumping',
    primary: false,
    priority: 95,
    notecardTokens: ['Jumping'],
    systemUuids: [
      '2305bd75-1ca9-b03b-1faa-b176b8a8c49e', // ANIM_AGENT_JUMP
    ],
  },
  {
    key: 'prejump',
    label: 'Pre-Jumping',
    primary: false,
    priority: 92,
    notecardTokens: ['Pre Jumping', 'Pre-Jumping'],
    systemUuids: [
      '7a4e87fe-de39-6fcb-6223-024b00893244', // ANIM_AGENT_PRE_JUMP
    ],
  },
  {
    key: 'fall',
    label: 'Falling',
    primary: false,
    priority: 100,
    notecardTokens: ['Falling', 'Falling Down'],
    systemUuids: [
      '666307d9-a860-572d-6fd4-c3ab8865c094', // ANIM_AGENT_FALLDOWN
    ],
  },
  {
    key: 'land',
    label: 'Landing',
    primary: false,
    priority: 90,
    notecardTokens: ['Landing'],
    systemUuids: [
      '7a17b059-12b2-41b1-570a-186368b6aa6f', // ANIM_AGENT_LAND
    ],
  },
  {
    key: 'softland',
    label: 'Soft Landing',
    primary: false,
    priority: 89,
    notecardTokens: ['Soft Landing'],
    systemUuids: [
      'f4f00d6e-b9fe-9292-f4cb-0ae06ea58d57', // ANIM_AGENT_MEDIUM_LAND
    ],
  },
  {
    key: 'standup',
    label: 'Standing Up',
    primary: false,
    priority: 88,
    notecardTokens: ['Standing Up'],
    systemUuids: [
      '3da1d753-028a-5446-24f3-9c9b856d9422', // ANIM_AGENT_STANDUP
    ],
  },
  {
    key: 'turnleft',
    label: 'Turning Left',
    primary: false,
    priority: 35,
    notecardTokens: ['Turning Left'],
    systemUuids: [
      '56e0ba0d-4a9f-7f27-6117-32f2ebbf6135', // ANIM_AGENT_TURNLEFT
    ],
  },
  {
    key: 'turnright',
    label: 'Turning Right',
    primary: false,
    priority: 35,
    notecardTokens: ['Turning Right'],
    systemUuids: [
      '2d6daa51-3192-6794-8e2e-a15f8338ec30', // ANIM_AGENT_TURNRIGHT
    ],
  },
  {
    key: 'stride',
    label: 'Stride',
    primary: false,
    priority: 48,
    notecardTokens: ['Stride', 'Striding'],
    systemUuids: [
      '1cb562b0-ba21-2202-efb3-30f82cdf9595', // ANIM_AGENT_STRIDE
    ],
  },
  {
    key: 'float',
    label: 'Floating',
    primary: false,
    priority: 71,
    notecardTokens: ['Floating'],
    systemUuids: [],
  },
  {
    key: 'swim_forward',
    label: 'Swimming Forward',
    primary: false,
    priority: 81,
    notecardTokens: ['Swimming Forward'],
    systemUuids: [],
  },
  {
    key: 'swim_up',
    label: 'Swimming Up',
    primary: false,
    priority: 79,
    notecardTokens: ['Swimming Up'],
    systemUuids: [],
  },
  {
    key: 'swim_down',
    label: 'Swimming Down',
    primary: false,
    priority: 79,
    notecardTokens: ['Swimming Down'],
    systemUuids: [],
  },
  {
    key: 'typing',
    label: 'Typing',
    primary: false,
    priority: 5,
    notecardTokens: ['Typing'],
    systemUuids: [
      'c541c47f-e0c0-058b-ad1a-d6ae3a4584d9', // ANIM_AGENT_TYPE
    ],
  },
];

const STATE_BY_KEY = new Map<AOStateKey, AOStateDefinition>(
  AO_STATE_DEFINITIONS.map((def) => [def.key, def]),
);

/** O(1) lookup from lowercase Linden system animation UUID to locomotion state. */
const SYSTEM_UUID_TO_STATE = new Map<string, AOStateDefinition>();
for (const def of AO_STATE_DEFINITIONS) {
  for (const uuid of def.systemUuids) {
    SYSTEM_UUID_TO_STATE.set(uuid.toLowerCase(), def);
  }
}

/** O(1) lookup from normalized Firestorm / ZHAO-II bracket token to state key. */
const NOTECARD_TOKEN_TO_STATE = new Map<string, AOStateKey>();
for (const def of AO_STATE_DEFINITIONS) {
  NOTECARD_TOKEN_TO_STATE.set(def.key.toLowerCase().replace(/[_-]+/g, ' '), def.key);
  NOTECARD_TOKEN_TO_STATE.set(def.label.toLowerCase().replace(/[_-]+/g, ' '), def.key);
  for (const token of def.notecardTokens) {
    NOTECARD_TOKEN_TO_STATE.set(token.toLowerCase().replace(/[_-]+/g, ' ').trim(), def.key);
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export const AO_STORAGE_KEY = 'linkpoint_ao_state_v1';
export const MIN_STAND_INTERVAL_SEC = 5;
export const MAX_STAND_INTERVAL_SEC = 600;
export const DEFAULT_STAND_INTERVAL_SEC = 30;

export interface AOAssignedAnimation {
  id: string;
  assetId: string;
  itemId?: string;
  name: string;
}

export interface AOProfile {
  id: string;
  name: string;
  states: Partial<Record<AOStateKey, AOAssignedAnimation[]>>;
  selectedIndex: Partial<Record<AOStateKey, number>>;
  updatedAt: number;
}

export interface AOAnimationError {
  assetId: string;
  name?: string;
  kind: 'download' | 'parse';
  message: string;
  timestamp: number;
}

export interface AOPersistedState {
  version: 1;
  enabled: boolean;
  activeProfileId: string | null;
  overrideSits: boolean;
  smartSit: boolean;
  cycleStands: boolean;
  randomStands: boolean;
  standIntervalSec: number;
  profiles: AOProfile[];
}

export interface AONotecardImportResult {
  profile: AOProfile;
  assignedCount: number;
  unresolvedNames: string[];
}

export interface AOWorldAdapter {
  getLocalAgentId: () => string;
  isUnderwater?: () => boolean;
  applyLocalAnimations: (animations: AnimationRequest[]) => void;
  validateAnimationAsset?: (
    id: string,
  ) => Promise<{ ok: boolean; kind?: 'download' | 'parse'; error?: string }>;
  invalidateAnimation?: (id: string) => void;
  on?: (event: string, cb: (...args: any[]) => void) => void;
  off?: (event: string, cb: (...args: any[]) => void) => void;
}

export interface AOProtocolAdapter {
  connected: boolean;
  agentId: string | null;
  sendAgentAnimations?: (
    animations: Array<{ id: string; start: boolean }>,
  ) => Promise<{ sent: boolean; count: number }>;
  on?: (event: string, cb: (...args: any[]) => void) => void;
  off?: (event: string, cb: (...args: any[]) => void) => void;
}

export interface AOInventoryAdapter {
  items: Map<string, any>;
}

type StorageAdapter = {
  get: (key: string, defaultValue?: any) => any;
  set: (key: string, value: any) => boolean | void;
};

export interface AOEngineOptions {
  world?: AOWorldAdapter | null;
  protocol?: AOProtocolAdapter | null;
  inventory?: AOInventoryAdapter | null;
  storage?: StorageAdapter;
  rng?: () => number;
  scheduleInterval?: (cb: () => void, ms: number) => any;
  clearScheduledInterval?: (handle: any) => void;
}

export function isValidAnimationUuid(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return UUID_REGEX.test(trimmed) && trimmed !== ZERO_UUID;
}

function clampInterval(sec: unknown): number {
  const n = Math.round(Number(sec));
  if (!Number.isFinite(n)) return DEFAULT_STAND_INTERVAL_SEC;
  return Math.min(MAX_STAND_INTERVAL_SEC, Math.max(MIN_STAND_INTERVAL_SEC, n));
}

/**
 * Strip optional `Linden text version 2` asset wrapper so both raw text and downloaded
 * Second Life notecard assets parse identically.
 */
export function unwrapLindenNotecardText(raw: string): string {
  const text = String(raw || '');
  if (!text.startsWith('Linden text version')) return text;
  const match = /Text length\s+(\d+)\r?\n([\s\S]*)$/.exec(text);
  if (!match) return text;
  const byteLen = Number(match[1]);
  const body = match[2];
  if (Number.isFinite(byteLen) && byteLen >= 0) {
    // Strip trailing closing brace added by Linden text wrapper
    return body.replace(/\}\s*$/, '');
  }
  return body;
}

/**
 * Parse standard Linden / Firestorm / ZHAO-II AO configuration notecard lines:
 * `[ Standing ]Anim1|Anim2|Anim3` or `[ Walking ]AnimWalk,AnimWalk2`
 */
export function parseAONotecardEntries(
  rawText: string,
): Array<{ state: AOStateKey; entries: string[] }> {
  const body = unwrapLindenNotecardText(rawText);
  const parsed: Array<{ state: AOStateKey; entries: string[] }> = [];

  for (const rawLine of body.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const match = /^\[\s*([^\]]+?)\s*\](.*)$/.exec(trimmed);
    if (!match) continue;
    const normalizedToken = match[1]
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const state = NOTECARD_TOKEN_TO_STATE.get(normalizedToken);
    if (!state) continue;
    const entries = match[2]
      .split(/[|,]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (entries.length > 0) {
      parsed.push({ state, entries });
    }
  }

  return parsed;
}

export class AOEngine extends Utils.EventEmitter {
  private world: AOWorldAdapter | null;
  private protocol: AOProtocolAdapter | null;
  private inventory: AOInventoryAdapter | null;
  private storage: StorageAdapter;
  private rng: () => number;
  private scheduleInterval: (cb: () => void, ms: number) => any;
  private clearScheduledInterval: (handle: any) => void;

  private state: AOPersistedState;
  private currentLocomotionState: AOStateKey = 'stand';
  private isTypingActive = false;
  private activeOverrideId: string | null = null;
  private activeTypingOverrideId: string | null = null;
  private overrideSeq = 1;
  private lastRawServerAnimations: AnimationRequest[] = [
    { id: DEFAULT_STAND_ANIMATION_UUID, seq: 0 },
  ];
  private knownSentOverrides = new Set<string>();
  private animationErrors = new Map<string, AOAnimationError>();
  private standTimer: any = null;

  private readonly boundOnAnimationError = (payload: any) => {
    if (!payload?.id) return;
    this.reportAnimationError(
      String(payload.id),
      payload.kind === 'parse' ? 'parse' : 'download',
      String(payload.message || 'Animation asset failed to load'),
    );
  };

  private readonly boundOnConnected = () => {
    if (!this.state.enabled) return;
    const outbound: Array<{ id: string; start: boolean }> = [];
    if (this.activeOverrideId) outbound.push({ id: this.activeOverrideId, start: true });
    if (this.activeTypingOverrideId && this.activeTypingOverrideId !== this.activeOverrideId) {
      outbound.push({ id: this.activeTypingOverrideId, start: true });
    }
    if (outbound.length > 0) {
      void this.dispatchSimulatorAnimations(outbound);
    }
  };

  private readonly boundOnDisconnected = () => {
    this.knownSentOverrides.clear();
  };

  constructor(options: AOEngineOptions = {}) {
    super();
    this.world = options.world ?? null;
    this.protocol = options.protocol ?? null;
    this.inventory = options.inventory ?? null;
    this.storage = options.storage ?? Utils.storage;
    this.rng = options.rng ?? (() => Math.random());
    this.scheduleInterval = options.scheduleInterval ?? ((cb, ms) => setInterval(cb, ms));
    this.clearScheduledInterval =
      options.clearScheduledInterval ?? ((handle) => clearInterval(handle));

    this.state = this.loadState();
    this.bindAdapters();
    if (this.state.enabled) {
      this.recomputeAndApply(true);
      this.syncStandTimer();
    }
  }

  private bindAdapters() {
    this.world?.on?.('animation_error', this.boundOnAnimationError);
    this.protocol?.on?.('connected', this.boundOnConnected);
    this.protocol?.on?.('disconnected', this.boundOnDisconnected);
  }

  public dispose() {
    this.stopStandTimer();
    this.world?.off?.('animation_error', this.boundOnAnimationError);
    this.protocol?.off?.('connected', this.boundOnConnected);
    this.protocol?.off?.('disconnected', this.boundOnDisconnected);
  }

  private loadState(): AOPersistedState {
    const fallback: AOPersistedState = {
      version: 1,
      enabled: false,
      activeProfileId: null,
      overrideSits: true,
      smartSit: true,
      cycleStands: true,
      randomStands: false,
      standIntervalSec: DEFAULT_STAND_INTERVAL_SEC,
      profiles: [],
    };
    try {
      const raw = this.storage.get(AO_STORAGE_KEY, null);
      if (!raw || typeof raw !== 'object') return fallback;
      const profiles: AOProfile[] = Array.isArray(raw.profiles)
        ? raw.profiles
            .filter(
              (p: any) =>
                p &&
                typeof p === 'object' &&
                typeof p.id === 'string' &&
                typeof p.name === 'string',
            )
            .map((p: any) => {
              const cleanStates: Partial<Record<AOStateKey, AOAssignedAnimation[]>> = {};
              const cleanSelected: Partial<Record<AOStateKey, number>> = {};
              if (p.states && typeof p.states === 'object') {
                for (const def of AO_STATE_DEFINITIONS) {
                  const list = p.states[def.key];
                  if (Array.isArray(list)) {
                    const valid = list
                      .filter((entry: any) => entry && isValidAnimationUuid(entry.assetId))
                      .map((entry: any) => ({
                        id: String(entry.id || Utils.generateUUID()),
                        assetId: String(entry.assetId).trim().toLowerCase(),
                        ...(entry.itemId ? { itemId: String(entry.itemId) } : {}),
                        name: String(entry.name || entry.assetId),
                      }));
                    if (valid.length > 0) cleanStates[def.key] = valid;
                  }
                }
              }
              if (p.selectedIndex && typeof p.selectedIndex === 'object') {
                for (const def of AO_STATE_DEFINITIONS) {
                  const idx = Number(p.selectedIndex[def.key]);
                  if (Number.isInteger(idx) && idx >= 0) cleanSelected[def.key] = idx;
                }
              }
              return {
                id: String(p.id),
                name: String(p.name).trim() || 'Untitled Set',
                states: cleanStates,
                selectedIndex: cleanSelected,
                updatedAt: Number(p.updatedAt) || Date.now(),
              };
            })
        : [];
      const activeProfileId =
        typeof raw.activeProfileId === 'string' &&
        profiles.some((p) => p.id === raw.activeProfileId)
          ? raw.activeProfileId
          : (profiles[0]?.id ?? null);

      return {
        version: 1,
        enabled: Boolean(raw.enabled),
        activeProfileId,
        overrideSits: raw.overrideSits !== undefined ? Boolean(raw.overrideSits) : true,
        smartSit: raw.smartSit !== undefined ? Boolean(raw.smartSit) : true,
        cycleStands: raw.cycleStands !== undefined ? Boolean(raw.cycleStands) : true,
        randomStands: Boolean(raw.randomStands),
        standIntervalSec: clampInterval(raw.standIntervalSec),
        profiles,
      };
    } catch {
      return fallback;
    }
  }

  private persist() {
    try {
      this.storage.set(AO_STORAGE_KEY, this.state);
    } catch {
      // Ignore storage quota errors
    }
  }

  private notifyChange() {
    this.emit('change', this.getSnapshot());
  }

  // ---- Read-only state queries ---------------------------------------------------------------

  public get enabled(): boolean {
    return this.state.enabled;
  }

  public get activeProfileId(): string | null {
    return this.state.activeProfileId;
  }

  public get profiles(): AOProfile[] {
    return this.state.profiles;
  }

  public get currentState(): AOStateKey {
    return this.currentLocomotionState;
  }

  public get activeAnimationId(): string | null {
    return this.activeOverrideId;
  }

  public getActiveProfile(): AOProfile | null {
    if (!this.state.activeProfileId) return null;
    return this.state.profiles.find((p) => p.id === this.state.activeProfileId) ?? null;
  }

  public getStateDefinition(state: AOStateKey): AOStateDefinition | undefined {
    return STATE_BY_KEY.get(state);
  }

  public getErrors(): AOAnimationError[] {
    return [...this.animationErrors.values()].sort((a, b) => b.timestamp - a.timestamp);
  }

  public getErrorForAsset(assetId: string): AOAnimationError | undefined {
    return this.animationErrors.get(String(assetId || '').toLowerCase());
  }

  public getInventoryAnimations(): Array<{ itemId: string; assetId: string; name: string }> {
    const items = this.inventory?.items;
    if (!items) return [];
    const results: Array<{ itemId: string; assetId: string; name: string }> = [];
    for (const item of items.values()) {
      if (!item || item.assetType !== LLAssetType.Animation) continue;
      if (!isValidAnimationUuid(item.assetId)) continue;
      results.push({
        itemId: String(item.id),
        assetId: String(item.assetId).toLowerCase(),
        name: String(item.name || item.assetId),
      });
    }
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  public getSnapshot() {
    const activeProfile = this.getActiveProfile();
    const stateDef = STATE_BY_KEY.get(this.currentLocomotionState);
    let activeAnimationName: string | null = null;
    if (activeProfile && this.activeOverrideId) {
      const list = activeProfile.states[this.currentLocomotionState] || [];
      activeAnimationName =
        list.find((a) => a.assetId === this.activeOverrideId)?.name ?? this.activeOverrideId;
    }
    return {
      enabled: this.state.enabled,
      activeProfileId: this.state.activeProfileId,
      activeProfileName: activeProfile?.name ?? null,
      overrideSits: this.state.overrideSits,
      smartSit: this.state.smartSit,
      cycleStands: this.state.cycleStands,
      randomStands: this.state.randomStands,
      standIntervalSec: this.state.standIntervalSec,
      currentState: this.currentLocomotionState,
      currentStateLabel: stateDef?.label ?? 'Standing',
      activeOverrideId: this.activeOverrideId,
      activeAnimationName,
      profiles: this.state.profiles.map((p) => ({
        ...p,
        states: { ...p.states },
        selectedIndex: { ...p.selectedIndex },
      })),
      errors: this.getErrors(),
    };
  }

  // ---- Master Toggle & Preferences -----------------------------------------------------------

  public setEnabled(enabled: boolean) {
    const next = Boolean(enabled);
    if (this.state.enabled === next) return;
    this.state.enabled = next;
    this.persist();

    if (!next) {
      this.stopStandTimer();
      this.restoreDefaultLocomotion();
    } else {
      this.recomputeAndApply(true);
      this.syncStandTimer();
    }
    this.notifyChange();
  }

  public toggleEnabled(): boolean {
    this.setEnabled(!this.state.enabled);
    return this.state.enabled;
  }

  public setPreferences(
    prefs: Partial<{
      overrideSits: boolean;
      smartSit: boolean;
      cycleStands: boolean;
      randomStands: boolean;
      standIntervalSec: number;
    }>,
  ) {
    if (prefs.overrideSits !== undefined) this.state.overrideSits = Boolean(prefs.overrideSits);
    if (prefs.smartSit !== undefined) this.state.smartSit = Boolean(prefs.smartSit);
    if (prefs.cycleStands !== undefined) this.state.cycleStands = Boolean(prefs.cycleStands);
    if (prefs.randomStands !== undefined) this.state.randomStands = Boolean(prefs.randomStands);
    if (prefs.standIntervalSec !== undefined) {
      this.state.standIntervalSec = clampInterval(prefs.standIntervalSec);
    }
    this.persist();
    if (this.state.enabled) {
      this.recomputeAndApply(true);
      this.syncStandTimer();
    }
    this.notifyChange();
  }

  // ---- Profile Management --------------------------------------------------------------------

  public createProfile(name: string): AOProfile {
    const cleanName =
      String(name || '').trim() || `Animation Set ${this.state.profiles.length + 1}`;
    const profile: AOProfile = {
      id: Utils.generateUUID(),
      name: cleanName,
      states: {},
      selectedIndex: {},
      updatedAt: Date.now(),
    };
    this.state.profiles.push(profile);
    this.state.activeProfileId = profile.id;
    this.persist();
    if (this.state.enabled) {
      this.recomputeAndApply(true);
      this.syncStandTimer();
    }
    this.notifyChange();
    return profile;
  }

  public renameProfile(profileId: string, newName: string): boolean {
    const profile = this.state.profiles.find((p) => p.id === profileId);
    const trimmed = String(newName || '').trim();
    if (!profile || !trimmed) return false;
    profile.name = trimmed;
    profile.updatedAt = Date.now();
    this.persist();
    this.notifyChange();
    return true;
  }

  public duplicateProfile(profileId: string, copyName?: string): AOProfile | null {
    const source = this.state.profiles.find((p) => p.id === profileId);
    if (!source) return null;
    const statesCopy: Partial<Record<AOStateKey, AOAssignedAnimation[]>> = {};
    for (const [key, list] of Object.entries(source.states) as Array<
      [AOStateKey, AOAssignedAnimation[]]
    >) {
      if (Array.isArray(list)) {
        statesCopy[key] = list.map((item) => ({ ...item, id: Utils.generateUUID() }));
      }
    }
    const copy: AOProfile = {
      id: Utils.generateUUID(),
      name: String(copyName || `${source.name} Copy`).trim(),
      states: statesCopy,
      selectedIndex: { ...source.selectedIndex },
      updatedAt: Date.now(),
    };
    this.state.profiles.push(copy);
    this.state.activeProfileId = copy.id;
    this.persist();
    if (this.state.enabled) {
      this.recomputeAndApply(true);
      this.syncStandTimer();
    }
    this.notifyChange();
    return copy;
  }

  public deleteProfile(profileId: string): boolean {
    const idx = this.state.profiles.findIndex((p) => p.id === profileId);
    if (idx < 0) return false;
    this.state.profiles.splice(idx, 1);
    if (this.state.activeProfileId === profileId) {
      this.state.activeProfileId = this.state.profiles[0]?.id ?? null;
    }
    this.persist();
    if (this.state.enabled) {
      this.recomputeAndApply(true);
      this.syncStandTimer();
    }
    this.notifyChange();
    return true;
  }

  public setActiveProfile(profileId: string | null) {
    if (profileId !== null && !this.state.profiles.some((p) => p.id === profileId)) {
      return;
    }
    if (this.state.activeProfileId === profileId) return;
    this.state.activeProfileId = profileId;
    this.persist();
    if (this.state.enabled) {
      this.recomputeAndApply(true);
      this.syncStandTimer();
    }
    this.notifyChange();
  }

  // ---- Per-State Animation Assignment --------------------------------------------------------

  public addAnimationToState(
    profileId: string,
    stateKey: AOStateKey,
    anim: { assetId: string; name?: string; itemId?: string },
  ): AOAssignedAnimation {
    const profile = this.state.profiles.find((p) => p.id === profileId);
    if (!profile) throw new Error('Animation profile not found');
    if (!STATE_BY_KEY.has(stateKey)) throw new Error(`Unknown locomotion state: ${stateKey}`);
    if (!isValidAnimationUuid(anim.assetId)) {
      throw new Error('Animation asset ID must be a valid non-zero UUID');
    }
    const normalizedAssetId = anim.assetId.trim().toLowerCase();
    const entry: AOAssignedAnimation = {
      id: Utils.generateUUID(),
      assetId: normalizedAssetId,
      ...(anim.itemId ? { itemId: String(anim.itemId) } : {}),
      name: String(anim.name || '').trim() || normalizedAssetId,
    };
    const existing = profile.states[stateKey] ? [...profile.states[stateKey]!] : [];
    existing.push(entry);
    profile.states[stateKey] = existing;
    if (profile.selectedIndex[stateKey] === undefined) {
      profile.selectedIndex[stateKey] = 0;
    }
    profile.updatedAt = Date.now();
    this.persist();

    if (profile.id === this.state.activeProfileId) {
      // Clear stale error on fresh assignment and preflight validate
      this.animationErrors.delete(normalizedAssetId);
      void this.verifyAnimationAsset(normalizedAssetId, entry.name);
      if (this.state.enabled) {
        this.recomputeAndApply(true);
        this.syncStandTimer();
      }
    }
    this.notifyChange();
    return entry;
  }

  public removeAnimationFromState(
    profileId: string,
    stateKey: AOStateKey,
    entryId: string,
  ): boolean {
    const profile = this.state.profiles.find((p) => p.id === profileId);
    const list = profile?.states[stateKey];
    if (!profile || !list) return false;
    const idx = list.findIndex((item) => item.id === entryId);
    if (idx < 0) return false;
    const nextList = list.filter((item) => item.id !== entryId);
    if (nextList.length === 0) {
      delete profile.states[stateKey];
      delete profile.selectedIndex[stateKey];
    } else {
      profile.states[stateKey] = nextList;
      const curIdx = profile.selectedIndex[stateKey] ?? 0;
      profile.selectedIndex[stateKey] = Math.min(curIdx, nextList.length - 1);
    }
    profile.updatedAt = Date.now();
    this.persist();
    if (this.state.enabled && profile.id === this.state.activeProfileId) {
      this.recomputeAndApply(true);
      this.syncStandTimer();
    }
    this.notifyChange();
    return true;
  }

  public moveAnimationInState(
    profileId: string,
    stateKey: AOStateKey,
    entryId: string,
    direction: -1 | 1,
  ): boolean {
    const profile = this.state.profiles.find((p) => p.id === profileId);
    const list = profile?.states[stateKey];
    if (!profile || !list || list.length < 2) return false;
    const idx = list.findIndex((item) => item.id === entryId);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= list.length) return false;
    const copy = [...list];
    const [moved] = copy.splice(idx, 1);
    copy.splice(target, 0, moved);
    profile.states[stateKey] = copy;

    const sel = profile.selectedIndex[stateKey] ?? 0;
    if (sel === idx) profile.selectedIndex[stateKey] = target;
    else if (sel === target) profile.selectedIndex[stateKey] = idx;

    profile.updatedAt = Date.now();
    this.persist();
    if (this.state.enabled && profile.id === this.state.activeProfileId) {
      this.recomputeAndApply(true);
    }
    this.notifyChange();
    return true;
  }

  public selectStateAnimation(profileId: string, stateKey: AOStateKey, index: number): boolean {
    const profile = this.state.profiles.find((p) => p.id === profileId);
    const list = profile?.states[stateKey];
    if (!profile || !list || index < 0 || index >= list.length) return false;
    profile.selectedIndex[stateKey] = index;
    profile.updatedAt = Date.now();
    this.persist();
    const chosen = list[index];
    if (chosen) void this.verifyAnimationAsset(chosen.assetId, chosen.name);
    if (this.state.enabled && profile.id === this.state.activeProfileId) {
      this.recomputeAndApply(true);
      if (stateKey === 'stand') this.syncStandTimer();
    }
    this.notifyChange();
    return true;
  }

  /**
   * Import a standard Linden / Firestorm / ZHAO-II AO configuration notecard into a new profile.
   * Resolves animation names against inventory animations or direct asset UUIDs.
   */
  public importNotecard(profileName: string, rawText: string): AONotecardImportResult {
    const parsedRows = parseAONotecardEntries(rawText);
    const invAnims = this.getInventoryAnimations();
    const byName = new Map<string, { itemId: string; assetId: string; name: string }>();
    for (const inv of invAnims) {
      byName.set(inv.name.toLowerCase(), inv);
    }

    const profile: AOProfile = {
      id: Utils.generateUUID(),
      name: String(profileName || '').trim() || 'Imported AO Set',
      states: {},
      selectedIndex: {},
      updatedAt: Date.now(),
    };

    const unresolvedNames: string[] = [];
    let assignedCount = 0;

    for (const row of parsedRows) {
      const targetList = profile.states[row.state] ? [...profile.states[row.state]!] : [];
      for (const token of row.entries) {
        if (isValidAnimationUuid(token)) {
          targetList.push({
            id: Utils.generateUUID(),
            assetId: token.toLowerCase(),
            name: token.toLowerCase(),
          });
          assignedCount += 1;
          continue;
        }
        const match = byName.get(token.toLowerCase());
        if (match) {
          targetList.push({
            id: Utils.generateUUID(),
            assetId: match.assetId,
            itemId: match.itemId,
            name: match.name,
          });
          assignedCount += 1;
        } else {
          unresolvedNames.push(token);
        }
      }
      if (targetList.length > 0) {
        profile.states[row.state] = targetList;
        profile.selectedIndex[row.state] = 0;
      }
    }

    this.state.profiles.push(profile);
    this.state.activeProfileId = profile.id;
    this.persist();
    if (this.state.enabled) {
      this.recomputeAndApply(true);
      this.syncStandTimer();
    }
    this.notifyChange();
    return { profile, assignedCount, unresolvedNames };
  }

  // ---- Stand Cycling Controls ----------------------------------------------------------------

  public nextStand(): AOAssignedAnimation | null {
    return this.stepStand(1, false);
  }

  public previousStand(): AOAssignedAnimation | null {
    return this.stepStand(-1, false);
  }

  private stepStand(delta: 1 | -1, useRandom: boolean): AOAssignedAnimation | null {
    const profile = this.getActiveProfile();
    const list = profile?.states.stand;
    if (!profile || !list || list.length === 0) return null;

    const validIndices = list
      .map((item, idx) => (this.animationErrors.has(item.assetId) ? -1 : idx))
      .filter((idx) => idx >= 0);
    const pool = validIndices.length > 0 ? validIndices : list.map((_, idx) => idx);
    const currentIdx = profile.selectedIndex.stand ?? 0;

    let nextIdx = currentIdx;
    if (pool.length === 1) {
      nextIdx = pool[0];
    } else if (useRandom) {
      const candidates = pool.filter((idx) => idx !== currentIdx);
      const pick = Math.floor(this.rng() * candidates.length);
      nextIdx = candidates[Math.min(candidates.length - 1, Math.max(0, pick))];
    } else {
      const posInPool = pool.indexOf(currentIdx);
      if (posInPool < 0) {
        nextIdx = pool[0];
      } else {
        nextIdx = pool[(posInPool + delta + pool.length) % pool.length];
      }
    }

    profile.selectedIndex.stand = nextIdx;
    this.overrideSeq += 1;
    this.persist();

    if (this.state.enabled && this.currentLocomotionState === 'stand') {
      this.recomputeAndApply(true);
      this.syncStandTimer();
    }
    this.notifyChange();
    return list[nextIdx] ?? null;
  }

  private syncStandTimer() {
    this.stopStandTimer();
    if (!this.state.enabled || !this.state.cycleStands) return;
    if (this.currentLocomotionState !== 'stand') return;
    const profile = this.getActiveProfile();
    const stands = profile?.states.stand;
    if (!stands || stands.length < 2) return;

    const intervalMs = clampInterval(this.state.standIntervalSec) * 1000;
    this.standTimer = this.scheduleInterval(() => {
      if (
        !this.state.enabled ||
        !this.state.cycleStands ||
        this.currentLocomotionState !== 'stand'
      ) {
        this.stopStandTimer();
        return;
      }
      this.stepStand(1, this.state.randomStands);
    }, intervalMs);
  }

  private stopStandTimer() {
    if (this.standTimer !== null) {
      this.clearScheduledInterval(this.standTimer);
      this.standTimer = null;
    }
  }

  // ---- Asset Download / Parse Error Handling (Criterion 5) -----------------------------------

  public reportAnimationError(
    assetId: string,
    kind: 'download' | 'parse',
    message: string,
    name?: string,
  ) {
    const normalizedId = String(assetId || '')
      .trim()
      .toLowerCase();
    if (!normalizedId) return;

    // Only surface errors for animations actually assigned in at least one AO profile
    const assignedEntry = this.findAssignedEntry(normalizedId);
    if (
      !assignedEntry &&
      normalizedId !== this.activeOverrideId &&
      normalizedId !== this.activeTypingOverrideId
    ) {
      return;
    }

    const errorRecord: AOAnimationError = {
      assetId: normalizedId,
      name: name || assignedEntry?.name || normalizedId,
      kind,
      message: String(message || 'Failed to download or parse animation asset'),
      timestamp: Date.now(),
    };
    this.animationErrors.set(normalizedId, errorRecord);

    // If the broken animation was currently overriding locomotion, immediately fall back
    // to another valid animation in that state or default Linden locomotion so the avatar
    // never freezes in an unposed state.
    if (
      this.state.enabled &&
      (this.activeOverrideId === normalizedId || this.activeTypingOverrideId === normalizedId)
    ) {
      this.recomputeAndApply(true);
    }

    this.emit('animation_error', errorRecord);
    this.notifyChange();
  }

  public clearAnimationError(assetId: string) {
    const normalizedId = String(assetId || '')
      .trim()
      .toLowerCase();
    if (this.animationErrors.delete(normalizedId)) {
      this.notifyChange();
    }
  }

  public async retryAnimation(assetId: string): Promise<boolean> {
    const normalizedId = String(assetId || '')
      .trim()
      .toLowerCase();
    this.animationErrors.delete(normalizedId);
    this.world?.invalidateAnimation?.(normalizedId);
    const assigned = this.findAssignedEntry(normalizedId);
    const ok = await this.verifyAnimationAsset(normalizedId, assigned?.name);
    if (ok && this.state.enabled) {
      this.recomputeAndApply(true);
    }
    this.notifyChange();
    return ok;
  }

  private findAssignedEntry(assetId: string): AOAssignedAnimation | undefined {
    for (const profile of this.state.profiles) {
      for (const list of Object.values(profile.states)) {
        const hit = list?.find((entry) => entry.assetId === assetId);
        if (hit) return hit;
      }
    }
    return undefined;
  }

  private async verifyAnimationAsset(assetId: string, name?: string): Promise<boolean> {
    if (!this.world?.validateAnimationAsset) return true;
    try {
      const res = await this.world.validateAnimationAsset(assetId);
      if (!res.ok) {
        this.reportAnimationError(
          assetId,
          res.kind === 'parse' ? 'parse' : 'download',
          res.error || 'Failed to download or parse animation asset',
          name,
        );
        return false;
      }
      if (this.animationErrors.delete(assetId)) {
        this.notifyChange();
      }
      return true;
    } catch (err) {
      this.reportAnimationError(
        assetId,
        'download',
        err instanceof Error ? err.message : String(err),
        name,
      );
      return false;
    }
  }

  // ---- O(1) Locomotion Interception & Outbound Simulator Sync --------------------------------

  private isLocalAgent(subjectId: string): boolean {
    if (!subjectId) return false;
    const localId = this.world?.getLocalAgentId?.() || this.protocol?.agentId || '';
    return Boolean(localId) && subjectId.toLowerCase() === localId.toLowerCase();
  }

  /**
   * Called synchronously by `WorldViewer` whenever `scene:animations` arrives or `applyAvatarBody`
   * initializes the avatar's idle pose. Executes in O(N_anims) where N_anims <= ~6 (microseconds),
   * never touching the per-frame render loop.
   */
  public interceptAnimations = (
    subjectId: string,
    incomingAnimations: AnimationRequest[],
  ): AnimationRequest[] => {
    if (!this.isLocalAgent(subjectId)) {
      return incomingAnimations;
    }

    const incomingSet = new Set(
      incomingAnimations.map((entry) => String(entry?.id || '').toLowerCase()).filter(Boolean),
    );
    for (const sentId of [...this.knownSentOverrides]) {
      if (
        sentId !== this.activeOverrideId &&
        sentId !== this.activeTypingOverrideId &&
        !incomingSet.has(sentId)
      ) {
        this.knownSentOverrides.delete(sentId);
      }
    }

    // Strip AO-injected override UUIDs echoed back in simulator AvatarAnimation packets
    // while keeping genuine server locomotion + non-AO animations (gestures, objects).
    const stripped = incomingAnimations.filter((entry) => {
      const lower = String(entry?.id || '').toLowerCase();
      if (!lower) return false;
      return !this.knownSentOverrides.has(lower);
    });

    this.lastRawServerAnimations =
      stripped.length > 0
        ? stripped.map((a) => ({ id: a.id, seq: a.seq }))
        : [{ id: DEFAULT_STAND_ANIMATION_UUID, seq: 0 }];

    if (!this.state.enabled) {
      this.detectStateFromRaw(this.lastRawServerAnimations);
      return this.lastRawServerAnimations;
    }

    return this.computeReplacedAnimations(this.lastRawServerAnimations, true);
  };

  private detectStateFromRaw(rawAnimations: AnimationRequest[]): {
    locomotionState: AOStateKey;
    typing: boolean;
    hasExternalNonSystemAnim: boolean;
  } {
    let bestDef: AOStateDefinition | null = null;
    let typing = false;
    let hasExternalNonSystemAnim = false;

    for (const anim of rawAnimations) {
      const lower = String(anim.id || '').toLowerCase();
      if (!lower) continue;
      const matched = SYSTEM_UUID_TO_STATE.get(lower);
      if (!matched) {
        hasExternalNonSystemAnim = true;
        continue;
      }
      if (matched.key === 'typing') {
        typing = true;
        continue;
      }
      if (!bestDef || matched.priority > bestDef.priority) {
        bestDef = matched;
      }
    }

    let stateKey: AOStateKey = bestDef ? bestDef.key : 'stand';

    // Firestorm underwater state promotion when swimming overrides are configured
    if (this.world?.isUnderwater?.()) {
      const activeProfile = this.getActiveProfile();
      if (stateKey === 'hover' && activeProfile?.states.float?.length) {
        stateKey = 'float';
      } else if (
        (stateKey === 'fly' || stateKey === 'flyslow') &&
        activeProfile?.states.swim_forward?.length
      ) {
        stateKey = 'swim_forward';
      } else if (stateKey === 'flyup' && activeProfile?.states.swim_up?.length) {
        stateKey = 'swim_up';
      } else if (stateKey === 'flydown' && activeProfile?.states.swim_down?.length) {
        stateKey = 'swim_down';
      }
    }

    return { locomotionState: stateKey, typing, hasExternalNonSystemAnim };
  }

  private pickOverrideForState(
    profile: AOProfile | null,
    stateKey: AOStateKey,
  ): AOAssignedAnimation | null {
    if (!profile) return null;
    const list = profile.states[stateKey];
    if (!list || list.length === 0) return null;

    const preferredIdx = Math.min(
      Math.max(0, profile.selectedIndex[stateKey] ?? 0),
      list.length - 1,
    );
    const preferred = list[preferredIdx];
    if (preferred && !this.animationErrors.has(preferred.assetId)) {
      return preferred;
    }
    for (const candidate of list) {
      if (!this.animationErrors.has(candidate.assetId)) {
        return candidate;
      }
    }
    return null;
  }

  private computeReplacedAnimations(
    rawAnimations: AnimationRequest[],
    syncSimulator: boolean,
  ): AnimationRequest[] {
    const prevState = this.currentLocomotionState;
    const { locomotionState, typing, hasExternalNonSystemAnim } =
      this.detectStateFromRaw(rawAnimations);
    this.currentLocomotionState = locomotionState;
    this.isTypingActive = typing;

    const profile = this.getActiveProfile();

    // Respect `overrideSits` and `smartSit` (do not clobber furniture/poseball custom sit poses)
    const suppressSitOverride =
      locomotionState === 'sit' &&
      (!this.state.overrideSits || (this.state.smartSit && hasExternalNonSystemAnim));

    const chosenMain = suppressSitOverride
      ? null
      : this.pickOverrideForState(profile, locomotionState);
    const chosenTyping = typing ? this.pickOverrideForState(profile, 'typing') : null;

    const nextOverrideId = chosenMain?.assetId ?? null;
    const nextTypingId = chosenTyping?.assetId ?? null;

    if (syncSimulator) {
      this.syncActiveOverridesToSimulator(nextOverrideId, nextTypingId);
    } else {
      this.activeOverrideId = nextOverrideId;
      this.activeTypingOverrideId = nextTypingId;
    }

    if (chosenMain) {
      void this.verifyAnimationAsset(chosenMain.assetId, chosenMain.name);
    }
    if (chosenTyping) {
      void this.verifyAnimationAsset(chosenTyping.assetId, chosenTyping.name);
    }

    if (prevState !== locomotionState) {
      this.syncStandTimer();
      this.notifyChange();
    }

    // Build local viewport animation list: replace default system locomotion UUIDs when overridden,
    // while keeping non-system animations (gestures, attachments) intact.
    const output: AnimationRequest[] = [];
    let insertedMain = false;
    let insertedTyping = false;

    for (const entry of rawAnimations) {
      const lower = String(entry.id || '').toLowerCase();
      const sysDef = SYSTEM_UUID_TO_STATE.get(lower);
      if (sysDef) {
        if (sysDef.key === 'typing') {
          if (nextTypingId) {
            if (!insertedTyping) {
              output.push({ id: nextTypingId, seq: this.overrideSeq });
              insertedTyping = true;
            }
          } else {
            output.push(entry);
          }
          continue;
        }
        // System locomotion animation: replace with AO override if one is active
        if (nextOverrideId) {
          if (!insertedMain) {
            output.push({ id: nextOverrideId, seq: this.overrideSeq });
            insertedMain = true;
          }
        } else {
          output.push(entry);
        }
      } else {
        output.push(entry);
      }
    }

    if (nextOverrideId && !insertedMain) {
      output.push({ id: nextOverrideId, seq: this.overrideSeq });
    }
    if (nextTypingId && !insertedTyping) {
      output.push({ id: nextTypingId, seq: this.overrideSeq });
    }

    return output;
  }

  private recomputeAndApply(syncSimulator: boolean) {
    const replaced = this.computeReplacedAnimations(this.lastRawServerAnimations, syncSimulator);
    this.world?.applyLocalAnimations(replaced);
  }

  private restoreDefaultLocomotion() {
    this.syncActiveOverridesToSimulator(null, null);
    this.knownSentOverrides.clear();
    const restored =
      this.lastRawServerAnimations.length > 0
        ? this.lastRawServerAnimations.map((a) => ({ id: a.id, seq: a.seq }))
        : [{ id: DEFAULT_STAND_ANIMATION_UUID, seq: 0 }];
    this.world?.applyLocalAnimations(restored);
  }

  private syncActiveOverridesToSimulator(nextMainId: string | null, nextTypingId: string | null) {
    const prevMain = this.activeOverrideId;
    const prevTyping = this.activeTypingOverrideId;
    this.activeOverrideId = nextMainId;
    this.activeTypingOverrideId = nextTypingId;

    const commands = new Map<string, boolean>();
    if (prevMain && prevMain !== nextMainId && prevMain !== nextTypingId) {
      commands.set(prevMain, false);
    }
    if (prevTyping && prevTyping !== nextTypingId && prevTyping !== nextMainId) {
      commands.set(prevTyping, false);
    }
    if (nextMainId && nextMainId !== prevMain) {
      commands.set(nextMainId, true);
      this.knownSentOverrides.add(nextMainId);
    }
    if (nextTypingId && nextTypingId !== prevTyping && nextTypingId !== nextMainId) {
      commands.set(nextTypingId, true);
      this.knownSentOverrides.add(nextTypingId);
    }

    if (commands.size === 0) return;

    const outbound = [...commands.entries()].map(([id, start]) => ({ id, start }));
    void this.dispatchSimulatorAnimations(outbound);
  }

  private async dispatchSimulatorAnimations(
    animations: Array<{ id: string; start: boolean }>,
  ): Promise<void> {
    if (!this.protocol?.connected || typeof this.protocol.sendAgentAnimations !== 'function') {
      return;
    }
    try {
      await this.protocol.sendAgentAnimations(animations);
    } catch (error) {
      console.warn('[AOEngine] Failed to send AgentAnimation packet:', error);
    }
  }
}
