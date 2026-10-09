import { AvatarSkeleton, type Mat4 } from './avatar-skeleton';
import type { Vec3 } from './avatar-animation';

/**
 * AppearanceManager handles visual parameter changes (shape sliders, joint overrides)
 * and triggers hierarchical matrix recalculation across all child Bento bones.
 */
export class AppearanceManager {
  private skeleton: AvatarSkeleton;
  private visualParams = new Map<number | string, number>();
  private positionOverrides = new Map<string, Vec3>();
  private scaleOverrides = new Map<string, Vec3>();
  private cachedWorldMatrices: Mat4[] = [];

  constructor(skeleton?: AvatarSkeleton) {
    this.skeleton = skeleton || new AvatarSkeleton();
    this.recalculate();
  }

  getSkeleton(): AvatarSkeleton {
    return this.skeleton;
  }

  getVisualParams(): Map<number | string, number> {
    return new Map(this.visualParams);
  }

  /**
   * Set visual parameters (shape sliders) and trigger hierarchical matrix
   * propagation down all child Bento bones.
   */
  setVisualParams(params: Map<number | string, number> | Record<string | number, number>): Mat4[] {
    const entries = params instanceof Map ? params.entries() : Object.entries(params);
    for (const [key, val] of entries) {
      this.visualParams.set(key, Number(val));
    }
    return this.recalculate();
  }

  setVisualParam(paramId: number | string, value: number): Mat4[] {
    this.visualParams.set(paramId, value);
    return this.recalculate();
  }

  setJointOverride(jointName: string, position?: Vec3, scale?: Vec3): Mat4[] {
    const resolved = this.skeleton.resolve(jointName);
    if (resolved) {
      if (position) this.positionOverrides.set(resolved, position);
      if (scale) this.scaleOverrides.set(resolved, scale);
    }
    return this.recalculate();
  }

  recalculate(): Mat4[] {
    this.cachedWorldMatrices = this.skeleton.worldMatrices(
      new Map(),
      this.positionOverrides,
      [0, 0, 0],
      this.scaleOverrides,
    );
    return this.cachedWorldMatrices;
  }

  getWorldMatrices(): Mat4[] {
    return this.cachedWorldMatrices;
  }
}
