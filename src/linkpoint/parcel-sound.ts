/**
 * "Sound local" parcels, from the official viewer (`indra/newview/llviewerparcelmgr.cpp`: `processParcelOverlay`,
 * `writeAgentParcelFromBitmap`, `inAgentParcel`, `isSoundLocal`, `canHearSound`; `llviewerparceloverlay.cpp`;
 * flag values from `indra/llinventory/llparcel.h` and `llparcelflags.h`).
 *
 * A parcel can be marked so its sounds are heard only inside it. The rule: a sound is heard when it is in the
 * avatar's parcel; otherwise not heard if the avatar's parcel is sound-local, and not heard if the sound's parcel is
 * sound-local. Only the current region is known (the simulator sends the overlay of the region it simulates), so a
 * sound in another region is treated as being in a parcel that is not sound-local.
 */

/** `PARCEL_SOUND_LOCAL`: a bit of each overlay byte. */
export const PARCEL_SOUND_LOCAL = 0x20;
/** `PF_SOUND_LOCAL` in the parcel flags. */
export const PF_SOUND_LOCAL = 1 << 15;
/** `PARCEL_GRID_STEP_METERS`. */
export const PARCEL_GRID_STEP_METERS = 4;
/** `PARCEL_OVERLAY_CHUNKS`: the overlay arrives in this many messages. */
export const PARCEL_OVERLAY_CHUNKS = 4;
/** Sequence ids that are not the agent's parcel (`SELECTED_PARCEL_SEQ_ID` ...). */
const NON_AGENT_SEQUENCES = new Set([-10000, -20000, -30000, -40000, -50000]);

import { Utils } from './utils';

const decode = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

export interface ParcelSoundEvent {
  action: 'overlay' | 'parcel' | 'reset';
  sequenceId?: number;
  data?: string;
  requestResult?: number;
  localId?: number;
  flags?: number;
  bitmap?: string;
}

export class ParcelSoundMap extends Utils.EventEmitter {
  /** Cells per edge: region width over 4 m (64 for a 256 m region). */
  readonly cellsPerEdge: number;
  private readonly overlay: Uint8Array;
  private overlayChunks = new Set<number>();
  private readonly agentCells: Uint8Array;
  private agentSequence = 0;
  private agentLocalId = -1;
  private agentSoundLocal = false;
  /** True once the agent's parcel has been received; sounds are not restricted before that. */
  hasAgentParcel = false;

  constructor(public readonly regionWidth = 256) {
    super();
    this.cellsPerEdge = Math.floor(regionWidth / PARCEL_GRID_STEP_METERS);
    this.overlay = new Uint8Array(this.cellsPerEdge * this.cellsPerEdge);
    this.agentCells = new Uint8Array(this.cellsPerEdge * this.cellsPerEdge);
  }

  /** The avatar's parcel: its local id and flags, once known. */
  get agentParcel(): { localId: number; flags: number } | null {
    return this.hasAgentParcel ? { localId: this.agentLocalId, flags: this.agentFlags } : null;
  }
  private agentFlags = 0;

  reset() {
    this.agentFlags = 0;
    this.overlay.fill(0); this.overlayChunks.clear(); this.agentCells.fill(0);
    this.agentSequence = 0; this.agentLocalId = -1; this.agentSoundLocal = false; this.hasAgentParcel = false;
  }

  /** Feed one forwarded message from the core. */
  accept(event: ParcelSoundEvent) {
    if (event.action === 'reset') this.reset();
    else if (event.action === 'overlay' && typeof event.data === 'string') this.acceptOverlay(event.sequenceId ?? -1, decode(event.data));
    else if (event.action === 'parcel') this.acceptParcel(event);
  }

  /** `LLViewerParcelMgr::processParcelOverlay` + `LLViewerParcelOverlay::uncompressLandOverlay`: chunk `sequence` is a slice of the grid. */
  private acceptOverlay(sequence: number, data: Uint8Array) {
    const chunkSize = this.overlay.length / PARCEL_OVERLAY_CHUNKS;
    if (data.length !== chunkSize) return; // "Got parcel overlay size ... expecting ..."
    if (!Number.isInteger(sequence) || sequence < 0 || sequence >= PARCEL_OVERLAY_CHUNKS) return;
    this.overlay.set(data, sequence * chunkSize);
    this.overlayChunks.add(sequence);
  }

  /** The agent-parcel half of `processParcelProperties`. */
  private acceptParcel(event: ParcelSoundEvent) {
    if (event.requestResult === -1) return; // PARCEL_RESULT_NO_DATA
    const sequence = event.sequenceId ?? 0;
    const flags = (event.flags ?? 0) >>> 0;
    const isAgentSequence = !NON_AGENT_SEQUENCES.has(sequence) && (sequence === 0 || sequence > this.agentSequence);
    if (isAgentSequence) {
      // A new agent parcel: take its flags, id and cell bitmap.
      this.agentSequence = sequence;
      this.agentLocalId = event.localId ?? -1;
      this.agentSoundLocal = (flags & PF_SOUND_LOCAL) !== 0;
      this.agentFlags = flags;
      this.writeAgentParcelFromBitmap(event.bitmap ? decode(event.bitmap) : null);
      this.hasAgentParcel = true;
      this.emit('agent_parcel', this.agentParcel);
    } else if (this.hasAgentParcel && event.localId === this.agentLocalId) {
      // Another message about the agent's parcel (selected, hovered ...): its flags are current.
      this.agentSoundLocal = (flags & PF_SOUND_LOCAL) !== 0;
      if (flags !== this.agentFlags) { this.agentFlags = flags; this.emit('agent_parcel', this.agentParcel); }
    }
  }

  /** `writeAgentParcelFromBitmap`: bit `x + y*edge` (least significant bit first within each byte). */
  private writeAgentParcelFromBitmap(bitmap: Uint8Array | null) {
    this.agentCells.fill(0);
    const expected = (this.cellsPerEdge * this.cellsPerEdge) / 8;
    if (!bitmap || bitmap.length < expected) return;
    for (let i = 0; i < this.agentCells.length; i++) this.agentCells[i] = (bitmap[i >> 3] >> (i & 7)) & 1;
  }

  private cell(position: ArrayLike<number>): number {
    const row = Math.trunc(position[1] / PARCEL_GRID_STEP_METERS);
    const column = Math.trunc(position[0] / PARCEL_GRID_STEP_METERS);
    if (row < 0 || column < 0 || row >= this.cellsPerEdge || column >= this.cellsPerEdge) return -1;
    return row * this.cellsPerEdge + column;
  }

  /** `inAgentParcel`: a region-local position inside the avatar's parcel. */
  inAgentParcel(regionPosition: ArrayLike<number>): boolean {
    const cell = this.cell(regionPosition);
    return cell >= 0 && this.agentCells[cell] === 1;
  }

  /** `LLViewerParcelOverlay::isSoundLocal`: the parcel at a region-local position is sound-local. */
  isSoundLocal(regionPosition: ArrayLike<number>): boolean {
    const cell = this.cell(regionPosition);
    return cell >= 0 && (this.overlay[cell] & PARCEL_SOUND_LOCAL) !== 0;
  }

  /**
   * `LLViewerParcelMgr::canHearSound` for a position in the avatar's region (null when it is in another region).
   * Until the avatar's parcel is known nothing is restricted.
   */
  canHear(regionPosition: ArrayLike<number> | null): boolean {
    if (!this.hasAgentParcel) return true;
    if (regionPosition && this.inAgentParcel(regionPosition)) return true; // same parcel as the avatar
    if (this.agentSoundLocal) return false; // not in the avatar's parcel, which only hears its own sounds
    if (regionPosition && this.isSoundLocal(regionPosition)) return false; // the sound's parcel is heard only inside it
    return true;
  }
}
