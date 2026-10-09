/**
 * RLV ("Restrained Love") command handling, ported from Firestorm's RLVa
 * (`indra/newview/rlvhandler.cpp`, `rlvhelper.cpp`, `rlvactions.cpp`, `rlvcommon.*`,
 * `llviewermessage.cpp` and `fsnearbychathub.cpp`). RLVa is (c) Kitty Barnett, LGPL 2.1 -
 * see docs/rlv.md. RLV is not part of the official Linden viewer; this follows RLVa and its
 * reported specification version (3.4.3).
 *
 * What is here: the command grammar, the per-object restriction table with reference counting,
 * exceptions (strict and permissive), distance and value modifiers, `@clear`, the reply commands that
 * need no inventory (`version*`, `getstatus*`, `getcommand`, `getgroup`, `getsitid`, `getcam_*`),
 * `@fly`, `@unsit`, `@sit`, `@tpto` through hooks, and the decisions the rest of the viewer asks
 * (`canSendIM`, `filterChat`, `canFly`, ...). Chat sent by objects (`llOwnerSay("@...")`) is handled in
 * `handleObjectChat`.
 *
 * What is not here: anything that needs the worn outfit or the inventory (`@attach*`, `@getoutfit`,
 * `@getinv`, `@findfolder`, `@remoutfit`, folder locks, ...). Those commands are accepted and tracked as
 * restrictions, force and reply forms answer `FAILED_UNSUPPORTED` (replies still send an empty answer so
 * a script waiting on its channel does not hang), and no enforcement exists for them.
 */
import { RLV_ANONYMS, RLV_BEHAVIOURS, RLV_STRINGS, RLV_SYNONYMS, type RlvOptionKind } from './rlv-data';
import { Utils } from './utils';

/** Specification version reported by `@version*` (`RLV_VERSION_*`) and the RLVa implementation it follows. */
export const RLV_VERSION = { major: 3, minor: 4, patch: 3, build: 0 } as const;
export const RLV_VERSION_COMPAT = { major: 2, minor: 9, patch: 28, build: 0 } as const;
export const RLVA_VERSION = { major: 2, minor: 4, patch: 2, implId: 13 } as const;

export const RLV_CMD_PREFIX = '@';
export const RLV_OPTION_SEPARATOR = ';';
/** `CHAT_CHANNEL_DEBUG`: not a valid reply channel. */
export const CHAT_CHANNEL_DEBUG = 2147483647;
/** `RLV_MODIFIER_*_DEFAULT` in `rlvdefines.h`. */
export const RLV_FARTOUCH_DEFAULT = 1.5;
export const RLV_SITTP_DEFAULT = 1.5;
export const RLV_TPLOCAL_DEFAULT = 256;
/** `DEFAULT_FIELD_OF_VIEW` (60 degrees, radians). */
export const DEFAULT_FIELD_OF_VIEW = 1.04719755;
/** `IMG_DEFAULT`. */
export const IMG_DEFAULT = 'd2114404-dd59-4a4d-8e6c-49359e91bbf0';

/** Chat types as the simulator numbers them. */
export const CHAT_TYPE = { WHISPER: 0, NORMAL: 1, SHOUT: 2, START: 4, STOP: 5, DEBUG: 6, REGION: 7, OWNER: 8, DIRECT: 9 } as const;
export const CHAT_SOURCE = { SYSTEM: 0, AGENT: 1, OBJECT: 2 } as const;

/** `ERlvCmdRet`. `FAILED_UNSUPPORTED` is ours: the command is valid but this viewer has no inventory or outfit to act on. */
export const RlvRet = {
  UNKNOWN: 0x0000,
  RETAINED: 0x0001,
  SUCCESS: 0x0100,
  SUCCESS_UNSET: 0x0101,
  SUCCESS_DUPLICATE: 0x0102,
  SUCCESS_DEPRECATED: 0x0103,
  SUCCESS_DELAYED: 0x0104,
  FAILED: 0x0200,
  FAILED_SYNTAX: 0x0201,
  FAILED_OPTION: 0x0202,
  FAILED_PARAM: 0x0203,
  FAILED_LOCK: 0x0204,
  FAILED_DISABLED: 0x0205,
  FAILED_UNKNOWN: 0x0206,
  FAILED_NOSHAREDROOT: 0x0207,
  FAILED_DEPRECATED: 0x0208,
  FAILED_NOBEHAVIOUR: 0x0209,
  FAILED_UNHELDBEHAVIOUR: 0x020a,
  FAILED_BLOCKED: 0x020b,
  FAILED_THROTTLED: 0x020c,
  FAILED_UNSUPPORTED: 0x020d,
} as const;
export type RlvRetCode = typeof RlvRet[keyof typeof RlvRet];
export const rlvSucceeded = (ret: number) => (ret & RlvRet.SUCCESS) === RlvRet.SUCCESS;
export const rlvFailed = (ret: number) => (ret & RlvRet.FAILED) === RlvRet.FAILED;

/** `RlvStrings::getStringFromReturnCode` (debug output). */
export function rlvReturnText(ret: number): string | null {
  switch (ret) {
    case RlvRet.SUCCESS_UNSET: return 'unset';
    case RlvRet.SUCCESS_DUPLICATE: return 'duplicate';
    case RlvRet.SUCCESS_DELAYED: return 'delayed';
    case RlvRet.SUCCESS_DEPRECATED: return 'deprecated';
    case RlvRet.FAILED_SYNTAX: return 'syntax error';
    case RlvRet.FAILED_OPTION: return 'invalid option';
    case RlvRet.FAILED_PARAM: return 'invalid param';
    case RlvRet.FAILED_LOCK: return 'locked command';
    case RlvRet.FAILED_DISABLED: return 'disabled command';
    case RlvRet.FAILED_UNKNOWN: return 'unknown command';
    case RlvRet.FAILED_NOSHAREDROOT: return 'missing #RLV';
    case RlvRet.FAILED_DEPRECATED: return 'deprecated and disabled';
    case RlvRet.FAILED_NOBEHAVIOUR: return 'no active behaviours';
    case RlvRet.FAILED_UNHELDBEHAVIOUR: return 'base behaviour not held';
    case RlvRet.FAILED_BLOCKED: return 'blocked object';
    case RlvRet.FAILED_THROTTLED: return 'throttled';
    case RlvRet.FAILED_UNSUPPORTED: return 'not supported by this viewer';
    default: return null;
  }
}

// ---- command parsing -------------------------------------------------------------------------------

export type RlvParamType = 'add' | 'remove' | 'clear' | 'force' | 'reply' | 'unknown';

export interface ParsedCommand { behaviour: string; option: string; param: string }

/** `RlvCommand::parseCommand`: `<behaviour>[:<option>]=<param>`. Null when improperly formatted. */
export function parseCommand(command: string): ParsedCommand | null {
  const idxParam = command.indexOf('=');
  let idxOption = idxParam > 0 ? command.indexOf(':') : -1;
  if (idxOption > idxParam - 1) idxOption = -1;
  // A missing <behaviour> is always malformed
  if (idxOption === 0 || idxParam === 0) return null;

  const behaviour = command.slice(0, idxOption !== -1 ? idxOption : (idxParam === -1 ? command.length : idxParam));
  // A missing <param> is malformed, except for "clear" (and "clear:<filter>")
  if (idxParam === -1 || command.length - 1 === idxParam) {
    if (behaviour === 'clear' && (idxOption === 0 || idxParam !== 0)) return { behaviour, option: '', param: '' };
    return null;
  }
  const option = idxOption !== -1 && idxOption + 1 !== idxParam ? command.slice(idxOption + 1, idxParam) : '';
  return { behaviour, option, param: command.slice(idxParam + 1) };
}

export class RlvCommand {
  readonly valid: boolean;
  readonly behaviour: string = '';
  readonly option: string = '';
  readonly param: string = '';
  readonly type: RlvParamType = 'unknown';
  readonly strict: boolean = false;
  /** The behaviour this command acts on (synonyms resolve to their target); null when unknown. */
  readonly name: string | null = null;
  /** Whether the reference count was taken for this command (`isRefCounted`). */
  refCounted = false;

  constructor(readonly objectId: string, command: string) {
    const parsed = parseCommand(command);
    if (!parsed) { this.valid = false; return; }
    this.behaviour = parsed.behaviour; this.option = parsed.option; this.param = parsed.param;
    let type: RlvParamType;
    if (this.param === 'n' || this.param === 'add') type = 'add';
    else if (this.param === 'y' || this.param === 'rem') type = 'remove';
    else if (this.behaviour === 'clear') type = 'clear';
    else if (this.param === 'force') type = 'force';
    else if (/^[+-]?\d+$/.test(this.param) && Number.isSafeInteger(Number(this.param))) type = 'reply';
    else type = 'unknown';
    this.type = type;
    this.valid = type !== 'unknown';
    if (!this.valid) { this.option = ''; this.param = ''; return; }
    const looked = lookupBehaviour(this.behaviour, type);
    this.strict = looked.strict;
    this.name = looked.name;
  }

  /** `RlvCommand::asString`: how the command is shown in `@getstatus` and used by `@clear:<filter>`. */
  asString(): string {
    if (this.type !== 'clear') return this.option ? `${this.behaviour}:${this.option}` : this.behaviour;
    return this.param ? `${this.behaviour}:${this.param}` : this.behaviour;
  }

  get hasOption() { return this.option !== ''; }
}

/** `RlvBehaviourDictionary::getBehaviourInfo`: handles the `_sec` strict suffix and synonyms. */
export function lookupBehaviour(behaviour: string, type: RlvParamType): { name: string | null; strict: boolean } {
  const wanted = type === 'force' ? 'force' : type === 'reply' ? 'reply' : 'add';
  const underscore = behaviour.lastIndexOf('_');
  const strict = underscore !== -1 && behaviour.slice(underscore + 1) === 'sec';
  const base = strict ? behaviour.slice(0, -4) : behaviour;
  const info = RLV_BEHAVIOURS[base];
  if (!info || !info.types.includes(wanted)) return { name: null, strict };
  if (strict && !info.strict) return { name: null, strict };
  return { name: RLV_SYNONYMS[base] ?? base, strict };
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const parseIntStrict = (value: string): number | null => (/^\s*[+-]?\d+/.test(value) ? parseInt(value, 10) : null);
const parseFloatStrict = (value: string): number | null => { const n = Number.parseFloat(value); return Number.isNaN(n) ? null : n; };
const isEmote = (text: string) => text.length > 4 && (text.startsWith('/me ') || text.startsWith("/me'"));
/** `RlvUtil::isValidReplyChannel`. */
export const isValidReplyChannel = (channel: number, loopback = false) => channel > (loopback ? -1 : 0) && channel !== CHAT_CHANNEL_DEBUG;

// ---- modifiers --------------------------------------------------------------------------------------

type ModValue = number | readonly number[] | string;
type ModKind = 'number' | 'vec3' | 'uuid';
interface ModifierDef { name: string; kind: ModKind; defaultValue: ModValue; addDefault: boolean; cmp: 'min' | 'max' | null }
interface ModEntry { value: ModValue; objectId: string; behaviour: string }

const F32_MAX = 3.4028234663852886e38;
/** `RlvBehaviourDictionary` modifier registrations (`addModifier`). */
const MODIFIERS: Record<string, ModifierDef & { behaviour: string }> = {
  fartouchdist: { behaviour: 'fartouch', name: 'Fartouch Distance', kind: 'number', defaultValue: RLV_FARTOUCH_DEFAULT, addDefault: true, cmp: 'min' },
  recvimdistmin: { behaviour: 'recvim', name: 'RecvIM Distance (Min)', kind: 'number', defaultValue: F32_MAX, addDefault: true, cmp: 'max' },
  recvimdistmax: { behaviour: 'recvim', name: 'RecvIM Distance (Max)', kind: 'number', defaultValue: F32_MAX, addDefault: true, cmp: 'min' },
  sendimdistmin: { behaviour: 'sendim', name: 'SendIM Distance (Min)', kind: 'number', defaultValue: F32_MAX, addDefault: true, cmp: 'max' },
  sendimdistmax: { behaviour: 'sendim', name: 'SendIM Distance (Max)', kind: 'number', defaultValue: F32_MAX, addDefault: true, cmp: 'min' },
  startimdistmin: { behaviour: 'startim', name: 'StartIM Distance (Min)', kind: 'number', defaultValue: F32_MAX, addDefault: true, cmp: 'max' },
  startimdistmax: { behaviour: 'startim', name: 'StartIM Distance (Max)', kind: 'number', defaultValue: F32_MAX, addDefault: true, cmp: 'min' },
  shownametagsdist: { behaviour: 'shownametags', name: 'Name Tags - Visible Distance', kind: 'number', defaultValue: 0, addDefault: true, cmp: 'min' },
  sittpdist: { behaviour: 'sittp', name: 'SitTp Distance', kind: 'number', defaultValue: RLV_SITTP_DEFAULT, addDefault: true, cmp: 'min' },
  tplocaldist: { behaviour: 'tplocal', name: 'Local Teleport Distance', kind: 'number', defaultValue: RLV_TPLOCAL_DEFAULT, addDefault: true, cmp: 'min' },
  setcam_avdist: { behaviour: 'setcam_avdist', name: 'Camera - Silhouette Distance', kind: 'number', defaultValue: 0, addDefault: false, cmp: 'max' },
  setcam_avdistmin: { behaviour: 'setcam_avdistmin', name: 'Camera - Avatar Distance (Min)', kind: 'number', defaultValue: 0, addDefault: false, cmp: 'max' },
  setcam_avdistmax: { behaviour: 'setcam_avdistmax', name: 'Camera - Avatar Distance (Max)', kind: 'number', defaultValue: F32_MAX, addDefault: false, cmp: 'min' },
  setcam_origindistmin: { behaviour: 'setcam_origindistmin', name: 'Camera - Focus Distance (Min)', kind: 'number', defaultValue: 0, addDefault: true, cmp: 'max' },
  setcam_origindistmax: { behaviour: 'setcam_origindistmax', name: 'Camera - Focus Distance (Max)', kind: 'number', defaultValue: F32_MAX, addDefault: true, cmp: 'min' },
  setcam_eyeoffset: { behaviour: 'setcam_eyeoffset', name: 'Camera - Eye Offset', kind: 'vec3', defaultValue: [0, 0, 0], addDefault: true, cmp: null },
  setcam_eyeoffsetscale: { behaviour: 'setcam_eyeoffsetscale', name: 'Camera - Eye Offset Scale', kind: 'number', defaultValue: 0, addDefault: true, cmp: null },
  setcam_focusoffset: { behaviour: 'setcam_focusoffset', name: 'Camera - Focus Offset', kind: 'vec3', defaultValue: [0, 0, 0], addDefault: true, cmp: null },
  setcam_fovmin: { behaviour: 'setcam_fovmin', name: 'Camera - FOV (Min)', kind: 'number', defaultValue: DEFAULT_FIELD_OF_VIEW, addDefault: true, cmp: 'max' },
  setcam_fovmax: { behaviour: 'setcam_fovmax', name: 'Camera - FOV (Max)', kind: 'number', defaultValue: DEFAULT_FIELD_OF_VIEW, addDefault: true, cmp: 'min' },
  setcam_texture: { behaviour: 'setcam_textures', name: 'Camera - Forced Texture', kind: 'uuid', defaultValue: IMG_DEFAULT, addDefault: true, cmp: null },
};
/** The modifier a single-modifier behaviour carries (recvim/sendim/startim have two and parse their own option). */
const MODIFIER_OF_BEHAVIOUR: Record<string, string> = {};
for (const [id, def] of Object.entries(MODIFIERS)) if (!['recvim', 'sendim', 'startim'].includes(def.behaviour)) MODIFIER_OF_BEHAVIOUR[def.behaviour] = id;

/** `RlvBehaviourModifier::convertOptionValue`. */
function convertModifierOption(option: string, kind: ModKind): ModValue | null {
  if (kind === 'number') { const n = parseFloatStrict(option); return n === null ? null : n; }
  if (kind === 'vec3') {
    const m = /^\s*([+-]?[\d.eE+-]+)\/([+-]?[\d.eE+-]+)\/([+-]?[\d.eE+-]+)/.exec(option);
    if (!m) return null;
    const v = [Number(m[1]), Number(m[2]), Number(m[3])];
    return v.some(Number.isNaN) ? null : v;
  }
  return isUuid(option) ? option.toLowerCase() : null;
}
const sameValue = (a: ModValue, b: ModValue) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => v === b[i]) : a === b);

class Modifier {
  readonly values: ModEntry[] = [];
  primaryObject = '';
  constructor(readonly def: ModifierDef) {}

  private sort() {
    const { cmp } = this.def;
    const primary = this.primaryObject;
    // Mirrors RlvBehaviourModifierComp: the primary object's values come first, then min/max order (stable otherwise).
    this.values.sort((a, b) => {
      const ap = primary && a.objectId === primary, bp = primary && b.objectId === primary;
      if (ap !== bp) return ap ? -1 : 1;
      if (cmp === 'min' && typeof a.value === 'number' && typeof b.value === 'number') return a.value - b.value;
      if (cmp === 'max' && typeof a.value === 'number' && typeof b.value === 'number') return b.value - a.value;
      return 0;
    });
  }

  addValue(value: ModValue, objectId: string, behaviour: string) {
    this.values.push({ value, objectId, behaviour });
    this.sort();
  }

  removeValue(value: ModValue, objectId: string, behaviour: string) {
    const at = this.values.findIndex((e) => e.objectId === objectId && e.behaviour === behaviour && sameValue(e.value, value));
    if (at !== -1) this.values.splice(at, 1);
  }

  clearValues(objectId: string) {
    for (let i = this.values.length - 1; i >= 0; i--) if (this.values[i].objectId === objectId) this.values.splice(i, 1);
  }

  hasValue() {
    if (!this.primaryObject) return this.values.length > 0;
    return this.values.length > 0 && this.values[0].objectId === this.primaryObject;
  }

  get value(): ModValue { return this.hasValue() ? this.values[0].value : this.def.defaultValue; }
}

// ---- per-object state ---------------------------------------------------------------------------------

export class RlvObject {
  readonly commands: RlvCommand[] = [];
  constructor(readonly id: string) {}

  /** Returns the existing duplicate (added=false) or the stored command. */
  addCommand(command: RlvCommand): { command: RlvCommand; added: boolean } {
    const dup = this.commands.find((c) => c.behaviour === command.behaviour && c.option === command.option && c.strict === command.strict);
    if (dup) return { command: dup, added: false };
    this.commands.push(command);
    return { command, added: true };
  }

  removeCommand(command: RlvCommand): boolean {
    const at = this.commands.findIndex((c) => c.behaviour === command.behaviour && c.option === command.option && c.strict === command.strict);
    if (at === -1) return false;
    this.commands.splice(at, 1);
    return true;
  }

  /** `RlvObject::hasBehaviour(bhvr, option, strictOnly)`; an empty option matches a reference-counted command. */
  hasBehaviour(name: string, option = '', strictOnly = false): boolean {
    return this.commands.some((c) => c.name === name && (c.option === option || (option === '' && c.refCounted)) && (!strictOnly || c.strict));
  }

  getStatusString(filter: string, separator: string): string {
    return this.commands.map((c) => c.asString()).filter((s) => !filter || s.includes(filter)).map((s) => separator + s).join('');
  }
}

type ExceptionOption = string | number;
interface RlvException { objectId: string; name: string; option: ExceptionOption }

/** What the handler needs from the rest of the viewer. Everything is optional; missing pieces make the commands that use them fail. */
export interface RlvEnvironment {
  /** The logged-in avatar's id. */
  selfId?(): string;
  /** Send chat as the avatar (replies are shouted on their channel). */
  sendChat?(text: string, channel: number, type: number): void;
  /** Send an IM to someone (busy replies for `@version` IM queries, remote notices). */
  sendInstantMessage?(recipientId: string, text: string): void;
  /** Squared distance in metres between the avatar and another avatar, or null when not in range. */
  avatarDistanceSquared?(id: string): number | null;
  /** The avatar's global position, metres. */
  agentPositionGlobal?(): readonly [number, number, number] | null;
  activeGroupName?(): string | null;
  /** The object the avatar sits on, '' when standing. */
  sitObjectId?(): string;
  isSitting?(): boolean;
  stand?(): void;
  sit?(objectId: string): boolean;
  sitOnGround?(): void;
  setFlying?(fly: boolean): void;
  isFlying?(): boolean;
  /** Teleport to a global position (and optional look-at angle in radians). */
  teleportToGlobal?(position: readonly [number, number, number], lookAtAngle?: number): void;
  /** Look up a region by name and teleport to a position inside it. */
  teleportToRegion?(region: string, position: readonly [number, number, number], lookAtAngle?: number): void;
  /** Names of nearby avatars for `filterNames`: `{ id, displayName, legacyName }`. */
  nearbyAvatars?(): Array<{ id: string; displayName: string; legacyName: string }>;
  /** Names of the regions and parcel mentioned by `filterLocation`. */
  locationNames?(): { regions: string[]; parcel: string | null };
  /** Is the object known and owned by us as an attachment (chat from our own attachments is never filtered). */
  isOwnAttachment?(objectId: string): boolean;
  now?(): number;
  random?(): number;
}

/** What the touch, edit and sit checks need to know about an object. */
export interface RlvObjectInfo {
  id: string;
  /** Root prim of the linkset. */
  rootId: string;
  isAttachment: boolean;
  isHud: boolean;
  isOwnedByYou: boolean;
  isVolume: boolean;
  /** Avatar wearing it, when it is an attachment. */
  wearerId?: string;
  /** Squared metres from the avatar to the object's centre plus the pick offset. */
  distanceSquared: number;
}

export interface RlvChatEvent {
  /** Text with any filtering applied; null when the message must be dropped. */
  text: string | null;
  fromName?: string;
}

export class RlvHandler extends Utils.EventEmitter {
  private enabled = false;
  /** Object id -> its restrictions. */
  readonly objects = new Map<string, RlvObject>();
  private readonly behaviours = new Map<string, number>();
  private exceptions: RlvException[] = [];
  private readonly modifiers = new Map<string, Modifier>();
  private readonly blockedObjects = new Set<string>();
  private readonly commandStack: RlvCommand[] = [];
  private readonly notifications: Array<{ objectId: string; channel: number; filter: string }> = [];
  /** Name filtering context (`RlvActions::s_BlockNamesContexts[SNC_DEFAULT]`). */
  private blockNames = false;
  /** `RestrainedLoveShowEllipsis` and `RestrainedLoveCanOoc`. */
  showEllipsis = true;
  canOoc = true;
  /** Shown in place of a blocked message. */
  debug = false;

  constructor(private env: RlvEnvironment = {}) {
    super();
    for (const [id, def] of Object.entries(MODIFIERS)) this.modifiers.set(id, new Modifier(def));
  }

  setEnvironment(env: RlvEnvironment) { this.env = env; }

  isEnabled() { return this.enabled; }

  /** Turn RLV on or off. Turning it off forgets every restriction (`RlvHandler::setEnabled` restarts the viewer in the real thing). */
  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) this.reset();
    this.emit('enabled', enabled);
  }

  /** Forget every object, restriction, exception and modifier (logout, teleport failure recovery, ...). */
  reset() {
    this.objects.clear(); this.behaviours.clear(); this.exceptions = [];
    for (const modifier of this.modifiers.values()) { modifier.values.length = 0; modifier.primaryObject = ''; }
    this.notifications.length = 0; this.commandStack.length = 0;
    this.blockNames = false;
    this.emit('reset');
  }

  // ---- queries -----------------------------------------------------------------------------------

  /** `hasBehaviour(bhvr)`: any object holds it (reference counted). */
  hasBehaviour(name: string): boolean { return (this.behaviours.get(name) ?? 0) > 0; }

  hasBehaviourFor(objectId: string, name: string, option = ''): boolean {
    return this.objects.get(objectId)?.hasBehaviour(name, option, false) ?? false;
  }

  /** `hasBehaviourExcept`: some object other than `objectId` holds it. */
  hasBehaviourExcept(name: string, objectId: string, option = ''): boolean {
    for (const [id, object] of this.objects) if (id !== objectId && object.hasBehaviour(name, option, false)) return true;
    return false;
  }

  hasException(name: string): boolean { return this.exceptions.some((e) => e.name === name); }

  getCurrentCommand(): RlvCommand | null { return this.commandStack.length ? this.commandStack[this.commandStack.length - 1] : null; }
  getCurrentObject(): string { return this.getCurrentCommand()?.objectId ?? ''; }

  /** `RlvHandler::isPermissive`. */
  isPermissive(name: string): boolean {
    const info = RLV_BEHAVIOURS[name];
    if (!info?.strict) return true;
    return !(this.hasBehaviour('permissive') || this.isException('permissive', name, 'permissive'));
  }

  /** `RlvHandler::isException`; `check` picks strict or permissive matching, defaulting as the viewer does. */
  isException(name: string, option: ExceptionOption, check: 'default' | 'strict' | 'permissive' = 'default'): boolean {
    let mode = check;
    if (mode === 'default') mode = this.hasBehaviour(name) && !this.isPermissive(name) ? 'strict' : 'permissive';
    const owners: string[] = [];
    if (mode === 'strict') {
      const strictOnly = !this.hasBehaviour('permissive');
      for (const [id, object] of this.objects) if (object.hasBehaviour(name, '', strictOnly)) owners.push(id);
    }
    const norm = (o: ExceptionOption) => (typeof o === 'string' ? o.toLowerCase() : o);
    for (const exception of this.exceptions) {
      if (exception.name !== name || norm(exception.option) !== norm(option)) continue;
      if (mode === 'permissive') return true;
      const at = owners.indexOf(exception.objectId);
      if (at !== -1) owners.splice(at, 1);
      if (owners.length === 0) return true;
    }
    return false;
  }

  private addException(objectId: string, name: string, option: ExceptionOption) { this.exceptions.push({ objectId, name, option }); }

  private removeException(objectId: string, name: string, option: ExceptionOption) {
    const norm = (o: ExceptionOption) => (typeof o === 'string' ? o.toLowerCase() : o);
    const at = this.exceptions.findIndex((e) => e.objectId === objectId && e.name === name && norm(e.option) === norm(option));
    if (at !== -1) this.exceptions.splice(at, 1);
  }

  /** Modifier value by id (see `MODIFIERS`), falling back to its default. */
  getModifier(id: string): ModValue | undefined { return this.modifiers.get(id)?.value; }
  hasModifierValue(id: string): boolean { return this.modifiers.get(id)?.hasValue() ?? false; }
  private num(id: string) { return Number(this.modifiers.get(id)?.value); }

  addBlockedObject(objectId: string) { this.blockedObjects.add(objectId); }
  removeBlockedObject(objectId: string) { this.blockedObjects.delete(objectId); }

  // ---- processing commands -----------------------------------------------------------------------

  /** `llOwnerSay("@a,b=n")` and the like: handle a chat line and say whether it was consumed (must not be displayed). */
  handleObjectChat(fromId: string, message: string, chatType: number, opts: { isTempAttachment?: boolean } = {}): boolean {
    if (!this.enabled || message.length <= 3 || message[0] !== RLV_CMD_PREFIX || chatType !== CHAT_TYPE.OWNER) return false;
    const results: Array<{ command: string; ret: number }> = [];
    for (const token of message.slice(1).toLowerCase().split(',')) {
      if (token === '') continue;
      results.push({ command: token, ret: this.processCommand(fromId, token, true) });
    }
    if (this.debug) this.emit('debug', results);
    return true;
  }

  /** `RlvHandler::processCommand(idObj, strCommand)`. */
  processCommand(objectId: string, command: string, fromObject = true): number {
    return this.process(new RlvCommand(objectId, command), fromObject);
  }

  private process(command: RlvCommand, fromObject: boolean): number {
    if (this.blockedObjects.has(command.objectId) && command.type !== 'remove' && command.type !== 'clear') return RlvRet.FAILED_BLOCKED;
    if (!command.valid) return RlvRet.FAILED_SYNTAX;

    this.commandStack.push(command);
    let ret: number = RlvRet.UNKNOWN;
    try {
      switch (command.type) {
        case 'add': ret = this.processAdd(command); break;
        case 'remove': ret = this.processRemove(command); break;
        case 'clear': ret = this.processClear(command); break;
        case 'force': ret = this.processForce(command); break;
        case 'reply': ret = this.processReply(command); break;
        default: ret = RlvRet.FAILED_PARAM;
      }
    } finally {
      this.commandStack.pop();
    }
    this.emit('command', { command, ret, fromObject });
    return ret;
  }

  private processAdd(command: RlvCommand): number {
    const name = command.name;
    if (!name) return RlvRet.FAILED_PARAM;
    // Some restrictions can only be held by one object at a time to avoid deadlocks
    if (this.hasBehaviour(name) && (name === 'setcam' || name === 'setdebug' || name === 'setenv')) {
      if (!this.hasBehaviourFor(command.objectId, name)) return RlvRet.FAILED_LOCK;
    }
    let object = this.objects.get(command.objectId);
    if (!object) { object = new RlvObject(command.objectId); this.objects.set(command.objectId, object); }
    const { command: stored, added } = object.addCommand(command);
    if (!added) return RlvRet.SUCCESS_DUPLICATE;
    const ret = this.processAddRem(stored);
    if (!rlvSucceeded(ret)) {
      object.removeCommand(stored);
      if (object.commands.length === 0) this.objects.delete(command.objectId);
    }
    return ret;
  }

  private processRemove(command: RlvCommand): number {
    const object = this.objects.get(command.objectId);
    const removed = object?.removeCommand(command) ?? false;
    if (!removed || !object) return RlvRet.SUCCESS_UNSET;
    const ret = this.processAddRem(command);
    if (object.commands.length === 0) {
      for (const modifier of this.modifiers.values()) modifier.clearValues(command.objectId);
      this.objects.delete(command.objectId);
    }
    return ret;
  }

  /** `RlvHandler::processClearCommand`: remove this object's commands, optionally only those containing a filter. */
  private processClear(command: RlvCommand): number {
    const object = this.objects.get(command.objectId);
    if (object) {
      const filter = command.param;
      for (const stored of [...object.commands]) {
        const text = stored.asString();
        if (!filter || text.includes(filter)) this.processCommand(command.objectId, `${text}=y`, false);
      }
    }
    this.emit('clear', command.objectId);
    return RlvRet.SUCCESS;
  }

  /** Apply an add/remove that has already been recorded on the object. */
  private processAddRem(command: RlvCommand): number {
    const name = command.name!;
    const adding = command.type === 'add';
    const info = RLV_BEHAVIOURS[RLV_SYNONYMS[command.behaviour] ? command.behaviour : name] ?? RLV_BEHAVIOURS[name];
    const option = command.option;
    let refCount = false;
    let ret: number = RlvRet.SUCCESS;

    const handler = this.customHandler(name);
    if (handler) {
      const res = handler(command, adding);
      ret = res.ret; refCount = res.refCount;
    } else {
      const res = this.genericHandler(info?.option ?? 'none', command, adding);
      ret = res.ret; refCount = res.refCount;
    }

    if (ret === RlvRet.SUCCESS && refCount) {
      const wasHeld = this.hasBehaviour(name);
      if (adding) {
        if (command.strict) this.addException(command.objectId, 'permissive', name);
        this.behaviours.set(name, (this.behaviours.get(name) ?? 0) + 1);
        command.refCounted = true;
      } else {
        if (command.strict) this.removeException(command.objectId, 'permissive', name);
        this.behaviours.set(name, Math.max(0, (this.behaviours.get(name) ?? 0) - 1));
      }
      this.emit('behaviour', { name, type: command.type, objectId: command.objectId, option });
      if (wasHeld !== this.hasBehaviour(name)) this.onToggle(name, this.hasBehaviour(name));
    }
    if (info?.deprecated && rlvSucceeded(ret) && ret === RlvRet.SUCCESS) return RlvRet.SUCCESS_DEPRECATED;
    return ret;
  }

  private modifierIdsOf(name: string): string[] {
    return Object.entries(MODIFIERS).filter(([, def]) => def.behaviour === name).map(([id]) => id);
  }

  private onToggle(name: string, held: boolean) {
    if (name === 'shownames') this.blockNames = held;
    this.emit('toggle', { name, held });
  }

  /** `RlvBehaviourGenericHandler<...>::onCommand`. */
  private genericHandler(kind: RlvOptionKind, command: RlvCommand, adding: boolean): { ret: number; refCount: boolean } {
    const noneHandler = () => (command.hasOption ? { ret: RlvRet.FAILED_OPTION as number, refCount: false } : { ret: RlvRet.SUCCESS as number, refCount: true });
    const exceptionHandler = () => {
      if (!isUuid(command.option)) return { ret: RlvRet.FAILED_OPTION as number, refCount: false };
      if (adding) this.addException(command.objectId, command.name!, command.option.toLowerCase());
      else this.removeException(command.objectId, command.name!, command.option.toLowerCase());
      return { ret: RlvRet.SUCCESS as number, refCount: true };
    };
    switch (kind) {
      case 'none': return noneHandler();
      case 'exception': return exceptionHandler();
      case 'noneOrException': {
        if (command.hasOption) { const res = exceptionHandler(); return { ret: res.ret, refCount: false }; }
        return noneHandler();
      }
      case 'modifier': return this.modifierHandler(command, adding);
      case 'noneOrModifier': {
        if (command.hasOption) return this.modifierHandler(command, adding);
        // @bhvr=n adds the default option on an empty modifier if needed
        for (const id of this.modifierIdsOf(command.name!)) {
          const modifier = this.modifiers.get(id)!;
          if (modifier.def.addDefault) {
            if (adding) modifier.addValue(modifier.def.defaultValue, command.objectId, command.name!);
            else modifier.removeValue(modifier.def.defaultValue, command.objectId, command.name!);
          }
        }
        return { ret: RlvRet.SUCCESS, refCount: true };
      }
      default: return { ret: RlvRet.SUCCESS, refCount: true };
    }
  }

  private modifierHandler(command: RlvCommand, adding: boolean): { ret: number; refCount: boolean } {
    const id = MODIFIER_OF_BEHAVIOUR[command.name!];
    const modifier = id ? this.modifiers.get(id) : undefined;
    const value = modifier && command.hasOption ? convertModifierOption(command.option, modifier.def.kind) : null;
    if (!modifier || value === null) return { ret: RlvRet.FAILED_OPTION, refCount: false };
    if (adding) modifier.addValue(value, command.objectId, command.name!);
    else modifier.removeValue(value, command.objectId, command.name!);
    return { ret: RlvRet.SUCCESS, refCount: true };
  }

  /** Behaviours with their own parsing in RLVa. Returns null to use the generic handler. */
  private customHandler(name: string): ((command: RlvCommand, adding: boolean) => { ret: number; refCount: boolean }) | null {
    switch (name) {
      case 'recvim': case 'sendim': case 'startim': return (c, a) => this.imHandler(c, a);
      case 'sendchannel': case 'sendchannel_except': return (c, a) => {
        if (c.hasOption) {
          const channel = parseIntStrict(c.option);
          if (channel === null || channel <= 0) return { ret: RlvRet.FAILED_OPTION, refCount: false };
          if (a) this.addException(c.objectId, c.name!, channel); else this.removeException(c.objectId, c.name!, channel);
          return { ret: RlvRet.SUCCESS, refCount: false };
        }
        return { ret: RlvRet.SUCCESS, refCount: true };
      };
      case 'redirchat': case 'rediremote': return (c, a) => {
        const channel = parseIntStrict(c.option);
        if (channel === null || !isValidReplyChannel(channel)) return { ret: RlvRet.FAILED_OPTION, refCount: false };
        if (a) this.addException(c.objectId, c.name!, channel); else this.removeException(c.objectId, c.name!, channel);
        return { ret: RlvRet.SUCCESS, refCount: true };
      };
      case 'notify': return (c, a) => {
        const parsed = parseNotifyOption(c.option);
        if (!c.option || !parsed) return { ret: RlvRet.FAILED_OPTION, refCount: false };
        if (a) this.notifications.push({ objectId: c.objectId, ...parsed });
        else {
          const at = this.notifications.findIndex((n) => n.objectId === c.objectId && n.channel === parsed.channel && n.filter === parsed.filter);
          if (at !== -1) this.notifications.splice(at, 1);
        }
        return { ret: RlvRet.SUCCESS, refCount: true };
      };
      case 'shownametags': return (c, a) => {
        if (c.hasOption && isUuid(c.option)) {
          const res = this.genericHandler('exception', c, a);
          return { ret: res.ret, refCount: false };
        }
        return this.genericHandler('noneOrModifier', c, a);
      };
      case 'setcam_fovmin': case 'setcam_fovmax': case 'setcam_avdist': case 'setcam_avdistmin': case 'setcam_avdistmax':
      case 'setcam_origindistmin': case 'setcam_origindistmax': return (c, a) => this.modifierHandler(c, a);
      case 'setcam_eyeoffset': case 'setcam_eyeoffsetscale': case 'setcam_focusoffset': return (c, a) => this.modifierHandler(c, a);
      case 'setcam_textures': case 'fartouch': case 'sittp': case 'tplocal': return (c, a) => this.genericHandler('noneOrModifier', c, a);
      case 'camzoommin': case 'camzoommax': return (c, a) => {
        const mult = c.hasOption ? parseFloatStrict(c.option) : 1;
        if (mult === null) return { ret: RlvRet.FAILED_OPTION, refCount: false };
        const target = name === 'camzoommin' ? 'setcam_fovmin' : 'setcam_fovmax';
        const modifier = this.modifiers.get(target)!;
        const value = DEFAULT_FIELD_OF_VIEW / mult;
        if (a) { this.behaviours.set(target, (this.behaviours.get(target) ?? 0) + 1); modifier.addValue(value, c.objectId, name); }
        else { this.behaviours.set(target, Math.max(0, (this.behaviours.get(target) ?? 0) - 1)); modifier.removeValue(value, c.objectId, name); }
        return { ret: RlvRet.SUCCESS, refCount: true };
      };
      // Outfit, attachment, shared-folder and effect restrictions are tracked but have nothing to enforce here.
      case 'addattach': case 'remattach': case 'addoutfit': case 'remoutfit': case 'detach': case 'attachthis': case 'attachallthis':
      case 'detachthis': case 'detachallthis': case 'attachthis_except': case 'attachallthis_except': case 'detachthis_except':
      case 'detachallthis_except': case 'sharedwear': case 'sharedunwear': case 'unsharedwear': case 'unsharedunwear':
      case 'setoverlay': case 'setsphere': case 'setoverlay_touch': return () => ({ ret: RlvRet.SUCCESS, refCount: true });
      default: return null;
    }
  }

  /** `@recvim/@sendim/@startim[:<uuid>|<min>[;<max>]]`. */
  private imHandler(command: RlvCommand, adding: boolean): { ret: number; refCount: boolean } {
    const generic = this.genericHandler('noneOrException', command, adding);
    if (generic.ret === RlvRet.SUCCESS || !command.hasOption) return generic.ret === RlvRet.SUCCESS ? { ret: generic.ret, refCount: generic.refCount } : generic;
    // <dist_min>[;<dist_max>]
    const parts = command.option.split(';');
    const min = parseFloatStrict(parts[0]);
    const max = parts.length >= 2 ? parseFloatStrict(parts[1]) : F32_MAX;
    if (parts.length > 2 || min === null || min < 0 || max === null || max < 0) return { ret: RlvRet.FAILED_OPTION, refCount: false };
    const prefix = command.name!;
    const minMod = this.modifiers.get(`${prefix}distmin`)!, maxMod = this.modifiers.get(`${prefix}distmax`)!;
    if (adding) {
      minMod.addValue(min * min, command.objectId, command.name!);
      if (parts.length >= 2) maxMod.addValue(max * max, command.objectId, command.name!);
    } else {
      minMod.removeValue(min * min, command.objectId, command.name!);
      if (parts.length >= 2) maxMod.removeValue(max * max, command.objectId, command.name!);
    }
    return { ret: RlvRet.SUCCESS, refCount: true };
  }

  // ---- force commands ----------------------------------------------------------------------------

  private processForce(command: RlvCommand): number {
    const name = command.name;
    if (!name) return RlvRet.FAILED_UNKNOWN;
    switch (name) {
      case 'unsit': {
        if (command.hasOption) return RlvRet.FAILED_OPTION;
        if ((this.env.isSitting ? this.env.isSitting() : true) && !this.hasBehaviourExcept('unsit', command.objectId)) this.env.stand?.();
        return this.env.stand ? RlvRet.SUCCESS : RlvRet.FAILED_UNSUPPORTED;
      }
      case 'fly': {
        let fly = true;
        if (command.hasOption) {
          if (command.option === 'true' || command.option === '1') fly = true;
          else if (command.option === 'false' || command.option === '0') fly = false;
          else return RlvRet.FAILED_OPTION;
        }
        if (fly && !this.canFlyFor(command.objectId)) return RlvRet.FAILED_LOCK;
        if (!this.env.setFlying) return RlvRet.FAILED_UNSUPPORTED;
        if (fly !== Boolean(this.env.isFlying?.())) this.env.setFlying(fly);
        return RlvRet.SUCCESS;
      }
      case 'sit': {
        if (!isUuid(command.option)) return RlvRet.FAILED_OPTION;
        if (!this.canSitFor(command.objectId)) return RlvRet.FAILED_LOCK;
        return this.env.sit?.(command.option.toLowerCase()) ? RlvRet.SUCCESS : RlvRet.FAILED;
      }
      case 'sitground': {
        if (command.hasOption) return RlvRet.FAILED_OPTION;
        if (!this.canSitFor(command.objectId)) return RlvRet.FAILED_LOCK;
        if (!this.env.sitOnGround) return RlvRet.FAILED_UNSUPPORTED;
        this.env.sitOnGround();
        return RlvRet.SUCCESS;
      }
      case 'tpto': return this.forceTpTo(command);
      default:
        // Wearing, detaching, camera and overlay effects: nothing in this viewer to act on.
        return RlvRet.FAILED_UNSUPPORTED;
    }
  }

  /** `@tpto:<region>/<x>/<y>/<z>[;<angle>]=force` or `@tpto:<gx>/<gy>/<gz>[;<angle>]=force`. */
  private forceTpTo(command: RlvCommand): number {
    const parts = command.option.split(';');
    let angle: number | undefined;
    if (parts.length > 1) {
      const a = parseFloatStrict(parts[1]);
      if (a === null) return RlvRet.FAILED_OPTION;
      angle = a;
    }
    // A teleport started by a command is not blocked by that same object's own restrictions.
    if (!this.canTeleportToLocation(command.objectId)) return RlvRet.FAILED_LOCK;
    const global = parts[0].split('/').map(Number);
    if (global.length === 3 && global.every((n) => !Number.isNaN(n)) && !parts[0].includes(' ')) {
      if (!this.env.teleportToGlobal) return RlvRet.FAILED_UNSUPPORTED;
      this.env.teleportToGlobal([global[0], global[1], global[2]], angle);
      return RlvRet.SUCCESS;
    }
    const named = parts[0].split('/');
    if (named.length !== 4) return RlvRet.FAILED_OPTION;
    const position = named.slice(1).map(Number);
    if (position.some(Number.isNaN)) return RlvRet.FAILED_OPTION;
    if (!this.env.teleportToRegion) return RlvRet.FAILED_UNSUPPORTED;
    this.env.teleportToRegion(named[0], [position[0], position[1], position[2]], angle);
    return RlvRet.SUCCESS;
  }

  // ---- reply commands ----------------------------------------------------------------------------

  private processReply(command: RlvCommand): number {
    const channel = parseIntStrict(command.param);
    if (channel === null || !isValidReplyChannel(channel, command.objectId === (this.env.selfId?.() ?? ''))) return RlvRet.FAILED_PARAM;
    const name = command.name;
    if (!name) return RlvRet.FAILED_UNKNOWN;

    let reply = '';
    let ret: number = RlvRet.SUCCESS;
    switch (name) {
      case 'version': case 'versionnew':
        reply = this.versionString(name === 'version');
        break;
      case 'versionnum':
        if (!command.hasOption) reply = this.versionNum();
        else if (command.option === 'impl') reply = this.versionImplNum();
        break;
      case 'getgroup': reply = this.env.activeGroupName?.() || 'none'; break;
      case 'getsitid': reply = this.env.sitObjectId?.() || '00000000-0000-0000-0000-000000000000'; break;
      case 'getstatus': case 'getstatusall': {
        const parsed = parseGetStatusOption(command.option);
        if (name === 'getstatus') reply = this.objects.get(command.objectId)?.getStatusString(parsed.filter, parsed.separator) ?? '';
        else reply = [...this.objects.values()].map((o) => o.getStatusString(parsed.filter, parsed.separator)).join('');
        break;
      }
      case 'getcommand': {
        const options = command.option === '' ? [] : command.option.split(RLV_OPTION_SEPARATOR);
        let type: 'any' | 'add' | 'force' | 'reply' = 'any';
        if (options.length >= 2) {
          const t = options[1];
          if (t === 'any' || t === '') type = 'any';
          else if (t === 'add' || t === 'force' || t === 'reply') type = t;
          else { ret = RlvRet.FAILED_OPTION; break; }
        }
        reply = this.commandList(options[0] ?? '', type).join(options.length >= 3 ? options[2] : RLV_OPTION_SEPARATOR);
        break;
      }
      case 'getcam_avdist': case 'getcam_fov': case 'getcam_textures':
      case 'getcam_avdistmin': case 'getcam_avdistmax': case 'getcam_fovmin': case 'getcam_fovmax': {
        if (command.hasOption) { ret = RlvRet.FAILED_OPTION; break; }
        if (name === 'getcam_textures') {
          const mod = this.modifiers.get('setcam_texture')!;
          reply = mod.hasValue() ? String(mod.value) : '';
        } else if (name === 'getcam_avdist' || name === 'getcam_fov') {
          // Needs the live camera, which RLV does not own.
          ret = RlvRet.FAILED_UNSUPPORTED;
        } else {
          const mod = this.modifiers.get(`setcam_${name.slice(7)}`);
          reply = mod?.hasValue() ? Number(mod.value).toFixed(3) : '';
        }
        break;
      }
      default:
        // Outfit, attachment and inventory queries need data this viewer does not hold; the answer is empty so scripts keep going.
        ret = RlvRet.FAILED_UNSUPPORTED;
    }
    // Even a failed reply command sends an (empty) answer so the issuing script does not block.
    if (channel > 0) this.sendChatReply(channel, reply);
    else this.emit('console-reply', { behaviour: command.behaviour, reply });
    return ret;
  }

  /** `RlvUtil::sendChatReply`: shouted on the channel. */
  sendChatReply(channel: number, text: string): boolean {
    if (!isValidReplyChannel(channel)) return false;
    this.env.sendChat?.(text.slice(0, 1023), channel, CHAT_TYPE.SHOUT);
    return Boolean(this.env.sendChat);
  }

  private commandList(match: string, type: 'any' | 'add' | 'force' | 'reply'): string[] {
    const out: string[] = [];
    for (const [name, info] of Object.entries(RLV_BEHAVIOURS)) {
      if (match && !name.includes(match)) continue;
      if (type === 'any' || info.types.includes(type)) out.push(name);
      if (info.strict && (type === 'any' || type === 'add') && (!match || `${name}_sec`.includes(match))) out.push(`${name}_sec`);
    }
    return out;
  }

  /** `RlvStrings::getVersion`. */
  versionString(legacy = true, compat = false): string {
    const v = compat ? RLV_VERSION_COMPAT : RLV_VERSION;
    return `${legacy ? 'RestrainedLife' : 'RestrainedLove'} viewer v${v.major}.${v.minor}.${v.patch} (RLVa ${RLVA_VERSION.major}.${RLVA_VERSION.minor}.${RLVA_VERSION.patch})`;
  }
  versionNum(compat = false): string {
    const v = compat ? RLV_VERSION_COMPAT : RLV_VERSION;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${v.major}${pad(v.minor)}${pad(v.patch)}${pad(v.build)}`;
  }
  versionImplNum(): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${RLVA_VERSION.major}${pad(RLVA_VERSION.minor)}${pad(RLVA_VERSION.patch)}${pad(RLVA_VERSION.implId)}`;
  }

  // ---- decisions the rest of the viewer asks ----------------------------------------------------

  canFly() { return this.canFlyFor(this.getCurrentObject()); }
  /** `RlvActions::canFly(idRlvObjExcept)`. */
  canFlyFor(exceptObject: string) { return !(exceptObject ? this.hasBehaviourExcept('fly', exceptObject) : this.hasBehaviour('fly')); }
  canJump() { return !this.hasBehaviour('jump'); }
  canRun() { return !this.hasBehaviour('alwaysrun'); }
  /** `RlvActions::canStand`: false only while sitting under `@unsit` (not counting the issuing object's own, if given). */
  canStand(exceptObject = '') {
    const blocked = exceptObject ? this.hasBehaviourExcept('unsit', exceptObject) : this.hasBehaviour('unsit');
    return !blocked || !this.sitting();
  }

  /** Whether the avatar is sitting; assumed so when the viewer cannot tell, which errs towards the restriction. */
  private sitting(): boolean { return this.env.isSitting ? this.env.isSitting() : true; }
  private canSitFor(exceptObject: string) { return this.canGroundSit(exceptObject); }
  canChangeActiveGroup(objectId = '') { return objectId ? !this.hasBehaviourExcept('setgroup', objectId) : !this.hasBehaviour('setgroup'); }
  canPlayGestures() { return !this.hasBehaviour('sendgesture'); }
  /** `RlvActions::canBuild`. */
  canBuild() { return !this.hasBehaviour('edit') || !this.hasBehaviour('rez'); }
  canPreviewTextures() { return !this.hasBehaviour('viewtexture'); }
  canShowLocation() { return !this.hasBehaviour('showloc'); }
  canShowNearbyAgents() { return !this.hasBehaviour('shownearby'); }
  canShowWorldMap() { return !this.hasBehaviour('showworldmap'); }
  canShowMiniMap() { return !this.hasBehaviour('showminimap'); }
  canShowInventory() { return !this.hasBehaviour('showinv'); }
  canGiveInventory(agentId?: string) {
    if (!this.hasBehaviour('share')) return true;
    return agentId ? this.isException('share', agentId) : this.hasException('share');
  }
  canTeleportToLocation(exceptObject = this.getCurrentObject()) {
    return !(exceptObject ? this.hasBehaviourExcept('tploc', exceptObject) : this.hasBehaviour('tploc')) && this.canStand(exceptObject);
  }
  /** `@tplm`: teleporting to a landmark. */
  canTeleportToLandmark() { return !this.hasBehaviour('tplm') && this.canStand(); }
  /** `RlvActions::canTeleportToLocal`; `from` and `to` are global positions. */
  canTeleportToLocal(from: readonly [number, number, number], to: readonly [number, number, number], exceptObject = this.getCurrentObject()): boolean {
    let can = this.canStand(exceptObject);
    if (can && this.hasBehaviourExcept('sittp', exceptObject)) {
      const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
      const dist = this.num('sittpdist');
      can = dx * dx + dy * dy + dz * dz < dist * dist;
    }
    if (can && this.hasBehaviourExcept('tplocal', exceptObject)) {
      const dx = to[0] - from[0], dy = to[1] - from[1];
      const dist = Math.min(this.num('tplocaldist'), RLV_TPLOCAL_DEFAULT);
      can = dx * dx + dy * dy < dist * dist;
    }
    return can;
  }
  canAcceptTpOffer(senderId: string) { return (!this.hasBehaviour('tplure') || this.isException('tplure', senderId)) && this.canStand(); }
  autoAcceptTeleportOffer(senderId: string) { return (Boolean(senderId) && this.isException('accepttp', senderId)) || this.hasBehaviour('accepttp'); }
  canAcceptTpRequest(senderId: string) { return !this.hasBehaviour('tprequest') || this.isException('tprequest', senderId); }
  autoAcceptTeleportRequest(requesterId: string) { return (Boolean(requesterId) && this.isException('accepttprequest', requesterId)) || this.hasBehaviour('accepttprequest'); }
  canSendChannel(channel: number) {
    return (!this.hasBehaviour('sendchannel') || this.isException('sendchannel', channel)) &&
      (!this.hasBehaviour('sendchannel_except') || !this.isException('sendchannel_except', channel));
  }
  canSendTypingStart(showRedirectChatTyping = false) { return !this.hasBehaviour('redirchat') || showRedirectChatTyping; }

  /** `rlvCheckAvatarIMDistance` for `recvim`, `sendim` and `startim`. */
  private checkIMDistance(avatarId: string, prefix: 'recvim' | 'sendim' | 'startim'): boolean {
    const minMod = this.modifiers.get(`${prefix}distmin`)!, maxMod = this.modifiers.get(`${prefix}distmax`)!;
    if (!minMod.hasValue()) return false;
    const hasMax = maxMod.hasValue();
    const min = Number(minMod.value), max = hasMax ? Number(maxMod.value) : F32_MAX;
    const dist = this.env.avatarDistanceSquared?.(avatarId) ?? F32_MAX;
    return min < max && min <= dist && dist <= max;
  }

  canReceiveIM(senderId: string): boolean {
    if (!this.enabled) return true;
    return (!this.hasBehaviour('recvim') || this.isException('recvim', senderId) || this.checkIMDistance(senderId, 'recvim')) &&
      (!this.hasBehaviour('recvimfrom') || !this.isException('recvimfrom', senderId));
  }
  canSendIM(recipientId: string): boolean {
    if (!this.enabled) return true;
    return (!this.hasBehaviour('sendim') || this.isException('sendim', recipientId) || this.checkIMDistance(recipientId, 'sendim')) &&
      (!this.hasBehaviour('sendimto') || !this.isException('sendimto', recipientId));
  }
  canStartIM(recipientId: string, hasOpenSession = false): boolean {
    if (!this.enabled) return true;
    return ((!this.hasBehaviour('startim') || this.isException('startim', recipientId) || this.checkIMDistance(recipientId, 'startim')) &&
      (!this.hasBehaviour('startimto') || !this.isException('startimto', recipientId))) || hasOpenSession;
  }

  /** `RlvActions::canShowName` (default context). */
  canShowName(agentId = ''): boolean {
    if (!this.blockNames) return true;
    if (!agentId) return false;
    return this.isException('shownames', agentId) || agentId.toLowerCase() === (this.env.selfId?.() ?? '').toLowerCase();
  }

  canShowNameTag(avatarId: string, distanceSquared: number): boolean {
    if (!this.hasBehaviour('shownametags') || this.isException('shownametags', avatarId) || avatarId === this.env.selfId?.()) return true;
    const dist = this.num('shownametagsdist');
    return dist !== 0 && distanceSquared < dist * dist;
  }

  /** Squared distance at which `@fartouch` stops touching and sitting. */
  private fartouchDistSquared() { const d = this.num('fartouchdist'); return d * d; }

  /** `RlvActions::canInteract` (`@interact`, `@fartouch`). `distanceSquared` is from the avatar to the object plus pick offset. */
  canInteract(obj: RlvObjectInfo | null): boolean {
    if (!obj) return true;
    return (!this.hasBehaviour('interact') || obj.isHud) &&
      (!this.hasBehaviour('fartouch') || obj.isHud || obj.distanceSquared <= this.fartouchDistSquared());
  }

  /** `RlvActions::canTouch`: `@touchall/this/world/attach/attachself/attachother/hud/me` and `@fartouch`. */
  canTouch(obj: RlvObjectInfo | null): boolean {
    const root = (obj?.rootId ?? '').toLowerCase();
    if (!obj || !root) return false;
    let can = (obj.isHud || !this.hasBehaviour('touchall')) &&
      (!this.hasBehaviour('touchthis') || !this.isException('touchthis', root, 'permissive'));
    if (can) {
      if (!obj.isAttachment) {
        can = (!this.hasBehaviour('touchworld') || this.isException('touchworld', root, 'permissive')) &&
          (!this.hasBehaviour('fartouch') || obj.distanceSquared <= this.fartouchDistSquared());
      } else if (!obj.isOwnedByYou) {
        const wearer = (obj.wearerId ?? '').toLowerCase();
        can = ((!this.hasBehaviour('touchattach') && !this.hasBehaviour('touchattachother')) ||
            this.isException('touchattach', root, 'permissive') || this.isException('touchattach', wearer, 'permissive')) &&
          !this.isException('touchattachother', wearer) &&
          (!this.hasBehaviour('fartouch') || obj.distanceSquared <= this.fartouchDistSquared());
      } else if (!obj.isHud) {
        can = (!this.hasBehaviour('touchattach') || this.isException('touchattach', root, 'permissive')) &&
          (!this.hasBehaviour('touchattachself') || this.isException('touchattach', root, 'permissive'));
      } else {
        can = !this.hasBehaviour('touchhud') || this.isException('touchhud', root, 'permissive');
      }
    }
    // @touchme in any prim of the linkset allows the whole linkset
    if (!can && this.hasBehaviour('touchme')) can = this.hasBehaviourRoot(root, 'touchme');
    return can;
  }

  /** `hasBehaviourRoot`: some object whose linkset root is `rootId` holds the behaviour. */
  hasBehaviourRoot(rootId: string, name: string, option = ''): boolean {
    for (const [id, object] of this.objects) if ((this.objectRoots.get(id) ?? id) === rootId && object.hasBehaviour(name, option, false)) return true;
    return false;
  }
  private readonly objectRoots = new Map<string, string>();
  /** Record an RLV object's linkset root (`RlvObject::m_idRoot`), so linkset-wide checks can find it. */
  setObjectRoot(objectId: string, rootId: string) { this.objectRoots.set(objectId, rootId.toLowerCase()); }

  /** `RlvActions::canEdit(obj)`: `@edit`, `@editobj`, `@editattach`, `@editworld`. */
  canEdit(obj: RlvObjectInfo | null): boolean {
    if (!obj) return false;
    const root = obj.rootId.toLowerCase();
    return (!this.hasBehaviour('edit') || this.isException('edit', root)) &&
      (!this.hasBehaviour('editobj') || !this.isException('editobj', root)) &&
      (obj.isAttachment ? !this.hasBehaviour('editattach') : !this.hasBehaviour('editworld'));
  }

  /** `RlvActions::canSit`. */
  canSit(obj: RlvObjectInfo | null): boolean {
    if (!obj || !obj.isVolume) return false;
    const sitting = this.sitting();
    const issuing = this.getCurrentCommand();
    return !this.hasBehaviour('sit') &&
      ((!this.hasBehaviour('unsit') && !this.hasBehaviour('standtp')) || !sitting) &&
      ((issuing !== null && issuing.name === 'sit') ||
        ((!this.hasBehaviour('sittp') || obj.distanceSquared < this.num('sittpdist') ** 2) &&
          (!this.hasBehaviour('fartouch') || obj.distanceSquared < this.fartouchDistSquared())));
  }

  /** `RlvActions::canGroundSit`. */
  canGroundSit(exceptObject = '') {
    return !(exceptObject ? this.hasBehaviourExcept('sit', exceptObject) : this.hasBehaviour('sit')) && this.canStand(exceptObject);
  }

  /** `RlvActions::canShowHoverText`. */
  canShowHoverText(obj: { id: string; isVolume: boolean; isHud: boolean } | null): boolean {
    if (!obj || !obj.isVolume) return true;
    return !(this.hasBehaviour('showhovertextall') ||
      (this.hasBehaviour('showhovertextworld') && !obj.isHud) ||
      (this.hasBehaviour('showhovertexthud') && obj.isHud) ||
      this.isException('showhovertext', obj.id.toLowerCase(), 'permissive'));
  }

  canPayAvatar() { return !this.hasBehaviour('pay'); }
  canPayObject() { return !this.hasBehaviour('buy'); }
  canRez() { return !this.hasBehaviour('rez'); }

  /** `RlvActions::checkChatVolume`: whisper/normal/shout limited by `@chat*`. */
  checkChatVolume(type: number): number {
    if ((type === CHAT_TYPE.SHOUT || type === CHAT_TYPE.NORMAL) && this.hasBehaviour('chatnormal')) return CHAT_TYPE.WHISPER;
    if (type === CHAT_TYPE.SHOUT && this.hasBehaviour('chatshout')) return CHAT_TYPE.NORMAL;
    if (type === CHAT_TYPE.WHISPER && this.hasBehaviour('chatwhisper')) return CHAT_TYPE.NORMAL;
    return type;
  }

  /** `RlvHandler::filterChat`: returns the (possibly replaced) text and whether it was filtered. */
  filterChat(text: string, filterEmote: boolean): { text: string; filtered: boolean } {
    if (!text) return { text, filtered: false };
    let filtered = false;
    let out = text;
    if (isEmote(out)) {
      if (filterEmote) {
        if (/["()*=^_?~]/.test(out) || out.includes(' -') || out.includes('- ') || out.includes("''")) {
          filtered = true; // Emote contains an illegal character (or sequence)
        } else if (!this.hasBehaviour('emote')) {
          // Truncate at 20 characters or at the dot, whichever is shorter
          const idx = out.indexOf('.');
          out = Array.from(out).slice(0, idx > 0 && idx < 20 ? idx + 1 : 20).join('');
        }
      }
    } else if (out[0] === '/') {
      filtered = Array.from(out).length > 7; // Allowed as long as it is 6 characters or less
    } else if (!this.canOoc || out.length < 4 || !out.startsWith('((') || !out.endsWith('))')) {
      filtered = true; // Regular chat (not OOC)
    }
    if (filtered) out = this.showEllipsis ? '...' : '';
    return { text: out, filtered };
  }

  /**
   * Chat leaving the avatar on channel 0 (`send_chat_from_viewer`). Returns the text to send (or null to drop it) and
   * the chat type to send it with; redirected chat is sent on its redirect channels and not at all in public.
   */
  prepareOutgoingChat(text: string, type: number, channel: number): { text: string; type: number } | null {
    if (!this.enabled || (type !== CHAT_TYPE.WHISPER && type !== CHAT_TYPE.NORMAL && type !== CHAT_TYPE.SHOUT)) return { text, type };
    if (channel === 0) {
      const adjusted = this.checkChatVolume(type);
      if ((this.hasBehaviour('redirchat') || this.hasBehaviour('rediremote')) && this.redirectChatOrEmote(text)) return null;
      let out = text;
      if (this.hasBehaviour('sendchat')) out = this.filterChat(out, true).text;
      return { text: out, type: adjusted };
    }
    // Chat on a non-public channel
    if (!this.canSendChannel(channel)) return null;
    if (channel === CHAT_CHANNEL_DEBUG) {
      const emote = isEmote(text);
      if (this.hasBehaviour('sendchat') || (!emote && this.hasBehaviour('redirchat')) || (emote && this.hasBehaviour('rediremote'))) return null;
    }
    return { text, type };
  }

  /** `RlvHandler::redirectChatOrEmote`: true when the text was redirected (and must not be said in public). */
  redirectChatOrEmote(text: string): boolean {
    const name = isEmote(text) ? 'rediremote' : 'redirchat';
    if (!text || !this.hasBehaviour(name)) return false;
    // @sendchat wouldn't filter it so @redirchat won't redirect it either
    if (name === 'redirchat' && !this.filterChat(text, false).filtered) return false;
    for (const exception of this.exceptions) {
      if (exception.name !== name || typeof exception.option !== 'number') continue;
      if (this.canSendChannel(exception.option)) this.sendChatReply(exception.option, text);
    }
    return true;
  }

  /**
   * Chat arriving from the simulator (`process_chat_from_simulator`). `fromId` is the speaker; `sourceType` one of `CHAT_SOURCE`.
   * Returns the text to show, or null to hide the message. Commands in owner-say chat are handled by `handleObjectChat` first.
   */
  filterIncomingChat(opts: { fromId: string; fromName: string; text: string; chatType: number; sourceType: number }): RlvChatEvent {
    if (!this.enabled || opts.chatType === CHAT_TYPE.START || opts.chatType === CHAT_TYPE.STOP) return { text: opts.text, fromName: opts.fromName };
    let text = opts.text;
    const self = (this.env.selfId?.() ?? '').toLowerCase();
    const fromId = opts.fromId.toLowerCase();
    const ownAttachment = this.env.isOwnAttachment?.(opts.fromId) ?? false;
    // avatar => filter all text (unless it's this avatar or an exception); objects => filter everything except our attachments (never llOwnerSay or llRegionSayTo)
    const filterable = (opts.sourceType === CHAT_SOURCE.AGENT && fromId !== self) ||
      (opts.sourceType === CHAT_SOURCE.OBJECT && !ownAttachment && opts.chatType !== CHAT_TYPE.OWNER && opts.chatType !== CHAT_TYPE.DIRECT);
    if (filterable) {
      const emote = isEmote(text);
      if (!emote && ((this.hasBehaviour('recvchat') && !this.isException('recvchat', fromId)) || (this.hasBehaviour('recvchatfrom') && this.isException('recvchatfrom', fromId)))) {
        const result = this.filterChat(text, false);
        if (result.filtered && !this.showEllipsis) return { text: null };
        text = result.text;
      } else if (emote && ((this.hasBehaviour('recvemote') && !this.isException('recvemote', fromId)) || (this.hasBehaviour('recvemotefrom') && this.isException('recvemotefrom', fromId)))) {
        if (!this.showEllipsis) return { text: null };
        text = '/me ...';
      }
    }
    // avatar => filter only their name (unless it's this avatar); other => filter everything
    let fromName = opts.fromName;
    if (!this.canShowName()) {
      if (opts.sourceType !== CHAT_SOURCE.AGENT) { fromName = this.filterNames(fromName); text = this.filterNames(text); }
      else if (!this.canShowName(opts.fromId)) fromName = this.anonym(fromName);
      else text = this.filterNames(text);
    }
    if (this.hasBehaviour('showloc')) text = this.filterLocation(text);
    return { text, fromName };
  }

  /** What a blocked or hidden IM turns into when it arrives. */
  filterIncomingIM(senderId: string, text: string): string {
    return this.canReceiveIM(senderId) ? text : RLV_STRINGS.blockedRecvIm;
  }

  /** `RlvStrings::getAnonym`: the same name always maps to the same stand-in. */
  anonym(name: string): string {
    if (!this.enabled || RLV_ANONYMS.length === 0) return 'Unknown';
    const bytes = new TextEncoder().encode(name);
    let hash = 0;
    for (const byte of bytes) hash = (hash + (byte > 127 ? byte - 256 : byte)) >>> 0; // char is signed in the original
    return RLV_ANONYMS[hash % RLV_ANONYMS.length];
  }

  /** `RlvUtil::filterNames`: replace every nearby avatar's names (unless an exception) in a piece of text. */
  filterNames(text: string, opts: { filterLegacy?: boolean; clearMatches?: boolean } = {}): string {
    const filterLegacyDefault = opts.filterLegacy ?? true;
    let out = text;
    for (const avatar of this.env.nearbyAvatars?.() ?? []) {
      if (!opts.clearMatches && this.canShowName(avatar.id)) continue;
      const display = avatar.displayName, legacy = avatar.legacyName;
      const filterDisplay = display.length > 2;
      const filterLegacy = filterLegacyDefault && legacy.length > 2;
      const replacement = opts.clearMatches ? '' : this.anonym(legacy || display);
      const replace = (name: string) => { out = out.replace(new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi'), replacement); };
      if (legacy.toLowerCase().includes(display.toLowerCase())) {
        if (filterLegacy) replace(legacy);
        if (filterDisplay) replace(display);
      } else {
        if (filterDisplay) replace(display);
        if (filterLegacy) replace(legacy);
      }
    }
    return out;
  }

  /** `RlvUtil::filterLocation`: hide mentions of the surrounding regions and the parcel. */
  filterLocation(text: string): string {
    const { regions, parcel } = this.env.locationNames?.() ?? { regions: [], parcel: null };
    let out = text;
    for (const region of regions) if (region) out = out.replace(new RegExp(`\\b${escapeRegex(region)}\\b`, 'gi'), RLV_STRINGS.hiddenRegion);
    if (parcel) out = out.replace(new RegExp(`\\b${escapeRegex(parcel)}\\b`, 'gi'), RLV_STRINGS.hiddenParcel);
    return out;
  }

  /** `@notify` subscriptions (object id, channel, filter), for the code that reports events to scripts. */
  getNotifications() { return this.notifications.map((n) => ({ ...n })); }

  /** Tell `@notify` listeners about an event (`/<text>`), honouring their filters. */
  notify(text: string) {
    for (const n of this.notifications) if (!n.filter || text.includes(n.filter)) this.sendChatReply(n.channel, `/${text}`);
  }
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `rlvParseNotifyOption`: `<channel>[;<filter>]`. */
function parseNotifyOption(option: string): { channel: number; filter: string } | null {
  const tokens = option.split(RLV_OPTION_SEPARATOR);
  const channel = parseIntStrict(tokens[0] ?? '');
  if (channel === null || !isValidReplyChannel(channel) || tokens.length > 2) return null;
  return { channel, filter: tokens[1] ?? '' };
}

/** `rlvParseGetStatusOption`: `[<filter>][;<separator>]`. */
function parseGetStatusOption(option: string): { filter: string; separator: string } {
  const tokens = option.split(RLV_OPTION_SEPARATOR);
  return { filter: tokens[0] ?? '', separator: tokens.length > 1 && tokens[1] !== '' ? tokens[1] : '/' };
}
