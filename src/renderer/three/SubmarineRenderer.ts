/**
 * SILENT DEPTH V2.0 — Submarine Renderer (src/renderer/three/SubmarineRenderer.ts)
 *
 * Manages the player submarine 3D mesh with animated parts:
 * - Periscope raise/lower/rotate
 * - Propeller spin (speed-dependent)
 * - Rudder turn
 * - Pitch during depth transitions
 * - Roll at speed
 */

import * as THREE from 'three';
import { createSubmarineGeometry, type SubmarineParts } from '../procedural/submarineGeometry';
import type { RenderPlayer } from '../types';

const RAD = Math.PI / 180;

export class SubmarineRenderer {
  readonly group: THREE.Group;
  private _parts: SubmarineParts;
  private _propAngle = 0;

  constructor(scene: THREE.Scene) {
    this._parts = createSubmarineGeometry();
    this.group = this._parts.group;
    scene.add(this.group);
  }

  update(player: RenderPlayer, wallTime: number, dt: number): void {
    // Position
    this.group.position.set(player.position.x, player.position.y, player.position.z);

    // Heading rotation (around Y axis)
    this.group.rotation.y = -player.headingDeg * RAD + Math.PI / 2;

    // Pitch (depth transition visual)
    const targetPitch = player.pitchDeg * RAD;
    this.group.rotation.z = targetPitch;

    // Roll (speed-dependent subtle roll)
    this.group.rotation.x = player.rollDeg * RAD;

    // --- Periscope animation ---
    const ps = player.periscopeState;
    const peri = this._parts.periscope;
    if (ps.state === 'RAISED' || ps.state === 'OBSERVING') {
      peri.visible = true;
      peri.scale.y = 1;
      peri.position.y = 0.023; // Fully extended
    } else if (ps.state === 'RAISING') {
      peri.visible = true;
      peri.scale.y = ps.progress;
      peri.position.y = 0.008 + 0.015 * ps.progress;
    } else if (ps.state === 'LOWERING') {
      peri.visible = true;
      peri.scale.y = 1 - ps.progress;
      peri.position.y = 0.008 + 0.015 * (1 - ps.progress);
    } else {
      peri.visible = false;
    }

    // --- Propeller animation ---
    if (player.speedKt > 0.1) {
      const rps = player.speedKt * 0.5; // Revolutions per second proportional to speed
      this._propAngle += rps * dt * Math.PI * 2;
      this._parts.propeller.rotation.x = this._propAngle;
    }

    // --- Rudder animation ---
    // Rudder turns slightly based on heading change rate (visual only)
    // For now, static centered
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material?.dispose();
      }
    });
  }
}
