/**
 * SILENT DEPTH V2.1 — Sky Renderer
 *
 * Atmospheric sky dome with:
 * - Physically-inspired gradient (Rayleigh-like scattering)
 * - Sun disc with glow
 * - Moon disc at night
 * - Multi-layer clouds (high wispy + low stratus)
 * - Stars at night with twinkle
 * - Weather-dependent coloring
 * - Horizon haze
 */

import * as THREE from 'three';
import type { RenderWeather } from '../types';

const SKY_VERTEX = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vDirection;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vDirection = normalize(worldPos.xyz - cameraPosition);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uTopColor;
uniform vec3 uHorizonColor;
uniform vec3 uBottomColor;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;
uniform float uCloudCover;
uniform float uIsNight;
uniform float uTime;
uniform float uStarIntensity;

varying vec3 vWorldPosition;
varying vec3 vDirection;

// --- Noise functions ---
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  vec2 shift = vec2(100.0);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vDirection);
  float y = dir.y;
  float yNorm = y * 0.5 + 0.5; // 0 at bottom, 1 at top

  // --- Sky gradient (physically inspired) ---
  vec3 color;
  if (y > 0.0) {
    // Rayleigh-like: darker at zenith, brighter at horizon
    float t = pow(y, 0.4);
    color = mix(uHorizonColor, uTopColor, t);

    // Horizon haze band
    float haze = exp(-y * 8.0) * 0.3;
    color += uHorizonColor * haze;
  } else {
    // Below horizon: dark ocean reflection
    color = mix(uHorizonColor * 0.3, uBottomColor, smoothstep(0.0, -0.3, y));
  }

  // --- Sun ---
  if (uIsNight < 0.5) {
    vec3 sunDir = normalize(uSunDirection);
    float sunDot = max(dot(dir, sunDir), 0.0);
    // Sun disc
    float sunDisc = smoothstep(0.998, 0.9995, sunDot);
    color = mix(color, uSunColor * 1.5, sunDisc);
    // Sun glow
    float sunGlow = pow(sunDot, 8.0) * 0.15;
    color += uSunColor * sunGlow;
    // Atmospheric scatter around sun
    float scatter = pow(sunDot, 3.0) * 0.08;
    color += uSunColor * scatter;
  }

  // --- Moon (night only) ---
  if (uIsNight > 0.5) {
    vec3 moonDir = normalize(vec3(0.3, 0.6, 0.5));
    float moonDot = max(dot(dir, moonDir), 0.0);
    // A readable disc and soft halo establish a moon direction without a large
    // emissive orb or a sci-fi bloom treatment.
    float moonDisc = smoothstep(0.994, 0.999, moonDot);
    vec3 moonColor = vec3(0.62, 0.73, 0.88);
    color = mix(color, moonColor * 0.72, moonDisc);
    float moonGlow = pow(moonDot, 9.0) * 0.085;
    color += moonColor * moonGlow;
  }

  // --- Clouds ---
  if (y > 0.02 && uCloudCover > 0.05) {
    vec2 uv = dir.xz / (y + 0.05) * 3.0;

    // High clouds (wispy, slow)
    float highCloud = fbm(uv * 1.5 + uTime * 0.008);
    highCloud = smoothstep(1.0 - uCloudCover * 0.7, 1.0, highCloud);

    // Low clouds (stratus, medium speed)
    float lowCloud = fbm(uv * 3.0 - uTime * 0.015 + 50.0);
    lowCloud = smoothstep(1.0 - uCloudCover * 0.9, 1.0, lowCloud);

    float cloud = max(highCloud * 0.5, lowCloud * 0.8);
    cloud *= smoothstep(0.0, 0.15, y); // Fade near horizon

    vec3 cloudColor = mix(vec3(0.55, 0.6, 0.68), vec3(0.85, 0.88, 0.92), y);
    if (uIsNight > 0.5) {
      cloudColor *= 0.14;
      // Moonlit cloud edges remain local to the light vector and retain the
      // low-value silhouette language needed for night navigation.
      vec3 moonDir = normalize(vec3(0.3, 0.6, 0.5));
      float moonLit = pow(max(dot(dir, moonDir), 0.0), 4.0) * 0.085;
      cloudColor += vec3(moonLit);
    }
    color = mix(color, cloudColor, cloud * 0.7);
  }

  // --- Stars (night) ---
  if (uIsNight > 0.5 && y > 0.15) {
    vec2 starUv = dir.xz * 400.0 / y;
    float starHash = hash(floor(starUv));
    float star = step(0.998, starHash);
    // Twinkle
    float twinkle = sin(uTime * 2.0 + starHash * 100.0) * 0.3 + 0.7;
    color += vec3(star * uStarIntensity * twinkle);
  }

  // --- Sun disc on horizon (sunset/sunrise hint) ---
  if (uIsNight < 0.5) {
    float horizonFade = exp(-abs(y) * 20.0);
    float sunHorizon = pow(max(dot(normalize(dir.xz), normalize(uSunDirection.xz)), 0.0), 4.0);
    color += uSunColor * horizonFade * sunHorizon * 0.1;
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

export class SkyRenderer {
  readonly mesh: THREE.Mesh;
  private _material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.SphereGeometry(120, 48, 24);
    this._material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        uTopColor: { value: new THREE.Color(0x1a3a5c) },
        uHorizonColor: { value: new THREE.Color(0x4a6a8a) },
        uBottomColor: { value: new THREE.Color(0x030a14) },
        uSunColor: { value: new THREE.Color(0xffddaa) },
        uSunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
        uCloudCover: { value: 0.1 },
        uIsNight: { value: 0 },
        uTime: { value: 0 },
        uStarIntensity: { value: 0.8 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geometry, this._material);
    scene.add(this.mesh);
  }

  update(weather: RenderWeather, wallTime: number): void {
    const u = this._material.uniforms;
    u['uTime']!.value = wallTime;
    u['uCloudCover']!.value = weather.cloudCover;
    u['uIsNight']!.value = weather.isNight ? 1 : 0;

    if (weather.isNight) {
      u['uTopColor']!.value.setHex(0x030c17);
      u['uHorizonColor']!.value.setHex(0x102438);
      u['uBottomColor']!.value.setHex(0x02070d);
      u['uSunColor']!.value.setHex(0xa8bfd6);
      u['uSunDirection']!.value.set(0.22, 0.62, 0.48).normalize();
      u['uStarIntensity']!.value = 0.52;
    } else if (weather.kind === 'Storm') {
      u['uTopColor']!.value.setHex(0x111d2a);
      u['uHorizonColor']!.value.setHex(0x34485a);
      u['uBottomColor']!.value.setHex(0x0b1929);
      u['uSunColor']!.value.setHex(0x9aaec0);
      u['uSunDirection']!.value.set(0.2, 0.3, 0.4).normalize();
      u['uStarIntensity']!.value = 0;
    } else if (weather.kind === 'Fog') {
      u['uTopColor']!.value.setHex(0x5a6a7a);
      u['uHorizonColor']!.value.setHex(0x8898a8);
      u['uBottomColor']!.value.setHex(0x5a6a7a);
      u['uSunColor']!.value.setHex(0xccccbb);
      u['uSunDirection']!.value.set(0.5, 0.5, 0.3).normalize();
      u['uStarIntensity']!.value = 0;
    } else if (weather.kind === 'Cloudy') {
      u['uTopColor']!.value.setHex(0x22384a);
      u['uHorizonColor']!.value.setHex(0x5a7a90);
      u['uBottomColor']!.value.setHex(0x0a1828);
      u['uSunColor']!.value.setHex(0xddddcc);
      u['uSunDirection']!.value.set(0.4, 0.6, 0.3).normalize();
      u['uStarIntensity']!.value = 0;
    } else {
      u['uTopColor']!.value.setHex(0x1a3a5c);
      u['uHorizonColor']!.value.setHex(0x4a6a8a);
      u['uBottomColor']!.value.setHex(0x030a14);
      u['uSunColor']!.value.setHex(0xffddaa);
      u['uSunDirection']!.value.set(0.5, 0.8, 0.3).normalize();
      u['uStarIntensity']!.value = 0;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this._material.dispose();
  }
}
