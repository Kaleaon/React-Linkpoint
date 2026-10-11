// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Graphics3D, webgl2ShaderSource } from '../graphics-3d';

// A context whose every member is a harmless no-op, enough to get through init().
const fakeGl = () => new Proxy({}, { get: () => () => 0 });

describe('Graphics3D.init when destroyed mid-initialization', () => {
  it('fails with a clear error instead of dereferencing the released context', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockImplementation(() => fakeGl() as any);
    const graphics = new Graphics3D(canvas);
    // Tear the graphics down while shader creation is pending, as an unmounting view does.
    vi.spyOn(graphics as any, 'createDefaultShaders').mockImplementation(async () => {
      graphics.destroy();
    });

    await expect(graphics.init()).rejects.toThrow('destroyed while initializing');
    vi.restoreAllMocks();
  });
});

describe('WebGL shader compatibility', () => {
  it('translates both stages to GLSL 300 with core derivatives and an explicit fragment output', () => {
    const vertex = webgl2ShaderSource(
      'attribute vec3 aPosition; varying vec2 vUV; void main() { gl_Position = vec4(aPosition, 1.0); }',
      false,
    );
    const fragment = webgl2ShaderSource(
      '#extension GL_OES_standard_derivatives : enable\nprecision highp float; varying vec2 vUV; uniform sampler2D uTexture; void main() { gl_FragColor = texture2D(uTexture, dFdx(vUV)); }',
      true,
    );
    expect(vertex).toContain('#version 300 es\nin vec3 aPosition; out vec2 vUV;');
    expect(fragment).toContain('out highp vec4 fragmentColor;');
    expect(fragment).toContain('in vec2 vUV;');
    expect(fragment).toContain('fragmentColor = texture(uTexture, dFdx(vUV));');
    expect(fragment).not.toContain('GL_OES_standard_derivatives');
    expect(webgl2ShaderSource(fragment, true)).toBe(fragment);
  });

  it('reports shader failure instead of initializing an empty renderer', async () => {
    const graphics = new Graphics3D(document.createElement('canvas'));
    graphics.gl = fakeGl() as any;
    vi.spyOn(graphics, 'createShaderProgram').mockReturnValue(null);
    await expect(graphics.createDefaultShaders()).rejects.toThrow(
      'Renderer shaders failed to compile',
    );
    vi.restoreAllMocks();
  });
});
