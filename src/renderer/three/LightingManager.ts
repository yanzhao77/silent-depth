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

export class LightingManager {
  readonly sunLight: THREE.DirectionalLight;
  readonly ambientLight: THREE.HemisphereLight;
  readonly rimLight: THREE.DirectionalLight;

  constructor(scene: THREE.Scene) {
    // --- Key Light (sun/moon) with shadows ---
    this.sunLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    this.sunLight.position.set(50, 80, 30);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
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

  update(weather: RenderWeather): void {
    if (weather.isNight) {
      // Moonlight retains a narrow cool rim and enough ambient lift to read a
      // wet hull, while keeping the surrounding ocean genuinely dark.
      this.sunLight.color.setHex(0xaec4dc);
      this.sunLight.intensity = 0.56;
      this.sunLight.position.set(30, 45, 50);
      this.ambientLight.color.setHex(0x21495d);
      this.ambientLight.groundColor.setHex(0x02070d);
      this.ambientLight.intensity = 0.36;
      this.rimLight.color.setHex(0x5c8bab);
      this.rimLight.intensity = 0.36;
      this.rimLight.position.set(-24, 22, -34);
    } else if (weather.kind === 'Storm') {
      // Storms compress contrast rather than removing all form definition.
      this.sunLight.color.setHex(0x8398aa);
      this.sunLight.intensity = 0.57;
      this.sunLight.position.set(20, 25, 40);
      this.ambientLight.color.setHex(0x3d5969);
      this.ambientLight.groundColor.setHex(0x07111f);
      this.ambientLight.intensity = 0.41;
      this.rimLight.color.setHex(0x63859b);
      this.rimLight.intensity = 0.27;
    } else if (weather.kind === 'Fog') {
      // Fog diffuses source light; a soft rim keeps close tactical geometry
      // separable without making silhouettes visible through the fog volume.
      this.sunLight.color.setHex(0xb5c5d0);
      this.sunLight.intensity = 0.62;
      this.sunLight.position.set(40, 55, 30);
      this.ambientLight.color.setHex(0x647786);
      this.ambientLight.groundColor.setHex(0x0d2233);
      this.ambientLight.intensity = 0.39;
      this.rimLight.color.setHex(0x7c91a0);
      this.rimLight.intensity = 0.20;
    } else if (weather.kind === 'Cloudy') {
      // Soft overcast uses cool naval tones and a controlled rear rim.
      this.sunLight.color.setHex(0xd0dfeb);
      this.sunLight.intensity = 0.82;
      this.sunLight.position.set(45, 65, 30);
      this.ambientLight.color.setHex(0x566b79);
      this.ambientLight.groundColor.setHex(0x0d2233);
      this.ambientLight.intensity = 0.36;
      this.rimLight.color.setHex(0x99afbd);
      this.rimLight.intensity = 0.24;
    } else {
      // Clear daylight — warm, cinematic
      this.sunLight.color.setHex(0xffeedd);
      this.sunLight.intensity = 1.3;
      this.sunLight.position.set(50, 80, 30);
      this.ambientLight.color.setHex(0x3a6a88);
      this.ambientLight.groundColor.setHex(0x030a14);
      this.ambientLight.intensity = 0.35;
      this.rimLight.color.setHex(0x88aacc);
      this.rimLight.intensity = 0.25;
      this.rimLight.position.set(-35, 15, -45);
    }
  }

  dispose(): void {
    this.sunLight.dispose();
    this.ambientLight.dispose();
    this.rimLight.dispose();
  }
}
