/**
 * SILENT DEPTH V2.0 — Sky Renderer (src/renderer/three/SkyRenderer.ts)
 *
 * Procedural sky dome with atmospheric coloring.
 * Supports clear, cloudy, storm, fog, and night skies.
 */

import * as THREE from 'three';
import type { RenderWeather } from '../types';

const SKY_VERTEX = /* glsl */ `
varying vec3 vWorldPosition;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uTopColor;
uniform vec3 uHorizonColor;
uniform vec3 uBottomColor;
uniform float uCloudCover;
uniform float uIsNight;
uniform float uTime;

varying vec3 vWorldPosition;

// Simple noise for clouds
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

void main() {
  vec3 dir = normalize(vWorldPosition - cameraPosition);
  float y = dir.y;
  
  // Sky gradient
  vec3 color;
  if (y > 0.0) {
    float t = pow(y, 0.5);
    color = mix(uHorizonColor, uTopColor, t);
  } else {
    color = uBottomColor;
  }
  
  // Clouds (only above horizon)
  if (y > 0.01 && uCloudCover > 0.05) {
    vec2 uv = dir.xz / (y + 0.1) * 2.0;
    float n = noise(uv * 3.0 + uTime * 0.02);
    n += noise(uv * 6.0 - uTime * 0.01) * 0.5;
    n /= 1.5;
    float cloud = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover * 0.3, n);
    vec3 cloudColor = mix(vec3(0.6, 0.65, 0.7), vec3(0.9, 0.92, 0.95), y);
    if (uIsNight > 0.5) cloudColor *= 0.15;
    color = mix(color, cloudColor, cloud * smoothstep(0.0, 0.3, y));
  }
  
  // Stars at night
  if (uIsNight > 0.5 && y > 0.1) {
    float star = step(0.997, hash(floor(dir.xz * 500.0)));
    color += vec3(star * 0.8);
  }
  
  gl_FragColor = vec4(color, 1.0);
}
`;

export class SkyRenderer {
  readonly mesh: THREE.Mesh;
  private _material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.SphereGeometry(100, 32, 16);
    this._material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        uTopColor: { value: new THREE.Color(0x1a3a5c) },
        uHorizonColor: { value: new THREE.Color(0x4a6a8a) },
        uBottomColor: { value: new THREE.Color(0x050a12) },
        uCloudCover: { value: 0.1 },
        uIsNight: { value: 0 },
        uTime: { value: 0 },
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
      u['uTopColor']!.value.setHex(0x020810);
      u['uHorizonColor']!.value.setHex(0x0a1520);
      u['uBottomColor']!.value.setHex(0x020408);
    } else if (weather.kind === 'Storm') {
      u['uTopColor']!.value.setHex(0x1a2030);
      u['uHorizonColor']!.value.setHex(0x2a3a4a);
      u['uBottomColor']!.value.setHex(0x0a1626);
    } else if (weather.kind === 'Fog') {
      u['uTopColor']!.value.setHex(0x6a7a8a);
      u['uHorizonColor']!.value.setHex(0x9fb4c7);
      u['uBottomColor']!.value.setHex(0x6a7a8a);
    } else if (weather.kind === 'Cloudy') {
      u['uTopColor']!.value.setHex(0x2a4a6a);
      u['uHorizonColor']!.value.setHex(0x6a8aaa);
      u['uBottomColor']!.value.setHex(0x0d2233);
    } else {
      u['uTopColor']!.value.setHex(0x1a3a5c);
      u['uHorizonColor']!.value.setHex(0x4a6a8a);
      u['uBottomColor']!.value.setHex(0x050a12);
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this._material.dispose();
  }
}
