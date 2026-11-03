import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Scene3D } from '../scene-3d';
import { createArrow, createScaleHandle } from '../primitives-3d';
import { Ray } from '../ray-pick';

function makeScene(cameraPos: [number, number, number] = [0, 0, 10]) {
  const graphics = {
    clear: vi.fn(),
    drawMesh: vi.fn(),
    setClearColor: vi.fn(),
    createMesh: vi.fn(),
    createRenderTarget: vi.fn(),
    beginRenderTarget: vi.fn(() => false),
    endRenderTarget: vi.fn(),
  };
  const camera = {
    position: [...cameraPos],
    getViewMatrix: () => new Float32Array(16),
    getProjectionMatrix: () => new Float32Array(16),
    screenToWorldRay: vi.fn((x: number, y: number, w: number, h: number) => ({
      origin: [0.6, 0, 10],
      direction: [0, 0, -1],
    })),
  };
  return { scene: new Scene3D(graphics as any, camera as any), graphics, camera };
}

describe('Scene3D Gizmo & Primitives', () => {
  it('creates valid arrow geometry with cone tip and cylinder shaft', () => {
    const arrow = createArrow(0.04, 0.7, 0.1, 0.3, 16);
    expect(arrow.vertices.length).toBeGreaterThan(0);
    expect(arrow.indices.length).toBeGreaterThan(0);
    expect(arrow.normals.length).toBe(arrow.vertices.length);
    expect(arrow.texCoords.length).toBe((arrow.vertices.length / 3) * 2);

    // Tip of cone should reach z = 1.0 (shaftLength 0.7 + coneLength 0.3)
    let maxZ = -Infinity;
    let minZ = Infinity;
    for (let i = 2; i < arrow.vertices.length; i += 3) {
      if (arrow.vertices[i] > maxZ) maxZ = arrow.vertices[i];
      if (arrow.vertices[i] < minZ) minZ = arrow.vertices[i];
    }
    expect(maxZ).toBeCloseTo(1.0, 2);
    expect(minZ).toBeCloseTo(0.0, 2);
  });

  it('creates valid scale handle geometry with cube tip and cylinder shaft', () => {
    const scaleMesh = createScaleHandle(0.04, 0.7, 0.16, 16);
    expect(scaleMesh.vertices.length).toBeGreaterThan(0);
    expect(scaleMesh.indices.length).toBeGreaterThan(0);

    let maxZ = -Infinity;
    for (let i = 2; i < scaleMesh.vertices.length; i += 3) {
      if (scaleMesh.vertices[i] > maxZ) maxZ = scaleMesh.vertices[i];
    }
    expect(maxZ).toBeGreaterThan(0.7);
  });

  it('calculates uniform screen-space scale based on camera distance', () => {
    const { scene, camera } = makeScene([0, 0, 10]);
    // Object at origin: distance = 10 -> scale = clamp(0.1, 10 * 0.15, 10.0) = 1.5
    const scale1 = scene.getGizmoScale([0, 0, 0]);
    expect(scale1).toBeCloseTo(1.5, 2);

    // Closer camera: distance = 2 -> scale = 0.3
    camera.position = [0, 0, 2];
    const scale2 = scene.getGizmoScale([0, 0, 0]);
    expect(scale2).toBeCloseTo(0.3, 2);

    // Very close camera clamps at min scale (0.1)
    camera.position = [0, 0, 0.5];
    const scale3 = scene.getGizmoScale([0, 0, 0]);
    expect(scale3).toBe(0.1);

    // Very far camera scales linearly with distance
    camera.position = [0, 0, 200];
    const scale4 = scene.getGizmoScale([0, 0, 0]);
    expect(scale4).toBeCloseTo(30.0, 2);
  });

  it('manages gizmo mode, selection, and modify permissions', () => {
    const { scene } = makeScene();
    expect(scene.getGizmoMode()).toBe('translate');

    scene.setGizmoMode('rotate');
    expect(scene.getGizmoMode()).toBe('rotate');

    scene.setGizmoMode('scale');
    expect(scene.getGizmoMode()).toBe('scale');

    scene.setGizmoSelectedObject('obj-1', true);
    scene.setGizmoHoverAxis('x');
    scene.setActiveGizmoAxis('y');

    scene.resetWorld();
    expect(scene.selectedObjectId).toBeNull();
    expect(scene.activeGizmoAxis).toBeNull();
    expect(scene.gizmoHoverAxis).toBeNull();
  });

  it('renders gizmo with depthTest: false to maintain overlay visibility through terrain', () => {
    const { scene, graphics } = makeScene([0, 0, 10]);
    scene.addObject('prim-123', { position: [0, 0, 0], scale: [1, 1, 1] });
    scene.setGizmoSelectedObject('prim-123', true);

    const viewMatrix = new Float32Array(16);
    const projMatrix = new Float32Array(16);

    // Render translate gizmo
    scene.setGizmoMode('translate');
    graphics.drawMesh.mockClear();
    scene.renderGizmo(viewMatrix, projMatrix);

    expect(graphics.drawMesh).toHaveBeenCalledTimes(3); // X, Y, Z
    expect(graphics.drawMesh).toHaveBeenCalledWith(
      'gizmo-arrow',
      'basic',
      expect.objectContaining({
        uColor: new Float32Array([0.95, 0.2, 0.2, 1.0]), // Red for X
      }),
      expect.objectContaining({
        depthTest: false,
        depthWrite: false,
        cullFace: false,
      }),
    );

    // Render rotate gizmo
    scene.setGizmoMode('rotate');
    graphics.drawMesh.mockClear();
    scene.renderGizmo(viewMatrix, projMatrix);

    expect(graphics.drawMesh).toHaveBeenCalledTimes(3); // Torus X, Y, Z
    expect(graphics.drawMesh).toHaveBeenCalledWith(
      'gizmo-torus',
      'basic',
      expect.anything(),
      expect.objectContaining({
        depthTest: false,
      }),
    );

    // Render scale gizmo with active hover axis highlight
    scene.setGizmoMode('scale');
    scene.setGizmoHoverAxis('y');
    graphics.drawMesh.mockClear();
    scene.renderGizmo(viewMatrix, projMatrix);

    expect(graphics.drawMesh).toHaveBeenCalledTimes(3);
    // Y axis should be highlighted yellow ([1.0, 0.9, 0.15, 1.0])
    const yCall = graphics.drawMesh.mock.calls.find((call: any[]) => {
      const color = call[2]?.uColor;
      return color && Math.abs(color[0] - 1.0) < 0.05 && Math.abs(color[1] - 0.9) < 0.05;
    });
    expect(yCall).toBeDefined();
  });

  it('does not render gizmo when disabled or when no object is selected', () => {
    const { scene, graphics } = makeScene();
    scene.setGizmoSelectedObject(null);
    scene.renderGizmo(new Float32Array(16), new Float32Array(16));
    expect(graphics.drawMesh).not.toHaveBeenCalled();

    scene.setGizmoSelectedObject('prim-1', true);
    scene.setGizmoEnabled(false);
    graphics.drawMesh.mockClear();
    scene.renderGizmo(new Float32Array(16), new Float32Array(16));
    expect(graphics.drawMesh).not.toHaveBeenCalled();
  });

  it('picks gizmo handles when ray intersects axis handle', () => {
    const { scene } = makeScene([0, 0, 10]);
    scene.addObject('prim-1', { position: [0, 0, 0], scale: [1, 1, 1] });
    scene.setGizmoSelectedObject('prim-1', true);
    scene.setGizmoMode('translate');

    // Ray pointing from [0.6, 0, 10] straight down -Z should intersect the X-axis arrow shaft
    const rayX: Ray = { origin: [0.6, 0, 10], direction: [0, 0, -1] };
    const hitX = scene.pickGizmo(rayX);
    expect(hitX).not.toBeNull();
    expect(hitX?.gizmoAxis).toBe('x');
    expect(hitX?.isGizmo).toBe(true);

    // Ray pointing from [0, 0.6, 10] straight down -Z should intersect Y-axis arrow shaft
    const rayY: Ray = { origin: [0, 0.6, 10], direction: [0, 0, -1] };
    const hitY = scene.pickGizmo(rayY);
    expect(hitY).not.toBeNull();
    expect(hitY?.gizmoAxis).toBe('y');

    // Ray pointing far away returns null
    const rayMiss: Ray = { origin: [100, 100, 10], direction: [0, 0, -1] };
    expect(scene.pickGizmo(rayMiss)).toBeNull();
  });

  it('disables gizmo ray picking when entity cannot be modified', () => {
    const { scene } = makeScene([0, 0, 10]);
    scene.addObject('prim-locked', { position: [0, 0, 0] });
    // canModify = false
    scene.setGizmoSelectedObject('prim-locked', false);
    scene.setGizmoMode('translate');

    const rayX: Ray = { origin: [0.6, 0, 10], direction: [0, 0, -1] };
    expect(scene.pickGizmo(rayX)).toBeNull();
  });

  it('gives gizmo picking precedence over background objects in scene pick()', () => {
    const { scene } = makeScene([0, 0, 10]);
    // Large background object behind gizmo
    scene.addObject('background-box', {
      position: [0, 0, -5],
      scale: [10, 10, 1],
      type: 'box',
    });
    scene.setGizmoSelectedObject('background-box', true);
    scene.setGizmoMode('translate');

    // pick(screenX, screenY, width, height) uses camera.screenToWorldRay which points at x handle
    const hit = scene.pick(400, 300, 800, 600);
    expect(hit).not.toBeNull();
    expect((hit as any)?.isGizmo).toBe(true);
    expect((hit as any)?.gizmoAxis).toBe('x');
  });
});
