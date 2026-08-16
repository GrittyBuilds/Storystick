// Minimal column-major 4x4 matrix and 3-vector maths, in the layout WebGL wants.
// Hand-written so the app keeps its no-dependency, no-build-step property.

export function identity(out = new Float32Array(16)) {
  out.fill(0);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

/** out = a * b (apply b first, then a). */
export function multiply(a, b, out = new Float32Array(16)) {
  const result = out === a || out === b ? new Float32Array(16) : out;
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[col * 4 + k];
      result[col * 4 + row] = sum;
    }
  }
  if (result !== out) out.set(result);
  return out;
}

export function perspective(fovYRadians, aspect, near, far, out = new Float32Array(16)) {
  const f = 1 / Math.tan(fovYRadians / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[11] = -1;
  if (far === Infinity) {
    out[10] = -1;
    out[14] = -2 * near;
  } else {
    const nf = 1 / (near - far);
    out[10] = (far + near) * nf;
    out[14] = 2 * far * near * nf;
  }
  return out;
}

export function orthographic(left, right, bottom, top, near, far, out = new Float32Array(16)) {
  out.fill(0);
  out[0] = 2 / (right - left);
  out[5] = 2 / (top - bottom);
  out[10] = -2 / (far - near);
  out[12] = -(right + left) / (right - left);
  out[13] = -(top + bottom) / (top - bottom);
  out[14] = -(far + near) / (far - near);
  out[15] = 1;
  return out;
}

export function lookAt(eye, center, up, out = new Float32Array(16)) {
  const z = normalize(subtract(eye, center));
  let x = cross(up, z);
  if (length(x) < 1e-8) {
    // The view direction is parallel to up; nudge to keep a valid basis.
    x = cross([up[1], up[2], up[0]], z);
  }
  x = normalize(x);
  const y = cross(z, x);
  out[0] = x[0];
  out[1] = y[0];
  out[2] = z[0];
  out[3] = 0;
  out[4] = x[1];
  out[5] = y[1];
  out[6] = z[1];
  out[7] = 0;
  out[8] = x[2];
  out[9] = y[2];
  out[10] = z[2];
  out[11] = 0;
  out[12] = -dot(x, eye);
  out[13] = -dot(y, eye);
  out[14] = -dot(z, eye);
  out[15] = 1;
  return out;
}

export function transformPoint(m, p) {
  const [x, y, z] = p;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
}

// --- vec3 -----------------------------------------------------------------

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const length = (a) => Math.hypot(a[0], a[1], a[2]);

export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function normalize(a) {
  const len = length(a);
  return len < 1e-12 ? [0, 0, 0] : [a[0] / len, a[1] / len, a[2] / len];
}

/**
 * Eye position for an orbit camera.
 * @param target [x,y,z] point being orbited
 * @param distance metres/inches from the target
 * @param yaw rotation about the vertical axis, radians
 * @param pitch elevation above the horizon, radians (clamped by the caller)
 */
export function orbitEye(target, distance, yaw, pitch) {
  const cosPitch = Math.cos(pitch);
  return [
    target[0] + distance * cosPitch * Math.sin(yaw),
    target[1] + distance * Math.sin(pitch),
    target[2] + distance * cosPitch * Math.cos(yaw),
  ];
}

export const PITCH_LIMIT = Math.PI / 2 - 0.01;

export function clampPitch(pitch) {
  return Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
}

/**
 * Distance at which a sphere of `radius` fits in a `fovY` frustum of the given
 * aspect ratio, with a little breathing room.
 */
export function fitDistance(radius, fovYRadians, aspect, margin = 1.25) {
  const fovX = 2 * Math.atan(Math.tan(fovYRadians / 2) * Math.max(aspect, 0.0001));
  const limiting = Math.min(fovYRadians, fovX);
  return (radius / Math.sin(limiting / 2)) * margin;
}

export function boundsCenter(b) {
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2];
}

export function boundsRadius(b) {
  return (
    Math.max(
      Math.hypot(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ) / 2,
      1
    )
  );
}
