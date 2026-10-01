/**
 * Tracks which animations each avatar / animated object is running (as announced
 * by the simulator's AvatarAnimation and ObjectAnimation messages) and produces
 * its blended skeleton pose over time.
 */
import { blendAnimations, parseAnimation, type JointPose, type KeyframeAnimation, type RunningAnimation } from './avatar-animation';

export interface AnimationRequest { id: string; seq: number }
export type AnimationLoader = (id: string) => Promise<KeyframeAnimation | null>;

interface Entry extends RunningAnimation { id: string; seq: number; anim: KeyframeAnimation }

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/** Built-in animations ship as static files named by UUID. */
export function bundledAnimationLoader(baseUrl = '/anims/', fetcher: typeof fetch = (input, init) => fetch(input, init)): AnimationLoader {
  return async (id) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    try {
      const response = await fetcher(`${baseUrl}${id.toLowerCase()}`);
      if (!response.ok) return null;
      return parseAnimation(new Uint8Array(await response.arrayBuffer()));
    } catch {
      return null; // not a bundled animation, or malformed: the avatar simply keeps its other poses
    }
  };
}

export class AvatarAnimator {
  private cache = new Map<string, Promise<KeyframeAnimation | null>>();
  private running = new Map<string, Map<string, Entry | { pending: true; seq: number; startedAt: number }>>();

  constructor(private loader: AnimationLoader, private clock: () => number = () => performance.now() / 1000) {}

  private load(id: string) {
    let promise = this.cache.get(id);
    if (!promise) {
      promise = this.loader(id).catch(() => null);
      this.cache.set(id, promise);
    }
    return promise;
  }

  /**
   * Replace the set of animations a subject is running. New ids start now, a changed sequence id
   * restarts an animation, and ids that disappeared ease out instead of cutting off.
   */
  setAnimations(subjectId: string, animations: AnimationRequest[]) {
    const now = this.clock();
    const current = this.running.get(subjectId) || new Map();
    this.running.set(subjectId, current);
    const wanted = new Map<string, AnimationRequest>();
    for (const a of animations) if (a.id && a.id !== ZERO_UUID) wanted.set(a.id, a);

    for (const [id, entry] of current) {
      if (!wanted.has(id) && !('pending' in entry) && entry.stoppedAt == null) entry.stoppedAt = now;
      if (!wanted.has(id) && 'pending' in entry) current.delete(id);
    }
    for (const [id, request] of wanted) {
      const existing = current.get(id);
      if (existing && existing.seq === request.seq && !('stoppedAt' in existing && existing.stoppedAt != null)) continue;
      const startedAt = now;
      current.set(id, { pending: true, seq: request.seq, startedAt });
      this.load(id).then((anim) => {
        const slot = this.running.get(subjectId)?.get(id);
        if (!anim || !slot || !('pending' in slot) || slot.seq !== request.seq) {
          if (!anim && slot && 'pending' in slot && slot.seq === request.seq) this.running.get(subjectId)?.delete(id);
          return;
        }
        this.running.get(subjectId)!.set(id, { id, seq: request.seq, anim, startedAt: slot.startedAt, stoppedAt: null });
      });
    }
  }

  /** Blended joint pose for a subject now; empty when nothing is running. Finished animations are dropped. */
  pose(subjectId: string, now: number = this.clock()): Map<string, JointPose> {
    const current = this.running.get(subjectId);
    if (!current) return new Map();
    const live: Entry[] = [];
    for (const [id, entry] of current) {
      if ('pending' in entry) continue;
      if (entry.stoppedAt != null && now - entry.stoppedAt >= Math.max(entry.anim.easeOut, 0.001)) { current.delete(id); continue; }
      if (!entry.anim.loop && entry.stoppedAt == null && now - entry.startedAt >= entry.anim.length) continue; // finished, holds last frame
      live.push(entry);
    }
    return blendAnimations(live, now);
  }

  /** True while the subject has any animation that still changes its pose. */
  isAnimating(subjectId: string): boolean {
    const current = this.running.get(subjectId);
    if (!current) return false;
    for (const entry of current.values()) if ('pending' in entry || entry.anim.loop || entry.stoppedAt != null || this.clock() - entry.startedAt < entry.anim.length + entry.anim.easeOut) return true;
    return false;
  }

  remove(subjectId: string) { this.running.delete(subjectId); }
  clear() { this.running.clear(); }
  subjects() { return [...this.running.keys()]; }
}
