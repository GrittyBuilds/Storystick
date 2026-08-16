// A small WebGL viewer for the extruded model. Hand-written rather than
// vendored so the app keeps its no-build-step, no-dependency property.
//
// Shaders are GLSL ES 1.00 so the same source runs on a WebGL2 context and on a
// WebGL1 fallback. Geometry arrives already in world space, so there is no model
// matrix — only view and projection.

import * as m4 from './mat4.js';
import { MATERIALS } from './build.js';
import { palette, TOKEN } from '../render/theme.js';

const SOLID_VS = `
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uProjection;
uniform mat4 uView;
varying vec3 vNormal;
varying float vDepth;
void main() {
  vNormal = aNormal;
  vec4 viewPos = uView * vec4(aPosition, 1.0);
  vDepth = -viewPos.z;
  gl_Position = uProjection * viewPos;
}`;

const SOLID_FS = `
precision mediump float;
uniform vec3 uColor;
uniform vec3 uLightDir;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uOpacity;
varying vec3 vNormal;
varying float vDepth;
void main() {
  vec3 n = normalize(vNormal);
  // Hemisphere ambient plus one directional key light reads well for massing.
  float hemi = 0.5 + 0.5 * n.y;
  vec3 ambient = mix(uGround, uSky, hemi);
  float key = max(dot(n, uLightDir), 0.0);
  float fill = max(dot(n, normalize(vec3(-uLightDir.x, 0.35, -uLightDir.z))), 0.0) * 0.22;
  vec3 lit = uColor * (ambient + key * 0.85 + fill);
  float fog = clamp((vDepth - uFogNear) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
  gl_FragColor = vec4(mix(lit, uFogColor, fog * 0.85), uOpacity);
}`;

const LINE_VS = `
attribute vec3 aPosition;
uniform mat4 uProjection;
uniform mat4 uView;
varying float vDepth;
void main() {
  vec4 viewPos = uView * vec4(aPosition, 1.0);
  vDepth = -viewPos.z;
  gl_Position = uProjection * viewPos;
}`;

const LINE_FS = `
precision mediump float;
uniform vec3 uColor;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uOpacity;
varying float vDepth;
void main() {
  float fog = clamp((vDepth - uFogNear) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
  gl_FragColor = vec4(mix(uColor, uFogColor, fog), uOpacity * (1.0 - fog * 0.9));
}`;

const FOV = (50 * Math.PI) / 180;
const TRANSPARENT = new Set(['glass', 'wallDemo']);

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader failed to compile: ${log}`);
  }
  return shader;
}

function link(gl, vsSource, fsSource, attributes) {
  const program = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSource);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program failed to link: ${log}`);
  }
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i += 1) {
    const info = gl.getActiveUniform(program, i);
    uniforms[info.name] = gl.getUniformLocation(program, info.name);
  }
  const attribs = {};
  for (const name of attributes) attribs[name] = gl.getAttribLocation(program, name);
  return { program, uniforms, attribs };
}

export function isWebglAvailable() {
  if (typeof document === 'undefined') return false;
  try {
    const probe = document.createElement('canvas');
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch {
    return false;
  }
}

export class Viewer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl =
      canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true }) ||
      canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
    if (!this.gl) throw new Error('WebGL is not available in this browser.');

    const gl = this.gl;
    this.isWebgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    if (!this.isWebgl2) gl.getExtension('OES_element_index_uint');

    this.solid = link(gl, SOLID_VS, SOLID_FS, ['aPosition', 'aNormal']);
    this.line = link(gl, LINE_VS, LINE_FS, ['aPosition']);

    this.buffers = [];
    this.grid = null;
    this.bounds = { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 };
    this.mode = 'blueprint';
    this.showGrid = true;

    this.camera = { target: [0, 0, 0], distance: 400, yaw: Math.PI * 0.25, pitch: 0.5 };
    this.width = 1;
    this.height = 1;
    this.dpr = 1;

    this.view = new Float32Array(16);
    this.projection = new Float32Array(16);
    this.dirty = true;
    this.frameHandle = 0;

    this.pointers = new Map();
    this.gesture = null;
    this.detach = this.attachControls();
  }

  // --- geometry ---------------------------------------------------------

  disposeBuffers() {
    const gl = this.gl;
    for (const b of this.buffers) {
      gl.deleteBuffer(b.position);
      gl.deleteBuffer(b.normal);
      gl.deleteBuffer(b.index);
    }
    this.buffers = [];
    if (this.grid) {
      gl.deleteBuffer(this.grid.position);
      this.grid = null;
    }
  }

  setModel(model) {
    const gl = this.gl;
    this.disposeBuffers();
    this.bounds = model.bounds;

    for (const mesh of model.meshes) {
      const position = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, position);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);

      const normal = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, normal);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);

      const index = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

      const spec = MATERIALS[mesh.material] || MATERIALS.wallNew;
      this.buffers.push({
        material: mesh.material,
        color: spec.color,
        opacity: spec.opacity ?? 1,
        transparent: TRANSPARENT.has(mesh.material) || (spec.opacity ?? 1) < 1,
        position,
        normal,
        index,
        count: mesh.indices.length,
        indexType: mesh.indices.BYTES_PER_ELEMENT === 4 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
      });
    }

    this.buildGrid();
    this.dirty = true;
  }

  buildGrid() {
    const gl = this.gl;
    const b = this.bounds;
    const spanX = Math.max(b.maxX - b.minX, 48);
    const spanZ = Math.max(b.maxZ - b.minZ, 48);
    const reach = Math.max(spanX, spanZ) * 0.85 + 96;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const y = Math.min(0, b.minY) - 0.25;

    // A one-foot grid, thinned out so a large site does not become a moiré.
    let step = 12;
    while (reach / step > 90) step *= 4;

    const lines = [];
    const first = Math.ceil((cx - reach) / step) * step;
    for (let x = first; x <= cx + reach; x += step) {
      lines.push(x, y, cz - reach, x, y, cz + reach);
    }
    const firstZ = Math.ceil((cz - reach) / step) * step;
    for (let z = firstZ; z <= cz + reach; z += step) {
      lines.push(cx - reach, y, z, cx + reach, y, z);
    }

    const position = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, position);
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(lines), gl.STATIC_DRAW);
    this.grid = { position, count: lines.length / 3 };
  }

  // --- camera -----------------------------------------------------------

  frameAll(margin = 1.3) {
    const b = this.bounds;
    this.camera.target = m4.boundsCenter(b);
    const radius = m4.boundsRadius(b);
    const aspect = this.width / Math.max(this.height, 1);
    this.camera.distance = m4.fitDistance(radius, FOV, aspect, margin);
    this.camera.yaw = Math.PI * 0.22;
    this.camera.pitch = 0.42;
    this.dirty = true;
  }

  setView(name) {
    const views = {
      top: { yaw: 0, pitch: m4.PITCH_LIMIT },
      front: { yaw: 0, pitch: 0.02 },
      back: { yaw: Math.PI, pitch: 0.02 },
      left: { yaw: -Math.PI / 2, pitch: 0.02 },
      right: { yaw: Math.PI / 2, pitch: 0.02 },
      iso: { yaw: Math.PI * 0.22, pitch: 0.42 },
    };
    const view = views[name];
    if (!view) return;
    this.camera.yaw = view.yaw;
    this.camera.pitch = m4.clampPitch(view.pitch);
    this.dirty = true;
  }

  orbitBy(dx, dy) {
    this.camera.yaw -= dx * 0.008;
    this.camera.pitch = m4.clampPitch(this.camera.pitch + dy * 0.008);
    this.dirty = true;
  }

  dollyBy(factor) {
    const radius = m4.boundsRadius(this.bounds);
    this.camera.distance = Math.max(
      radius * 0.05,
      Math.min(radius * 40, this.camera.distance * factor)
    );
    this.dirty = true;
  }

  panBy(dx, dy) {
    // Move the target across the screen plane, scaled so a drag tracks the cursor.
    const eye = m4.orbitEye(this.camera.target, this.camera.distance, this.camera.yaw, this.camera.pitch);
    const forward = m4.normalize(m4.subtract(this.camera.target, eye));
    const right = m4.normalize(m4.cross(forward, [0, 1, 0]));
    const up = m4.cross(right, forward);
    const worldPerPixel = (2 * this.camera.distance * Math.tan(FOV / 2)) / Math.max(this.height, 1);
    this.camera.target = m4.add(
      this.camera.target,
      m4.add(m4.scale(right, -dx * worldPerPixel), m4.scale(up, dy * worldPerPixel))
    );
    this.dirty = true;
  }

  // --- input ------------------------------------------------------------

  attachControls() {
    const canvas = this.canvas;
    const onDown = (event) => {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* capture is optional */
      }
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.gesture = {
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          midX: (a.x + b.x) / 2,
          midY: (a.y + b.y) / 2,
        };
      }
    };

    const onMove = (event) => {
      const previous = this.pointers.get(event.pointerId);
      if (!previous) return;
      const next = { x: event.clientX, y: event.clientY };
      this.pointers.set(event.pointerId, next);

      if (this.pointers.size === 1) {
        const panning = event.shiftKey || event.buttons === 2 || event.buttons === 4;
        if (panning) this.panBy(next.x - previous.x, next.y - previous.y);
        else this.orbitBy(next.x - previous.x, next.y - previous.y);
        this.requestFrame();
        return;
      }

      if (this.pointers.size === 2 && this.gesture) {
        const [a, b] = [...this.pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        if (this.gesture.distance > 0 && distance > 0) {
          this.dollyBy(this.gesture.distance / distance);
        }
        this.panBy(midX - this.gesture.midX, midY - this.gesture.midY);
        this.gesture = { distance, midX, midY };
        this.requestFrame();
      }
    };

    const onUp = (event) => {
      this.pointers.delete(event.pointerId);
      if (this.pointers.size < 2) this.gesture = null;
      try {
        if (canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
      } catch {
        /* already released */
      }
    };

    const onWheel = (event) => {
      event.preventDefault();
      this.dollyBy(Math.exp(event.deltaY * 0.0012));
      this.requestFrame();
    };

    const onContext = (event) => event.preventDefault();

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContext);

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
    };
  }

  // --- drawing ----------------------------------------------------------

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.dirty = true;
  }

  setMode(mode) {
    this.mode = mode === 'paper' ? 'paper' : 'blueprint';
    this.dirty = true;
  }

  requestFrame() {
    if (this.frameHandle) return;
    this.frameHandle = requestAnimationFrame(() => {
      this.frameHandle = 0;
      this.render();
    });
  }

  palette() {
    const pal = palette(this.mode);
    const dark = this.mode === 'blueprint';
    return {
      background: hexToRgb(pal.background),
      sky: dark ? [0.30, 0.36, 0.46] : [0.62, 0.64, 0.66],
      ground: dark ? [0.10, 0.13, 0.18] : [0.34, 0.33, 0.31],
      grid: hexToRgb(dark ? TOKEN.chalk : TOKEN.slate40),
      gridOpacity: dark ? 0.18 : 0.35,
    };
  }

  render() {
    const gl = this.gl;
    const pal = this.palette();
    const aspect = this.width / Math.max(this.height, 1);
    const radius = m4.boundsRadius(this.bounds);

    const eye = m4.orbitEye(this.camera.target, this.camera.distance, this.camera.yaw, this.camera.pitch);
    m4.lookAt(eye, this.camera.target, [0, 1, 0], this.view);
    m4.perspective(FOV, aspect, Math.max(radius * 0.002, 0.5), this.camera.distance + radius * 12, this.projection);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(pal.background[0], pal.background[1], pal.background[2], 1);
    gl.clearDepth(1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const fogNear = this.camera.distance * 0.6;
    const fogFar = this.camera.distance + radius * 6;
    const lightDir = m4.normalize([0.45, 0.78, 0.35]);

    // Ground grid first, so translucent geometry blends over it.
    if (this.showGrid && this.grid) {
      const { program, uniforms, attribs } = this.line;
      gl.useProgram(program);
      gl.uniformMatrix4fv(uniforms.uProjection, false, this.projection);
      gl.uniformMatrix4fv(uniforms.uView, false, this.view);
      gl.uniform3fv(uniforms.uColor, pal.grid);
      gl.uniform3fv(uniforms.uFogColor, pal.background);
      gl.uniform1f(uniforms.uFogNear, fogNear);
      gl.uniform1f(uniforms.uFogFar, fogFar);
      gl.uniform1f(uniforms.uOpacity, pal.gridOpacity);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.grid.position);
      gl.enableVertexAttribArray(attribs.aPosition);
      gl.vertexAttribPointer(attribs.aPosition, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, this.grid.count);
      gl.disable(gl.BLEND);
    }

    const { program, uniforms, attribs } = this.solid;
    gl.useProgram(program);
    gl.uniformMatrix4fv(uniforms.uProjection, false, this.projection);
    gl.uniformMatrix4fv(uniforms.uView, false, this.view);
    gl.uniform3fv(uniforms.uLightDir, lightDir);
    gl.uniform3fv(uniforms.uSky, pal.sky);
    gl.uniform3fv(uniforms.uGround, pal.ground);
    gl.uniform3fv(uniforms.uFogColor, pal.background);
    gl.uniform1f(uniforms.uFogNear, fogNear);
    gl.uniform1f(uniforms.uFogFar, fogFar);

    const draw = (buffer) => {
      gl.uniform3fv(uniforms.uColor, buffer.color);
      gl.uniform1f(uniforms.uOpacity, buffer.opacity);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer.position);
      gl.enableVertexAttribArray(attribs.aPosition);
      gl.vertexAttribPointer(attribs.aPosition, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer.normal);
      gl.enableVertexAttribArray(attribs.aNormal);
      gl.vertexAttribPointer(attribs.aNormal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer.index);
      gl.drawElements(gl.TRIANGLES, buffer.count, buffer.indexType, 0);
    };

    for (const buffer of this.buffers) if (!buffer.transparent) draw(buffer);

    // Translucent passes last, without writing depth, so glass layers correctly.
    const transparent = this.buffers.filter((b) => b.transparent);
    if (transparent.length) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      for (const buffer of transparent) draw(buffer);
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    this.dirty = false;
  }

  toDataUrl(type = 'image/png') {
    this.render();
    return this.canvas.toDataURL(type);
  }

  dispose() {
    if (this.detach) this.detach();
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.disposeBuffers();
    const gl = this.gl;
    gl.deleteProgram(this.solid.program);
    gl.deleteProgram(this.line.program);
  }
}
