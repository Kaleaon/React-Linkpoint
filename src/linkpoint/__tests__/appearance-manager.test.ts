import { describe, expect, it } from 'vitest';
import { AppearanceManager } from '../appearance-manager';
import { AvatarSkeleton } from '../avatar-skeleton';

describe('AppearanceManager & Hierarchical Matrix Propagation', () => {
  it('creates an instance with default skeleton matrices', () => {
    const mgr = new AppearanceManager();
    expect(mgr.getSkeleton()).toBeInstanceOf(AvatarSkeleton);
    const matrices = mgr.getWorldMatrices();
    expect(matrices).toHaveLength(159); // 159 total bones
  });

  it('triggers hierarchical matrix recalculations across child Bento bones on setVisualParams', () => {
    const mgr = new AppearanceManager();
    const skeleton = mgr.getSkeleton();

    const initialJawIndex = skeleton.indexOf('mFaceJaw');
    const initialJawMatrix = Array.from(mgr.getWorldMatrices()[initialJawIndex]);

    // Apply joint overrides or visual parameters on parent head joint
    mgr.setJointOverride('mHead', [0, 0, 0.2]); // shift head up
    const updatedMatrices = mgr.getWorldMatrices();
    const updatedJawMatrix = Array.from(updatedMatrices[initialJawIndex]);

    // Child Bento bone (mFaceJaw) matrix must shift hierarchically along with parent mHead
    expect(updatedJawMatrix[14]).toBeGreaterThan(initialJawMatrix[14]);
    expect(updatedJawMatrix[14] - initialJawMatrix[14]).toBeGreaterThan(0.1);
  });

  it('completes matrix recalculation within 2 milliseconds on visual parameter updates', () => {
    const mgr = new AppearanceManager();
    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      mgr.setVisualParams({ 33: 0.5 + (i % 10) * 0.01, 102: 0.2 + (i % 5) * 0.05 });
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 50;
    expect(perCall).toBeLessThan(2.0); // Success Metric: < 2 ms
  });
});
