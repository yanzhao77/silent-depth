/**
 * SILENT DEPTH V2.0 — Ship Renderer (src/renderer/three/ShipRenderer.ts)
 *
 * Manages 3D ship meshes in the scene. Creates procedural geometry per
 * ship class, caches geometries/materials, and updates positions each frame.
 */

import * as THREE from 'three';
import { createShipGeometry } from '../procedural/shipGeometry';
import type { RenderShip } from '../types';

const RAD = Math.PI / 180;

export class ShipRenderer {
  private _scene: THREE.Scene;
  private _meshes = new Map<string, THREE.Group>();
  private _geometryCache = new Map<string, THREE.Group>();

  constructor(scene: THREE.Scene) {
    this._scene = scene;
  }

  update(ships: RenderShip[], wallTime: number): void {
    const activeIds = new Set<string>();

    for (const ship of ships) {
      activeIds.add(ship.id);

      if (!ship.visible) {
        // Hide undetected ships
        const existing = this._meshes.get(ship.id);
        if (existing) existing.visible = false;
        continue;
      }

      let group = this._meshes.get(ship.id);
      if (!group) {
        // Create or clone from cache
        const cached = this._geometryCache.get(ship.shipClass);
        if (cached) {
          group = cached.clone();
        } else {
          group = createShipGeometry(ship.shipClass);
          this._geometryCache.set(ship.shipClass, group);
          group = group.clone();
        }
        this._scene.add(group);
        this._meshes.set(ship.id, group);
      }

      group.visible = true;
      group.position.set(ship.position.x, ship.position.y, ship.position.z);

      // Rotate to match heading (engine: 0=north CW → Three.js Y rotation)
      // In Three.js with our coord mapping, heading rotation is around Y axis
      group.rotation.y = -ship.headingDeg * RAD + Math.PI / 2;

      // Subtle bob on waves
      const bob = Math.sin(wallTime * 1.5 + ship.position.x * 10) * 0.0005;
      group.position.y += bob;

      // AI state visual coding: hunting ships get a subtle red tint
      if (ship.aiState === 'HUNTING') {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.emissive.setHex(0x330000);
            child.material.emissiveIntensity = 0.3;
          }
        });
      } else {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.emissive.setHex(0x000000);
            child.material.emissiveIntensity = 0;
          }
        });
      }
    }

    // Remove ships no longer in the list
    for (const [id, mesh] of this._meshes) {
      if (!activeIds.has(id)) {
        this._scene.remove(mesh);
        this._meshes.delete(id);
      }
    }
  }

  dispose(): void {
    for (const [, group] of this._meshes) {
      this._scene.remove(group);
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material?.dispose();
        }
      });
    }
    this._meshes.clear();
    this._geometryCache.clear();
  }
}
