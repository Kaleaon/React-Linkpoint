// Unified single-canvas 512x512 master crystal geometry definition.
// Replaces dual coordinate systems with a single master 512x512 coordinate space.

export const CRYSTAL = {
  dur: '6s',
  motes: [
    { near: 4, far: 3, token: 'pri', begin: '0s' },
    { near: 5, far: 3.5, token: 'sec2', begin: '-2s' },
    { near: 3, far: 2.25, token: 'sec', begin: '-4s' },
  ],
  top: {
    base: '392,170 256,220 120,170 256,120',
    faces: [
      { grad: 'face1Grad', points: '256,40 392,170 256,220', opacity: 1.0 },
      { grad: 'face2Grad', points: '256,40 256,220 120,170', opacity: 1.0 },
      { grad: 'face3Grad', points: '256,40 120,170 256,120', opacity: 0.9 },
      { grad: 'face4Grad', points: '256,40 256,120 392,170', opacity: 0.9 },
    ],
    ridge: '120,170 256,120 392,170',
    faceA: '256,40 120,170 256,220',
    faceB: '256,40 256,220 392,170',
  },
  bot: {
    base: '392,342 256,392 120,342 256,292',
    faces: [
      { grad: 'face4Grad', points: '256,472 392,342 256,392', opacity: 0.9 },
      { grad: 'face3Grad', points: '256,472 256,392 120,342', opacity: 0.9 },
      { grad: 'face1Grad', points: '256,472 120,342 256,292', opacity: 0.9 },
      { grad: 'face2Grad', points: '256,472 256,292 392,342', opacity: 0.9 },
    ],
    ridge: '120,342 256,292 392,342',
    faceA: '256,472 120,342 256,392',
    faceB: '256,472 256,392 392,342',
  },
  topStatic: {
    base: '392,170 256,220 120,170 256,120',
    faces: [
      { grad: 'face1Grad', points: '256,40 392,170 256,220', opacity: 1.0 },
      { grad: 'face2Grad', points: '256,40 256,220 120,170', opacity: 1.0 },
    ],
  },
  botStatic: {
    base: '392,342 256,392 120,342 256,292',
    faces: [
      { grad: 'face4Grad', points: '256,472 392,342 256,392', opacity: 0.9 },
      { grad: 'face3Grad', points: '256,472 256,392 120,342', opacity: 0.9 },
    ],
  },
  staticMotes: {
    far: [{ cx: 150, cy: 201, r: 3.5, token: 'sec2' }],
    near: [
      { cx: 56, cy: 256, r: 4, token: 'pri' },
      { cx: 430, cy: 280, r: 3, token: 'sec' },
    ],
  },
  wireframe: {
    farLines: ['82,256 256,180 430,256', '22,256 256,120 490,256'],
    nearLines: ['430,256 256,332 82,256', '490,256 256,392 22,256'],
    axes: {
      vertical: { x1: 256, y1: 20, x2: 256, y2: 492, dash: '4 6' },
      horizontal: { x1: 22, y1: 256, x2: 490, y2: 256, dash: '4 6' },
    },
  },
  orbit: {
    farPath: 'M 56 256 A 200 65 0 0 1 456 256',
    farOuterPath: 'M 41 256 A 215 72 0 0 1 471 256',
    nearPath: 'M 56 256 A 200 65 0 0 0 456 256',
    nearOuterPath: 'M 41 256 A 215 72 0 0 0 471 256',
    ring: { cx: 256, cy: 256, r: 204.8 },
  },
  coreNode: {
    cx: 256,
    cy: 256,
    r: 45,
    loaderR: 64,
    diamond: '256,242 270,256 256,270 242,256',
  },
};
