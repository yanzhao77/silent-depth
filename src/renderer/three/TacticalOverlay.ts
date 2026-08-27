/**
 * SILENT DEPTH V2.1 — Tactical Overlay
 *
 * 2D Canvas overlay with enhanced visuals:
 * - Sonar range rings with labels
 * - Contact uncertainty ellipses with state colors
 * - Ship wake direction indicators
 * - Torpedo trajectory lines
 * - Player position + heading line
 * - Compass heading markers at screen edges
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

    const project = (wx: number, wy: number, wz: number): { x: number; y: number; visible: boolean } => {
      const v = new THREE.Vector3(wx, wy, wz);
      v.project(camera);
      return {
        x: (v.x + 1) / 2 * width,
        y: (-v.y + 1) / 2 * height,
        visible: v.z < 1 && v.z > -1,
      };
    };

    const pp = state.player.position;
    const headingRad = state.player.headingDeg * RAD;

    // --- Compass heading at screen edges ---
    const compassRadius = Math.min(width, height) * 0.48;
    const cx = width / 2;
    const cy = height / 2;
    for (let deg = 0; deg < 360; deg += 30) {
      const relDeg = ((deg - state.player.headingDeg + 540) % 360) - 180;
      if (Math.abs(relDeg) > 70) continue;
      const angle = (relDeg - 90) * RAD;
      const edgeX = cx + Math.cos(angle) * compassRadius;
      const edgeY = cy + Math.sin(angle) * compassRadius;

      ctx.fillStyle = 'rgba(100, 150, 170, 0.3)';
      ctx.font = '9px "SF Mono", Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(deg).padStart(3, '0'), edgeX, edgeY);
    }

    // --- Sonar range rings ---
    const passiveRange = 5;
    const activeRange = 10;
    const rings: [number, string, string][] = [
      [passiveRange, 'rgba(34, 180, 180, 0.15)', 'PASSIVE 5km'],
      [activeRange, 'rgba(180, 34, 34, 0.12)', 'ACTIVE 10km'],
    ];
    for (const [range, color, label] of rings) {
      const center = project(pp.x, pp.y, pp.z);
      if (!center.visible) continue;
      const edge = project(pp.x + range, pp.y, pp.z);
      if (!edge.visible) continue;
      const screenRadius = Math.abs(edge.x - center.x);
      if (screenRadius < 5 || screenRadius > width) continue;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(center.x, center.y, screenRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = color;
      ctx.font = '8px "SF Mono", Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, center.x + screenRadius * 0.7, center.y - screenRadius * 0.7);
    }

    // --- Contact uncertainty ellipses ---
    for (const contact of state.contacts) {
      const pos = contact.estimatedPosition;
      const screen = project(pos.x, pos.y, pos.z);
      if (!screen.visible) continue;

      const color = STATE_COLORS[contact.state] ?? '#6b7280';
      const rxScreen = Math.max(3, contact.uncertaintyRxKm * (width / 30));
      const ryScreen = Math.max(2, contact.uncertaintyRyKm * (width / 30));

      ctx.save();
      ctx.translate(screen.x, screen.y);
      ctx.rotate(contact.uncertaintyRotationDeg * RAD);

      const hasResolvedCenter = contact.classification !== 'Unknown' && contact.confidence > 30;
      // Ellipse remains the primary representation for uncertain observations.
      ctx.fillStyle = color;
      ctx.globalAlpha = hasResolvedCenter ? (contact.selected ? 0.10 : 0.055) : 0.028;
      ctx.beginPath();
      ctx.ellipse(0, 0, rxScreen, ryScreen, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = contact.selected && hasResolvedCenter ? 2 : 1;
      ctx.globalAlpha = hasResolvedCenter ? (contact.selected ? 0.90 : 0.52) : 0.32;
      ctx.setLineDash(hasResolvedCenter ? [3, 3] : [5, 5]);
      ctx.beginPath();
      ctx.ellipse(0, 0, rxScreen, ryScreen, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Do not draw an exact center for Unknown/low-confidence observations.
      if (hasResolvedCenter) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(0, 0, contact.selected ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (hasResolvedCenter) {
        ctx.fillStyle = color;
        ctx.font = '9px "SF Mono", Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.globalAlpha = 0.75;
        ctx.fillText(`${contact.classification.substring(0, 5).toUpperCase()} ${Math.round(contact.confidence)}%`, screen.x, screen.y - ryScreen - 6);
      }
    }
    ctx.globalAlpha = 1;

    // --- Ship wake direction indicators ---
    for (const ship of state.ships) {
      if (!ship.visible) continue;
      const screen = project(ship.position.x, ship.position.y, ship.position.z);
      if (!screen.visible) continue;

      // Wake direction line behind ship
      const wakeLen = 0.8; // km behind
      const sHdgRad = ship.headingDeg * RAD;
      const wakeX = ship.position.x - Math.sin(sHdgRad) * wakeLen;
      const wakeZ = ship.position.z + Math.cos(sHdgRad) * wakeLen;
      const wakeScreen = project(wakeX, ship.position.y, wakeZ);

      if (wakeScreen.visible) {
        ctx.strokeStyle = 'rgba(140, 180, 200, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(screen.x, screen.y);
        ctx.lineTo(wakeScreen.x, wakeScreen.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // --- Torpedo trajectory lines ---
    for (const torp of state.torpedoes) {
      if (torp.state !== 'RUNNING') continue;
      const screen = project(torp.position.x, torp.position.y, torp.position.z);
      if (!screen.visible) continue;

      const hdgRad = torp.headingDeg * RAD;
      const lineLen = 2;
      const endX = torp.position.x + Math.sin(hdgRad) * lineLen;
      const endZ = torp.position.z - Math.cos(hdgRad) * lineLen;
      const endScreen = project(endX, torp.position.y, endZ);

      ctx.strokeStyle = 'rgba(220, 220, 220, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y);
      if (endScreen.visible) {
        ctx.lineTo(endScreen.x, endScreen.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Torpedo marker (diamond)
      ctx.fillStyle = '#e8e8e8';
      ctx.save();
      ctx.translate(screen.x, screen.y);
      ctx.rotate(hdgRad);
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(3, 0);
      ctx.lineTo(0, 4);
      ctx.lineTo(-3, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // --- Player position + heading line ---
    const playerScreen = project(pp.x, pp.y, pp.z);
    if (playerScreen.visible) {
      // Heading line ahead
      const hdgAhead = 1.5;
      const aheadX = pp.x + Math.sin(headingRad) * hdgAhead;
      const aheadZ = pp.z - Math.cos(headingRad) * hdgAhead;
      const aheadScreen = project(aheadX, pp.y, aheadZ);
      if (aheadScreen.visible) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(playerScreen.x, playerScreen.y);
        ctx.lineTo(aheadScreen.x, aheadScreen.y);
        ctx.stroke();
      }

      // Player triangle
      ctx.fillStyle = '#ffffff';
      ctx.save();
      ctx.translate(playerScreen.x, playerScreen.y);
      ctx.rotate(-headingRad);
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 6);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  dispose(): void {
    // Canvas is owned externally
  }
}
