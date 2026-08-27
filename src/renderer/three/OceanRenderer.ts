/**
 * SILENT DEPTH V2.0 — Ocean Renderer (src/renderer/three/OceanRenderer.ts)
 *
 * Procedural ocean surface with Gerstner waves, depth-based coloring,
 * foam on wave crests, and weather-responsive wave parameters.
 *
 * Uses custom vertex/fragment shaders for GPU-driven wave animation.
 * The ocean plane covers a large area centered on the player.
 */

import * as THREE from 'three';
import type { RenderWeather } from '../types';

// ---------------------------------------------------------------------------
// Ocean Shader (GLSL)
// ---------------------------------------------------------------------------

const OCEAN_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uWaveHeight;
uniform float uWindSpeed;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vWaveHeight;
varying vec2 vUv;

// Gerstner wave function
vec3 gerstnerWave(vec2 pos, float steepness, float wavelength, vec2 direction, float speed, float time) {
  float k = 6.28318 / wavelength;
  float c = speed;
  float a = steepness / k;
  float phase = k * dot(direction, pos) - c * time;
  float sinP = sin(phase);
  float cosP = cos(phase);
  
  return vec3(
    direction.x * a * cosP,
    a * sinP,
    direction.y * a * cosP
  );
}

void main() {
  vUv = uv;
  vec3 pos = position;
  
  // Sum of 4 Gerstner waves with different directions/frequencies
  vec3 wave1 = gerstnerWave(pos.xz, 0.15 * uWaveHeight, 0.8, vec2(1.0, 0.3), uWindSpeed * 0.15, uTime);
  vec3 wave2 = gerstnerWave(pos.xz, 0.10 * uWaveHeight, 0.5, vec2(-0.5, 1.0), uWindSpeed * 0.12, uTime * 1.1);
  vec3 wave3 = gerstnerWave(pos.xz, 0.08 * uWaveHeight, 0.3, vec2(0.7, -0.7), uWindSpeed * 0.18, uTime * 0.9);
  vec3 wave4 = gerstnerWave(pos.xz, 0.05 * uWaveHeight, 0.15, vec2(-0.3, -0.5), uWindSpeed * 0.22, uTime * 1.3);
  
  vec3 totalWave = wave1 + wave2 + wave3 + wave4;
  pos += totalWave;
  vWaveHeight = totalWave.y;
  
  // Approximate normal from wave derivatives
  float eps = 0.01;
  vec3 waveX = gerstnerWave(pos.xz + vec2(eps, 0.0), 0.15 * uWaveHeight, 0.8, vec2(1.0, 0.3), uWindSpeed * 0.15, uTime)
             + gerstnerWave(pos.xz + vec2(eps, 0.0), 0.10 * uWaveHeight, 0.5, vec2(-0.5, 1.0), uWindSpeed * 0.12, uTime * 1.1);
  vec3 waveZ = gerstnerWave(pos.xz + vec2(0.0, eps), 0.15 * uWaveHeight, 0.8, vec2(1.0, 0.3), uWindSpeed * 0.15, uTime)
             + gerstnerWave(pos.xz + vec2(0.0, eps), 0.10 * uWaveHeight, 0.5, vec2(-0.5, 1.0), uWindSpeed * 0.12, uTime * 1.1);
  
  vec3 tangentX = normalize(vec3(eps, waveX.y - totalWave.y, 0.0));
  vec3 tangentZ = normalize(vec3(0.0, waveZ.y - totalWave.y, eps));
  vNormal = normalize(cross(tangentZ, tangentX));
  
  vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const OCEAN_FRAGMENT = /* glsl */ `
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uFoamColor;
uniform float uFogDensity;
uniform vec3 uFogColor;
uniform vec3 uSunDirection;
uniform float uIsNight;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vWaveHeight;
varying vec2 vUv;

void main() {
  // Depth-based color gradient
  float depthFactor = smoothstep(-0.005, 0.002, vWorldPosition.y);
  vec3 waterColor = mix(uDeepColor, uShallowColor, depthFactor);
  
  // Simple diffuse lighting
  vec3 lightDir = normalize(uSunDirection);
  float diff = max(dot(vNormal, lightDir), 0.0);
  float ambient = mix(0.15, 0.05, uIsNight);
  
  // Specular highlight (sun/moon reflection)
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 halfDir = normalize(lightDir + viewDir);
  float spec = pow(max(dot(vNormal, halfDir), 0.0), 64.0) * mix(0.6, 0.15, uIsNight);
  
  // Foam on wave crests
  float foamThreshold = 0.002;
  float foam = smoothstep(foamThreshold, foamThreshold + 0.001, vWaveHeight);
  waterColor = mix(waterColor, uFoamColor, foam * 0.6);
  
  // Combine lighting
  vec3 finalColor = waterColor * (ambient + diff * 0.7) + vec3(spec);
  
  // Distance fog
  float dist = length(vWorldPosition - cameraPosition);
  float fogFactor = 1.0 - exp(-uFogDensity * dist * dist);
  finalColor = mix(finalColor, uFogColor, clamp(fogFactor, 0.0, 1.0));
  
  gl_FragColor = vec4(finalColor, 0.95);
}
`;

// ---------------------------------------------------------------------------
// Ocean Renderer Class
// ---------------------------------------------------------------------------

export class OceanRenderer {
  readonly mesh: THREE.Mesh;
  private _material: THREE.ShaderMaterial;
  private _geometry: THREE.PlaneGeometry;

  constructor() {
    // Large ocean plane: 60km x 60km, 256x256 segments for wave detail
    this._geometry = new THREE.PlaneGeometry(60, 60, 256, 256);
    this._geometry.rotateX(-Math.PI / 2); // Lay flat (XZ plane)

    this._material = new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERTEX,
      fragmentShader: OCEAN_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uWaveHeight: { value: 0.3 },
        uWindSpeed: { value: 2 },
        uDeepColor: { value: new THREE.Color(0x050a12) },
        uShallowColor: { value: new THREE.Color(0x14303f) },
        uFoamColor: { value: new THREE.Color(0xc8dce8) },
        uFogDensity: { value: 0.008 },
        uFogColor: { value: new THREE.Color(0x050a12) },
        uSunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
        uIsNight: { value: 0 },
      },
      transparent: true,
      side: THREE.FrontSide,
    });

    this.mesh = new THREE.Mesh(this._geometry, this._material);
    this.mesh.receiveShadow = true;
  }

  update(weather: RenderWeather, wallTime: number, playerX: number, playerZ: number): void {
    // Keep ocean centered on player
    this.mesh.position.set(playerX, 0, playerZ);

    // Update shader uniforms (safe access — all uniforms are pre-declared)
    const u = this._material.uniforms;
    u['uTime']!.value = wallTime;
    u['uWaveHeight']!.value = weather.waveHeight;
    u['uWindSpeed']!.value = weather.windSpeed;
    u['uFogDensity']!.value = weather.fogDensity;
    u['uIsNight']!.value = weather.isNight ? 1 : 0;

    // Adjust colors based on weather
    if (weather.isNight) {
      u['uDeepColor']!.value.setHex(0x020408);
      u['uShallowColor']!.value.setHex(0x0a1620);
      u['uFogColor']!.value.setHex(0x020408);
      u['uSunDirection']!.value.set(0.3, -0.2, 0.5).normalize();
    } else if (weather.kind === 'Storm') {
      u['uDeepColor']!.value.setHex(0x030810);
      u['uShallowColor']!.value.setHex(0x0d1e2a);
      u['uFogColor']!.value.setHex(0x0a1626);
      u['uSunDirection']!.value.set(0.2, 0.3, 0.4).normalize();
    } else if (weather.kind === 'Fog') {
      u['uDeepColor']!.value.setHex(0x060c16);
      u['uShallowColor']!.value.setHex(0x1a3040);
      u['uFogColor']!.value.setHex(0x9fb4c7);
      u['uSunDirection']!.value.set(0.5, 0.6, 0.3).normalize();
    } else {
      u['uDeepColor']!.value.setHex(0x050a12);
      u['uShallowColor']!.value.setHex(0x14303f);
      u['uFogColor']!.value.setHex(0x050a12);
      u['uSunDirection']!.value.set(0.5, 0.8, 0.3).normalize();
    }
  }

  dispose(): void {
    this._geometry.dispose();
    this._material.dispose();
  }
}
