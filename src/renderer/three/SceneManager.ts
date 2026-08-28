/**
 * SILENT DEPTH V2.0 — Three.js Scene Manager (src/renderer/three/SceneManager.ts)
 *
 * Manages the Three.js WebGLRenderer, Scene, and resize lifecycle.
 * Creates a cinematic dark-ocean backdrop with proper tone mapping.
 */

import * as THREE from 'three';

export interface SceneManagerOptions {
  canvas: HTMLCanvasElement;
  /** Initial viewport width in CSS pixels. */
  width: number;
  /** Initial viewport height in CSS pixels. */
  height: number;
}

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;

  private _width: number;
  private _height: number;

  constructor(opts: SceneManagerOptions) {
    this._width = opts.width;
    this._height = opts.height;

    // WebGL2 renderer with cinematic settings
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(opts.width, opts.height, false); // false = don't set CSS size
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.85;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Scene with deep ocean fog color
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050a12);
    this.scene.fog = new THREE.FogExp2(0x050a12, 0.008);
  }

  get width(): number { return this._width; }
  get height(): number { return this._height; }

  resize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
  }

  /**
   * Push the active atmosphere (fog colour + density) into the scene. This is
   * the single owned place where scene fog is set; weather and underwater
   * visuals feed their resolved colours through here rather than mutating the
   * scene directly. The background colour follows the fog so the far horizon
   * stays consistent with the sky dome behind it.
   */
  setAtmosphere(fogColor: number, fogDensity: number): void {
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(fogColor);
      this.scene.fog.density = fogDensity;
    }
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.setHex(fogColor);
    }
  }

  render(camera: THREE.Camera): void {
    this.renderer.render(this.scene, camera);
  }

  dispose(): void {
    this.renderer.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
  }
}
