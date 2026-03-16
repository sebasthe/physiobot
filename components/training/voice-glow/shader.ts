/**
 * Voice glow visualizer — WebGL shader module.
 *
 * SDF circle + layered turbulence displacement + smoothstep edge +
 * bloom accumulation + Reinhard tonemapping + dithering.
 */

export interface GlowUniformDef {
  type: '1f' | '2f' | '3f'
  default: number | [number, number] | [number, number, number]
}

export interface GlowUniforms {
  uTime: number
  uSpeed: number
  uAmplitude: number
  uFrequency: number
  uScale: number
  uBlur: number
  uBrightness: number
  uColor: [number, number, number]
  uColorShift: number
  uResolution: [number, number]
}

export const UNIFORM_DEFS: Record<keyof GlowUniforms, GlowUniformDef> = {
  uTime: { type: '1f', default: 0 },
  uSpeed: { type: '1f', default: 10 },
  uAmplitude: { type: '1f', default: 0.5 },
  uFrequency: { type: '1f', default: 0.5 },
  uScale: { type: '1f', default: 0.25 },
  uBlur: { type: '1f', default: 0.8 },
  uBrightness: { type: '1f', default: 1.0 },
  uColor: { type: '3f', default: [0.165, 0.616, 0.541] },
  uColorShift: { type: '1f', default: 0.15 },
  uResolution: { type: '2f', default: [300, 300] },
}

export const VERTEX_SHADER = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

export const FRAGMENT_SHADER = `
precision mediump float;

uniform float uTime;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uScale;
uniform float uBlur;
uniform float uBrightness;
uniform vec3 uColor;
uniform float uColorShift;
uniform vec2 uResolution;

const float TAU = 6.283185;
const float ITERATIONS = 32.0;

vec2 dither(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.xx + p.yx) * p.xy);
}

vec3 tonemap(vec3 x) {
  x *= 4.0;
  return x / (1.0 + x);
}

float luminance(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

vec2 turbulence(vec2 pos, float t, float offset) {
  mat2 rot = mat2(0.6, -0.25, 0.25, 0.9);
  mat2 layerRot = mat2(0.6, -0.8, 0.8, 0.6);

  float freq = mix(2.0, 15.0, uFrequency);
  float amp = uAmplitude;
  float animT = t * 0.1 * uSpeed;

  for (int i = 0; i < 4; i++) {
    vec2 rp = pos * rot;
    vec2 wave = sin(freq * rp + float(i) * animT + offset);
    pos += (amp / freq) * rot[0] * wave;
    rot *= layerRot;
    amp *= 0.7;
    freq *= 1.4;
  }

  return pos;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 pos = uv - 0.5;

  float t = uTime * 0.5;

  vec3 accum = vec3(0.0);
  vec3 bloom = vec3(0.0);

  vec2 prevPos = turbulence(pos, t, -1.0 / ITERATIONS);
  float spacing = mix(1.0, TAU, 0.5);

  for (float i = 1.0; i < ITERATIONS + 1.0; i++) {
    float iter = i / ITERATIONS;
    vec2 st = turbulence(pos, t, iter * spacing);
    float d = abs(sdCircle(st, uScale));
    float pd = distance(st, prevPos);
    prevPos = st;

    float dynBlur = exp2(pd * 2.0 * 1.4427) - 1.0;
    float edge = smoothstep(0.0, uBlur * 0.05 + max(dynBlur * 1.0, 0.001), d);

    vec3 col = uColor;
    if (uColorShift > 0.01) {
      vec3 hsv = rgb2hsv(col);
      hsv.x = fract(hsv.x + (1.0 - iter) * uColorShift * 0.3);
      col = hsv2rgb(hsv);
    }

    float invD = 1.0 / max(d + dynBlur, 0.001);
    accum += (edge - 1.0) * col;
    bloom += clamp(invD, 0.0, 250.0) * col;
  }

  accum *= 1.0 / ITERATIONS;

  bloom = bloom / (bloom + 2e4);
  vec3 color = (-accum + bloom * 3.0) * 1.2;
  color += (dither(gl_FragCoord.xy).x - 0.5) / 255.0;
  color = tonemap(color);

  float alpha = luminance(color) * uBrightness;
  gl_FragColor = vec4(color * uBrightness, alpha);
}
`
