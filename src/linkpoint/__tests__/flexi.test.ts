import { describe, expect, it, vi } from 'vitest';
import { parseFlexibleParams, WorldViewer } from '../world';
import { Scene3D } from '../scene-3d';
import { Camera3D } from '../camera-3d';

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

    it('reads the field names node-metaverse produces: Drag is the air friction', () => {
      expect(
        parseFlexibleParams({
          flexible: {
            Softness: 2,
            Tension: 1.5,
            Drag: 0.7,
            Gravity: -9,
            Wind: 1.2,
            Force: { x: 1, y: 2, z: 3 },
          },
        }),
      ).toEqual({
        softness: 2,
        tension: 1.5,
        friction: 0.7,
        gravity: -9,
        wind: 1.2,
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
      world.scene3d = {
        addObject: sceneAddObject,
        updateObject: vi.fn(),
        objects: new Map(),
      } as any;

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
        }),
      );
    });
  });

  describe('scene and per-frame step', () => {
    const makeWorld = () => {
      const listeners = new Map<string, Function[]>();
      const protocol = {
        connected: true,
        on: (event: string, fn: Function) => {
          listeners.set(event, [...(listeners.get(event) || []), fn]);
        },
        emit: (event: string, data: any) => {
          for (const fn of listeners.get(event) || []) fn(data);
        },
      };
      const world = new WorldViewer(protocol);
      const updateObject = vi.fn();
      const objects = new Map<string, any>();
      world.scene3d = {
        addObject: (id: string, c: any) => objects.set(id, c),
        updateObject,
        removeObject: (id: string) => objects.delete(id),
        objects,
      } as any;
      return { world, protocol, updateObject, objects };
    };
    const flexible = {
      softness: 2,
      gravity: 4,
      friction: 0.5,
      wind: 0,
      tension: 1,
      force: [0, 0, 0],
    };

    it('keeps flexi parameters when an object is first added to the scene', () => {
      const scene = new Scene3D({ createMesh: vi.fn() } as any, new Camera3D());
      const object = scene.addObject('a', { mesh: 'cube', flexi: flexible });
      expect(object.flexi).toEqual(flexible);
      expect(object.flexiSections).toBeNull();
    });

    it('gives the scene nine section transforms per frame, in the prim frame, once the chain has run', () => {
      const { world, protocol, updateObject, objects } = makeWorld();
      protocol.emit('ObjectUpdate', {
        id: 'flag',
        position: [10, 10, 20],
        rotation: [0, 0, 0, 1],
        scale: [0.2, 1, 4],
        flexible,
      });
      expect(objects.get('flag')).toBeDefined();
      objects.set('flag', { ...objects.get('flag') });
      (world as any).updateFlexibles(1);
      (world as any).updateFlexibles(1.016);
      const call = updateObject.mock.calls
        .filter((c) => c[0] === 'flag' && c[1].flexiSections)
        .at(-1)!;
      const { positions, rotations } = call[1].flexiSections;
      expect(positions).toHaveLength(27);
      expect(rotations).toHaveLength(36);
      // base at the bottom of the prim, tip near the top; gravity pulls along the chain so it stays straight
      expect(Array.from(positions.slice(0, 3))).toEqual(
        [0, 0, -2].map((v) => expect.closeTo(v, 4)),
      );
      expect(positions[26]).toBeCloseTo(2, 3);
    });

    // A wind layer whose X grid is a constant (DC-only patch) and whose Y grid is zero, built the way the simulator packs it.
    const windLayer = (dcX: number) => {
      const bits: number[] = [];
      const write = (value: number, count: number) => {
        for (let remaining = count, v = value; remaining > 0;) {
          const chunk = Math.min(8, remaining);
          remaining -= chunk;
          const byte = v % 256;
          v = Math.floor(v / 256);
          for (let i = chunk - 1; i >= 0; i--) bits.push((byte >> i) & 1);
        }
      };
      const float = new DataView(new ArrayBuffer(4));
      const patch = (dc: number, coefficient: number) => {
        write(0x38, 8);
        float.setFloat32(0, dc, true);
        write(float.getUint32(0, true), 32);
        write(32, 16);
        write(0, 10);
        if (coefficient) {
          write(0b11, 2);
          write(0, 1);
          write(coefficient, 10);
        } else write(0, 1);
        write(0b10, 2);
      };
      write(16, 16);
      write(16, 8);
      write(0x37, 8);
      patch(dcX, 0);
      patch(0, 0);
      const bytes = new Uint8Array(Math.ceil(bits.length / 8));
      bits.forEach((b, i) => {
        if (b) bytes[i >> 3] |= 0x80 >> (i & 7);
      });
      return { action: 'layer', data: btoa(String.fromCharCode(...bytes)) };
    };

    it('has no wind until the simulator sends its wind layer, then blows flexible prims with it', () => {
      const { world, protocol, updateObject } = makeWorld();
      const tipX = () =>
        updateObject.mock.calls.filter((c) => c[0] === 'flag' && c[1].flexiSections).at(-1)![1]
          .flexiSections.positions[24];
      const windy = { ...flexible, gravity: 0, wind: 10, softness: 0 };
      protocol.emit('ObjectUpdate', {
        id: 'flag',
        position: [0, 0, 20],
        rotation: [0, 0, 0, 1],
        scale: [0.2, 1, 3],
        flexible: windy,
      });
      for (let t = 1; t < 1.5; t += 1 / 30) (world as any).updateFlexibles(t);
      expect(world.wind).toBeNull();
      const calm = tipX();

      // DC-only patch: every cell is mult*(0/16) + mult*2^(prequant-1) + dc = 1*16 + 4 = 20 m/s physical wind vector.
      protocol.emit('scene:wind-layer', windLayer(4));
      expect(world.wind?.loaded).toBe(true);
      expect(world.wind!.velocity([10, 10, 20])[0]).toBeCloseTo(20, 3);
      (world as any).flexChains.clear();
      for (let t = 2; t < 3; t += 1 / 30) (world as any).updateFlexibles(t);
      expect(tipX()).toBeGreaterThan(calm + 0.05);
    });

    it('drops the wind on a region change or disconnect, and ignores damaged data', () => {
      const { world, protocol } = makeWorld();
      protocol.emit('scene:wind-layer', windLayer(0));
      expect(world.wind?.loaded).toBe(true);
      protocol.emit('scene:wind-layer', { action: 'reset' });
      expect(world.wind).toBeNull();
      protocol.emit('scene:wind-layer', { action: 'layer', data: btoa('xx') });
      expect(world.wind).toBeNull();
      protocol.emit('scene:wind-layer', windLayer(0));
      protocol.emit('disconnected', {});
      expect(world.wind).toBeNull();
    });

    it('does nothing for objects that are not flexible, and forgets a removed object', () => {
      const { world, protocol, updateObject } = makeWorld();
      protocol.emit('ObjectUpdate', {
        id: 'plain',
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      });
      (world as any).updateFlexibles(1);
      expect(updateObject.mock.calls.some((c) => c[1]?.flexiSections)).toBe(false);
      protocol.emit('ObjectUpdate', {
        id: 'flag',
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 3],
        flexible,
      });
      (world as any).updateFlexibles(2);
      expect((world as any).flexChains.has('flag')).toBe(true);
      (world as any).removeSceneObject({ id: 'flag' });
      expect((world as any).flexChains.has('flag')).toBe(false);
    });
  });
});
