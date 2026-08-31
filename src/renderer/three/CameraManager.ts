/**
 * SILENT DEPTH V2.5 — Camera Manager
 *
 * Cinematic camera system with smooth transitions across six presentation
 * presets (tactical / cinematic / chase / surface / underwater / periscope).
 * Preset framing is resolved by CameraDirector; this manager applies it with
 * bounded smoothing, an optional reveal focus, and a short bounded camera shake.
 *
 * The manager only reads RenderPlayer (position / heading / depth / speed) and
 * an optional focus point; it never writes simulation state.
 */

import * as THREE from 'three';
import type { CameraMode, RenderPlayer } from '../types';
import { PRESET_FOV, resolvePresetParams } from './CameraDirector';
import { createVisualRng, type VisualRng } from '../visualRng';

const RAD = Math.PI / 180;
const MAX_SHAKE = 0.006; // km — bounded so shake never disorients framing

function smoothDamp(current: number, target: number, smoothing: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-smoothing * dt));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class CameraManager {
  readonly worldCamera: THREE.PerspectiveCamera;
  readonly periscopeCamera: THREE.PerspectiveCamera;
  readonly tacticalCamera: THREE.OrthographicCamera;

  private _mode: CameraMode = 'cinematic';
  private _transitionT = 1;
  private _prevMode: CameraMode = 'cinematic';

  // World camera orbit parameters (kilometre world units; hull ≈ 67 m).
  private _orbitDistance = 0.20;
  private _orbitHeight = 0.085;
  private _targetDistance = 0.20;
  private _targetHeight = 0.085;

  private _camPos = new THREE.Vector3();
  private _camLookAt = new THREE.Vector3();
  private _initialized = false;

  private _focus: { x: number; z: number } | null = null;
  private _shake = 0;
  private readonly _visualRng: VisualRng = createVisualRng();

  constructor(width: number, height: number) {
    this.worldCamera = new THREE.PerspectiveCamera(PRESET_FOV.cinematic, width / height, 0.001, 200);
    this.periscopeCamera = new THREE.PerspectiveCamera(PRESET_FOV.periscope, width / height, 0.001, 100);
    const aspect = width / height;
    const frustumSize = 15;
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

  /** Set the reveal focus point (world XZ) or null to release it. */
  setFocus(focus: { x: number; z: number } | null): void {
    this._focus = focus;
  }

  /** Trigger a short, bounded camera shake (combat cue). */
  triggerShake(magnitude: number): void {
    this._shake = Math.min(MAX_SHAKE, Math.max(this._shake, magnitude));
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

  update(player: RenderPlayer, dt: number, wallTime: number = 0): void {
    if (this._transitionT < 1) {
      this._transitionT = Math.min(1, this._transitionT + dt * 2.0);
    }

    const pp = player.position;
    const hdgRad = player.headingDeg * RAD;

    switch (this._mode) {
      case 'periscope': {
        this.periscopeCamera.fov = PRESET_FOV.periscope;
        this.periscopeCamera.updateProjectionMatrix();
        const periHeight = 0.015;
        const eyeY = pp.y + periHeight;
        const sway = Math.sin(wallTime * 0.3) * 0.001;
        this.periscopeCamera.position.set(pp.x + sway, eyeY, pp.z);
        const lookDist = 5;
        const lx = pp.x + Math.sin(hdgRad) * lookDist;
        const lz = pp.z - Math.cos(hdgRad) * lookDist;
        this.periscopeCamera.lookAt(lx, eyeY, lz);
        return;
      }
      case 'tactical': {
        this.tacticalCamera.position.set(pp.x, 50, pp.z);
        this.tacticalCamera.lookAt(pp.x, 0, pp.z);
        return;
      }
      default:
        break;
    }

    // World-family presets (cinematic / chase / surface / underwater).
    const params = resolvePresetParams(this._mode);
    const focus = this._focus;
    const effectiveFov = focus ? Math.max(38, params.fov - 5) : params.fov;

    this._orbitDistance = smoothDamp(this._orbitDistance, params.distance, params.smoothing, dt);
    this._orbitHeight = smoothDamp(this._orbitHeight, params.height, params.smoothing, dt);

    const sinH = Math.sin(hdgRad);
    const cosH = Math.cos(hdgRad);

    const sideOffset = this._orbitDistance * (params.sideOffset / Math.max(0.0001, params.distance));
    const targetX = pp.x - sinH * this._orbitDistance + cosH * sideOffset;
    const targetZ = pp.z + cosH * this._orbitDistance + sinH * sideOffset;

    const underwater = params.underwater || pp.y < -0.014;
    const targetY = underwater
      ? pp.y + this._orbitHeight
      : Math.max(0.03, pp.y + this._orbitHeight);

    let lookX = pp.x + sinH * params.lookAhead;
    let lookZ = pp.z - cosH * params.lookAhead;
    const lookY = underwater ? pp.y + params.lookUpBias * 0.5 : Math.max(-0.012, pp.y + params.lookUpBias);

    // Reveal framing: slowly pan the aim toward the detected ship and tighten the
    // field of view. The smoothing above already provides the slow pan; we only
    // bias the look target, never the gameplay entity.
    if (focus) {
      lookX = lerp(lookX, focus.x, 0.55);
      lookZ = lerp(lookZ, focus.z, 0.55);
    }

    if (!this._initialized) {
      this._camPos.set(targetX, targetY, targetZ);
      this._camLookAt.set(lookX, lookY, lookZ);
      this._initialized = true;
    }

    const smoothFactor = params.smoothing;
    this._camPos.x = smoothDamp(this._camPos.x, targetX, smoothFactor, dt);
    this._camPos.y = smoothDamp(this._camPos.y, targetY, smoothFactor, dt);
    this._camPos.z = smoothDamp(this._camPos.z, targetZ, smoothFactor, dt);
    this._camLookAt.x = smoothDamp(this._camLookAt.x, lookX, smoothFactor, dt);
    this._camLookAt.y = smoothDamp(this._camLookAt.y, lookY, smoothFactor, dt);
    this._camLookAt.z = smoothDamp(this._camLookAt.z, lookZ, smoothFactor, dt);

    // Bounded decay of the combat shake.
    this._shake *= Math.exp(-dt * 6);
    if (this._shake < 1e-5) this._shake = 0;
    const sx = (this._visualRng.next() - 0.5) * 2 * this._shake;
    const sy = (this._visualRng.next() - 0.5) * 2 * this._shake;

    this.worldCamera.position.set(this._camPos.x + sx, this._camPos.y + sy, this._camPos.z);
    this.worldCamera.lookAt(this._camLookAt);
    this.worldCamera.fov = effectiveFov;
    this.worldCamera.updateProjectionMatrix();
  }

  orbit(_dx: number, dy: number): void {
    this._targetHeight = Math.max(0.2, Math.min(5, this._targetHeight + dy * 0.005));
  }

  zoomTactical(factor: number): void {
    const s = 1 / factor;
    this.tacticalCamera.zoom = Math.max(0.2, Math.min(5, this.tacticalCamera.zoom * s));
    this.tacticalCamera.updateProjectionMatrix();
  }
}
