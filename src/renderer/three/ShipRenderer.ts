/**
 * SILENT DEPTH V2.2 — Naval Ship Renderer
 *
 * Resolves local procedural naval families into distance-driven LOD roots. This
 * renderer consumes RenderShip only; visibility and AI state remain simulation
 * facts, while bobbing and warning tint are presentation-only.
 */

import * as THREE from 'three';
import { createShipLodGeometry } from '../procedural/shipGeometry';
import type { RenderShip } from '../types';
import type { QualitySettings } from './QualityPresets';

const RAD = Math.PI / 180;

function cloneVisualPrototype(prototype: THREE.Group): THREE.Group {
  const clone = prototype.clone(true);
  // Geometry stays shared between same-class ships; materials are local so the
  // HUNTING feedback below never recolours a separate entity of the same class.
  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => material.clone())
      : child.material.clone();
  });
  return clone;
}

function applyLodDistanceMultiplier(group: THREE.Object3D, multiplier: number): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.LOD)) return;
    for (const level of child.levels) level.distance *= multiplier;
  });
}

function disposeGroupResources(
  group: THREE.Group,
  geometries: Set<THREE.BufferGeometry>,
  materials: Set<THREE.Material>,
): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!geometries.has(child.geometry)) {
      child.geometry.dispose();
      geometries.add(child.geometry);
    }
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of childMaterials) {
      if (!materials.has(material)) {
        material.dispose();
        materials.add(material);
      }
    }
  });
}

export class ShipRenderer {
  private readonly _scene: THREE.Scene;
  private readonly _meshes = new Map<string, THREE.Group>();
  private readonly _prototypeCache = new Map<string, THREE.Group>();
  private readonly _lodDistanceMultiplier: number;

  constructor(
    scene: THREE.Scene,
    quality?: Pick<QualitySettings, 'lodDistanceMultiplier'>,
  ) {
    this._scene = scene;
    this._lodDistanceMultiplier = quality?.lodDistanceMultiplier ?? 1;
  }

  update(ships: RenderShip[], wallTime: number): void {
    const activeIds = new Set<string>();

    for (const ship of ships) {
      activeIds.add(ship.id);
      if (!ship.visible) {
        const existing = this._meshes.get(ship.id);
        if (existing) existing.visible = false;
        continue;
      }

      let group = this._meshes.get(ship.id);
      if (!group) {
        let prototype = this._prototypeCache.get(ship.shipClass);
        if (!prototype) {
          prototype = createShipLodGeometry(ship.shipClass);
          applyLodDistanceMultiplier(prototype, this._lodDistanceMultiplier);
          this._prototypeCache.set(ship.shipClass, prototype);
        }
        group = cloneVisualPrototype(prototype);
        group.name = `ship-${ship.id}`;
        group.userData.renderOnly = true;
        this._scene.add(group);
        this._meshes.set(ship.id, group);
      }

      group.visible = true;
      group.position.set(ship.position.x, ship.position.y, ship.position.z);
      group.rotation.y = -ship.headingDeg * RAD + Math.PI / 2;
      group.position.y += Math.sin(wallTime * 1.5 + ship.position.x * 10) * 0.0005;

      const hunting = ship.aiState === 'HUNTING';
      group.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          material.emissive.setHex(hunting ? 0x26110a : 0x000000);
          material.emissiveIntensity = hunting ? 0.16 : 0;
        }
      });
    }

    for (const [id, group] of this._meshes) {
      if (!activeIds.has(id)) {
        this._scene.remove(group);
        this._meshes.delete(id);
      }
    }
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    for (const group of this._meshes.values()) {
      this._scene.remove(group);
      disposeGroupResources(group, geometries, materials);
    }
    // Prototypes are never added to the scene but own the original materials.
    for (const prototype of this._prototypeCache.values()) {
      disposeGroupResources(prototype, geometries, materials);
    }
    this._meshes.clear();
    this._prototypeCache.clear();
  }
}
