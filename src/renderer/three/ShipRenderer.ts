import * as THREE from 'three';
import type { AssetManager } from '../assets/AssetManager';
import { createShipLodGeometry } from '../procedural/shipGeometry';
import type { RenderShip } from '../types';
import type { QualitySettings } from './QualityPresets';

const RAD = Math.PI / 180;
const GLB_WORLD_SCALE = 0.00335;
const GLB_SHIP_CLASSES = new Set(['Destroyer', 'Tanker']);
const GLB_LOD_DISTANCES_KM: readonly [number, number, number] = [0, 0.58, 1.45];

type PrototypeSource = 'procedural' | 'glb';

function cloneVisualPrototype(prototype: THREE.Group): THREE.Group {
  const clone = prototype.clone(true);
  // Geometry remains shared. Materials are unique per entity so the HUNTING
  // visual cue cannot recolour another ship instance.
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

/**
 * Pure, fail-closed nav-light descriptor for a ship. Returns `null` for any
 * ship that is not visible — a hidden contact must never yield a marker, per
 * the architecture's visibility-truth rule. Visible ships expose the standard
 * COLREG side lights (port red, starboard green) plus a stern white light so
 * the player can read a target's orientation at night.
 */
export interface NavLight {
  color: number;
  /** Local ship-space offset in km. */
  position: { x: number; y: number; z: number };
}

export function shipNavLights(ship: RenderShip): NavLight[] | null {
  if (!ship.visible) return null;
  return [
    { color: 0xff2b2b, position: { x: -0.03, y: 0.012, z: 0 } }, // port (left) red
    { color: 0x2bff5a, position: { x: 0.03, y: 0.012, z: 0 } }, // starboard (right) green
    { color: 0xffffff, position: { x: 0, y: 0.014, z: -0.055 } }, // stern white
  ];
}

function addNavLights(group: THREE.Group, ship: RenderShip): void {
  const lights = shipNavLights(ship);
  if (!lights) return;
  for (const light of lights) {
    const geometry = new THREE.SphereGeometry(0.004, 6, 4);
    const material = new THREE.MeshBasicMaterial({ color: light.color, fog: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(light.position.x, light.position.y, light.position.z);
    mesh.name = `nav-light-${light.color.toString(16)}`;
    mesh.userData.renderOnly = true;
    group.add(mesh);
  }
}

function disposeGroupResources(
  group: THREE.Group,
  geometries: Set<THREE.BufferGeometry>,
  materials: Set<THREE.Material>,
  disposeGeometry: boolean,
): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (disposeGeometry && !geometries.has(child.geometry)) {
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

/**
 * Presentation-only visual mirror for RenderShip. Approved GLB models are
 * selected only for families that have a complete local LOD set; all other
 * classes and every failed asset request continue to use procedural geometry.
 */
export class ShipRenderer {
  private readonly meshes = new Map<string, THREE.Group>();
  private readonly proceduralPrototypeCache = new Map<string, THREE.Group>();
  private readonly glbPrototypeCache = new Map<string, THREE.Group>();
  private readonly glbLoadStarted = new Set<string>();
  private readonly lodDistanceMultiplier: number;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assetManager: AssetManager,
    quality?: Pick<QualitySettings, 'lodDistanceMultiplier'>,
  ) {
    this.lodDistanceMultiplier = quality?.lodDistanceMultiplier ?? 1;
  }

  update(ships: RenderShip[], wallTime: number): void {
    const activeIds = new Set<string>();

    for (const ship of ships) {
      activeIds.add(ship.id);
      if (!ship.visible) {
        const existing = this.meshes.get(ship.id);
        if (existing) existing.visible = false;
        continue;
      }

      const source = this.resolveSource(ship.shipClass);
      let group = this.meshes.get(ship.id);
      if (group && group.userData.prototypeSource !== source) {
        this.removeInstance(ship.id, group);
        group = undefined;
      }
      if (!group) {
        group = cloneVisualPrototype(this.resolvePrototype(ship.shipClass, source));
        group.name = `ship-${ship.id}`;
        group.userData.renderOnly = true;
        group.userData.prototypeSource = source;
        addNavLights(group, ship);
        this.scene.add(group);
        this.meshes.set(ship.id, group);
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

    for (const [id, group] of this.meshes) {
      if (!activeIds.has(id)) this.removeInstance(id, group);
    }
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    for (const [id, group] of this.meshes) this.removeInstance(id, group, geometries, materials);
    for (const prototype of this.proceduralPrototypeCache.values()) {
      disposeGroupResources(prototype, geometries, materials, true);
    }
    // GLB geometry is owned by AssetManager. Only local clone materials above
    // are released here; the cached source scenes are released centrally.
    this.meshes.clear();
    this.proceduralPrototypeCache.clear();
    this.glbPrototypeCache.clear();
  }

  private resolveSource(shipClass: string): PrototypeSource {
    if (!GLB_SHIP_CLASSES.has(shipClass)) return 'procedural';
    if (!this.glbLoadStarted.has(shipClass)) {
      this.glbLoadStarted.add(shipClass);
      void this.loadGlbPrototype(shipClass);
    }
    return this.glbPrototypeCache.has(shipClass) ? 'glb' : 'procedural';
  }

  private resolvePrototype(shipClass: string, source: PrototypeSource): THREE.Group {
    if (source === 'glb') return this.glbPrototypeCache.get(shipClass)!;
    let prototype = this.proceduralPrototypeCache.get(shipClass);
    if (!prototype) {
      prototype = createShipLodGeometry(shipClass);
      applyLodDistanceMultiplier(prototype, this.lodDistanceMultiplier);
      this.proceduralPrototypeCache.set(shipClass, prototype);
    }
    return prototype;
  }

  private async loadGlbPrototype(shipClass: string): Promise<void> {
    const family = shipClass.toLowerCase();
    const loaded = await Promise.all(([1, 2, 3] as const).map((lod) => this.assetManager.loadFamilyLod(family, lod)));
    if (loaded.some((result) => result.usingFallback || !result.scene)) return;

    const root = new THREE.Group();
    root.name = `${family}-glb-prototype`;
    const controller = new THREE.LOD();
    for (let index = 0; index < loaded.length; index++) {
      const scene = loaded[index]!.scene!;
      scene.name = `${family}-glb-lod${index + 1}`;
      scene.scale.setScalar(GLB_WORLD_SCALE);
      scene.rotation.y = Math.PI;
      controller.addLevel(scene, GLB_LOD_DISTANCES_KM[index]! * this.lodDistanceMultiplier);
    }
    root.add(controller);
    this.glbPrototypeCache.set(shipClass, root);
  }

  private removeInstance(
    id: string,
    group: THREE.Group,
    geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
  ): void {
    this.scene.remove(group);
    disposeGroupResources(group, geometries, materials, group.userData.prototypeSource !== 'glb');
    this.meshes.delete(id);
  }
}
