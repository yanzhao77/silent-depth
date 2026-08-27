/**
 * SILENT DEPTH V2.1 — Periscope View
 *
 * Cinematic periscope overlay:
 * - Circular viewport with dark vignette
 * - Optical glass effect (subtle distortion, water drops)
 * - Bearing scale with tick marks
 * - Crosshair with mil markings
 * - Contact highlighting in FOV
 * - Lock indicator (red brackets + label)
 * - Exposure warning vignette
 * - Condensation effect
 * - Bottom info bar (bearing, exposure band)
 */

import * as THREE from 'three';
import type { RenderState, RenderContact } from '../types';

const RAD = Math.PI / 180;

export class PeriscopeView {
  private _overlay: HTMLDivElement;
  private _canvas: HTMLCanvasElement;
  private _ctx: CanvasRenderingContext2D;
  private _active = false;
  private _drops: Array<{ x: number; y: number; r: number; vy: number }> = [];
  private _condensationPhase = 0;
  private _dropAccumulator = 0;
  private _dropSeed = 0;

  constructor() {
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

  update(state: RenderState, dt: number): void {
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
      this._drops = [];
      this._dropAccumulator = 0;
      this._dropSeed = 0;
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

    // --- Circular viewport mask (dark outside) ---
    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
    ctx.fill();

    // --- Outer ring (thick, metallic) ---
    const grad = ctx.createRadialGradient(cx, cy, radius - 3, cx, cy, radius + 8);
    grad.addColorStop(0, 'rgba(60, 70, 80, 0.8)');
    grad.addColorStop(0.5, 'rgba(40, 50, 60, 0.9)');
    grad.addColorStop(1, 'rgba(20, 25, 30, 0.95)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
    ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2, true);
    ctx.fill();

    // --- Inner ring highlight ---
    ctx.strokeStyle = 'rgba(100, 140, 170, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
    ctx.stroke();

    // --- Optical glass tint and restrained horizon sheen ---
    const glassGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    glassGrad.addColorStop(0, 'rgba(120, 180, 200, 0.025)');
    glassGrad.addColorStop(0.66, 'rgba(80, 120, 150, 0.018)');
    glassGrad.addColorStop(1, 'rgba(32, 50, 70, 0.09)');
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 4, 0, Math.PI * 2);
    ctx.clip();
    const sheen = ctx.createLinearGradient(0, cy - radius * 0.05, 0, cy + radius * 0.13);
    sheen.addColorStop(0, 'rgba(175, 205, 218, 0)');
    sheen.addColorStop(0.48, 'rgba(175, 205, 218, 0.055)');
    sheen.addColorStop(0.54, 'rgba(8, 18, 28, 0.025)');
    sheen.addColorStop(1, 'rgba(8, 18, 28, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(cx - radius, cy - radius * 0.05, radius * 2, radius * 0.18);
    ctx.restore();

    // --- Crosshair with mil markings ---
    ctx.strokeStyle = 'rgba(100, 160, 180, 0.35)';
    ctx.lineWidth = 1;
    // Horizontal
    ctx.beginPath();
    ctx.moveTo(cx - radius * 0.85, cy);
    ctx.lineTo(cx - 25, cy);
    ctx.moveTo(cx + 25, cy);
    ctx.lineTo(cx + radius * 0.85, cy);
    // Vertical
    ctx.moveTo(cx, cy - radius * 0.85);
    ctx.lineTo(cx, cy - 25);
    ctx.moveTo(cx, cy + 25);
    ctx.lineTo(cx, cy + radius * 0.85);
    ctx.stroke();

    // Mil marks on horizontal
    for (let i = -20; i <= 20; i++) {
      if (i === 0) continue;
      const mx = cx + i * 8;
      const tickH = i % 5 === 0 ? 6 : 3;
      ctx.beginPath();
      ctx.moveTo(mx, cy - tickH);
      ctx.lineTo(mx, cy + tickH);
      ctx.stroke();
    }

    // Mil marks on vertical
    for (let i = -20; i <= 20; i++) {
      if (i === 0) continue;
      const my = cy + i * 8;
      const tickW = i % 5 === 0 ? 6 : 3;
      ctx.beginPath();
      ctx.moveTo(cx - tickW, my);
      ctx.lineTo(cx + tickW, my);
      ctx.stroke();
    }

    // --- Bearing scale around edge ---
    ctx.font = '10px "SF Mono", Consolas, monospace';
    ctx.fillStyle = 'rgba(140, 175, 195, 0.55)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const headingDeg = state.player.headingDeg;
    for (let deg = 0; deg < 360; deg += 5) {
      const relDeg = ((deg - headingDeg + 540) % 360) - 180;
      if (Math.abs(relDeg) > 55) continue;
      const angle = (relDeg - 90) * RAD;

      const isMajor = deg % 30 === 0;
      const isMedium = deg % 10 === 0;
      const outerR = radius - 4;
      const innerR = radius - (isMajor ? 15 : isMedium ? 10 : 6);

      // Tick
      ctx.strokeStyle = isMajor ? 'rgba(165, 198, 214, 0.68)' : isMedium ? 'rgba(140, 175, 195, 0.42)' : 'rgba(140, 175, 195, 0.22)';
      ctx.lineWidth = isMajor ? 1.5 : isMedium ? 1 : 0.65;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
      ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
      ctx.stroke();

      // Label (only major ticks)
      if (isMajor) {
        const labelR = radius - 22;
        const lx = cx + Math.cos(angle) * labelR;
        const ly = cy + Math.sin(angle) * labelR;
        ctx.fillText(String(deg).padStart(3, '0'), lx, ly);
      }
    }

    // --- Contacts in FOV ---
    for (const contact of state.contacts) {
      const relBrg = ((contact.bearingDeg - headingDeg + 540) % 360) - 180;
      if (Math.abs(relBrg) > 30) continue;

      const angle = (relBrg - 90) * RAD;
      const dist = Math.min(radius * 0.8, (contact.rangeKm ?? 3) * 15);
      const px = cx + Math.cos(angle) * dist * 0.35;
      const py = cy + Math.sin(angle) * dist * 0.35;

      const color = contact.selected ? '#22d3ee' : this._stateColor(contact.state);
      const confidenceAlpha = contact.selected ? 0.95 : Math.max(0.28, Math.min(0.78, contact.confidence / 100));
      ctx.strokeStyle = color;
      ctx.globalAlpha = confidenceAlpha;
      ctx.lineWidth = contact.selected ? 1.8 : 1.2;
      ctx.beginPath();
      ctx.arc(px, py, contact.selected ? 5.5 : 4.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Classification
      if (contact.classification !== 'Unknown') {
        ctx.fillStyle = color;
        ctx.font = '9px "SF Mono", Consolas, monospace';
        ctx.fillText(contact.classification.substring(0, 5).toUpperCase(), px, py - 10);
      }
    }

    // --- Lock indicator ---
    const lockedId = state.player.periscopeState.lockedContactId;
    if (lockedId) {
      const locked = state.contacts.find((c) => c.id === lockedId);
      if (locked) {
        const relBrg = ((locked.bearingDeg - headingDeg + 540) % 360) - 180;
        if (Math.abs(relBrg) <= 30) {
          const angle = (relBrg - 90) * RAD;
          const dist = Math.min(radius * 0.8, (locked.rangeKm ?? 3) * 15);
          const px = cx + Math.cos(angle) * dist * 0.35;
          const py = cy + Math.sin(angle) * dist * 0.35;

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
          ctx.font = '9px "SF Mono", Consolas, monospace';
          ctx.fillText('LOCKED', px, py + s + 12);
        }
      }
    }

    // --- Water drops on glass ---
    this._updateDrops(dt, radius, cx, cy);

    // --- Condensation (subtle haze at edges) ---
    this._condensationPhase += dt;
    const condAlpha = 0.04 + Math.sin(this._condensationPhase * 0.5) * 0.02;
    const condGrad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
    condGrad.addColorStop(0, 'rgba(150, 180, 200, 0)');
    condGrad.addColorStop(0.8, `rgba(150, 180, 200, ${condAlpha})`);
    condGrad.addColorStop(1, `rgba(150, 180, 200, ${condAlpha * 2})`);
    ctx.fillStyle = condGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // --- Exposure warning vignette ---
    const exposure = state.player.periscopeState.exposure;
    if (exposure > 20) {
      const alpha = Math.min(0.5, (exposure - 20) / 160);
      const vigGrad = ctx.createRadialGradient(cx, cy, radius * 0.6, cx, cy, radius);
      vigGrad.addColorStop(0, 'rgba(200, 40, 40, 0)');
      vigGrad.addColorStop(1, `rgba(200, 40, 40, ${alpha})`);
      ctx.fillStyle = vigGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Bottom info bar ---
    ctx.fillStyle = 'rgba(140, 175, 195, 0.6)';
    ctx.font = '11px "SF Mono", Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`BRG ${String(Math.round(headingDeg)).padStart(3, '0')}°`, cx - radius + 15, cy + radius - 15);
    ctx.textAlign = 'right';
    const expBand = state.player.periscopeState.exposureBand;
    if (expBand !== 'NONE') {
      ctx.fillStyle = exposure > 60 ? '#f87171' : '#fbbf24';
      ctx.fillText(`EXPOSURE ${expBand}`, cx + radius - 15, cy + radius - 15);
    }
  }

  private _updateDrops(dt: number, radius: number, cx: number, cy: number): void {
    const ctx = this._ctx;

    // Spawn a small deterministic stream of droplets. Presentation remains
    // reproducible across a fixed input sequence and does not read game state.
    this._dropAccumulator += Math.max(0, dt);
    while (this._dropAccumulator >= 0.22 && this._drops.length < 30) {
      this._dropAccumulator -= 0.22;
      const seed = this._dropSeed++;
      const sample = (salt: number): number => {
        const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
        return value - Math.floor(value);
      };
      const angle = sample(1) * Math.PI * 2;
      const r = radius * (0.34 + sample(2) * 0.56);
      this._drops.push({
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        r: 1 + sample(3) * 2,
        vy: 0.2 + sample(4) * 0.5,
      });
    }

    // Update and draw drops
    for (let i = this._drops.length - 1; i >= 0; i--) {
      const drop = this._drops[i]!;
      drop.y += drop.vy;
      drop.r += dt * 0.3;

      if (drop.r > 4) {
        this._drops.splice(i, 1);
        continue;
      }

      ctx.fillStyle = `rgba(180, 210, 230, ${0.15 / drop.r})`;
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, drop.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Limit drops
    if (this._drops.length > 30) {
      this._drops.splice(0, this._drops.length - 30);
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
