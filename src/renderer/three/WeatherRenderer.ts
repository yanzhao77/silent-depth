/**
 * SILENT DEPTH V2.0 — Weather Renderer (src/renderer/three/WeatherRenderer.ts)
 *
 * Visual weather effects: rain particles (Storm), volumetric fog layers.
 */

import * as THREE from 'three';
import type { RenderWeather } from '../types';

export class WeatherRenderer {
  private _scene: THREE.Scene;
  private _rainParticles: THREE.Points | null = null;
  private _rainGeometry: THREE.BufferGeometry | null = null;
  private _rainCount = 3000;

  constructor(scene: THREE.Scene) {
    this._scene = scene;
  }

  update(weather: RenderWeather, playerX: number, playerZ: number, dt: number): void {
    // Update fog density on scene
    if (this._scene.fog instanceof THREE.FogExp2) {
      this._scene.fog.density = weather.fogDensity;
      if (weather.isNight) {
        this._scene.fog.color.setHex(0x020408);
      } else if (weather.kind === 'Fog') {
        this._scene.fog.color.setHex(0x9fb4c7);
      } else if (weather.kind === 'Storm') {
        this._scene.fog.color.setHex(0x0a1626);
      } else {
        this._scene.fog.color.setHex(0x050a12);
      }
    }

    // Rain particles for Storm
    if (weather.kind === 'Storm') {
      if (!this._rainParticles) {
        this._createRain();
      }
      if (this._rainParticles) {
        this._rainParticles.visible = true;
        this._rainParticles.position.set(playerX, 0, playerZ);
        // Animate rain falling
        const positions = this._rainGeometry!.attributes.position;
        if (positions) {
          const arr = positions.array as Float32Array;
          for (let i = 1; i < arr.length; i += 3) {
            arr[i]! -= dt * 15; // Fall speed
            if (arr[i]! < -2) arr[i] = 5; // Reset to top
          }
          positions.needsUpdate = true;
        }
      }
    } else {
      if (this._rainParticles) {
        this._rainParticles.visible = false;
      }
    }
  }

  private _createRain(): void {
    this._rainGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this._rainCount * 3);
    for (let i = 0; i < this._rainCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 10;     // x spread
      positions[i * 3 + 1] = Math.random() * 5;           // y height
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10; // z spread
    }
    this._rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xaabbcc,
      size: 0.02,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });

    this._rainParticles = new THREE.Points(this._rainGeometry, material);
    this._scene.add(this._rainParticles);
  }

  dispose(): void {
    if (this._rainParticles) {
      this._scene.remove(this._rainParticles);
      this._rainGeometry?.dispose();
      (this._rainParticles.material as THREE.Material).dispose();
    }
  }
}
