/**
 * Linkpoint PWA - 3D Graphics Engine (WebGL)
 */

import { Utils } from './utils';

export class Graphics3D extends Utils.EventEmitter {
  public canvas: HTMLCanvasElement;
  public gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private programs: Map<string, any> = new Map();
  private meshes: Map<string, any> = new Map();
  private textures: Map<string, any> = new Map();
  private renderTargets: Map<string, { framebuffer: WebGLFramebuffer; depth: WebGLRenderbuffer; width: number; height: number }> = new Map();
  
  // Rendering state
  public drawCalls: number = 0;
  public triangles: number = 0;
  
  // Capabilities
  public extensions: any = {};
  public maxTextureSize: number = 0;
  public maxVertexAttributes: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    super();
    this.canvas = canvas;
  }

  /**
   * Initialize WebGL context
   */
  async init() {
    // Try WebGL2 first, fallback to WebGL1
    this.gl = this.canvas.getContext('webgl2', {
      alpha: false,
      depth: true,
      stencil: false,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    }) as WebGL2RenderingContext;

    if (!this.gl) {
      this.gl = this.canvas.getContext('webgl', {
        alpha: false,
        depth: true,
        antialias: true,
        premultipliedAlpha: false
      }) as WebGLRenderingContext;
    }

    if (!this.gl) {
      throw new Error('WebGL not supported');
    }

    const gl = this.gl;
    console.log('WebGL version:', typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? '2.0' : '1.0');

    // Get capabilities
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.maxVertexAttributes = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);

    // Get extensions
    this.extensions.anisotropic = gl.getExtension('EXT_texture_filter_anisotropic');
    this.extensions.depthTexture = gl.getExtension('WEBGL_depth_texture');
    this.extensions.floatTexture = gl.getExtension('OES_texture_float');
    this.extensions.vao = gl.getExtension('OES_vertex_array_object');

    // Initial GL state
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.depthFunc(gl.LEQUAL);
    // Lighter sky color for better visibility
    gl.clearColor(0.53, 0.81, 0.92, 1.0); // Light blue sky color

    // Create default shaders
    await this.createDefaultShaders();

    this.emit('initialized');
    return true;
  }

  /**
   * Create default shader programs
   */
  async createDefaultShaders() {
    // Basic shader
    this.createShaderProgram('basic', {
      vertex: `
        attribute vec3 aPosition;
        attribute vec3 aNormal;
        attribute vec2 aTexCoord;
        
        uniform mat4 uModelMatrix;
        uniform mat4 uViewMatrix;
        uniform mat4 uProjectionMatrix;
        uniform mat3 uNormalMatrix;
        
        varying vec3 vNormal;
        varying vec2 vTexCoord;
        varying vec3 vPosition;
        
        void main() {
          vec4 worldPos = uModelMatrix * vec4(aPosition, 1.0);
          vPosition = worldPos.xyz;
          vNormal = normalize(uNormalMatrix * aNormal);
          vTexCoord = aTexCoord;
          gl_Position = uProjectionMatrix * uViewMatrix * worldPos;
        }
      `,
      fragment: `
        precision mediump float;
        
        varying vec3 vNormal;
        varying vec2 vTexCoord;
        varying vec3 vPosition;
        
        uniform vec3 uLightPos;
        uniform vec3 uLightColor;
        uniform vec3 uAmbientColor;
        uniform vec4 uColor;
        uniform sampler2D uTexture;
        uniform bool uUseTexture;
        uniform vec4 uTexTransform;
        uniform float uTexRotation;
        uniform bool uFullBright;
        uniform vec3 uCameraPos;
        uniform float uMetallic;
        uniform float uRoughness;
        uniform vec3 uEmissive;
        uniform sampler2D uMetallicRoughnessTexture;
        uniform sampler2D uNormalTexture;
        uniform sampler2D uEmissiveTexture;
        uniform bool uUseMetallicRoughnessTexture;
        uniform bool uUseNormalTexture;
        uniform bool uUseEmissiveTexture;
        uniform float uAlphaCutoff;
        uniform int uAlphaMode;
        
        void main() {
          vec3 normal = normalize(vNormal);
          if (uUseNormalTexture) normal = normalize(normal + (texture2D(uNormalTexture, vTexCoord).xyz * 2.0 - 1.0));
          vec3 lightDir = normalize(uLightPos - vPosition);
          
          // Ambient
          vec3 ambient = uAmbientColor;
          
          // Diffuse
          float diff = max(dot(normal, lightDir), 0.0);
          vec3 diffuse = diff * uLightColor;
          
          // Final color
          vec2 centered = vTexCoord - vec2(0.5);
          float texSin = sin(uTexRotation);
          float texCos = cos(uTexRotation);
          vec2 rotated = mat2(texCos, -texSin, texSin, texCos) * centered + vec2(0.5);
          vec2 transformedUV = rotated * uTexTransform.xy + uTexTransform.zw;
          vec4 baseColor = uUseTexture ? texture2D(uTexture, transformedUV) * uColor : uColor;
          if (uAlphaMode == 1 && baseColor.a < uAlphaCutoff) discard;
          vec3 orm = uUseMetallicRoughnessTexture ? texture2D(uMetallicRoughnessTexture, transformedUV).rgb : vec3(1.0);
          float metallic = clamp(uMetallic * orm.b, 0.0, 1.0);
          float roughness = clamp(uRoughness * orm.g, 0.04, 1.0);
          vec3 viewDir = normalize(uCameraPos - vPosition);
          vec3 halfDir = normalize(lightDir + viewDir);
          float specPower = mix(128.0, 2.0, roughness);
          float specular = pow(max(dot(normal, halfDir), 0.0), specPower);
          vec3 f0 = mix(vec3(0.04), baseColor.rgb, metallic);
          vec3 diffusePbr = baseColor.rgb * (1.0 - metallic) * (ambient + diffuse);
          vec3 emission = uEmissive * (uUseEmissiveTexture ? texture2D(uEmissiveTexture, transformedUV).rgb : vec3(1.0));
          vec3 result = uFullBright ? baseColor.rgb : diffusePbr + f0 * specular + emission;
          
          gl_FragColor = vec4(result, baseColor.a);
        }
      `
    });
  }

  /**
   * Create shader program
   */
  createShaderProgram(name: string, source: { vertex: string, fragment: string }) {
    const gl = this.gl!;

    const vertexShader = this.compileShader(gl.VERTEX_SHADER, source.vertex);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, source.fragment);

    if (!vertexShader || !fragmentShader) return null;

    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Shader program link error:', gl.getProgramInfoLog(program));
      return null;
    }

    // Get attribute and uniform locations
    const numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    const attributes: Record<string, number> = {};
    for (let i = 0; i < numAttributes; i++) {
      const info = gl.getActiveAttrib(program, i)!;
      attributes[info.name] = gl.getAttribLocation(program, info.name);
    }

    const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (let i = 0; i < numUniforms; i++) {
      const info = gl.getActiveUniform(program, i)!;
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }

    this.programs.set(name, { program, attributes, uniforms });
    return program;
  }

  /**
   * Compile shader
   */
  private compileShader(type: number, source: string) {
    const gl = this.gl!;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * Create mesh
   */
  createMesh(name: string, vertices: number[], indices: number[], normals?: number[], texCoords?: number[], tangents?: number[]) {
    const gl = this.gl!;

    const mesh: any = {
      vao: null,
      buffers: {},
      indexCount: indices.length,
      vertexCount: vertices.length / 3
    };

    // Create VAO if supported
    if (this.extensions.vao) {
      mesh.vao = this.extensions.vao.createVertexArrayOES();
      this.extensions.vao.bindVertexArrayOES(mesh.vao);
    }

    // Vertex buffer
    mesh.buffers.position = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers.position);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    // Normal buffer
    if (normals) {
      mesh.buffers.normal = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers.normal);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
    }

    // TexCoord buffer
    if (texCoords) {
      mesh.buffers.texCoord = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers.texCoord);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);
    }

    // Tangent buffer
    if (tangents) {
      mesh.buffers.tangent = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers.tangent);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tangents), gl.STATIC_DRAW);
    }

    // Index buffer
    mesh.buffers.index = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.buffers.index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    if (this.extensions.vao) {
      // OES VAOs capture attribute and element-buffer bindings. Previously the
      // VAO was created but never populated, so WebGL 1 implementations with
      // OES_vertex_array_object drew empty meshes.
      const basicProgram = this.programs.get('basic');
      if (basicProgram) this.bindMeshAttributes(mesh, basicProgram.attributes);
      this.extensions.vao.bindVertexArrayOES(null);
    }

    this.meshes.set(name, mesh);
    return mesh;
  }

  /**
   * Draw mesh
   */
  drawMesh(meshName: string, programName: string, uniforms: any) {
    const gl = this.gl!;
    const mesh = this.meshes.get(meshName);
    const programInfo = this.programs.get(programName);

    if (!mesh || !programInfo) return;

    gl.useProgram(programInfo.program);

    // Bind VAO or manually bind attributes
    if (mesh.vao && this.extensions.vao) {
      this.extensions.vao.bindVertexArrayOES(mesh.vao);
    } else {
      this.bindMeshAttributes(mesh, programInfo.attributes);
    }

    // Set uniforms
    const bindings = [
      ['uTextureName', 'uTexture'], ['uMetallicRoughnessTextureName', 'uMetallicRoughnessTexture'],
      ['uNormalTextureName', 'uNormalTexture'], ['uEmissiveTextureName', 'uEmissiveTexture'],
    ];
    bindings.forEach(([valueName, uniformName], unit) => {
      const texture = uniforms[valueName] && this.textures.get(uniforms[valueName]);
      if (!texture) return;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      const sampler = programInfo.uniforms[uniformName];
      if (sampler) gl.uniform1i(sampler, unit);
    });
    this.setUniforms(programInfo.uniforms, uniforms);

    if (uniforms.uAlphaMode === 2) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    }
    if (uniforms.uDoubleSided) gl.disable(gl.CULL_FACE);

    // Draw
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
    if (uniforms.uAlphaMode === 2) { gl.depthMask(true); gl.disable(gl.BLEND); }
    if (uniforms.uDoubleSided) gl.enable(gl.CULL_FACE);

    this.drawCalls++;
    this.triangles += mesh.indexCount / 3;
  }

  createTexture(name: string, width: number, height: number, rgba: Uint8Array) {
    const gl = this.gl!;
    const existing = this.textures.get(name);
    if (existing) gl.deleteTexture(existing);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    const powerOfTwo = (value: number) => value > 0 && (value & (value - 1)) === 0;
    const canMipmap = powerOfTwo(width) && powerOfTwo(height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, canMipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, canMipmap ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, canMipmap ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    if (canMipmap) gl.generateMipmap(gl.TEXTURE_2D);
    this.textures.set(name, texture);
    return name;
  }

  createRenderTarget(name: string, width = 256, height = 256) {
    if (this.renderTargets.has(name)) return name;
    const gl = this.gl!;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const depth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    const framebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Unable to create reflection render target');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.textures.set(name, texture);
    this.renderTargets.set(name, { framebuffer, depth, width, height });
    return name;
  }

  beginRenderTarget(name: string) {
    const target = this.renderTargets.get(name);
    if (!target) return false;
    const gl = this.gl!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    return true;
  }

  endRenderTarget() {
    const gl = this.gl!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Bind mesh attributes
   */
  private bindMeshAttributes(mesh: any, attributes: any) {
    const gl = this.gl!;

    if (attributes.aPosition !== undefined && mesh.buffers.position) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers.position);
      gl.enableVertexAttribArray(attributes.aPosition);
      gl.vertexAttribPointer(attributes.aPosition, 3, gl.FLOAT, false, 0, 0);
    }

    if (attributes.aNormal !== undefined && mesh.buffers.normal) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers.normal);
      gl.enableVertexAttribArray(attributes.aNormal);
      gl.vertexAttribPointer(attributes.aNormal, 3, gl.FLOAT, false, 0, 0);
    }

    if (attributes.aTexCoord !== undefined && mesh.buffers.texCoord) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers.texCoord);
      gl.enableVertexAttribArray(attributes.aTexCoord);
      gl.vertexAttribPointer(attributes.aTexCoord, 2, gl.FLOAT, false, 0, 0);
    }

    if (attributes.aTangent !== undefined && mesh.buffers.tangent) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers.tangent);
      gl.enableVertexAttribArray(attributes.aTangent);
      gl.vertexAttribPointer(attributes.aTangent, 3, gl.FLOAT, false, 0, 0);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.buffers.index);
  }

  /**
   * Set uniforms
   */
  private setUniforms(uniformLocations: any, values: any) {
    const gl = this.gl!;

    for (const [name, location] of Object.entries(uniformLocations)) {
      if (location === null || values[name] === undefined) continue;

      const value = values[name];

      if (value instanceof Float32Array || Array.isArray(value)) {
        if (value.length === 16) {
          gl.uniformMatrix4fv(location as WebGLUniformLocation, false, value);
        } else if (value.length === 9) {
          gl.uniformMatrix3fv(location as WebGLUniformLocation, false, value);
        } else if (value.length === 4) {
          gl.uniform4fv(location as WebGLUniformLocation, value);
        } else if (value.length === 3) {
          gl.uniform3fv(location as WebGLUniformLocation, value);
        } else if (value.length === 2) {
          gl.uniform2fv(location as WebGLUniformLocation, value);
        }
      } else if (typeof value === 'number') {
        if (name === 'uAlphaMode') gl.uniform1i(location as WebGLUniformLocation, value);
        else gl.uniform1f(location as WebGLUniformLocation, value);
      } else if (typeof value === 'boolean') {
        gl.uniform1i(location as WebGLUniformLocation, value ? 1 : 0);
      }
    }
  }

  /**
   * Clear buffers
   */
  clear(color: number[] = [0.05, 0.05, 0.1, 1.0]) {
    const gl = this.gl!;
    gl.clearColor(color[0], color[1], color[2], color[3]);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    this.drawCalls = 0;
    this.triangles = 0;
  }

  /**
   * Resize viewport
   */
  resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    if (this.gl) {
      this.gl.viewport(0, 0, width, height);
    }
  }

  /**
   * Get rendering stats
   */
  getStats() {
    return {
      drawCalls: this.drawCalls,
      triangles: this.triangles,
      meshes: this.meshes.size,
      textures: this.textures.size,
      programs: this.programs.size
    };
  }

  /**
   * Cleanup
   */
  destroy() {
    const gl = this.gl;
    if (!gl) return;

    // Delete all meshes
    this.meshes.forEach(mesh => {
      Object.values(mesh.buffers).forEach((buffer: any) => {
        gl.deleteBuffer(buffer);
      });
      if (mesh.vao && this.extensions.vao) {
        this.extensions.vao.deleteVertexArrayOES(mesh.vao);
      }
    });

    // Delete all programs
    this.programs.forEach(({ program }) => {
      gl.deleteProgram(program);
    });

    this.meshes.clear();
    this.programs.clear();
    this.textures.forEach(texture => gl.deleteTexture(texture));
    this.textures.clear();
    this.renderTargets.forEach(target => {
      gl.deleteFramebuffer(target.framebuffer);
      gl.deleteRenderbuffer(target.depth);
    });
    this.renderTargets.clear();
    this.gl = null;
  }
}
