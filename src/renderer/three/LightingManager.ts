/**
 * SILENT DEPTH V2.0 — Lighting Manager (src/renderer/three/LightingManager.ts)
 *
 * Manages directional (sun/moon), hemisphere (ambient), and point lights.
 * Adjusts intensity/color based on weather and time of day.
 */

import * as THREE from 'three';
import type { RenderWeather } from '../types';

export class LightingManager {
  readonly sunLight: THREE.DirectionalLight;
  readonly ambientLight: THREE.HemisphereLight;

  constructor(scene: THREE.Scene) {
    // Sun/moon directional light with shadows
    this.sunLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    this.sunLight.position.set(50, 80, 30);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 0.1;
    this.sunLight.shadow.camera.far = 200;
    this.sunLight.shadow.camera.left = -30;
    this.sunLight.shadow.camera.right = 30;
    this.sunLight.shadow.camera.top = 30;
    this.sunLight.shadow.camera.bottom = -30;
    scene.add(this.sunLight);

    // Hemisphere light for ambient fill
    this.ambientLight = new THREE.HemisphereLight(0x4488aa, 0x050a12, 0.4);
    scene.add(this.ambientLight);
  }

  update(weather: RenderWeather): void {
    if (weather.isNight) {
      // Moonlight: dim, blue-tinted
      this.sunLight.color.setHex(0x8899bb);
      this.sunLight.intensity = 0.15;
      this.sunLight.position.set(30, -20, 50); // Below horizon-ish
      this.ambientLight.color.setHex(0x112233);
      this.ambientLight.groundColor.setHex(0x020408);
      this.ambientLight.intensity = 0.15;
    } else if (weather.kind === 'Storm') {
      // Overcast: very dim, grey
      this.sunLight.color.setHex(0x667788);
      this.sunLight.intensity = 0.3;
      this.sunLight.position.set(20, 30, 40);
      this.ambientLight.color.setHex(0x334455);
      this.ambientLight.groundColor.setHex(0x0a1626);
      this.ambientLight.intensity = 0.35;
    } else if (weather.kind === 'Fog') {
      // Diffused light
      this.sunLight.color.setHex(0xaabbcc);
      this.sunLight.intensity = 0.5;
      this.sunLight.position.set(40, 60, 30);
      this.ambientLight.color.setHex(0x667788);
      this.ambientLight.groundColor.setHex(0x0d2233);
      this.ambientLight.intensity = 0.4;
    } else if (weather.kind === 'Cloudy') {
      // Soft overcast
      this.sunLight.color.setHex(0xccddee);
      this.sunLight.intensity = 0.7;
      this.sunLight.position.set(45, 70, 30);
      this.ambientLight.color.setHex(0x556677);
      this.ambientLight.groundColor.setHex(0x0d2233);
      this.ambientLight.intensity = 0.35;
    } else {
      // Clear daylight
      this.sunLight.color.setHex(0xffeedd);
      this.sunLight.intensity = 1.2;
      this.sunLight.position.set(50, 80, 30);
      this.ambientLight.color.setHex(0x4488aa);
      this.ambientLight.groundColor.setHex(0x050a12);
      this.ambientLight.intensity = 0.4;
    }
  }

  dispose(): void {
    this.sunLight.dispose();
  }
}
