/**
 * SILENT DEPTH V2.0 — Camera Manager (src/renderer/three/CameraManager.ts)
 *
 * Manages three camera modes: World, Periscope, Tactical.
 * Smooth transitions between modes via lerp.
 */

import * as THREE from 'three';
import type { CameraMode, RenderCamera, RenderPlayer, Vec3 } from '../types';

const RAD = Math.PI / 180;

export class CameraManager {
  readonly worldCamera: THREE.PerspectiveCamera;
  readonly periscopeCamera: THREE.PerspectiveCamera;
  readonly tacticalCamera: THREE.OrthographicCamera;

  private _mode: CameraMode = 'world';
  private _transitionT = 1;
  private _prevMode: CameraMode = 'world';

  // World camera orbit parameters
  private _orbitDistance = 2.5; // km behind/above sub
  private _orbitHeight = 1.2;   // km above surface
  private _orbitAngle = 0;    // radians around the sub

  constructor(width: number, height: number) {
    this.worldCamera = new THREE.PerspectiveCamera(60, width / height, 0.01, 200);
    this.periscopeCamera = new THREE.PerspectiveCamera(40, width / height, 0.001, 100);
    const aspect = width / height;
    const frustumSize = 15; // km
    this.tacticalCamera = new THREE.OrthographicCamera(
      -frustumSize * aspect / 2, frustumSize * aspect / 2,
      frustumSize / 2, -frustumSize / 2,
      0.01, 200,
    );
    this.tacticalCamera.position.set(0, 50, 0);
    this.tacticalCamera.lookAt(0, 0, 0);
  }

  get activeCamera(): THREE.Camera {
    switch (this._mode) {
      case 'periscope': return this.periscopeCamera;
      case 'tactical': return this.tacticalCamera;
      default: return this.worldCamera;
    }
  }

  get mode(): CameraMode { return this._mode; }

  setMode(mode: CameraMode): void {
    if (mode === this._mode) return;
    this._prevMode = this._mode;
    this._mode = mode;
    this._transitionT = 0;
  }

  resize(width: number, height: number): void {
    const aspect = width / height;
    this.worldCamera.aspect = aspect;
    this.worldCamera.updateProjectionMatrix();
    this.periscopeCamera.aspect = aspect;
    this.periscopeCamera.updateProjectionMatrix();
    const frustumSize = 15;
    this.tacticalCamera.left = -frustumSize * aspect / 2;
    this.tacticalCamera.right = frustumSize * aspect / 2;
    this.tacticalCamera.top = frustumSize / 2;
    this.tacticalCamera.bottom = -frustumSize / 2;
    this.tacticalCamera.updateProjectionMatrix();
  }

  /**
   * Update camera positions based on render state.
   * Call once per frame before rendering.
   */
  update(player: RenderPlayer, dt: number): void {
    // Smooth transition
    if (this._transitionT < 1) {
      this._transitionT = Math.min(1, this._transitionT + dt * 2.5); // ~0.4s transition
    }

    const pp = player.position;
    const hdgRad = player.headingDeg * RAD;

    switch (this._mode) {
      case 'world': {
        // Third-person elevated follow camera
        const sinH = Math.sin(hdgRad);
        const cosH = Math.cos(hdgRad);
        // Position behind and above the submarine
        const camX = pp.x - sinH * this._orbitDistance;
        const camZ = pp.z + cosH * this._orbitDistance; // note: z is -north
        const camY = Math.max(0.3, pp.y + this._orbitHeight);

        this.worldCamera.position.set(camX, camY, camZ);
        // Look slightly ahead of the sub
        const lookX = pp.x + sinH * 0.5;
        const lookZ = pp.z - cosH * 0.5;
        this.worldCamera.lookAt(lookX, pp.y, lookZ);
        break;
      }
      case 'periscope': {
        // First-person at conning tower height
        const periHeight = 0.015; // ~15m above sub center in km
        const eyeY = pp.y + periHeight;
        this.periscopeCamera.position.set(pp.x, eyeY, pp.z);
        // Look in heading direction
        const lookDist = 5; // km
        const lx = pp.x + Math.sin(hdgRad) * lookDist;
        const lz = pp.z - Math.cos(hdgRad) * lookDist;
        this.periscopeCamera.lookAt(lx, eyeY, lz);
        break;
      }
      case 'tactical': {
        // Top-down orthographic centered on player
        this.tacticalCamera.position.set(pp.x, 50, pp.z);
        this.tacticalCamera.lookAt(pp.x, 0, pp.z);
        break;
      }
    }
  }

  /** Orbit the world camera around the player (mouse drag). */
  orbit(dx: number, dy: number): void {
    this._orbitAngle += dx * 0.005;
    this._orbitHeight = Math.max(0.2, Math.min(5, this._orbitHeight + dy * 0.005));
  }

  /** Zoom the tactical camera. */
  zoomTactical(factor: number): void {
    const s = 1 / factor;
    this.tacticalCamera.zoom = Math.max(0.2, Math.min(5, this.tacticalCamera.zoom * s));
    this.tacticalCamera.updateProjectionMatrix();
  }
}
