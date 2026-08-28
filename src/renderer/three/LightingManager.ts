/**
 * SILENT DEPTH V2.1 — Lighting Manager
 *
 * Cinematic 3-point lighting system:
 * - Key Light (sun/moon directional)
 * - Fill Light (hemisphere ambient)
 * - Rim Light (subtle back light for silhouette definition)
 * - Shadow optimization
 * - Weather-responsive intensity and color
 */

import * as THREE from 'three';
import type { RenderWeather } from '../types';
import type { WeatherVisual } from '../weather';
import type { QualitySettings } from './QualityPresets';

export interface LightingOptions {
  /** Storm lightning flash intensity [0,1] from the deterministic clock. */
  lightning?: number;
  /** Underwater light attenuation [0,1]; 1 = surface, lower = darker depths. */
  underwaterAttenuation?: number;
}

export class LightingManager {
  readonly sunLight: THREE.DirectionalLight;
  readonly ambientLight: THREE.HemisphereLight;
  readonly rimLight: THREE.DirectionalLight;

  constructor(
    scene: THREE.Scene,
    quality?: Pick<QualitySettings, 'shadowEnabled' | 'shadowMapSize'>,
  ) {
    // --- Key Light (sun/moon) with quality-governed shadows ---
    this.sunLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    this.sunLight.position.set(50, 80, 30);
    this.sunLight.castShadow = quality?.shadowEnabled ?? true;
    const shadowMapSize = quality?.shadowMapSize ?? 2048;
    this.sunLight.shadow.mapSize.width = shadowMapSize;
    this.sunLight.shadow.mapSize.height = shadowMapSize;
    this.sunLight.shadow.camera.near = 0.1;
    this.sunLight.shadow.camera.far = 300;
    this.sunLight.shadow.camera.left = -40;
    this.sunLight.shadow.camera.right = 40;
    this.sunLight.shadow.camera.top = 40;
    this.sunLight.shadow.camera.bottom = -40;
    this.sunLight.shadow.bias = -0.001;
    this.sunLight.shadow.normalBias = 0.02;
    scene.add(this.sunLight);

    // --- Fill Light (hemisphere ambient) ---
    this.ambientLight = new THREE.HemisphereLight(0x4488aa, 0x030a14, 0.4);
    scene.add(this.ambientLight);

    // --- Rim Light (back light for silhouette) ---
    this.rimLight = new THREE.DirectionalLight(0x88aacc, 0.3);
    this.rimLight.position.set(-30, 20, -40);
    scene.add(this.rimLight);
  }

  update(weather: RenderWeather, options: LightingOptions = {}): void {
    const v: WeatherVisual = weather.visual;
    const lightning = options.lightning ?? 0;
    const underwater = options.underwaterAttenuation ?? 1;

    // Key light tracks the weather's sun/moon direction.
    this.sunLight.position.set(v.sunDirection.x * 100, v.sunDirection.y * 100, v.sunDirection.z * 100);

    let sunIntensity = v.sunIntensity;
    let ambientIntensity = v.ambientIntensity;
    let rimIntensity = v.rimIntensity;

    // Storm lightning briefly lifts the key + ambient without affecting the
    // authoritative simulation. It is a pure visual additive flash.
    if (lightning > 0) {
      sunIntensity += lightning * 0.9;
      ambientIntensity += lightning * 0.4;
    }

    // Underwater attenuation dims every light by the surviving top-side light.
    sunIntensity *= underwater;
    ambientIntensity *= underwater;
    rimIntensity *= Math.max(underwater, 0.12);

    this.sunLight.color.setHex(v.sunColor);
    this.sunLight.intensity = sunIntensity;
    this.ambientLight.color.setHex(v.ambientTop);
    this.ambientLight.groundColor.setHex(v.ambientBottom);
    this.ambientLight.intensity = ambientIntensity;
    this.rimLight.color.setHex(v.rimColor);
    this.rimLight.intensity = rimIntensity;
  }

  dispose(): void {
    this.sunLight.dispose();
    this.ambientLight.dispose();
    this.rimLight.dispose();
  }
}
