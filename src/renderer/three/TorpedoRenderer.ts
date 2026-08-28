/**
 * SILENT DEPTH V2.5 — Torpedo Renderer (presentation-only)
 *
 * Renders player-launched torpedoes as small, readable entities with a bubble
 * trail, driven entirely by RenderState.torpedoes. It consumes only position /
 * heading / speed already present in the render contract; it never writes back to
 * the simulation, AI or physics. Torpedo meshes and bubble pools are recycled by
 * torpedo id and disposed when the torpedo leaves the snapshot.
 */

import * as THREE from 'three';
import type { RenderTorpedo } from '../types';
import { createVisualRng, type VisualRng } from '../visualRng';

const RAD = Math.PI / 180;
const BUBBLE_COUNT = 14;

interface TorpedoView {
  group: THREE.Group;
  body: THREE.Mesh;
  bubbles: THREE.Points;
  bubbleVelocities: Float32Array;
}

export class TorpedoRenderer {
  private readonly _scene: THREE.Scene;
  private readonly _views = new Map<string, TorpedoView>();
  private readonly _bodyGeo: THREE.CapsuleGeometry;
  private readonly _bodyMat: THREE.MeshStandardMaterial;
  private readonly _bubbleGeo: THREE.BufferGeometry;
  private readonly _bubbleMat: THREE.PointsMaterial;
  private readonly _rng: VisualRng = createVisualRng();

  constructor(scene: THREE.Scene) {
    this._scene = scene;

    // Hull: a slim capsule laid along +X (the model forward axis).
    this._bodyGeo = new THREE.CapsuleGeometry(0.0011, 0.012, 4, 8);
    this._bodyGeo.rotateZ(Math.PI / 2);
    this._bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2a2f33, roughness: 0.5, metalness: 0.5,
      emissive: 0x06222b, emissiveIntensity: 0.25,
    });

    this._bubbleGeo = new THREE.BufferGeometry();
    this._bubbleGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BUBBLE_COUNT * 3), 3));
    this._bubbleMat = new THREE.PointsMaterial({
      color: 0xbfe6ef, size: 0.004, transparent: true, opacity: 0.7,
      depthWrite: false,
    });
  }

  update(torpedoes: readonly RenderTorpedo[], dt: number, wallTime: number): void {
    const activeIds = new Set<string>();

    for (const torp of torpedoes) {
      activeIds.add(torp.id);
      let view = this._views.get(torp.id);
      if (!view) {
        view = this._createView();
        this._views.set(torp.id, view);
      }
      this._placeView(view, torp, wallTime);
    }

    for (const [id, view] of this._views) {
      if (!activeIds.has(id)) {
        this._disposeView(view);
        this._views.delete(id);
      }
    }
    void dt;
  }

  private _createView(): TorpedoView {
    const group = new THREE.Group();
    const body = new THREE.Mesh(this._bodyGeo, this._bodyMat);
    group.add(body);

    const bubbles = new THREE.Points(this._bubbleGeo.clone(), this._bubbleMat.clone());
    const bubbleVelocities = new Float32Array(BUBBLE_COUNT * 3);
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      bubbleVelocities[i * 3] = (this._rng.next() - 0.5) * 0.004;
      bubbleVelocities[i * 3 + 1] = 0.01 + this._rng.next() * 0.02;
      bubbleVelocities[i * 3 + 2] = (this._rng.next() - 0.5) * 0.004;
    }
    bubbles.geometry.userData = { velocities: bubbleVelocities, phase: this._rng.next() * 10 };
    group.add(bubbles);

    this._scene.add(group);
    return { group, body, bubbles, bubbleVelocities };
  }

  private _placeView(view: TorpedoView, torp: RenderTorpedo, wallTime: number): void {
    view.group.position.set(torp.position.x, torp.position.y, torp.position.z);
    view.group.rotation.y = -torp.headingDeg * RAD + Math.PI / 2;

    // Bubble trail drifts backward (−X local) and upward, recycling by a phase.
    const positions = view.bubbles.geometry.attributes.position;
    if (positions) {
      const arr = positions.array as Float32Array;
      const vels = view.bubbleVelocities;
      const phase = (view.bubbles.geometry.userData?.phase as number) ?? 0;
      for (let i = 0; i < BUBBLE_COUNT; i++) {
        const t = ((wallTime * 0.6 + phase + i / BUBBLE_COUNT) % 1);
        const back = -0.002 - t * 0.02; // trail length behind the torpedo
        arr[i * 3] = back + vels[i * 3]! * t;
        arr[i * 3 + 1] = t * 0.02 + Math.sin(wallTime * 3 + i) * 0.0015;
        arr[i * 3 + 2] = vels[i * 3 + 2]! * t;
      }
      positions.needsUpdate = true;
    }
    (view.bubbles.material as THREE.PointsMaterial).opacity = 0.5 + 0.25 * Math.sin(wallTime * 4);
  }

  private _disposeView(view: TorpedoView): void {
    this._scene.remove(view.group);
    view.bubbles.geometry.dispose();
    (view.bubbles.material as THREE.Material).dispose();
  }

  dispose(): void {
    for (const view of this._views.values()) this._disposeView(view);
    this._views.clear();
    this._bodyGeo.dispose();
    this._bodyMat.dispose();
    this._bubbleGeo.dispose();
    this._bubbleMat.dispose();
  }
}
