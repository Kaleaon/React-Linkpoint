import { describe, expect, it, vi } from 'vitest';
import { Camera3D } from '../camera-3d';
import { Scene3D } from '../scene-3d';

const CUBE_BOUNDS = { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };

function makeScene(options: { camera?: Partial<Camera3D>; bounds?: boolean } = {}) {
  const graphics = {
    clear: vi.fn(),
    drawMesh: vi.fn(),
    setClearColor: vi.fn(),
    createMesh: vi.fn(),
    createRenderTarget: vi.fn(),
    beginRenderTarget: vi.fn(() => false),
    endRenderTarget: vi.fn(),
    getMeshBounds: vi.fn((name: string) => (options.bounds === false || name.startsWith('unknown') ? null : CUBE_BOUNDS)),
  };
  const camera = new Camera3D();
  camera.mode = 'first-person';
  camera.position = [0, 0, 50];
  camera.rotation = [0, 0, 0]; // looking along +Y
  Object.assign(camera, options.camera);
  camera.updateMatrices();
  const scene = new Scene3D(graphics as any, camera);
  scene.showGrid = false;
  return { scene, graphics, camera };
}

const drawnIds = (graphics: ReturnType<typeof makeScene>['graphics']) =>
  graphics.drawMesh.mock.calls.filter((call) => call[1] === 'basic').map((call) => call[2].uModelMatrix[13]);
const programs = (graphics: ReturnType<typeof makeScene>['graphics']) => graphics.drawMesh.mock.calls.map((call) => call[1]);

describe('Scene3D frustum culling', () => {
  it('skips objects behind the camera or far outside the view but keeps visible ones', () => {
    const { scene, graphics } = makeScene();
    scene.addObject('ahead', { mesh: 'cube', position: [0, 20, 50] });
    scene.addObject('behind', { mesh: 'cube', position: [0, -20, 50] });
    scene.addObject('left', { mesh: 'cube', position: [-800, 20, 50] });
    scene.addObject('too-far', { mesh: 'cube', position: [0, 5000, 50] });

    scene.render();

    expect(drawnIds(graphics)).toEqual([20]);
    expect(scene.frameStats).toEqual({ drawn: 1, culled: 3 });
  });

  it('keeps large objects whose centre is outside but whose bounds reach into view', () => {
    const { scene, graphics } = makeScene();
    // At 20m the view is about +-20.5m wide (60 degree vertical FOV, 16:9).
    scene.addObject('wall', { mesh: 'cube', position: [-80, 20, 50], scale: [100, 1, 1] }); // spans x -130..-30: outside
    scene.addObject('big-wall', { mesh: 'cube', position: [-80, 21, 50], scale: [160, 1, 1] }); // spans x -160..0: reaches in

    scene.render();

    expect(scene.frameStats).toEqual({ drawn: 1, culled: 1 });
    expect(drawnIds(graphics)).toEqual([21]); // only the wall that reaches into view
  });

  it('never culls when bounds are unknown, the matrices are degenerate, or culling is disabled', () => {
    const unknown = makeScene({ bounds: false });
    unknown.scene.addObject('behind', { mesh: 'cube', position: [0, -20, 50] });
    unknown.scene.render();
    expect(unknown.scene.frameStats.culled).toBe(0);

    const degenerate = makeScene();
    degenerate.camera.getViewMatrix = () => new Float32Array(16);
    degenerate.camera.getProjectionMatrix = () => new Float32Array(16);
    degenerate.scene.addObject('behind', { mesh: 'cube', position: [0, -20, 50] });
    degenerate.scene.render();
    expect(degenerate.scene.frameStats).toEqual({ drawn: 1, culled: 0 });

    const disabled = makeScene();
    disabled.scene.cullingEnabled = false;
    disabled.scene.addObject('behind', { mesh: 'cube', position: [0, -20, 50] });
    disabled.scene.render();
    expect(disabled.scene.frameStats.culled).toBe(0);
  });

  it('does not cull a multi-part asset when one part has no known bounds', () => {
    const { scene } = makeScene();
    scene.addObject('asset', { mesh: 'cube', meshes: [{ mesh: 'cube', materialIndex: 0 }, { mesh: 'unknown-part', materialIndex: 1 }], position: [0, -20, 50] });
    scene.render();
    expect(scene.frameStats.culled).toBe(0);
  });

  it('uses the union of part bounds for multi-part assets', () => {
    const { scene, graphics } = makeScene();
    graphics.getMeshBounds.mockImplementation((name: string) => (name === 'wide' ? { min: [-200, -0.5, -0.5], max: [200, 0.5, 0.5] } : CUBE_BOUNDS));
    scene.addObject('asset', { mesh: 'cube', meshes: [{ mesh: 'cube', materialIndex: 0 }, { mesh: 'wide', materialIndex: 1 }], position: [-100, 20, 50] });
    scene.render();
    expect(scene.frameStats).toEqual({ drawn: 1, culled: 0 }); // the wide part spans x -300..100
  });
});

describe('Scene3D sky and water', () => {
  function readyScene(options: Parameters<typeof makeScene>[0] = {}) {
    const result = makeScene(options);
    result.scene.createEnvironmentMeshes();
    return result;
  }

  it('does not draw sky or water until environment resources exist', () => {
    const { scene, graphics } = makeScene();
    scene.render();
    expect(programs(graphics)).toEqual([]);
  });

  it('draws opaque objects, then the sky, then water, then blended objects back to front', () => {
    const { scene, graphics } = readyScene();
    scene.setTerrain(new Array(16 * 16).fill(0), 16);
    scene.addObject('glass', { mesh: 'cube', position: [0, 20, 50], faces: [{ pbr: { alphaMode: 'BLEND' } }] });
    scene.addObject('solid', { mesh: 'cube', position: [0, 30, 50] });

    scene.render();

    expect(programs(graphics)).toEqual(['basic', 'basic', 'sky', 'water', 'basic']);
    expect(drawnIds(graphics)).toEqual([0 /* terrain */, 30, 20]);
  });

  it('pins the sky to the camera by removing view translation, and writes no depth', () => {
    const { scene, graphics } = readyScene({ camera: { position: [100, 200, 50] } });
    scene.setEnvironment({ sky: { blueHorizon: [0.2, 0.2, 0.2], blueDensity: [1, 1, 1], sunlightColor: [0.1, 0.1, 0.1], ambient: [0.1, 0.1, 0.1] } });
    scene.render();

    const call = graphics.drawMesh.mock.calls.find((c) => c[1] === 'sky')!;
    expect(Array.from(call[2].uSkyViewMatrix.slice(12, 15))).toEqual([0, 0, 0]);
    expect(Array.from(call[2].uSkyColor).map((v: number) => +v.toFixed(3))).toEqual([0.4, 0.4, 0.4]);
    expect(call[3]).toMatchObject({ depthWrite: false });
  });

  it('draws stars only when the sky has star brightness', () => {
    const night = readyScene();
    night.scene.setEnvironment({ sky: { blueHorizon: [0, 0, 0], blueDensity: [1, 1, 1], starBrightness: 0.7 } });
    night.scene.render();
    const stars = night.graphics.drawMesh.mock.calls.find((c) => c[1] === 'stars')!;
    expect(stars[3]).toMatchObject({ mode: 'points', blend: true });
    expect(stars[2].uStarColor[3]).toBeCloseTo(0.7, 6);

    const day = readyScene();
    day.scene.render();
    expect(programs(day.graphics)).not.toContain('stars');
  });

  it('only draws water once real terrain has loaded, at the configured height, with wave tables', () => {
    const { scene, graphics } = readyScene();
    scene.render();
    expect(programs(graphics)).not.toContain('water');

    scene.setTerrain(new Array(16 * 16).fill(0), 16);
    expect(scene.setWaterHeight(18.5)).toBe(true);
    expect(scene.setWaterHeight(Number.NaN)).toBe(false);
    graphics.drawMesh.mockClear();
    scene.render();

    const uniforms = graphics.drawMesh.mock.calls.find((c) => c[1] === 'water')![2];
    expect(uniforms.uWaterHeight).toBe(18.5);
    expect(uniforms.uFrequency).toHaveLength(4);
    expect(uniforms.uDirection).toHaveLength(8);
    expect(uniforms.uTime).toBeGreaterThanOrEqual(0);
    expect(uniforms.uTime).toBeLessThan(1000);
    expect(uniforms.uPixelAngle).toBeGreaterThan(0);
    expect(uniforms.uNormalScale).toBeGreaterThan(0);
  });

  it('switches to a water tint with no sky or water surface while the camera is underwater, and restores on surfacing', () => {
    const { scene, graphics, camera } = readyScene();
    scene.setTerrain(new Array(16 * 16).fill(0), 16);
    scene.setEnvironment({ sky: { blueHorizon: [0.2, 0.4, 0.6] } });
    graphics.setClearColor.mockClear();

    camera.position = [0, 0, 10];
    camera.updateMatrices();
    graphics.drawMesh.mockClear();
    scene.render();
    expect(scene.underWater).toBe(true);
    expect(programs(graphics)).not.toContain('sky');
    expect(programs(graphics)).not.toContain('water');
    expect(graphics.setClearColor).toHaveBeenCalledTimes(1);

    scene.render(); // still underwater: no repeated clear-colour churn
    expect(graphics.setClearColor).toHaveBeenCalledTimes(1);

    camera.position = [0, 0, 50];
    camera.updateMatrices();
    scene.render();
    expect(scene.underWater).toBe(false);
    expect(graphics.setClearColor).toHaveBeenLastCalledWith([0.2, 0.4, 0.6, 1]);
    expect(programs(graphics)).toContain('sky');
  });

  it('honours showSky / showWater toggles', () => {
    const { scene, graphics } = readyScene();
    scene.setTerrain(new Array(16 * 16).fill(0), 16);
    scene.showSky = false;
    scene.showWater = false;
    scene.render();
    expect(programs(graphics)).not.toContain('sky');
    expect(programs(graphics)).not.toContain('water');
  });
});

describe('Scene3D.pick', () => {
  it('returns the nearest object under the cursor with its distance and hit point', () => {
    const { scene } = makeScene();
    scene.addObject('near', { mesh: 'cube', position: [0, 20, 50], scale: [2, 2, 2] });
    scene.addObject('far', { mesh: 'cube', position: [0, 40, 50], scale: [2, 2, 2] });
    scene.addObject('aside', { mesh: 'cube', position: [30, 20, 50] });

    const hit = scene.pick(400, 300, 800, 600)!; // screen centre looks along +Y
    expect(hit.id).toBe('near');
    expect(hit.distance).toBeCloseTo(19, 3); // camera y=0 to the near face at y=19
    expect(hit.point[1]).toBeCloseTo(19, 3);
    expect(hit.point[0]).toBeCloseTo(0, 3);
  });

  it('respects rotation, visibility and misses', () => {
    const { scene } = makeScene();
    scene.addObject('hidden', { mesh: 'cube', position: [0, 10, 50], visible: false });
    scene.addObject('slab', { mesh: 'cube', position: [0, 20, 50], scale: [1, 8, 1], rotation: [0, 0, Math.PI / 2] }); // 8 wide along X after rotation
    expect(scene.pick(400, 300, 800, 600)!.id).toBe('slab');
    expect(scene.pick(400, 300, 800, 600)!.distance).toBeCloseTo(19.5, 3);
    expect(scene.pick(5, 5, 800, 600)).toBeNull();
  });

  it('falls back to the unit cube a prim is scaled from when mesh bounds are unknown', () => {
    const { scene } = makeScene({ bounds: false });
    scene.addObject('x', { mesh: 'cube', position: [0, 20, 50] });
    scene.addObject('hidden', { mesh: 'cube', position: [0, 10, 50], visible: false });
    expect(scene.pick(400, 300, 800, 600)).toMatchObject({ id: 'x' });
    expect(scene.pick(400, 300, 800, 600)!.distance).toBeCloseTo(19.5, 3);
  });

  it('uses real mesh bounds rather than assuming a unit cube', () => {
    const { scene, graphics } = makeScene();
    graphics.getMeshBounds.mockReturnValue({ min: [-0.5, -3, -0.5], max: [0.5, 3, 0.5] });
    scene.addObject('long', { mesh: 'cube', position: [0, 20, 50] });
    expect(scene.pick(400, 300, 800, 600)!.distance).toBeCloseTo(17, 3);
  });
});

describe('Scene3D lighting from the environment', () => {
  const objectCall = (graphics: ReturnType<typeof makeScene>['graphics']) => graphics.drawMesh.mock.calls.find((call) => call[1] === 'basic')![2];

  it('uses the sky ambient term and sun direction for objects', () => {
    const { scene, graphics } = makeScene();
    scene.addLight({ position: [0, 0, 1], color: [1, 1, 1] });
    scene.addObject('prim', { mesh: 'cube', position: [0, 20, 50] });
    scene.setEnvironment({ currentSky: { ambient: [0.6, 0.5, 0.4, 1], sunlightColor: [0.9, 0.8, 0.7, 1], sunDirection: [0, 0, 1] } });
    scene.render();
    const call = objectCall(graphics);
    expect(Array.from(call.uAmbientColor)).toEqual([0.6, 0.5, 0.4].map(Math.fround));
    expect(Array.from(call.uLightPos)).toEqual([0, 0, 10000]);
    expect(Array.from(call.uLightColor)).toEqual([0.9, 0.8, 0.7].map(Math.fround));
  });

  it('keeps a modest default ambient and clamps out-of-range values', () => {
    const { scene, graphics } = makeScene();
    scene.addObject('prim', { mesh: 'cube', position: [0, 20, 50] });
    scene.render();
    expect(Array.from(objectCall(graphics).uAmbientColor)).toEqual([0.2, 0.2, 0.2].map(Math.fround));
    graphics.drawMesh.mockClear();
    scene.setEnvironment({ currentSky: { ambient: [3, -1, 0.5] } });
    scene.render();
    expect(Array.from(objectCall(graphics).uAmbientColor)).toEqual([1, 0, 0.5]);
  });

  it('ignores a non-finite sun direction', () => {
    const { scene } = makeScene();
    scene.addLight({ position: [1, 2, 3] });
    scene.setEnvironment({ currentSky: { sunDirection: [NaN, 0, 1] } });
    expect(scene.lights[0].position).toEqual([1, 2, 3]);
  });
});
