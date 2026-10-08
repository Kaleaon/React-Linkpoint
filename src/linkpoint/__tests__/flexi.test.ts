import { describe, expect, it, vi } from 'vitest';
import { parseFlexibleParams, WorldViewer } from '../world';
import { deformFlexibleVertices, type FlexiParams } from '../graphics-3d';

describe('Flexible Prim Dynamics', () => {
  describe('parseFlexibleParams', () => {
    it('returns null for empty or non-flexi input', () => {
      expect(parseFlexibleParams(null)).toBeNull();
      expect(parseFlexibleParams({})).toBeNull();
      expect(parseFlexibleParams({ name: 'Cube' })).toBeNull();
    });

    it('parses flexi parameters from flexible object', () => {
      const data = {
        flexible: {
          softness: 2,
          gravity: 0.5,
          friction: 1.0,
          wind: 2.0,
          tension: 3.0,
          force: [1, 2, 3],
        },
      };
      const parsed = parseFlexibleParams(data);
      expect(parsed).toEqual({
        softness: 2,
        gravity: 0.5,
        friction: 1.0,
        wind: 2.0,
        tension: 3.0,
        force: [1, 2, 3],
      });
    });

    it('parses flexi parameters from extraParams.flexible and object force', () => {
      const data = {
        extraParams: {
          flexible: {
            Softness: 3,
            Gravity: -1.0,
            Friction: 0.5,
            Wind: 1.5,
            Tension: 2.0,
            Force: { x: 0.5, y: -0.5, z: 0.0 },
          },
        },
      };
      const parsed = parseFlexibleParams(data);
      expect(parsed).toEqual({
        softness: 3,
        gravity: -1.0,
        friction: 0.5,
        wind: 1.5,
        tension: 2.0,
        force: [0.5, -0.5, 0],
      });
    });
  });

  describe('deformFlexibleVertices', () => {
    const unitCubeVertices = new Float32Array([
      // Base vertices (z = -0.5)
      -0.5, -0.5, -0.5,
       0.5, -0.5, -0.5,
       0.5,  0.5, -0.5,
      -0.5,  0.5, -0.5,
      // Top vertices (z = 0.5)
      -0.5, -0.5,  0.5,
       0.5, -0.5,  0.5,
       0.5,  0.5,  0.5,
      -0.5,  0.5,  0.5,
    ]);

    it('keeps base vertices fixed at h = 0', () => {
      const flexi: FlexiParams = {
        softness: 2,
        gravity: 5.0,
        friction: 0.0,
        wind: 3.0,
        tension: 1.0,
        force: [2, 0, 0],
      };
      const deformed = deformFlexibleVertices(unitCubeVertices, flexi, { minZ: -0.5, maxZ: 0.5 });
      // Base x, y, z should match original
      expect(deformed[0]).toBeCloseTo(-0.5);
      expect(deformed[1]).toBeCloseTo(-0.5);
      expect(deformed[2]).toBeCloseTo(-0.5);

      expect(deformed[3]).toBeCloseTo(0.5);
      expect(deformed[4]).toBeCloseTo(-0.5);
      expect(deformed[5]).toBeCloseTo(-0.5);
    });

    it('deforms top vertices (h = 1) under force, gravity, and wind', () => {
      const flexi: FlexiParams = {
        softness: 1,
        gravity: 1.0,
        friction: 0.0,
        wind: 0.0,
        tension: 1.0,
        force: [2, 0, 0],
      };
      const deformed = deformFlexibleVertices(unitCubeVertices, flexi, { minZ: -0.5, maxZ: 0.5 });
      // Top vertex 4 (-0.5, -0.5, 0.5) x should be shifted by force
      expect(deformed[12]).toBeGreaterThan(-0.5);
    });

    it('increases deformation with higher softness and decreases with higher tension', () => {
      const lowSoftness: FlexiParams = { softness: 0, gravity: 0, friction: 0, wind: 0, tension: 1, force: [1, 0, 0] };
      const highSoftness: FlexiParams = { softness: 3, gravity: 0, friction: 0, wind: 0, tension: 1, force: [1, 0, 0] };
      const highTension: FlexiParams = { softness: 3, gravity: 0, friction: 0, wind: 0, tension: 10, force: [1, 0, 0] };

      const defLow = deformFlexibleVertices(unitCubeVertices, lowSoftness, { minZ: -0.5, maxZ: 0.5 });
      const defHigh = deformFlexibleVertices(unitCubeVertices, highSoftness, { minZ: -0.5, maxZ: 0.5 });
      const defStiff = deformFlexibleVertices(unitCubeVertices, highTension, { minZ: -0.5, maxZ: 0.5 });

      const dispLow = defLow[12] - unitCubeVertices[12];
      const dispHigh = defHigh[12] - unitCubeVertices[12];
      const dispStiff = defStiff[12] - unitCubeVertices[12];

      expect(dispHigh).toBeGreaterThan(dispLow);
      expect(dispStiff).toBeLessThan(dispHigh);
    });

    it('dampens displacement with higher friction', () => {
      const lowFriction: FlexiParams = { softness: 2, gravity: 2, friction: 0, wind: 0, tension: 1, force: [1, 0, 0] };
      const highFriction: FlexiParams = { softness: 2, gravity: 2, friction: 5, wind: 0, tension: 1, force: [1, 0, 0] };

      const defLow = deformFlexibleVertices(unitCubeVertices, lowFriction, { minZ: -0.5, maxZ: 0.5 });
      const defHigh = deformFlexibleVertices(unitCubeVertices, highFriction, { minZ: -0.5, maxZ: 0.5 });

      const dispLow = defLow[12] - unitCubeVertices[12];
      const dispHigh = defHigh[12] - unitCubeVertices[12];

      expect(dispHigh).toBeLessThan(dispLow);
    });
  });

  describe('WorldViewer flexi object handling', () => {
    it('stores flexi data on scene objects and passes config to scene3d', () => {
      const listeners = new Map<string, Function[]>();
      const mockProtocol = {
        connected: true,
        on: (event: string, fn: Function) => {
          if (!listeners.has(event)) listeners.set(event, []);
          listeners.get(event)!.push(fn);
        },
        emit: (event: string, data: any) => {
          for (const fn of listeners.get(event) || []) fn(data);
        },
      };

      const world = new WorldViewer(mockProtocol);
      const sceneAddObject = vi.fn();
      world.scene3d = { addObject: sceneAddObject, updateObject: vi.fn(), objects: new Map() } as any;

      const flexiObject = {
        id: 'flexi-prim-1',
        name: 'Flexible Flag',
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [0.1, 1, 3],
        flexible: {
          softness: 2,
          gravity: 0.3,
          friction: 0.5,
          wind: 1.0,
          tension: 2.0,
          force: [0, 0, 0],
        },
      };

      mockProtocol.emit('ObjectUpdate', flexiObject);

      const stored = world.objects.find((o) => o.id === 'flexi-prim-1');
      expect(stored).toBeDefined();
      expect(stored?.flexi).toEqual({
        softness: 2,
        gravity: 0.3,
        friction: 0.5,
        wind: 1.0,
        tension: 2.0,
        force: [0, 0, 0],
      });

      expect(sceneAddObject).toHaveBeenCalledWith(
        'flexi-prim-1',
        expect.objectContaining({
          flexi: {
            softness: 2,
            gravity: 0.3,
            friction: 0.5,
            wind: 1.0,
            tension: 2.0,
            force: [0, 0, 0],
          },
        })
      );
    });
  });
});
