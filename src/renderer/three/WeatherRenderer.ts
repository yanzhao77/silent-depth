/**
 * SILENT DEPTH V2.6 — Weather Renderer
 *
 * Presentation-only storm rain and lightning layer. Rain moves in a shader so
 * CPU cost remains bounded at the configured point count; weather semantics are
 * read exclusively from RenderWeather. Scene fog is owned by SceneManager, so
 * this module no longer sets it. Lightning intensity is supplied by the
 * deterministic `stormLightningIntensity` clock computed in ThreeRenderer, so
 * the flash cadence is reproducible and never consumes engine RNG.
 */

import * as THREE from 'three';
import type { RenderWeather } from '../types';
import { createVisualRng } from '../visualRng';

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

export interface WeatherUpdateOptions {
  /** Deterministic storm lightning flash intensity [0,1]. */
  lightning: number;
  /** Whether the player is currently below the surface (disable rain/flash). */
  underwater: boolean;
}

export class WeatherRenderer {
  private readonly _scene: THREE.Scene;
  private _rainParticles: THREE.Points | null = null;
  private _rainGeometry: THREE.BufferGeometry | null = null;
  private _rainMaterial: THREE.ShaderMaterial | null = null;
  private readonly _rainCount: number;
  private _lightningLight: THREE.PointLight | null = null;
  private _weatherTime = 0;

  constructor(scene: THREE.Scene, rainCount: number = 4000) {
    this._scene = scene;
    this._rainCount = rainCount;
  }

  update(
    weather: RenderWeather,
    playerX: number,
    playerZ: number,
    dt: number,
    options: WeatherUpdateOptions = { lightning: 0, underwater: false },
  ): void {
    this._weatherTime += Math.max(0, dt);

    if (weather.kind === 'Storm' && !options.underwater) {
      if (!this._rainParticles) this._createRain();
      if (this._rainParticles && this._rainMaterial) {
        this._rainParticles.visible = true;
        this._rainParticles.position.set(playerX, 0, playerZ);
        this._rainMaterial.uniforms['uTime']!.value = this._weatherTime;
        this._rainMaterial.uniforms['uWindSpeed']!.value = weather.windSpeed;
      }
      this._applyLightning(options.lightning, playerX, playerZ);
    } else {
      if (this._rainParticles) this._rainParticles.visible = false;
      if (this._lightningLight) this._lightningLight.intensity = 0;
    }
  }

  private _applyLightning(intensity: number, playerX: number, playerZ: number): void {
    if (!this._lightningLight) {
      this._lightningLight = new THREE.PointLight(0xc9dbff, 0, 170);
      this._scene.add(this._lightningLight);
    }
    this._lightningLight.position.set(playerX, 42, playerZ);
    // Deterministic flash: 0 intensity between strikes, bright during the peak.
    this._lightningLight.intensity = intensity * 9;
  }

  private _createRain(): void {
    const rng = createVisualRng(0x9e3779b1);
    const positions = new Float32Array(this._rainCount * 3);
    const seeds = new Float32Array(this._rainCount);
    for (let i = 0; i < this._rainCount; i++) {
      positions[i * 3] = (rng.next() - 0.5) * 17;
      positions[i * 3 + 1] = rng.next() * 8;
      positions[i * 3 + 2] = (rng.next() - 0.5) * 17;
      seeds[i] = rng.next();
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
    if (this._lightningLight) {
      this._lightningLight.intensity = 0;
      this._scene.remove(this._lightningLight);
      this._lightningLight.dispose();
    }
  }
}
