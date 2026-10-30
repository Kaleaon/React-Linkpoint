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

  getPositionOverrides(): Map<string, Vec3> {
    return new Map(this.positionOverrides);
  }

  getScaleOverrides(): Map<string, Vec3> {
    return new Map(this.scaleOverrides);
  }

  /**
   * Set visual parameters (shape sliders) and trigger hierarchical matrix
   * propagation down all child Bento bones.
   */
  setVisualParams(params: Map<number | string, number> | Record<string | number, number>): Mat4[] {
    const entries = params instanceof Map ? params.entries() : Object.entries(params);
    for (const [key, val] of entries) {
      const numKey = Number(key);
      const k = Number.isNaN(numKey) ? key : numKey;
      this.visualParams.set(k, Number(val));
    }
    return this.recalculate();
  }

  setVisualParam(paramId: number | string, value: number): Mat4[] {
    const numKey = Number(paramId);
    const k = Number.isNaN(numKey) ? paramId : numKey;
    this.visualParams.set(k, Number(value));
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

  private computeOverridesFromVisualParams() {
    for (const [paramId, rawValue] of this.visualParams.entries()) {
      const id = String(paramId);
      const val = Number(rawValue) || 0;
      // Normalize weight factor roughly into [-1, 1] or [0, 1] for scaling calculation
      const factor = val > 1 ? (val - 128) / 128 : val;

      // Map standard visual param IDs / names
      if (id === '12' || id.toLowerCase().includes('head size')) {
        const s = Math.max(0.2, 1 + factor * 0.4);
        const scale: Vec3 = [s, s, s];
        for (const j of ['mHead', 'mSkull', 'mFaceRoot']) {
          const resolved = this.skeleton.resolve(j);
          if (resolved) this.scaleOverrides.set(resolved, scale);
        }
      } else if (id === '33' || id.toLowerCase().includes('height')) {
        const s = Math.max(0.5, 1 + factor * 0.25);
        const resolved = this.skeleton.resolve('mPelvis');
        if (resolved) {
          const rest = this.skeleton.bones[this.skeleton.indexOf(resolved)]?.rest || [0, 0, 0];
          this.positionOverrides.set(resolved, [rest[0], rest[1], rest[2] + factor * 0.15]);
        }
      } else if (id === '24' || id.toLowerCase().includes('torso length')) {
        const s = Math.max(0.5, 1 + factor * 0.3);
        for (const j of ['mTorso', 'mChest']) {
          const resolved = this.skeleton.resolve(j);
          if (resolved) this.scaleOverrides.set(resolved, [1, 1, s]);
        }
      } else if (id === '25' || id === '36' || id.toLowerCase().includes('shoulder')) {
        const s = Math.max(0.5, 1 + factor * 0.35);
        for (const j of ['mCollarLeft', 'mCollarRight', 'mShoulderLeft', 'mShoulderRight']) {
          const resolved = this.skeleton.resolve(j);
          if (resolved) this.scaleOverrides.set(resolved, [s, 1, 1]);
        }
      } else if (id === '26' || id.toLowerCase().includes('arm length')) {
        const s = Math.max(0.5, 1 + factor * 0.3);
        for (const j of ['mShoulderLeft', 'mShoulderRight', 'mElbowLeft', 'mElbowRight']) {
          const resolved = this.skeleton.resolve(j);
          if (resolved) this.scaleOverrides.set(resolved, [1, 1, s]);
        }
      } else if (id === '27' || id.toLowerCase().includes('leg length')) {
        const s = Math.max(0.5, 1 + factor * 0.3);
        for (const j of ['mHipLeft', 'mHipRight', 'mKneeLeft', 'mKneeRight']) {
          const resolved = this.skeleton.resolve(j);
          if (resolved) this.scaleOverrides.set(resolved, [1, 1, s]);
        }
      } else if (id === '28' || id === '37' || id.toLowerCase().includes('hip width')) {
        const s = Math.max(0.5, 1 + factor * 0.35);
        for (const j of ['mHipLeft', 'mHipRight']) {
          const resolved = this.skeleton.resolve(j);
          if (resolved) this.scaleOverrides.set(resolved, [s, 1, 1]);
        }
      } else if (id === '15' || id.toLowerCase().includes('eye size')) {
        const s = Math.max(0.2, 1 + factor * 0.4);
        for (const j of ['mEyeLeft', 'mEyeRight']) {
          const resolved = this.skeleton.resolve(j);
          if (resolved) this.scaleOverrides.set(resolved, [s, s, s]);
        }
      } else if (id === '29' || id.toLowerCase().includes('foot size')) {
        const s = Math.max(0.2, 1 + factor * 0.4);
        for (const j of ['mAnkleLeft', 'mAnkleRight', 'mFootLeft', 'mFootRight']) {
          const resolved = this.skeleton.resolve(j);
          if (resolved) this.scaleOverrides.set(resolved, [s, s, s]);
        }
      } else if (
        id === '34' ||
        id === '35' ||
        id.toLowerCase().includes('thickness') ||
        id.toLowerCase().includes('fat')
      ) {
        const s = Math.max(0.5, 1 + factor * 0.25);
        for (const j of ['mTorso', 'mChest', 'mPelvis']) {
          const resolved = this.skeleton.resolve(j);
          if (resolved) this.scaleOverrides.set(resolved, [s, s, 1]);
        }
      }
    }
  }

  recalculate(): Mat4[] {
    this.computeOverridesFromVisualParams();
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
