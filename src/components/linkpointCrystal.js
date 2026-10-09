// Modernized procedural crystal geometry definition for CSS transform animation engine.
// Replaces 20.6 KB SMIL frame dataset with static SVG polygonal geometry.

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
  },
  bot: {
    base: '392,342 256,392 120,342 256,292',
    faces: [
      { grad: 'face4Grad', points: '256,472 392,342 256,392', opacity: 0.9 },
      { grad: 'face3Grad', points: '256,472 256,392 120,342', opacity: 0.9 },
      { grad: 'face1Grad', points: '256,472 120,342 256,292', opacity: 0.9 },
      { grad: 'face2Grad', points: '256,472 256,292 392,342', opacity: 0.9 },
    ],
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
};
