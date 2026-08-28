/**
 * SILENT DEPTH V2.1 — Effects Manager
 *
 * Enhanced visual effects:
 * - SonarPing: expanding ring with secondary wave
 * - Explosion: multi-phase (flash + debris + smoke + water column)
 * - DepthCharge: water geyser with shockwave
 * - ShipWake: V-shaped foam trail
 * - BubbleTrail: torpedo wake bubbles
 *
 * Pooled — no per-frame allocation.
 */

import * as THREE from 'three';
import type { RenderEffect } from '../types';

interface ActivePing {
  fxId: string;
  ring1: THREE.Mesh;
  ring2: THREE.Mesh;
}

interface ActiveExplosion {
  fxId: string;
  group: THREE.Group;
  flash: THREE.PointLight;
  particles: THREE.Points;
  shockwave: THREE.Mesh;
  waterColumn: THREE.Mesh;
  debrisGeo: THREE.BufferGeometry;
  debris: THREE.Points;
}

export class EffectsManager {
  private _scene: THREE.Scene;

  // Ping pools
  private _pings: ActivePing[] = [];
  private _pingGeo: THREE.RingGeometry;
  private _pingMat: THREE.MeshBasicMaterial;

  // Explosion pools
  private _explosions: ActiveExplosion[] = [];
  private _particleGeo: THREE.BufferGeometry;
  private _particleMat: THREE.PointsMaterial;

  constructor(scene: THREE.Scene, particleCount: number = 40) {
    this._scene = scene;

    // --- Sonar ping ---
    this._pingGeo = new THREE.RingGeometry(0.01, 0.014, 64);
    this._pingGeo.rotateX(-Math.PI / 2);
    this._pingMat = new THREE.MeshBasicMaterial({
      color: 0x7fd8d8,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // --- Explosion particles ---
    const pCount = Math.max(12, Math.floor(particleCount));
    const positions = new Float32Array(pCount * 3);
    const velocities = new Float32Array(pCount * 3);
    const sizes = new Float32Array(pCount);
    for (let i = 0; i < pCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.7; // Bias upward
      const speed = 0.3 + Math.random() * 1.8;
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i * 3 + 1] = Math.abs(Math.cos(phi)) * speed * 1.8;
      velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;
      sizes[i] = 0.02 + Math.random() * 0.03;
    }
    this._particleGeo = new THREE.BufferGeometry();
    this._particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._particleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    this._particleGeo.userData = { velocities };
    this._particleMat = new THREE.PointsMaterial({
      color: 0xffd479,
      size: 0.025,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
  }

  update(effects: RenderEffect[], dt: number): void {
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
    let ping = this._pings.find((p) => p.fxId === fx.id);
    if (!ping) {
      const ring1 = new THREE.Mesh(this._pingGeo, this._pingMat.clone());
      const ring2 = new THREE.Mesh(this._pingGeo, this._pingMat.clone());
      ring1.position.set(fx.position.x, 0.002, fx.position.z);
      ring2.position.set(fx.position.x, 0.002, fx.position.z);
      this._scene.add(ring1);
      this._scene.add(ring2);
      ping = { fxId: fx.id, ring1, ring2 };
      this._pings.push(ping);
    }

    const progress = fx.age / fx.maxAge;
    const radiusKm = progress * (fx.params.speedKmPerS ?? 1) * fx.maxAge;
    const scale = Math.max(0.01, radiusKm / 0.01);

    // Primary ring
    ping.ring1.scale.set(scale, scale, scale);
    (ping.ring1.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - progress);

    // Secondary ring (delayed)
    const p2 = Math.max(0, progress - 0.15);
    const scale2 = Math.max(0.01, (p2 / 0.85) * radiusKm / 0.01);
    ping.ring2.scale.set(scale2, scale2, scale2);
    (ping.ring2.material as THREE.MeshBasicMaterial).opacity = 0.4 * Math.max(0, 1 - p2 / 0.85);
  }

  private _renderExplosion(fx: RenderEffect, dt: number): void {
    let exp = this._explosions.find((e) => e.fxId === fx.id);
    if (!exp) {
      const group = new THREE.Group();
      group.position.set(fx.position.x, fx.position.y, fx.position.z);

      const isDepthCharge = fx.type === 'depthCharge';
      // A torpedo hit reads warm and brief; a depth charge is colder and wider.
      // Both are visual-only reflections of an effect already emitted by the
      // simulation adapter.
      const flash = new THREE.PointLight(isDepthCharge ? 0xd7ecff : 0xffa94d, isDepthCharge ? 8 : 12, isDepthCharge ? 0.72 : 0.56);
      group.add(flash);

      // Particles
      const particles = new THREE.Points(this._particleGeo.clone(), this._particleMat.clone());
      const particleMat = particles.material as THREE.PointsMaterial;
      particleMat.color.setHex(isDepthCharge ? 0xb9d7e5 : 0xffd479);
      particleMat.size = isDepthCharge ? 0.030 : 0.025;
      group.add(particles);

      // Surface/underwater shockwave ring
      const shockGeo = new THREE.RingGeometry(0.01, 0.016, 64);
      shockGeo.rotateX(-Math.PI / 2);
      const shockMat = new THREE.MeshBasicMaterial({
        color: isDepthCharge ? 0xc9e2ed : 0xffe1a3,
        transparent: true,
        opacity: isDepthCharge ? 0.48 : 0.60,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const shockwave = new THREE.Mesh(shockGeo, shockMat);
      group.add(shockwave);

      // A depth charge is legible as a cold, vertical water column rather than
      // a recoloured torpedo hit. It is spawned only after the adapter has
      // emitted the same pre-existing depthCharge effect.
      const columnGeo = new THREE.ConeGeometry(0.06, 0.52, 18, 1, true);
      const columnMat = new THREE.MeshBasicMaterial({
        color: isDepthCharge ? 0xc8e7f4 : 0xffc36e,
        transparent: true,
        opacity: isDepthCharge ? 0.42 : 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const waterColumn = new THREE.Mesh(columnGeo, columnMat);
      waterColumn.position.y = isDepthCharge ? 0.18 : 0.04;
      waterColumn.visible = isDepthCharge;
      group.add(waterColumn);

      // Debris (larger chunks)
      const debrisCount = 8;
      const dPos = new Float32Array(debrisCount * 3);
      const dVel = new Float32Array(debrisCount * 3);
      for (let i = 0; i < debrisCount; i++) {
        dPos[i * 3] = 0;
        dPos[i * 3 + 1] = 0;
        dPos[i * 3 + 2] = 0;
        const theta = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * 1.5;
        dVel[i * 3] = Math.cos(theta) * speed;
        dVel[i * 3 + 1] = 2 + Math.random() * 3;
        dVel[i * 3 + 2] = Math.sin(theta) * speed;
      }
      const debrisGeo = new THREE.BufferGeometry();
      debrisGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
      debrisGeo.userData = { velocities: dVel };
      const debrisMat = new THREE.PointsMaterial({
        color: 0x666666,
        size: 0.06,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      });
      const debris = new THREE.Points(debrisGeo, debrisMat);
      group.add(debris);

      this._scene.add(group);
      exp = { fxId: fx.id, group, flash, particles, shockwave, waterColumn, debrisGeo, debris };
      this._explosions.push(exp);
    }

    const progress = fx.age / fx.maxAge;
    const scale = (fx.params.scale ?? 1) * (fx.type === 'depthCharge' ? 0.024 : 0.020);

    const isDepthCharge = fx.type === 'depthCharge';
    // Flash fades fast enough to avoid persistent point-light cost while the
    // ring and particles carry the longer visual read.
    exp.flash.intensity = Math.max(0, (isDepthCharge ? 8 : 12) * (1 - progress * 4.2));

    // Particles
    const positions = exp.particles.geometry.attributes.position;
    if (positions) {
      const arr = positions.array as Float32Array;
      const vels = this._particleGeo.userData.velocities as Float32Array;
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3] = vels[i * 3]! * fx.age * scale;
        arr[i * 3 + 1] = vels[i * 3 + 1]! * fx.age * scale - 0.5 * fx.age * fx.age;
        arr[i * 3 + 2] = vels[i * 3 + 2]! * fx.age * scale;
      }
      positions.needsUpdate = true;
    }
    (exp.particles.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - progress);
    const mat = exp.particles.material as THREE.PointsMaterial;
    if (isDepthCharge) {
      if (progress < 0.16) mat.color.setHex(0xe5f3ff);
      else if (progress < 0.52) mat.color.setHex(0x7faaba);
      else mat.color.setHex(0x355563);
    } else if (progress < 0.18) mat.color.setHex(0xfff0ad);
    else if (progress < 0.52) mat.color.setHex(0xff6b35);
    else mat.color.setHex(0x43241d);

    // Shockwave is broader for a depth charge, but remains subordinate to the
    // existing tactical uncertainty overlay.
    const shockScale = progress * (isDepthCharge ? 0.44 : 0.30);
    exp.shockwave.scale.set(shockScale, shockScale, shockScale);
    (exp.shockwave.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (isDepthCharge ? 0.42 : 0.55) * (1 - progress * 1.9));

    const columnMaterial = exp.waterColumn.material as THREE.MeshBasicMaterial;
    if (isDepthCharge) {
      const plume = Math.sin(Math.min(1, progress / 0.42) * Math.PI * 0.5);
      exp.waterColumn.visible = plume > 0.01;
      exp.waterColumn.scale.set(1 + plume * 1.7, 0.35 + plume * 2.2, 1 + plume * 1.7);
      columnMaterial.opacity = Math.max(0, 0.46 * plume * (1 - progress * 0.72));
    }

    // Debris
    const dPos = exp.debrisGeo.attributes.position;
    if (dPos) {
      const arr = dPos.array as Float32Array;
      const dVel = exp.debrisGeo.userData.velocities as Float32Array;
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3] = dVel[i * 3]! * fx.age * scale * 0.5;
        arr[i * 3 + 1] = dVel[i * 3 + 1]! * fx.age * scale * 0.3 - 0.8 * fx.age * fx.age;
        arr[i * 3 + 2] = dVel[i * 3 + 2]! * fx.age * scale * 0.5;
      }
      dPos.needsUpdate = true;
    }
    (exp.debris.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - progress * 1.2);
  }

  private _cleanupExpired(activeEffects: RenderEffect[]): void {
    const activeIds = new Set(activeEffects.map((e) => e.id));

    for (let i = this._pings.length - 1; i >= 0; i--) {
      const ping = this._pings[i]!;
      if (!activeIds.has(ping.fxId)) {
        this._scene.remove(ping.ring1);
        this._scene.remove(ping.ring2);
        (ping.ring1.material as THREE.Material).dispose();
        (ping.ring2.material as THREE.Material).dispose();
        this._pings.splice(i, 1);
      }
    }

    for (let i = this._explosions.length - 1; i >= 0; i--) {
      const exp = this._explosions[i]!;
      if (!activeIds.has(exp.fxId)) {
        this._scene.remove(exp.group);
        exp.flash.dispose();
        exp.particles.geometry.dispose();
        (exp.particles.material as THREE.Material).dispose();
        exp.shockwave.geometry.dispose();
        (exp.shockwave.material as THREE.Material).dispose();
        exp.waterColumn.geometry.dispose();
        (exp.waterColumn.material as THREE.Material).dispose();
        exp.debrisGeo.dispose();
        (exp.debris.material as THREE.Material).dispose();
        this._explosions.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this._pingGeo.dispose();
    this._pingMat.dispose();
    this._particleGeo.dispose();
    this._particleMat.dispose();
    for (const ping of this._pings) {
      this._scene.remove(ping.ring1);
      this._scene.remove(ping.ring2);
    }
    for (const exp of this._explosions) {
      this._scene.remove(exp.group);
    }
    this._pings.length = 0;
    this._explosions.length = 0;
  }
}
