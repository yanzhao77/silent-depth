/**
 * SILENT DEPTH V2.0 — Effects Manager (src/renderer/three/EffectsManager.ts)
 *
 * Unified visual effects system for combat and sonar visuals:
 * - SonarPing: expanding ring from submarine
 * - Explosion: water column + flash + shockwave
 * - DepthCharge: water geyser
 * - TorpedoWake: bubble trail
 * - ShipWake: V-shaped foam trail
 *
 * All effects are pooled — no per-frame allocation.
 */

import * as THREE from 'three';
import type { RenderEffect } from '../types';

export class EffectsManager {
  private _scene: THREE.Scene;
  
  // Ping rings pool
  private _pingRings: THREE.Mesh[] = [];
  private _pingGeo: THREE.RingGeometry;
  private _pingMat: THREE.MeshBasicMaterial;
  
  // Explosion particles pool
  private _explosionGroups: THREE.Points[] = [];
  private _explosionGeo: THREE.BufferGeometry;
  private _explosionMat: THREE.PointsMaterial;

  constructor(scene: THREE.Scene) {
    this._scene = scene;
    
    // Pre-create ping ring geometry/material
    this._pingGeo = new THREE.RingGeometry(0.01, 0.015, 64);
    this._pingGeo.rotateX(-Math.PI / 2);
    this._pingMat = new THREE.MeshBasicMaterial({
      color: 0x7fd8d8,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Pre-create explosion particle geometry
    const particleCount = 30;
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      // Random outward velocity
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 0.5 + Math.random() * 1.5;
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i * 3 + 1] = Math.abs(Math.cos(phi)) * speed * 1.5; // Upward bias
      velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;
    }
    this._explosionGeo = new THREE.BufferGeometry();
    this._explosionGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._explosionGeo.userData = { velocities };
    this._explosionMat = new THREE.PointsMaterial({
      color: 0xffd479,
      size: 0.03,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
  }

  update(effects: RenderEffect[], dt: number): void {
    // Clean up old meshes
    this._cleanupExpired(effects);

    for (const fx of effects) {
      switch (fx.type) {
        case 'sonarPing':
          this._renderPing(fx);
          break;
        case 'explosion':
        case 'depthCharge':
          this._renderExplosion(fx, dt);
          break;
        default:
          break;
      }
    }
  }

  private _renderPing(fx: RenderEffect): void {
    // Find or create a ring mesh for this effect
    let ring = this._pingRings.find((r) => r.userData.fxId === fx.id);
    if (!ring) {
      ring = new THREE.Mesh(this._pingGeo, this._pingMat.clone());
      ring.userData = { fxId: fx.id };
      ring.position.set(fx.position.x, 0.001, fx.position.z);
      this._scene.add(ring);
      this._pingRings.push(ring);
    }

    // Expand ring based on age
    const progress = fx.age / fx.maxAge;
    const radiusKm = progress * (fx.params.speedKmPerS ?? 1) * fx.maxAge;
    const scale = Math.max(0.01, radiusKm / 0.01); // Scale relative to base geometry
    ring.scale.set(scale, scale, scale);
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - progress);
  }

  private _renderExplosion(fx: RenderEffect, dt: number): void {
    let points = this._explosionGroups.find((p) => p.userData.fxId === fx.id);
    if (!points) {
      const geo = this._explosionGeo.clone();
      points = new THREE.Points(geo, this._explosionMat.clone());
      points.userData = { fxId: fx.id, initialPos: { ...fx.position } };
      points.position.set(fx.position.x, fx.position.y, fx.position.z);
      this._scene.add(points);
      this._explosionGroups.push(points);
    }

    const progress = fx.age / fx.maxAge;
    const scale = (fx.params.scale ?? 1) * 0.02;

    // Animate particles outward
    const positions = points.geometry.attributes.position;
    if (positions) {
      const arr = positions.array as Float32Array;
      const vels = this._explosionGeo.userData.velocities as Float32Array;
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3] = vels[i * 3]! * fx.age * scale;
        arr[i * 3 + 1] = vels[i * 3 + 1]! * fx.age * scale - 0.5 * fx.age * fx.age;
        arr[i * 3 + 2] = vels[i * 3 + 2]! * fx.age * scale;
      }
      positions.needsUpdate = true;
    }

    // Fade out
    (points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - progress);
    // Color shift: yellow → orange → red
    const mat = points.material as THREE.PointsMaterial;
    if (progress < 0.3) mat.color.setHex(0xffd479);
    else if (progress < 0.6) mat.color.setHex(0xff6b35);
    else mat.color.setHex(0x7a2f22);
  }

  private _cleanupExpired(activeEffects: RenderEffect[]): void {
    const activeIds = new Set(activeEffects.map((e) => e.id));

    for (let i = this._pingRings.length - 1; i >= 0; i--) {
      const ring = this._pingRings[i]!;
      if (!activeIds.has(ring.userData.fxId)) {
        this._scene.remove(ring);
        (ring.material as THREE.Material).dispose();
        this._pingRings.splice(i, 1);
      }
    }

    for (let i = this._explosionGroups.length - 1; i >= 0; i--) {
      const pts = this._explosionGroups[i]!;
      if (!activeIds.has(pts.userData.fxId)) {
        this._scene.remove(pts);
        pts.geometry.dispose();
        (pts.material as THREE.Material).dispose();
        this._explosionGroups.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this._pingGeo.dispose();
    this._pingMat.dispose();
    this._explosionGeo.dispose();
    this._explosionMat.dispose();
    for (const ring of this._pingRings) {
      this._scene.remove(ring);
      (ring.material as THREE.Material).dispose();
    }
    for (const pts of this._explosionGroups) {
      this._scene.remove(pts);
      pts.geometry.dispose();
      (pts.material as THREE.Material).dispose();
    }
  }
}
