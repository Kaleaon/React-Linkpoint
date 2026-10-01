import { describe, expect, it } from 'vitest';
import { Primitives3D } from '../primitives-3d';

/** Fraction of triangles whose counter-clockwise normal agrees with the mesh's own vertex normals. */
function outwardFraction(mesh: { vertices: number[]; normals: number[]; indices: number[] }) {
  const v = mesh.vertices, nm = mesh.normals;
  let outward = 0, total = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const idx = [0, 1, 2].map((k) => mesh.indices[i + k]);
    const p = idx.map((o) => [v[o * 3], v[o * 3 + 1], v[o * 3 + 2]]);
    const e1 = p[1].map((x, k) => x - p[0][k]), e2 = p[2].map((x, k) => x - p[0][k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (Math.hypot(...n) < 1e-12) continue; // degenerate (pole) triangle
    const vn = [0, 1, 2].map((k) => idx.reduce((sum, o) => sum + nm[o * 3 + k], 0));
    total++;
    if (n[0] * vn[0] + n[1] * vn[1] + n[2] * vn[2] > 0) outward++;
  }
  return outward / total;
}

describe('primitive meshes face outward (counter-clockwise front faces, as the renderer culls back faces)', () => {
  const meshes: Array<[string, () => { vertices: number[]; indices: number[] }]> = [
    ['cube', () => Primitives3D.createCube(1)],
    ['sphere', () => Primitives3D.createSphere(1, 32, 16)],
    ['cylinder', () => Primitives3D.createCylinder(1, 1, 2, 32)],
    ['prism', () => Primitives3D.createPrism()],
    ['torus', () => Primitives3D.createTorus()],
  ];
  for (const [name, make] of meshes) {
    it(`${name}: every triangle's front side is the outside`, () => {
      expect(outwardFraction(make())).toBeGreaterThan(0.99);
    });
  }
});
