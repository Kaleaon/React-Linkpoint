import { Camera3D } from './camera-3d';

export type PickableObject = {
  id: string;
  position: number[];
  rotation?: number[];
  scale?: number[];
  visible?: boolean;
};

export type PickResult = {
  id: string;
  distance: number;
  point: number[];
};

const normalize = (vector: number[]) => {
  const length = Math.hypot(...vector) || 1;
  return vector.map(value => value / length);
};

const rotateInverse = (vector: number[], rotation: number[]) => {
  let [x, y, z] = vector;
  const [rx, ry, rz] = rotation;
  let sine = Math.sin(-rz), cosine = Math.cos(-rz);
  [x, y] = [x * cosine - y * sine, x * sine + y * cosine];
  sine = Math.sin(-ry); cosine = Math.cos(-ry);
  [x, z] = [x * cosine + z * sine, -x * sine + z * cosine];
  sine = Math.sin(-rx); cosine = Math.cos(-rx);
  [y, z] = [y * cosine - z * sine, y * sine + z * cosine];
  return [x, y, z];
};

/** Create a world-space ray from a canvas point without reading the GL buffer. */
export function screenRay(camera: Camera3D, x: number, y: number, width: number, height: number) {
  const [pitch, yaw] = camera.rotation;
  const forward = normalize([
    Math.sin(yaw) * Math.cos(pitch),
    Math.cos(yaw) * Math.cos(pitch),
    Math.sin(pitch),
  ]);
  const right = normalize([Math.cos(yaw), -Math.sin(yaw), 0]);
  const up = normalize([
    right[1] * forward[2],
    -right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ]);
  const halfHeight = Math.tan(camera.fov * Math.PI / 360);
  const nx = (2 * x / Math.max(1, width) - 1) * halfHeight * camera.aspect;
  const ny = (1 - 2 * y / Math.max(1, height)) * halfHeight;
  return {
    origin: [...camera.position],
    direction: normalize(forward.map((value, index) => value + right[index] * nx + up[index] * ny)),
  };
}

/**
 * Lumiya first rejects picks against a transformed collision cube before its
 * more expensive per-triangle test. Linkpoint uses that recovered broad phase
 * for responsive selection while streamed mesh CPU data is not retained.
 */
export function pickObjects(origin: number[], direction: number[], objects: Iterable<PickableObject>): PickResult | null {
  let closest: PickResult | null = null;
  for (const object of objects) {
    if (object.visible === false) continue;
    const scale = (object.scale || [1, 1, 1]).map(value => Math.max(Math.abs(Number(value) || 0), 1e-6));
    const offset = origin.map((value, index) => value - Number(object.position[index] || 0));
    const localOrigin = rotateInverse(offset, object.rotation || [0, 0, 0]).map((value, index) => value / scale[index]);
    const localDirection = rotateInverse(direction, object.rotation || [0, 0, 0]).map((value, index) => value / scale[index]);
    let near = -Infinity;
    let far = Infinity;
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(localDirection[axis]) < 1e-8) {
        if (localOrigin[axis] < -.5 || localOrigin[axis] > .5) { far = -Infinity; break; }
        continue;
      }
      const a = (-.5 - localOrigin[axis]) / localDirection[axis];
      const b = (.5 - localOrigin[axis]) / localDirection[axis];
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
    }
    if (far < Math.max(near, 0)) continue;
    const distance = near >= 0 ? near : far;
    if (closest && closest.distance <= distance) continue;
    closest = {
      id: object.id,
      distance,
      point: origin.map((value, index) => value + direction[index] * distance),
    };
  }
  return closest;
}
