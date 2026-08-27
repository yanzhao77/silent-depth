/**
 * SILENT DEPTH V2.2 — Hero Submarine Renderer
 *
 * Presents a local four-tier procedural hero asset. LOD changes, periscope,
 * propeller and rudder are purely visual mirrors of RenderPlayer and never
 * write to simulation state.
 */

import * as THREE from 'three';
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

export class SubmarineRenderer {
  readonly group = new THREE.Group();
  private readonly _lod = new THREE.LOD();
  private readonly _partsByLod: Readonly<Record<SubmarineLodLevel, SubmarineParts>>;
  private _propAngle = 0;
  private _lastHeadingDeg: number | null = null;

  constructor(
    scene: THREE.Scene,
    quality?: Pick<QualitySettings, 'lodDistanceMultiplier'>,
  ) {
    const lodDistanceMultiplier = quality?.lodDistanceMultiplier ?? 1;
    const partsByLod = {} as Record<SubmarineLodLevel, SubmarineParts>;
    for (const lod of LOD_LEVELS) {
      const parts = createSubmarineGeometry(lod);
      partsByLod[lod] = parts;
      const baseDistance = lod === 0 ? 0 : SUBMARINE_LOD_DISTANCES_KM[lod - 1]!;
      this._lod.addLevel(parts.group, baseDistance * lodDistanceMultiplier);
    }
    this._partsByLod = partsByLod;
    this._lod.name = 'player-submarine-lod-controller';
    this._lod.userData.renderOnly = true;
    this.group.name = 'player-submarine-render-root';
    this.group.userData.renderOnly = true;
    this.group.add(this._lod);
    scene.add(this.group);
  }

  update(player: RenderPlayer, wallTime: number, dt: number): void {
    this.group.position.set(player.position.x, player.position.y, player.position.z);
    this.group.rotation.y = -player.headingDeg * RAD + Math.PI / 2;
    this.group.rotation.z = player.pitchDeg * RAD;
    this.group.rotation.x = player.rollDeg * RAD;

    const ps = player.periscopeState;
    for (const lod of LOD_LEVELS) {
      const parts = this._partsByLod[lod];
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
      this._propAngle += rps * dt * Math.PI * 2;
    }
    for (const lod of LOD_LEVELS) {
      this._partsByLod[lod].propeller.rotation.x = this._propAngle;
    }

    // Visual-only rudder response. It is derived from the heading delta already
    // exposed through RenderPlayer, then damped locally so it never affects turn.
    const headingDelta = this._lastHeadingDeg === null
      ? 0
      : THREE.MathUtils.euclideanModulo(player.headingDeg - this._lastHeadingDeg + 180, 360) - 180;
    this._lastHeadingDeg = player.headingDeg;
    const rudderAngle = THREE.MathUtils.clamp(-headingDelta * 0.75, -12, 12) * RAD;
    for (const lod of LOD_LEVELS) {
      const rudder = this._partsByLod[lod].rudder;
      rudder.rotation.y = THREE.MathUtils.damp(rudder.rotation.y, rudderAngle, 9, dt);
    }

    // Preserve a tiny deterministic idle motion without reading clock/RNG from
    // the engine; wallTime already belongs to the render-state contract.
    this._lod.rotation.y = Math.sin(wallTime * 0.45) * 0.003;
  }

  dispose(): void {
    const disposedGeometries = new Set<THREE.BufferGeometry>();
    const disposedMaterials = new Set<THREE.Material>();
    this.group.traverse((child) => {
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
}
