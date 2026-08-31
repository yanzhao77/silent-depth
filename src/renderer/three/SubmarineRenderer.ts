import * as THREE from 'three';
import type { AssetManager } from '../assets/AssetManager';
import {
  createSubmarineGeometry,
  SUBMARINE_LOD_DISTANCES_KM,
  type SubmarineLodLevel,
  type SubmarineParts,
} from '../procedural/submarineGeometry';
import type { RenderPlayer } from '../types';
import type { QualitySettings } from './QualityPresets';

const RAD = Math.PI / 180;
const LOD_LEVELS: readonly SubmarineLodLevel[] = [0, 1, 2, 3];
const GLB_WORLD_SCALE = 0.00345;

/**
 * Presents the V2.3 local GLB hero asset when all approved LODs load, while
 * preserving the V2.2 procedural unit as an all-or-nothing visual fallback.
 * No code in this class writes to simulation state.
 */
export class SubmarineRenderer {
  readonly group = new THREE.Group();
  private readonly proceduralLod = new THREE.LOD();
  private readonly glbLod = new THREE.LOD();
  private readonly partsByLod: Readonly<Record<SubmarineLodLevel, SubmarineParts>>;
  private propAngle = 0;
  private lastHeadingDeg: number | null = null;
  private glbReady = false;

  constructor(
    scene: THREE.Scene,
    private readonly assetManager: AssetManager,
    quality?: Pick<QualitySettings, 'lodDistanceMultiplier'>,
  ) {
    const lodDistanceMultiplier = quality?.lodDistanceMultiplier ?? 1;
    const partsByLod = {} as Record<SubmarineLodLevel, SubmarineParts>;
    for (const lod of LOD_LEVELS) {
      const parts = createSubmarineGeometry(lod);
      partsByLod[lod] = parts;
      const baseDistance = lod === 0 ? 0 : SUBMARINE_LOD_DISTANCES_KM[lod - 1]!;
      this.proceduralLod.addLevel(parts.group, baseDistance * lodDistanceMultiplier);
    }
    this.partsByLod = partsByLod;
    this.proceduralLod.name = 'player-submarine-procedural-fallback-lod-controller';
    this.proceduralLod.userData.renderOnly = true;
    this.glbLod.name = 'player-submarine-glb-lod-controller';
    this.glbLod.userData.renderOnly = true;
    this.glbLod.visible = false;
    this.group.name = 'player-submarine-render-root';
    this.group.userData.renderOnly = true;
    this.group.add(this.proceduralLod, this.glbLod);
    scene.add(this.group);

    void this.loadApprovedGlbLods(lodDistanceMultiplier);
  }

  update(player: RenderPlayer, wallTime: number, dt: number): void {
    this.group.position.set(player.position.x, player.position.y, player.position.z);
    this.group.rotation.y = -player.headingDeg * RAD + Math.PI / 2;
    this.group.rotation.z = player.pitchDeg * RAD;
    this.group.rotation.x = player.rollDeg * RAD;

    this.updateFallbackAnimation(player, wallTime, dt);

    // GLB idle motion mirrors the same renderer wall clock, never a gameplay clock.
    if (this.glbReady) this.glbLod.rotation.y = Math.sin(wallTime * 0.45) * 0.003;
  }

  dispose(): void {
    // GLB geometry/material resources remain owned by the shared AssetManager.
    const disposedGeometries = new Set<THREE.BufferGeometry>();
    const disposedMaterials = new Set<THREE.Material>();
    this.proceduralLod.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!disposedGeometries.has(child.geometry)) {
        child.geometry.dispose();
        disposedGeometries.add(child.geometry);
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!disposedMaterials.has(material)) {
          material.dispose();
          disposedMaterials.add(material);
        }
      }
    });
  }

  private async loadApprovedGlbLods(lodDistanceMultiplier: number): Promise<void> {
    const loaded = await Promise.all(LOD_LEVELS.map((lod) => this.assetManager.loadFamilyLod('player-submarine', lod)));
    if (loaded.some((result) => result.usingFallback || !result.scene)) return;

    for (const lod of LOD_LEVELS) {
      const scene = loaded[lod]!.scene!;
      scene.name = `hero-submarine-glb-lod${lod}`;
      scene.scale.setScalar(GLB_WORLD_SCALE);
      scene.rotation.y = Math.PI;
      const baseDistance = lod === 0 ? 0 : SUBMARINE_LOD_DISTANCES_KM[lod - 1]!;
      this.glbLod.addLevel(scene, baseDistance * lodDistanceMultiplier);
    }

    this.glbReady = true;
    this.glbLod.visible = true;
    this.proceduralLod.visible = false;
  }

  private updateFallbackAnimation(player: RenderPlayer, wallTime: number, dt: number): void {
    const ps = player.periscopeState;
    for (const lod of LOD_LEVELS) {
      const parts = this.partsByLod[lod];
      const peri = parts.periscope;
      if (ps.state === 'RAISED' || ps.state === 'OBSERVING') {
        peri.visible = true;
        peri.scale.y = 1;
        peri.position.y = 0.023;
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
    }

    if (player.speedKt > 0.1) {
      const rps = player.speedKt * 0.5;
      this.propAngle += rps * dt * Math.PI * 2;
    }
    for (const lod of LOD_LEVELS) this.partsByLod[lod].propeller.rotation.x = this.propAngle;

    const headingDelta = this.lastHeadingDeg === null
      ? 0
      : THREE.MathUtils.euclideanModulo(player.headingDeg - this.lastHeadingDeg + 180, 360) - 180;
    this.lastHeadingDeg = player.headingDeg;
    const rudderAngle = THREE.MathUtils.clamp(-headingDelta * 0.75, -12, 12) * RAD;
    for (const lod of LOD_LEVELS) {
      const rudder = this.partsByLod[lod].rudder;
      rudder.rotation.y = THREE.MathUtils.damp(rudder.rotation.y, rudderAngle, 9, dt);
    }
    this.proceduralLod.rotation.y = Math.sin(wallTime * 0.45) * 0.003;
  }
}
