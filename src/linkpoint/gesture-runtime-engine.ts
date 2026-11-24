/**
 * Dedicated Gesture Runtime Engine and Action Pipeline
 *
 * Coordinates gesture registration, compilation (including Second Life LLMultiGesture v2 assets
 * and structured step definitions), bounded memory step graphs (<= 5 MiB), yielding sequential
 * step execution, hotkey listeners with text-focus guards, outbound chat trigger matching/revision,
 * and non-blocking ActivateGestures / DeactivateGestures simulator synchronization.
 */

import { Utils } from './utils';
import { matchesKeyBinding, formatKeyString } from './key-bindings';
import { isTypingTarget } from './keyboard-motion';

/** Maximum memory footprint allowed for compiled gesture step graphs (5 MiB). */
export const MAX_GESTURE_GRAPH_MEMORY_BYTES = 5 * 1024 * 1024;

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Second Life LLMultiGesture step type codes (`indra/llcharacter/llmultigesture.h`). */
export const SL_GESTURE_STEP_TYPE = {
  ANIMATION: 0,
  SOUND: 1,
  CHAT: 2,
  WAIT: 3,
} as const;

/** Second Life LLMultiGesture step flag bitmasks (`indra/llcharacter/llmultigesture.h`). */
export const SL_GESTURE_FLAGS = {
  ANIM_FLAG_STOP: 0x01,
  WAIT_TIME: 0x01,
  WAIT_ANIM_DONE: 0x02,
} as const;

/** Second Life LLKeyboard modifier masks (`indra/llui/llkeyboard.h`). */
const SL_MASK_SHIFT = 0x01;
const SL_MASK_CONTROL = 0x02;
const SL_MASK_ALT = 0x04;

/** Second Life LLKeyboard special key codes (`indra/llui/llkeyboard.h`). */
const SL_KEY_CODE_MAP: Readonly<Record<number, string>> = {
  0x81: 'F1',
  0x82: 'F2',
  0x83: 'F3',
  0x84: 'F4',
  0x85: 'F5',
  0x86: 'F6',
  0x87: 'F7',
  0x88: 'F8',
  0x89: 'F9',
  0x8a: 'F10',
  0x8b: 'F11',
  0x8c: 'F12',
};

export type GestureStepType = 'animation' | 'sound' | 'chat' | 'wait';

export interface GestureStepInput {
  type: GestureStepType | 0 | 1 | 2 | 3;
  id?: string;
  assetId?: string;
  animId?: string;
  soundId?: string;
  name?: string;
  text?: string;
  message?: string;
  channel?: number;
  chatType?: number;
  gain?: number;
  volume?: number;
  durationMs?: number;
  seconds?: number;
  duration?: number;
  stop?: boolean;
  waitForAnimDone?: boolean;
  flags?: number;
}

export interface LegacyGestureMediaEntry {
  id?: string;
  assetId?: string;
  animId?: string;
  soundId?: string;
  name?: string;
  stop?: boolean;
  durationMs?: number;
  duration?: number;
  delayMs?: number;
  gain?: number;
  volume?: number;
  flags?: number;
}

export interface GestureDefinitionInput {
  id?: string;
  itemId?: string;
  assetId?: string;
  name?: string;
  trigger?: string;
  replaceWith?: string;
  replacement?: string;
  hotkey?: string;
  shortcutKey?: string;
  key?: string | number;
  mask?: number;
  active?: boolean;
  gestureFlags?: number;
  consumeTrigger?: boolean;
  steps?: GestureStepInput[];
  animations?: Array<string | LegacyGestureMediaEntry>;
  sounds?: Array<string | LegacyGestureMediaEntry>;
  assetData?: string;
  rawAsset?: string;
  [key: string]: unknown;
}

export interface CompiledGestureStep {
  readonly index: number;
  readonly nextIndex: number;
  readonly type: GestureStepType;
  readonly assetId: string;
  readonly name: string;
  readonly text: string;
  readonly channel: number;
  readonly chatType: number;
  readonly gain: number;
  readonly durationMs: number;
  readonly stopAnimation: boolean;
  readonly waitForAnimDone: boolean;
  readonly flags: number;
}

export interface CompiledGestureGraph {
  readonly id: string;
  readonly itemId: string;
  readonly assetId: string;
  readonly name: string;
  readonly trigger: string;
  readonly triggerLower: string;
  readonly replaceWith: string;
  readonly hotkey: string;
  readonly gestureFlags: number;
  readonly consumeTrigger: boolean;
  readonly steps: readonly CompiledGestureStep[];
  readonly byteSize: number;
}

export interface RegisteredGestureRecord {
  readonly id: string;
  readonly compiled: CompiledGestureGraph;
  active: boolean;
}

export interface GestureExecutionResult {
  gestureId: string;
  completed: boolean;
  aborted: boolean;
  stepsExecuted: number;
}

export interface ChatTriggerProcessResult {
  triggered: boolean;
  consumed: boolean;
  text: string;
  matchedGestureIds: string[];
  executions: Promise<GestureExecutionResult>[];
}

export interface GestureTransportBridge {
  connected?: boolean;
  activateGestures?: (params: {
    gestures: Array<{ itemId: string; assetId?: string; gestureFlags?: number }>;
    flags?: number;
  }) => Promise<unknown>;
  deactivateGestures?: (params: {
    gestures: Array<{ itemId: string; gestureFlags?: number }>;
    flags?: number;
  }) => Promise<unknown>;
  setAgentAnimation?: (params: {
    animations?: Array<{ animId: string; start?: boolean; stop?: boolean }>;
    animId?: string;
    start?: boolean;
    stop?: boolean;
  }) => Promise<unknown>;
  triggerGestureSound?: (params: {
    soundId: string;
    gain?: number;
    position?: number[];
  }) => Promise<unknown>;
  fetchGesture?: (
    id: string,
    itemId?: string,
  ) => Promise<{ id: string; itemId?: string; data: string; size: number }>;
}

export interface GestureActionHandlers {
  onAnimation?: (step: CompiledGestureStep, gesture: CompiledGestureGraph) => void | Promise<void>;
  onSound?: (step: CompiledGestureStep, gesture: CompiledGestureGraph) => void | Promise<void>;
  onChat?: (step: CompiledGestureStep, gesture: CompiledGestureGraph) => void | Promise<void>;
  resolveAnimationDurationMs?: (animId: string) => number | undefined;
}

export interface GestureKeyTarget {
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
}

export interface GestureRuntimeOptions {
  maxMemoryBytes?: number;
  bridge?: GestureTransportBridge | null;
  handlers?: GestureActionHandlers;
  keyTarget?: GestureKeyTarget | null;
  scheduler?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearScheduler?: (handle: ReturnType<typeof setTimeout>) => void;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deterministicUuidFromSeed(seed: string): string {
  if (UUID_PATTERN.test(seed)) return seed.toLowerCase();
  let h1 = 0xdeadbeef ^ seed.length;
  let h2 = 0x41c6ce57 ^ seed.length;
  let h3 = 0x9e3779b9 ^ seed.length;
  let h4 = 0x85ebca6b ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 2246822507);
    h4 = Math.imul(h4 ^ ch, 3266489909);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  const raw = `${hex(h1)}${hex(h2)}${hex(h3)}${hex(h4)}`;
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-4${raw.slice(13, 16)}-a${raw.slice(17, 20)}-${raw.slice(20, 32)}`;
}

function slKeyAndMaskToHotkey(keyCode: number, mask: number): string {
  if (!Number.isFinite(keyCode) || keyCode <= 0) return '';
  let baseKey = SL_KEY_CODE_MAP[keyCode] || '';
  if (!baseKey && keyCode >= 0x20 && keyCode <= 0x7e) {
    baseKey = String.fromCharCode(keyCode).toUpperCase();
  }
  if (!baseKey) return '';
  const parts: string[] = [];
  if (mask & SL_MASK_CONTROL) parts.push('Ctrl');
  if (mask & SL_MASK_ALT) parts.push('Alt');
  if (mask & SL_MASK_SHIFT) parts.push('Shift');
  parts.push(baseKey);
  return parts.join('+');
}

/**
 * Parses a Second Life `LLMultiGesture` version 2 asset text payload into a `GestureDefinitionInput`.
 */
export function parseMultiGestureAsset(
  rawText: string,
  metadata: {
    id?: string;
    itemId?: string;
    assetId?: string;
    name?: string;
    active?: boolean;
  } = {},
): GestureDefinitionInput {
  const lines = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  let cursor = 0;
  const nextLine = () => (cursor < lines.length ? lines[cursor++] : '');

  const versionStr = nextLine().trim();
  const version = Number.parseInt(versionStr, 10);
  if (version !== 2) {
    throw new Error(`Unsupported Second Life gesture asset version: ${versionStr || 'empty'}`);
  }

  const keyMaskParts = nextLine().trim().split(/\s+/);
  const keyCode = Number.parseInt(keyMaskParts[0] || '0', 10) || 0;
  const maskCode = Number.parseInt(keyMaskParts[1] || '0', 10) || 0;
  const hotkey = slKeyAndMaskToHotkey(keyCode, maskCode);

  const trigger = nextLine().trim();
  const replaceWith = nextLine();
  const stepCount = Math.max(0, Number.parseInt(nextLine().trim() || '0', 10) || 0);

  const steps: GestureStepInput[] = [];
  for (let i = 0; i < stepCount && cursor < lines.length; i++) {
    const stepTypeRaw = nextLine().trim();
    if (!stepTypeRaw) break;
    const stepType = Number.parseInt(stepTypeRaw, 10);
    if (stepType === SL_GESTURE_STEP_TYPE.ANIMATION) {
      const animName = nextLine();
      const animId = nextLine().trim();
      const animFlags = Number.parseInt(nextLine().trim() || '0', 10) || 0;
      steps.push({
        type: 'animation',
        name: animName,
        animId,
        stop: Boolean(animFlags & SL_GESTURE_FLAGS.ANIM_FLAG_STOP),
        flags: animFlags,
      });
    } else if (stepType === SL_GESTURE_STEP_TYPE.SOUND) {
      const soundName = nextLine();
      const soundId = nextLine().trim();
      const soundFlags = Number.parseInt(nextLine().trim() || '0', 10) || 0;
      steps.push({
        type: 'sound',
        name: soundName,
        soundId,
        flags: soundFlags,
      });
    } else if (stepType === SL_GESTURE_STEP_TYPE.CHAT) {
      const chatText = nextLine();
      const chatFlags = Number.parseInt(nextLine().trim() || '0', 10) || 0;
      steps.push({
        type: 'chat',
        text: chatText,
        flags: chatFlags,
      });
    } else if (stepType === SL_GESTURE_STEP_TYPE.WAIT) {
      const waitSeconds = Number.parseFloat(nextLine().trim() || '0') || 0;
      const waitFlags = Number.parseInt(nextLine().trim() || '0', 10) || 0;
      const waitTimeEnabled = waitFlags === 0 || Boolean(waitFlags & SL_GESTURE_FLAGS.WAIT_TIME);
      steps.push({
        type: 'wait',
        durationMs: waitTimeEnabled ? Math.max(0, Math.round(waitSeconds * 1000)) : 0,
        waitForAnimDone: Boolean(waitFlags & SL_GESTURE_FLAGS.WAIT_ANIM_DONE),
        flags: waitFlags,
      });
    }
  }

  return {
    id: metadata.id,
    itemId: metadata.itemId,
    assetId: metadata.assetId,
    name: metadata.name || 'Gesture',
    trigger,
    replaceWith,
    hotkey,
    active: metadata.active,
    steps,
  };
}

function estimateStringBytes(value: string): number {
  return 24 + value.length * 2;
}

function estimateCompiledGraphBytes(
  meta: {
    id: string;
    itemId: string;
    assetId: string;
    name: string;
    trigger: string;
    triggerLower: string;
    replaceWith: string;
    hotkey: string;
  },
  steps: readonly CompiledGestureStep[],
): number {
  let bytes =
    128 +
    estimateStringBytes(meta.id) +
    estimateStringBytes(meta.itemId) +
    estimateStringBytes(meta.assetId) +
    estimateStringBytes(meta.name) +
    estimateStringBytes(meta.trigger) +
    estimateStringBytes(meta.triggerLower) +
    estimateStringBytes(meta.replaceWith) +
    estimateStringBytes(meta.hotkey);

  for (const step of steps) {
    bytes +=
      96 +
      estimateStringBytes(step.type) +
      estimateStringBytes(step.assetId) +
      estimateStringBytes(step.name) +
      estimateStringBytes(step.text);
  }
  return bytes;
}

function isFocusedTextElement(element: unknown): boolean {
  if (!element || typeof element !== 'object') return false;
  if (isTypingTarget(element as EventTarget)) return true;
  const candidate = element as {
    contentEditable?: string;
    getAttribute?: (attr: string) => string | null;
  };
  if (candidate.contentEditable === 'true') return true;
  if (typeof candidate.getAttribute === 'function') {
    const ce = candidate.getAttribute('contenteditable');
    if (ce === '' || ce === 'true' || ce === 'plaintext-only') return true;
  }
  return false;
}

export class GestureRuntimeEngine extends Utils.EventEmitter {
  private readonly maxMemoryBytes: number;
  private bridge: GestureTransportBridge | null;
  private handlers: GestureActionHandlers;
  private keyTarget: GestureKeyTarget | null = null;
  private readonly scheduleTimer: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  private readonly cancelTimer: (handle: ReturnType<typeof setTimeout>) => void;

  private readonly records = new Map<string, RegisteredGestureRecord>();
  private readonly activeExecutions = new Map<string, Set<AbortController>>();
  private compiledMemoryBytes = 0;

  constructor(options: GestureRuntimeOptions = {}) {
    super();
    this.maxMemoryBytes =
      typeof options.maxMemoryBytes === 'number' && options.maxMemoryBytes > 0
        ? Math.min(options.maxMemoryBytes, MAX_GESTURE_GRAPH_MEMORY_BYTES)
        : MAX_GESTURE_GRAPH_MEMORY_BYTES;
    this.bridge = options.bridge ?? null;
    this.handlers = options.handlers ? { ...options.handlers } : {};
    this.scheduleTimer = options.scheduler ?? ((cb, ms) => setTimeout(cb, ms));
    this.cancelTimer = options.clearScheduler ?? ((h) => clearTimeout(h));

    if (options.keyTarget) {
      this.attachKeyListener(options.keyTarget);
    }
  }

  public setBridge(bridge: GestureTransportBridge | null): void {
    this.bridge = bridge;
  }

  public setHandlers(handlers: GestureActionHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  public getMemoryUsageBytes(): number {
    return this.compiledMemoryBytes;
  }

  public get memoryUsageBytes(): number {
    return this.compiledMemoryBytes;
  }

  public getMaxMemoryBytes(): number {
    return this.maxMemoryBytes;
  }

  /**
   * Attaches keyboard shortcut listener to `target` (defaults to `window` when available).
   */
  public attachKeyListener(target?: GestureKeyTarget | null): void {
    this.detachKeyListener();
    const resolved =
      target ?? (typeof window !== 'undefined' ? (window as unknown as GestureKeyTarget) : null);
    if (!resolved || typeof resolved.addEventListener !== 'function') return;
    this.keyTarget = resolved;
    this.keyTarget.addEventListener('keydown', this.onKeyDown as EventListener);
  }

  public detachKeyListener(): void {
    if (this.keyTarget && typeof this.keyTarget.removeEventListener === 'function') {
      this.keyTarget.removeEventListener('keydown', this.onKeyDown as EventListener);
    }
    this.keyTarget = null;
  }

  public destroy(): void {
    this.detachKeyListener();
    this.stopAll();
    this.clear();
  }

  /**
   * Compiles a raw gesture definition or Second Life LLMultiGesture asset into an immutable step graph.
   */
  public compileGesture(
    gestureId: string,
    input: GestureDefinitionInput | string,
  ): CompiledGestureGraph {
    const cleanId = String(gestureId || '').trim();
    if (!cleanId) {
      throw new Error('Valid gesture ID required');
    }

    let def: GestureDefinitionInput;
    if (typeof input === 'string') {
      def = parseMultiGestureAsset(input, { id: cleanId });
    } else if (input && typeof input === 'object') {
      const rawAsset =
        typeof input.assetData === 'string' && input.assetData.trim()
          ? input.assetData
          : typeof input.rawAsset === 'string' && input.rawAsset.trim()
            ? input.rawAsset
            : '';
      if (rawAsset && !Array.isArray(input.steps)) {
        const parsed = parseMultiGestureAsset(rawAsset, {
          id: cleanId,
          itemId: input.itemId ? String(input.itemId) : undefined,
          assetId: input.assetId ? String(input.assetId) : undefined,
          name: input.name ? String(input.name) : undefined,
          active: typeof input.active === 'boolean' ? input.active : undefined,
        });
        def = {
          ...parsed,
          ...input,
          trigger: input.trigger !== undefined ? input.trigger : parsed.trigger,
          replaceWith: input.replaceWith !== undefined ? input.replaceWith : parsed.replaceWith,
          hotkey: input.hotkey !== undefined ? input.hotkey : parsed.hotkey,
          steps: parsed.steps,
        };
      } else {
        def = input;
      }
    } else {
      throw new Error('Valid gesture data required');
    }

    const rawItemId = String(def.itemId || cleanId).trim();
    const itemId = UUID_PATTERN.test(rawItemId)
      ? rawItemId.toLowerCase()
      : deterministicUuidFromSeed(rawItemId);
    const rawAssetId = String(def.assetId || '').trim();
    const assetId = rawAssetId
      ? UUID_PATTERN.test(rawAssetId)
        ? rawAssetId.toLowerCase()
        : deterministicUuidFromSeed(rawAssetId)
      : ZERO_UUID;

    const name = String(def.name || 'Gesture').trim() || 'Gesture';
    const trigger = String(def.trigger || '').trim();
    const triggerLower = trigger.toLowerCase();
    const replaceWith =
      def.replaceWith !== undefined
        ? String(def.replaceWith)
        : def.replacement !== undefined
          ? String(def.replacement)
          : '';

    let hotkey = '';
    const rawHotkey = def.hotkey ?? def.shortcutKey ?? (typeof def.key === 'string' ? def.key : '');
    if (typeof rawHotkey === 'string' && rawHotkey.trim()) {
      hotkey = formatKeyString(rawHotkey.trim()) || rawHotkey.trim();
    } else if (typeof def.key === 'number' && def.key > 0) {
      hotkey = slKeyAndMaskToHotkey(def.key, Number(def.mask) || 0);
    }

    const rawSteps: GestureStepInput[] = [];
    if (Array.isArray(def.steps)) {
      rawSteps.push(...def.steps);
    } else {
      if (Array.isArray(def.sounds)) {
        for (const s of def.sounds) {
          if (typeof s === 'string') {
            rawSteps.push({ type: 'sound', soundId: s });
          } else if (s && typeof s === 'object') {
            rawSteps.push({
              type: 'sound',
              soundId: s.soundId || s.assetId || s.id || '',
              name: s.name,
              gain: s.gain ?? s.volume,
              flags: s.flags,
            });
            if (typeof s.delayMs === 'number' && s.delayMs > 0) {
              rawSteps.push({ type: 'wait', durationMs: s.delayMs });
            }
          }
        }
      }
      if (Array.isArray(def.animations)) {
        for (const a of def.animations) {
          if (typeof a === 'string') {
            rawSteps.push({ type: 'animation', animId: a });
          } else if (a && typeof a === 'object') {
            rawSteps.push({
              type: 'animation',
              animId: a.animId || a.assetId || a.id || '',
              name: a.name,
              stop: a.stop,
              durationMs:
                typeof a.durationMs === 'number'
                  ? a.durationMs
                  : typeof a.duration === 'number'
                    ? a.duration
                    : 0,
              flags: a.flags,
            });
            if (typeof a.delayMs === 'number' && a.delayMs > 0) {
              rawSteps.push({ type: 'wait', durationMs: a.delayMs });
            }
          }
        }
      }
    }

    const compiledSteps: CompiledGestureStep[] = rawSteps.map((step, idx) => {
      const normalizedType = this.normalizeStepType(step.type);
      const flags = Number(step.flags ?? 0) || 0;
      const stepAsset = String(step.animId || step.soundId || step.assetId || step.id || '').trim();
      const text = String(step.text ?? step.message ?? '');
      const channel = Number.isFinite(Number(step.channel)) ? Number(step.channel) : 0;
      const chatType = Number.isFinite(Number(step.chatType)) ? Number(step.chatType) : 1;
      const rawGain = Number(step.gain ?? step.volume ?? 1.0);
      const gain = Number.isFinite(rawGain) ? Math.max(0, Math.min(1, rawGain)) : 1.0;

      let durationMs = 0;
      if (typeof step.durationMs === 'number' && Number.isFinite(step.durationMs)) {
        durationMs = Math.max(0, Math.round(step.durationMs));
      } else if (typeof step.seconds === 'number' && Number.isFinite(step.seconds)) {
        durationMs = Math.max(0, Math.round(step.seconds * 1000));
      } else if (typeof step.duration === 'number' && Number.isFinite(step.duration)) {
        durationMs = Math.max(0, Math.round(step.duration * 1000));
      }

      const stopAnimation = Boolean(step.stop) || Boolean(flags & SL_GESTURE_FLAGS.ANIM_FLAG_STOP);
      const waitForAnimDone =
        Boolean(step.waitForAnimDone) || Boolean(flags & SL_GESTURE_FLAGS.WAIT_ANIM_DONE);

      return Object.freeze({
        index: idx,
        nextIndex: idx + 1 < rawSteps.length ? idx + 1 : -1,
        type: normalizedType,
        assetId: stepAsset,
        name: String(step.name || ''),
        text,
        channel,
        chatType,
        gain,
        durationMs,
        stopAnimation,
        waitForAnimDone,
        flags,
      });
    });

    const frozenSteps = Object.freeze(compiledSteps);
    const gestureFlags = (Number(def.gestureFlags ?? 0) || 0) >>> 0;
    const consumeTrigger =
      typeof def.consumeTrigger === 'boolean'
        ? def.consumeTrigger
        : trigger.startsWith('/') && replaceWith.length === 0;

    const byteSize = estimateCompiledGraphBytes(
      { id: cleanId, itemId, assetId, name, trigger, triggerLower, replaceWith, hotkey },
      frozenSteps,
    );

    return Object.freeze({
      id: cleanId,
      itemId,
      assetId,
      name,
      trigger,
      triggerLower,
      replaceWith,
      hotkey,
      gestureFlags,
      consumeTrigger,
      steps: frozenSteps,
      byteSize,
    });
  }

  private normalizeStepType(raw: GestureStepInput['type']): GestureStepType {
    if (raw === 'animation' || raw === SL_GESTURE_STEP_TYPE.ANIMATION) return 'animation';
    if (raw === 'sound' || raw === SL_GESTURE_STEP_TYPE.SOUND) return 'sound';
    if (raw === 'chat' || raw === SL_GESTURE_STEP_TYPE.CHAT) return 'chat';
    if (raw === 'wait' || raw === SL_GESTURE_STEP_TYPE.WAIT) return 'wait';
    throw new Error(`Unsupported gesture step type: ${String(raw)}`);
  }

  /**
   * Registers and compiles a gesture into the runtime engine while enforcing the 5 MiB memory cap.
   * When `syncNetwork` is true and `active` is true, dispatches ActivateGestures non-blockingly.
   */
  public registerGesture(
    gestureId: string,
    gestureData: GestureDefinitionInput | string,
    options: { syncNetwork?: boolean } = {},
  ): CompiledGestureGraph {
    const compiled = this.compileGesture(gestureId, gestureData);
    const existing = this.records.get(compiled.id);
    const existingBytes = existing ? existing.compiled.byteSize : 0;
    const nextMemoryBytes = this.compiledMemoryBytes - existingBytes + compiled.byteSize;

    if (nextMemoryBytes > this.maxMemoryBytes) {
      throw new Error(
        `Gesture step graph memory limit exceeded (${nextMemoryBytes} bytes > ${this.maxMemoryBytes} bytes max)`,
      );
    }

    const explicitActive =
      typeof gestureData === 'object' &&
      gestureData !== null &&
      typeof gestureData.active === 'boolean'
        ? gestureData.active
        : undefined;
    const active =
      explicitActive !== undefined ? explicitActive : existing ? existing.active : true;

    this.compiledMemoryBytes = nextMemoryBytes;
    this.records.set(compiled.id, {
      id: compiled.id,
      compiled,
      active,
    });

    this.emit('gesture_registered', {
      id: compiled.id,
      gesture: compiled,
      active,
      memoryBytes: this.compiledMemoryBytes,
    });

    if (options.syncNetwork && active) {
      this.dispatchActivatePacket([compiled]);
    }

    return compiled;
  }

  public unregisterGesture(gestureId: string): boolean {
    const cleanId = String(gestureId || '').trim();
    const existing = this.records.get(cleanId);
    if (!existing) return false;

    this.stopGesture(cleanId);
    this.compiledMemoryBytes = Math.max(0, this.compiledMemoryBytes - existing.compiled.byteSize);
    this.records.delete(cleanId);
    this.emit('gesture_unregistered', { id: cleanId, memoryBytes: this.compiledMemoryBytes });
    return true;
  }

  public clear(): void {
    this.stopAll();
    this.records.clear();
    this.compiledMemoryBytes = 0;
  }

  public getGesture(gestureId: string): RegisteredGestureRecord | null {
    return this.records.get(String(gestureId || '').trim()) ?? null;
  }

  public getAllGestures(): RegisteredGestureRecord[] {
    return Array.from(this.records.values());
  }

  public getActiveGestures(): RegisteredGestureRecord[] {
    return Array.from(this.records.values()).filter((r) => r.active);
  }

  public isGestureActive(gestureId: string): boolean {
    return Boolean(this.records.get(String(gestureId || '').trim())?.active);
  }

  /**
   * Activates a registered gesture and dispatches a reliable ActivateGestures packet without blocking UI threads.
   */
  public activateGesture(gestureId: string): Promise<boolean> {
    return this.activateGestures([gestureId]).then((res) => res.count > 0);
  }

  /**
   * Activates multiple gestures in a single batch and synchronizes via ActivateGestures packet.
   */
  public async activateGestures(gestureIds: string[]): Promise<{ count: number }> {
    const targets: CompiledGestureGraph[] = [];
    for (const rawId of gestureIds) {
      const record = this.records.get(String(rawId || '').trim());
      if (!record) continue;
      record.active = true;
      targets.push(record.compiled);
      this.emit('gesture_activated', { id: record.id, gesture: record.compiled });
    }
    if (targets.length > 0) {
      await this.dispatchActivatePacket(targets);
    }
    return { count: targets.length };
  }

  /**
   * Deactivates a registered gesture, aborts in-flight executions, and transmits DeactivateGestures.
   */
  public deactivateGesture(gestureId: string): Promise<boolean> {
    return this.deactivateGestures([gestureId]).then((res) => res.count > 0);
  }

  /**
   * Deactivates multiple gestures in a single batch and transmits DeactivateGestures packet.
   */
  public async deactivateGestures(gestureIds: string[]): Promise<{ count: number }> {
    const targets: CompiledGestureGraph[] = [];
    for (const rawId of gestureIds) {
      const cleanId = String(rawId || '').trim();
      const record = this.records.get(cleanId);
      if (!record) continue;
      record.active = false;
      this.stopGesture(cleanId);
      targets.push(record.compiled);
      this.emit('gesture_deactivated', { id: record.id, gesture: record.compiled });
    }
    if (targets.length > 0) {
      await this.dispatchDeactivatePacket(targets);
    }
    return { count: targets.length };
  }

  /**
   * Non-blocking activation/deactivation state setter for UI toggles and InventorySpecialTypes.
   */
  public setGestureActive(gestureId: string, active: boolean = true): void {
    const cleanId = String(gestureId || '').trim();
    const record = this.records.get(cleanId);
    if (!record) return;
    record.active = Boolean(active);
    if (record.active) {
      this.emit('gesture_activated', { id: record.id, gesture: record.compiled });
      void this.dispatchActivatePacket([record.compiled]);
    } else {
      this.stopGesture(cleanId);
      this.emit('gesture_deactivated', { id: record.id, gesture: record.compiled });
      void this.dispatchDeactivatePacket([record.compiled]);
    }
  }

  private dispatchActivatePacket(gestures: CompiledGestureGraph[]): Promise<void> {
    if (!this.bridge?.connected || typeof this.bridge.activateGestures !== 'function') {
      return Promise.resolve();
    }
    return Promise.resolve()
      .then(() =>
        this.bridge!.activateGestures!({
          gestures: gestures.map((g) => ({
            itemId: g.itemId,
            assetId: g.assetId,
            gestureFlags: g.gestureFlags,
          })),
          flags: 0,
        }),
      )
      .then(() => undefined)
      .catch((err: unknown) => {
        this.emit('gesture_error', {
          action: 'activateGestures',
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }

  private dispatchDeactivatePacket(gestures: CompiledGestureGraph[]): Promise<void> {
    if (!this.bridge?.connected || typeof this.bridge.deactivateGestures !== 'function') {
      return Promise.resolve();
    }
    return Promise.resolve()
      .then(() =>
        this.bridge!.deactivateGestures!({
          gestures: gestures.map((g) => ({
            itemId: g.itemId,
            gestureFlags: g.gestureFlags,
          })),
          flags: 0,
        }),
      )
      .then(() => undefined)
      .catch((err: unknown) => {
        this.emit('gesture_error', {
          action: 'deactivateGestures',
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }

  /**
   * Stops any running sequence executions for a specific gesture ID.
   */
  public stopGesture(gestureId: string): void {
    const cleanId = String(gestureId || '').trim();
    const controllers = this.activeExecutions.get(cleanId);
    if (!controllers) return;
    for (const controller of controllers) {
      controller.abort();
    }
    this.activeExecutions.delete(cleanId);
    this.emit('gesture_stopped', { id: cleanId });
  }

  /**
   * Stops all currently running gesture step sequences.
   */
  public stopAll(): void {
    for (const [id, controllers] of this.activeExecutions.entries()) {
      for (const controller of controllers) {
        controller.abort();
      }
      this.emit('gesture_stopped', { id });
    }
    this.activeExecutions.clear();
  }

  private yieldDelay(delayMs: number, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        this.cancelTimer(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(false);
      };
      const timer = this.scheduleTimer(
        () => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', onAbort);
          resolve(!signal.aborted);
        },
        Math.max(0, delayMs),
      );
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /**
   * Executes a registered gesture's compiled step sequence asynchronously, yielding control
   * between steps so UI rendering and input handling are never blocked.
   */
  public async executeGesture(gestureId: string): Promise<GestureExecutionResult> {
    const cleanId = String(gestureId || '').trim();
    const record = this.records.get(cleanId);
    if (!record) {
      throw new Error(`Unknown gesture: ${cleanId}`);
    }

    const { compiled } = record;
    const controller = new AbortController();
    let controllers = this.activeExecutions.get(cleanId);
    if (!controllers) {
      controllers = new Set();
      this.activeExecutions.set(cleanId, controllers);
    }
    controllers.add(controller);

    let stepsExecuted = 0;
    let lastStartedAnimationDurationMs = 0;

    this.emit('gesture_started', { id: cleanId, gesture: compiled });

    try {
      let stepIndex = compiled.steps.length > 0 ? 0 : -1;
      while (stepIndex >= 0 && stepIndex < compiled.steps.length) {
        if (controller.signal.aborted) {
          return { gestureId: cleanId, completed: false, aborted: true, stepsExecuted };
        }

        const step = compiled.steps[stepIndex];
        if (step.type === 'wait') {
          let waitMs = step.durationMs;
          if (step.waitForAnimDone && lastStartedAnimationDurationMs > waitMs) {
            waitMs = lastStartedAnimationDurationMs;
          }
          const ok = await this.yieldDelay(waitMs, controller.signal);
          if (!ok) {
            return { gestureId: cleanId, completed: false, aborted: true, stepsExecuted };
          }
          stepsExecuted++;
          this.emit('gesture_step', { id: cleanId, step, stepIndex });
        } else {
          if (step.type === 'animation') {
            this.executeAnimationStep(step, compiled);
            if (!step.stopAnimation) {
              const resolvedDuration =
                step.durationMs ||
                (step.assetId ? this.handlers.resolveAnimationDurationMs?.(step.assetId) : 0) ||
                0;
              lastStartedAnimationDurationMs = resolvedDuration;
            } else {
              lastStartedAnimationDurationMs = 0;
            }
          } else if (step.type === 'sound') {
            this.executeSoundStep(step, compiled);
          } else if (step.type === 'chat') {
            this.executeChatStep(step, compiled);
          }

          stepsExecuted++;
          this.emit('gesture_step', { id: cleanId, step, stepIndex });

          // Yield control between consecutive non-wait steps to prevent UI thread freezing.
          const nextStep =
            step.nextIndex >= 0 && step.nextIndex < compiled.steps.length
              ? compiled.steps[step.nextIndex]
              : null;
          if (nextStep && nextStep.type !== 'wait') {
            const ok = await this.yieldDelay(0, controller.signal);
            if (!ok) {
              return { gestureId: cleanId, completed: false, aborted: true, stepsExecuted };
            }
          }
        }

        stepIndex = step.nextIndex;
      }

      this.emit('gesture_completed', { id: cleanId, stepsExecuted });
      return { gestureId: cleanId, completed: true, aborted: false, stepsExecuted };
    } finally {
      const set = this.activeExecutions.get(cleanId);
      if (set) {
        set.delete(controller);
        if (set.size === 0) {
          this.activeExecutions.delete(cleanId);
        }
      }
    }
  }

  private executeAnimationStep(step: CompiledGestureStep, gesture: CompiledGestureGraph): void {
    try {
      const res = this.handlers.onAnimation?.(step, gesture);
      if (res && typeof (res as Promise<void>).catch === 'function') {
        (res as Promise<void>).catch((err: unknown) => {
          this.emit('gesture_error', {
            action: 'animation_handler',
            gestureId: gesture.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (err) {
      this.emit('gesture_error', {
        action: 'animation_handler',
        gestureId: gesture.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (
      step.assetId &&
      UUID_PATTERN.test(step.assetId) &&
      this.bridge?.connected &&
      typeof this.bridge.setAgentAnimation === 'function'
    ) {
      void Promise.resolve()
        .then(() =>
          this.bridge!.setAgentAnimation!({
            animId: step.assetId,
            start: !step.stopAnimation,
          }),
        )
        .catch((err: unknown) => {
          this.emit('gesture_error', {
            action: 'setAgentAnimation',
            gestureId: gesture.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
  }

  private executeSoundStep(step: CompiledGestureStep, gesture: CompiledGestureGraph): void {
    try {
      const res = this.handlers.onSound?.(step, gesture);
      if (res && typeof (res as Promise<void>).catch === 'function') {
        (res as Promise<void>).catch((err: unknown) => {
          this.emit('gesture_error', {
            action: 'sound_handler',
            gestureId: gesture.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (err) {
      this.emit('gesture_error', {
        action: 'sound_handler',
        gestureId: gesture.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (
      step.assetId &&
      UUID_PATTERN.test(step.assetId) &&
      this.bridge?.connected &&
      typeof this.bridge.triggerGestureSound === 'function'
    ) {
      void Promise.resolve()
        .then(() =>
          this.bridge!.triggerGestureSound!({
            soundId: step.assetId,
            gain: step.gain,
          }),
        )
        .catch((err: unknown) => {
          this.emit('gesture_error', {
            action: 'triggerGestureSound',
            gestureId: gesture.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
  }

  private executeChatStep(step: CompiledGestureStep, gesture: CompiledGestureGraph): void {
    if (!step.text.trim()) return;
    try {
      const res = this.handlers.onChat?.(step, gesture);
      if (res && typeof (res as Promise<void>).catch === 'function') {
        (res as Promise<void>).catch((err: unknown) => {
          this.emit('gesture_error', {
            action: 'chat_handler',
            gestureId: gesture.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (err) {
      this.emit('gesture_error', {
        action: 'chat_handler',
        gestureId: gesture.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Processes a keyboard event and fires matching active hotkey gestures, ignoring keystrokes
   * whenever a text input (`event.target` or `document.activeElement`) has active focus.
   */
  public handleKeyDown(
    event:
      | KeyboardEvent
      | {
          key?: string;
          code?: string;
          ctrlKey?: boolean;
          altKey?: boolean;
          shiftKey?: boolean;
          metaKey?: boolean;
          repeat?: boolean;
          target?: EventTarget | null;
          preventDefault?: () => void;
        },
  ): Promise<GestureExecutionResult>[] {
    if (!event || event.repeat) return [];

    if (isFocusedTextElement(event.target)) return [];
    if (typeof document !== 'undefined' && isFocusedTextElement(document.activeElement)) {
      return [];
    }

    const executions: Promise<GestureExecutionResult>[] = [];
    for (const record of this.records.values()) {
      if (!record.active || !record.compiled.hotkey) continue;
      if (matchesKeyBinding(event, record.compiled.hotkey, true)) {
        executions.push(this.executeGesture(record.id));
      }
    }

    if (executions.length > 0) {
      event.preventDefault?.();
    }
    return executions;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    this.handleKeyDown(event);
  };

  /**
   * Evaluates outbound chat text against active gesture triggers (`LLGestureMgr::triggerAndReviseString`),
   * starts matching gesture sequences asynchronously, revises replacement text, and marks standalone
   * slash triggers as consumed when no replacement text is configured.
   */
  public processOutboundChat(
    rawMessage: string,
    _context: { channel?: number; type?: number; range?: string } = {},
  ): ChatTriggerProcessResult {
    const text = String(rawMessage ?? '');
    const trimmed = text.trim();
    if (!trimmed) {
      return {
        triggered: false,
        consumed: false,
        text,
        matchedGestureIds: [],
        executions: [],
      };
    }

    // Sort active triggers longest-first so specific multi-word or longer slash triggers match before prefixes.
    const candidates = Array.from(this.records.values())
      .filter((r) => r.active && r.compiled.triggerLower.length > 0)
      .sort((a, b) => b.compiled.triggerLower.length - a.compiled.triggerLower.length);

    if (candidates.length === 0) {
      return {
        triggered: false,
        consumed: false,
        text,
        matchedGestureIds: [],
        executions: [],
      };
    }

    const trimmedLower = trimmed.toLowerCase();
    const matchedIds: string[] = [];
    const executions: Promise<GestureExecutionResult>[] = [];

    // 1. Check exact full-line trigger match first (e.g. "/wave" or exact phrase).
    const exactMatches = candidates.filter((r) => r.compiled.triggerLower === trimmedLower);
    if (exactMatches.length > 0) {
      for (const record of exactMatches) {
        matchedIds.push(record.id);
        executions.push(this.executeGesture(record.id));
      }
      const primary = exactMatches[0].compiled;
      if (primary.replaceWith.length > 0) {
        return {
          triggered: true,
          consumed: false,
          text: primary.replaceWith,
          matchedGestureIds: matchedIds,
          executions,
        };
      }
      if (primary.consumeTrigger) {
        return {
          triggered: true,
          consumed: true,
          text: '',
          matchedGestureIds: matchedIds,
          executions,
        };
      }
      return {
        triggered: true,
        consumed: false,
        text,
        matchedGestureIds: matchedIds,
        executions,
      };
    }

    // 2. Token-boundary trigger scan across the outbound message.
    let revisedText = text;
    for (const record of candidates) {
      const { compiled } = record;
      const escaped = escapeRegExp(compiled.trigger);
      const pattern = new RegExp(`(^|\\s)(${escaped})(?=\\s|[.,!?;:]|$)`, 'gi');
      if (pattern.test(revisedText)) {
        matchedIds.push(record.id);
        executions.push(this.executeGesture(record.id));
        if (compiled.replaceWith.length > 0) {
          revisedText = revisedText.replace(
            new RegExp(`(^|\\s)(${escaped})(?=\\s|[.,!?;:]|$)`, 'gi'),
            `$1${compiled.replaceWith}`,
          );
        } else if (compiled.consumeTrigger) {
          revisedText = revisedText
            .replace(new RegExp(`(^|\\s)(${escaped})(?=\\s|[.,!?;:]|$)`, 'gi'), '$1')
            .replace(/\s{2,}/g, ' ')
            .trim();
        }
      }
    }

    const triggered = matchedIds.length > 0;
    const consumed = triggered && revisedText.trim().length === 0;
    return {
      triggered,
      consumed,
      text: consumed ? '' : revisedText,
      matchedGestureIds: matchedIds,
      executions,
    };
  }
}
