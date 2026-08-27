/**
 * SILENT DEPTH V2.0 — Periscope View (src/renderer/three/PeriscopeView.ts)
 *
 * Renders the periscope optical overlay when camera mode is 'periscope':
 * - Circular viewport mask
 * - Bearing markers around the edge
 * - Contact highlighting in FOV
 * - Lock indicator
 * - Exposure vignette warning
 */

import * as THREE from 'three';
import type { RenderState, RenderContact } from '../types';

const RAD = Math.PI / 180;

export class PeriscopeView {
  private _overlay: HTMLDivElement;
  private _canvas: HTMLCanvasElement;
  private _ctx: CanvasRenderingContext2D;
  private _active = false;

  constructor() {
    // Create DOM overlay for periscope HUD
    this._overlay = document.createElement('div');
    this._overlay.id = 'periscope-overlay';
    this._overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 10; display: none;
    `;

    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = 'width: 100%; height: 100%;';
    this._overlay.appendChild(this._canvas);
    document.body.appendChild(this._overlay);

    this._ctx = this._canvas.getContext('2d')!;
  }

  update(state: RenderState): void {
    const isPeriscope = state.camera.mode === 'periscope' ||
      state.player.periscopeState.state === 'RAISED' ||
      state.player.periscopeState.state === 'OBSERVING';

    if (!isPeriscope) {
      if (this._active) {
        this._overlay.style.display = 'none';
        this._active = false;
      }
      return;
    }

    if (!this._active) {
      this._overlay.style.display = '';
      this._active = true;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    this._canvas.width = w;
    this._canvas.height = h;
    const ctx = this._ctx;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.42;

    ctx.clearRect(0, 0, w, h);

    // Circular viewport mask (dark outside)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
    ctx.fill();

    // Optic ring
    ctx.strokeStyle = 'rgba(100, 140, 160, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner crosshair
    ctx.strokeStyle = 'rgba(100, 140, 160, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy);
    ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20);
    ctx.lineTo(cx, cy + 20);
    ctx.stroke();

    // Bearing markers (every 30°)
    ctx.font = '11px "SF Mono", Consolas, monospace';
    ctx.fillStyle = 'rgba(160, 190, 210, 0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const headingDeg = state.player.headingDeg;
    for (let deg = 0; deg < 360; deg += 30) {
      const relDeg = ((deg - headingDeg + 540) % 360) - 180;
      if (Math.abs(relDeg) > 50) continue; // Only show within FOV
      const angle = (relDeg - 90) * RAD; // -90 because 0° is top
      const mx = cx + Math.cos(angle) * (radius - 15);
      const my = cy + Math.sin(angle) * (radius - 15);
      const label = String(deg).padStart(3, '0');
      ctx.fillText(label, mx, my);

      // Tick mark
      const tx = cx + Math.cos(angle) * (radius - 5);
      const ty = cy + Math.sin(angle) * (radius - 5);
      const tx2 = cx + Math.cos(angle) * (radius - 10);
      const ty2 = cy + Math.sin(angle) * (radius - 10);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx2, ty2);
      ctx.stroke();
    }

    // Highlight contacts in FOV
    for (const contact of state.contacts) {
      const relBrg = ((contact.bearingDeg - headingDeg + 540) % 360) - 180;
      if (Math.abs(relBrg) > 25) continue; // Outside periscope FOV

      const angle = (relBrg - 90) * RAD;
      const dist = Math.min(radius * 0.8, (contact.rangeKm ?? 3) * 15);
      const px = cx + Math.cos(angle) * dist * 0.3;
      const py = cy + Math.sin(angle) * dist * 0.3;

      // Contact marker
      const color = contact.selected ? '#22d3ee' : this._stateColor(contact.state);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.stroke();

      // Classification label
      if (contact.classification !== 'Unknown') {
        ctx.fillStyle = color;
        ctx.font = '10px "SF Mono", Consolas, monospace';
        ctx.fillText(contact.classification.substring(0, 4).toUpperCase(), px, py - 12);
      }
    }

    // Lock indicator
    const lockedId = state.player.periscopeState.lockedContactId;
    if (lockedId) {
      const locked = state.contacts.find((c) => c.id === lockedId);
      if (locked) {
        const relBrg = ((locked.bearingDeg - headingDeg + 540) % 360) - 180;
        if (Math.abs(relBrg) <= 25) {
          const angle = (relBrg - 90) * RAD;
          const dist = Math.min(radius * 0.8, (locked.rangeKm ?? 3) * 15);
          const px = cx + Math.cos(angle) * dist * 0.3;
          const py = cy + Math.sin(angle) * dist * 0.3;

          ctx.strokeStyle = '#f87171';
          ctx.lineWidth = 2;
          const s = 10;
          ctx.beginPath();
          ctx.moveTo(px - s, py - s); ctx.lineTo(px - s + 4, py - s);
          ctx.moveTo(px - s, py - s); ctx.lineTo(px - s, py - s + 4);
          ctx.moveTo(px + s, py - s); ctx.lineTo(px + s - 4, py - s);
          ctx.moveTo(px + s, py - s); ctx.lineTo(px + s, py - s + 4);
          ctx.moveTo(px - s, py + s); ctx.lineTo(px - s + 4, py + s);
          ctx.moveTo(px - s, py + s); ctx.lineTo(px - s, py + s - 4);
          ctx.moveTo(px + s, py + s); ctx.lineTo(px + s - 4, py + s);
          ctx.moveTo(px + s, py + s); ctx.lineTo(px + s, py + s - 4);
          ctx.stroke();

          ctx.fillStyle = '#f87171';
          ctx.font = '10px "SF Mono", Consolas, monospace';
          ctx.fillText('LOCKED', px, py + s + 12);
        }
      }
    }

    // Exposure warning vignette
    const exposure = state.player.periscopeState.exposure;
    if (exposure > 20) {
      const alpha = Math.min(0.5, (exposure - 20) / 160);
      const grad = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius);
      grad.addColorStop(0, 'rgba(200, 50, 50, 0)');
      grad.addColorStop(1, `rgba(200, 50, 50, ${alpha})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bottom info bar
    ctx.fillStyle = 'rgba(160, 190, 210, 0.7)';
    ctx.font = '12px "SF Mono", Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`BRG ${String(Math.round(headingDeg)).padStart(3, '0')}°`, cx - radius + 20, cy + radius - 20);
    ctx.textAlign = 'right';
    const expBand = state.player.periscopeState.exposureBand;
    if (expBand !== 'NONE') {
      ctx.fillStyle = exposure > 60 ? '#f87171' : '#fbbf24';
      ctx.fillText(`EXPOSURE ${expBand}`, cx + radius - 20, cy + radius - 20);
    }
  }

  private _stateColor(state: string): string {
    switch (state) {
      case 'UNKNOWN': return '#6b7280';
      case 'SUSPECTED': return '#fbbf24';
      case 'CLASSIFIED': return '#22d3ee';
      case 'TRACKED': return '#60a5fa';
      case 'CONFIRMED': return '#f87171';
      default: return '#6b7280';
    }
  }

  dispose(): void {
    this._overlay.remove();
  }
}
