/**
 * SILENT DEPTH V2.0 — Tactical Overlay (src/renderer/three/TacticalOverlay.ts)
 *
 * 2D Canvas overlay rendered on top of the Three.js 3D world.
 * Projects contact ellipses, track lines, LKP markers, sonar rings,
 * and torpedo trajectories into screen space.
 */

import * as THREE from 'three';
import type { RenderState, RenderContact } from '../types';

const RAD = Math.PI / 180;

const STATE_COLORS: Record<string, string> = {
  UNKNOWN: '#6b7280',
  SUSPECTED: '#fbbf24',
  CLASSIFIED: '#22d3ee',
  TRACKED: '#60a5fa',
  CONFIRMED: '#f87171',
};

export class TacticalOverlay {
  private _canvas: HTMLCanvasElement;
  private _ctx: CanvasRenderingContext2D;

  constructor(overlayCanvas: HTMLCanvasElement) {
    this._canvas = overlayCanvas;
    this._ctx = overlayCanvas.getContext('2d')!;
  }

  update(state: RenderState, camera: THREE.Camera, width: number, height: number): void {
    this._canvas.width = width;
    this._canvas.height = height;
    const ctx = this._ctx;
    ctx.clearRect(0, 0, width, height);

    // Project helper: world position → screen position
    const project = (wx: number, wy: number, wz: number): { x: number; y: number; visible: boolean } => {
      const v = new THREE.Vector3(wx, wy, wz);
      v.project(camera);
      return {
        x: (v.x + 1) / 2 * width,
        y: (-v.y + 1) / 2 * height,
        visible: v.z < 1 && v.z > -1,
      };
    };

    // --- Sonar range rings around player ---
    const pp = state.player.position;
    const passiveRange = 5; // km (approximate)
    const activeRange = 10; // km
    for (const range of [passiveRange, activeRange]) {
      const center = project(pp.x, pp.y, pp.z);
      if (!center.visible) continue;
      // Approximate screen-space radius by projecting two points
      const edge = project(pp.x + range, pp.y, pp.z);
      if (!edge.visible) continue;
      const screenRadius = Math.abs(edge.x - center.x);
      if (screenRadius < 5 || screenRadius > width) continue;

      ctx.strokeStyle = 'rgba(46, 95, 116, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(center.x, center.y, screenRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // --- Contact uncertainty ellipses ---
    for (const contact of state.contacts) {
      const pos = contact.estimatedPosition;
      const screen = project(pos.x, pos.y, pos.z);
      if (!screen.visible) continue;

      const color = STATE_COLORS[contact.state] ?? '#6b7280';

      // Project ellipse axes to screen space (approximate)
      const rxScreen = Math.max(3, contact.uncertaintyRxKm * (width / 30));
      const ryScreen = Math.max(2, contact.uncertaintyRyKm * (width / 30));

      ctx.save();
      ctx.translate(screen.x, screen.y);
      ctx.rotate(contact.uncertaintyRotationDeg * RAD);
      ctx.strokeStyle = color;
      ctx.lineWidth = contact.selected ? 2 : 1;
      ctx.globalAlpha = contact.selected ? 0.9 : 0.6;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.ellipse(0, 0, rxScreen, ryScreen, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Center dot
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, contact.selected ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Classification label
      if (contact.classification !== 'Unknown' && contact.confidence > 30) {
        ctx.fillStyle = color;
        ctx.font = '10px "SF Mono", Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.globalAlpha = 0.8;
        ctx.fillText(contact.id, screen.x, screen.y - ryScreen - 6);
      }
    }
    ctx.globalAlpha = 1;

    // --- Torpedo trajectory lines ---
    for (const torp of state.torpedoes) {
      if (torp.state !== 'RUNNING') continue;
      const screen = project(torp.position.x, torp.position.y, torp.position.z);
      if (!screen.visible) continue;

      // Draw heading line ahead of torpedo
      const hdgRad = torp.headingDeg * RAD;
      const lineLen = 2; // km ahead
      const endX = torp.position.x + Math.sin(hdgRad) * lineLen;
      const endZ = torp.position.z - Math.cos(hdgRad) * lineLen;
      const endScreen = project(endX, torp.position.y, endZ);

      ctx.strokeStyle = 'rgba(232, 232, 232, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y);
      if (endScreen.visible) {
        ctx.lineTo(endScreen.x, endScreen.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Torpedo marker
      ctx.fillStyle = '#e8e8e8';
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Player position indicator ---
    const playerScreen = project(pp.x, pp.y, pp.z);
    if (playerScreen.visible) {
      ctx.fillStyle = '#ffffff';
      ctx.save();
      ctx.translate(playerScreen.x, playerScreen.y);
      ctx.rotate(-state.player.headingDeg * RAD);
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 5);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  dispose(): void {
    // Canvas is owned externally, just clear context
  }
}
