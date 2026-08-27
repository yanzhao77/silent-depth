/**
 * SILENT DEPTH V2.2 — Weather Renderer
 *
 * Presentation-only storm, fog and lightning layer. Rain moves in a shader so
 * CPU cost remains bounded at the configured point count; weather semantics are
 * read exclusively from RenderWeather.
 */

import * as THREE from 'three';
import type { RenderWeather } from '../types';

const RAIN_VERTEX = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uWindSpeed;
varying float vAlpha;

void main() {
  float fall = fract(aSeed + uTime * (0.62 + fract(aSeed * 37.0) * 0.18));
  vec3 p = position;
  p.y = 5.5 - fall * 8.2;
  float gust = sin(uTime * 0.63 + aSeed * 53.0) * 0.16;
  p.x += (uWindSpeed * 0.018 + gust) * (1.0 - fall) * 3.2;
  p.z += (uWindSpeed * 0.007 + gust * 0.55) * (1.0 - fall) * 2.0;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  // World units are kilometres and the follow camera is close; scale from a
  // sub-unit world size and clamp in pixels to avoid billboard-sized rain.
  float rainWorldSize = 0.00050 + clamp(uWindSpeed, 0.0, 20.0) * 0.00003;
  gl_PointSize = clamp(rainWorldSize * (240.0 / max(0.10, -mvPosition.z)), 0.8, 3.8);
  gl_Position = projectionMatrix * mvPosition;
  vAlpha = smoothstep(0.0, 0.10, fall) * (1.0 - smoothstep(0.82, 1.0, fall));
}
`;

const RAIN_FRAGMENT = /* glsl */ `
varying float vAlpha;
void main() {
  float center = 1.0 - abs(gl_PointCoord.x - 0.5) * 2.0;
  float streak = smoothstep(0.24, 0.72, center);
  gl_FragColor = vec4(0.62, 0.75, 0.86, streak * vAlpha * 0.42);
}
`;

function pseudoRandom(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export class WeatherRenderer {
  private readonly _scene: THREE.Scene;
  private _rainParticles: THREE.Points | null = null;
  private _rainGeometry: THREE.BufferGeometry | null = null;
  private _rainMaterial: THREE.ShaderMaterial | null = null;
  private readonly _rainCount: number;
  private _lightningLight: THREE.PointLight | null = null;
  private _lightningTimer = 2.8;
  private _lightningActive = false;
  private _lightningSeed = 0;
  private _weatherTime = 0;

  constructor(scene: THREE.Scene, rainCount: number = 4000) {
    this._scene = scene;
    this._rainCount = rainCount;
  }

  update(weather: RenderWeather, playerX: number, playerZ: number, dt: number): void {
    this._weatherTime += Math.max(0, dt);
    this._updateSceneFog(weather);

    if (weather.kind === 'Storm') {
      if (!this._rainParticles) this._createRain();
      if (this._rainParticles && this._rainMaterial) {
        this._rainParticles.visible = true;
        this._rainParticles.position.set(playerX, 0, playerZ);
        this._rainMaterial.uniforms['uTime']!.value = this._weatherTime;
        this._rainMaterial.uniforms['uWindSpeed']!.value = weather.windSpeed;
      }
      this._updateLightning(dt, playerX, playerZ);
    } else {
      if (this._rainParticles) this._rainParticles.visible = false;
      this._removeLightning();
    }
  }

  private _updateSceneFog(weather: RenderWeather): void {
    if (!(this._scene.fog instanceof THREE.FogExp2)) return;
    this._scene.fog.density = weather.fogDensity;
    if (weather.isNight) {
      this._scene.fog.color.setHex(0x020a10);
    } else if (weather.kind === 'Fog') {
      this._scene.fog.color.setHex(0x788d9b);
    } else if (weather.kind === 'Storm') {
      this._scene.fog.color.setHex(0x101f31);
    } else if (weather.kind === 'Cloudy') {
      this._scene.fog.color.setHex(0x10283a);
    } else {
      this._scene.fog.color.setHex(0x071b2a);
    }
  }

  private _updateLightning(dt: number, playerX: number, playerZ: number): void {
    this._lightningTimer -= Math.max(0, dt);
    if (this._lightningTimer <= 0 && !this._lightningActive) {
      this._lightningActive = true;
      const flashLength = 0.055 + pseudoRandom(this._lightningSeed, 1) * 0.095;
      this._lightningTimer = flashLength;
      if (!this._lightningLight) {
        this._lightningLight = new THREE.PointLight(0xc9dbff, 8.5, 170);
        this._scene.add(this._lightningLight);
      }
      this._lightningLight.intensity = 5.5 + pseudoRandom(this._lightningSeed, 2) * 3.0;
      this._lightningLight.position.set(
        playerX + (pseudoRandom(this._lightningSeed, 3) - 0.5) * 46,
        38 + pseudoRandom(this._lightningSeed, 4) * 19,
        playerZ + (pseudoRandom(this._lightningSeed, 5) - 0.5) * 46,
      );
      this._lightningSeed++;
      return;
    }
    if (this._lightningActive && this._lightningTimer <= 0) {
      this._lightningActive = false;
      this._lightningTimer = 3.5 + pseudoRandom(this._lightningSeed, 6) * 6.5;
      if (this._lightningLight) this._lightningLight.intensity = 0;
    }
  }

  private _removeLightning(): void {
    this._lightningActive = false;
    this._lightningTimer = 2.8;
    if (this._lightningLight) this._lightningLight.intensity = 0;
  }

  private _createRain(): void {
    const positions = new Float32Array(this._rainCount * 3);
    const seeds = new Float32Array(this._rainCount);
    for (let i = 0; i < this._rainCount; i++) {
      positions[i * 3] = (pseudoRandom(i, 11) - 0.5) * 17;
      positions[i * 3 + 1] = pseudoRandom(i, 12) * 8;
      positions[i * 3 + 2] = (pseudoRandom(i, 13) - 0.5) * 17;
      seeds[i] = pseudoRandom(i, 14);
    }
    this._rainGeometry = new THREE.BufferGeometry();
    this._rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._rainGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this._rainMaterial = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERTEX,
      fragmentShader: RAIN_FRAGMENT,
      uniforms: { uTime: { value: 0 }, uWindSpeed: { value: 0 } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });
    this._rainParticles = new THREE.Points(this._rainGeometry, this._rainMaterial);
    this._rainParticles.name = 'storm-rain-gpu-points';
    this._scene.add(this._rainParticles);
  }

  dispose(): void {
    if (this._rainParticles) this._scene.remove(this._rainParticles);
    this._rainGeometry?.dispose();
    this._rainMaterial?.dispose();
    this._removeLightning();
    if (this._lightningLight) {
      this._scene.remove(this._lightningLight);
      this._lightningLight.dispose();
    }
  }
}
