/**
 * SoftCanvas — a minimal software implementation of the Canvas2D subset used by
 * SILENT DEPTH's renderer and sprite factory, so the REAL game renderer can
 * draw headlessly to a pixel buffer (for README preview renders).
 *
 * Implements: save/restore/translate/rotate/setTransform, fillStyle/strokeStyle
 * (solid '#rgb/#rrggbb/rgba()' or SoftGradient), globalAlpha, lineWidth,
 * lineCap/lineJoin, setLineDash, beginPath/moveTo/lineTo/closePath/arc/ellipse/
 * arcTo/quadraticCurveTo/bezierCurveTo, fill/stroke, fillRect/strokeRect/
 * clearRect, drawImage (3/5/9-arg), createLinearGradient/createRadialGradient,
 * fillText (no-op — text is DOM HUD; canvas text is skipped).
 *
 * Honesty: this is a render approximation for preview images, NOT a browser
 * canvas. Screenshots captured from these renders are labeled as procedural
 * previews; real captures come from the in-game F12 screenshot key.
 */

export type SoftColor = string | SoftGradient;

export class SoftGradient {
  stops: { t: number; r: number; g: number; b: number; a: number }[] = [];
  constructor(
    public kind: 'linear' | 'radial',
    public x0: number,
    public y0: number,
    public x1: number,
    public y1: number,
    public r0 = 0,
    public r1 = 0,
  ) {}
  addColorStop(t: number, color: string): void {
    const c = parseColor(color);
    this.stops.push({ t, r: c[0], g: c[1], b: c[2], a: c[3] });
    this.stops.sort((a, b) => a.t - b.t);
  }
  colorAt(u: number): [number, number, number, number] {
    const s = this.stops;
    if (s.length === 0) return [0, 0, 0, 1];
    if (u <= s[0]!.t) return [s[0]!.r, s[0]!.g, s[0]!.b, s[0]!.a];
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i]!,
        b = s[i + 1]!;
      if (u <= b.t) {
        const f = b.t === a.t ? 0 : (u - a.t) / (b.t - a.t);
        return [
          a.r + (b.r - a.r) * f,
          a.g + (b.g - a.g) * f,
          a.b + (b.b - a.b) * f,
          a.a + (b.a - a.a) * f,
        ];
      }
    }
    const l = s[s.length - 1]!;
    return [l.r, l.g, l.b, l.a];
  }
}

export function parseColor(color: string): [number, number, number, number] {
  const s = color.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 3)
      return [
        parseInt(h[0]! + h[0]!, 16),
        parseInt(h[1]! + h[1]!, 16),
        parseInt(h[2]! + h[2]!, 16),
        1,
      ];
    if (h.length === 6)
      return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
        1,
      ];
    if (h.length === 8)
      return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
        parseInt(h.slice(6, 8), 16) / 255,
      ];
    return [0, 0, 0, 1];
  }
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  if (s === 'transparent') return [0, 0, 0, 0];
  return [255, 255, 255, 1];
}

function mul(a: number[], b: number[]): number[] {
  // a × b (a applied first, then b)
  return [
    a[0]! * b[0]! + a[2]! * b[1]!,
    a[1]! * b[0]! + a[3]! * b[1]!,
    a[0]! * b[2]! + a[2]! * b[3]!,
    a[1]! * b[2]! + a[3]! * b[3]!,
    a[0]! * b[4]! + a[2]! * b[5]! + a[4]!,
    a[1]! * b[4]! + a[3]! * b[5]! + a[5]!,
  ];
}

function apply(m: number[], x: number, y: number): [number, number] {
  return [m[0]! * x + m[2]! * y + m[4]!, m[1]! * x + m[3]! * y + m[5]!];
}

type Seg = [number, number, number, number];

export class SoftCanvas {
  private _width: number;
  private _height: number;
  data: Uint8ClampedArray;
  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
  /** Browser-like: assigning width/height resizes the pixel buffer. */
  get width(): number {
    return this._width;
  }
  set width(w: number) {
    this._width = w;
    this.data = new Uint8ClampedArray(w * this._height * 4);
  }
  get height(): number {
    return this._height;
  }
  set height(h: number) {
    this._height = h;
    this.data = new Uint8ClampedArray(this._width * h * 4);
  }
  getContext(_id: string): SoftCtx {
    return new SoftCtx(this);
  }
}

export class SoftCtx {
  private stack: { t: number[]; alpha: number; dash: number[] }[] = [];
  private t: number[] = [1, 0, 0, 1, 0, 0];
  globalAlpha = 1;
  lineWidth = 1;
  lineCap: string = 'butt';
  lineJoin: string = 'miter';
  dash: number[] = [];
  font = '';
  textAlign = 'left';
  fillStyle: SoftColor = '#000';
  strokeStyle: SoftColor = '#000';
  private path: number[] = [];
  private subpaths: number[] = [];
  canvas: SoftCanvas;

  constructor(canvas: SoftCanvas) {
    this.canvas = canvas;
  }

  save(): void {
    this.stack.push({ t: [...this.t], alpha: this.globalAlpha, dash: [...this.dash] });
  }
  restore(): void {
    const s = this.stack.pop();
    if (s) {
      this.t = s.t;
      this.globalAlpha = s.alpha;
      this.dash = s.dash;
    }
  }
  translate(x: number, y: number): void {
    // Canvas spec: transforms POST-multiply (M = M × T), so the new transform
    // is applied after the current one. p' = M·T·p.
    this.t = mul(this.t, [1, 0, 0, 1, x, y]);
  }
  rotate(a: number): void {
    const c = Math.cos(a),
      s = Math.sin(a);
    this.t = mul(this.t, [c, s, -s, c, 0, 0]);
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.t = [a, b, c, d, e, f];
  }
  setLineDash(d: number[]): void {
    this.dash = d;
  }

  beginPath(): void {
    this.path = [];
    this.subpaths = [];
  }
  moveTo(x: number, y: number): void {
    this.path.push(x, y);
    this.subpaths.push(this.path.length);
  }
  lineTo(x: number, y: number): void {
    this.path.push(x, y);
  }
  closePath(): void {
    const p = this.path;
    const start = this.subpaths.length > 1 ? this.subpaths[this.subpaths.length - 2]! - 2 : 0;
    if (p.length >= start + 4) {
      p.push(p[start]!, p[start + 1]!);
    }
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    const p = this.path;
    const x0 = p[p.length - 2]!,
      y0 = p[p.length - 1]!;
    for (let i = 1; i <= 16; i++) {
      const u = i / 16,
        v = 1 - u;
      p.push(v * v * x0 + 2 * v * u * cx + u * u * x, v * v * y0 + 2 * v * u * cy + u * u * y);
    }
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    const p = this.path;
    const x0 = p[p.length - 2]!,
      y0 = p[p.length - 1]!;
    for (let i = 1; i <= 20; i++) {
      const u = i / 20,
        v = 1 - u;
      const a = v * v * v,
        b = 3 * v * v * u,
        c = 3 * v * u * u,
        d = u * u * u;
      p.push(a * x0 + b * c1x + c * c2x + d * x, a * y0 + b * c1y + c * c2y + d * y);
    }
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void {
    const p = this.path;
    if (p.length < 2) return;
    const x0 = p[p.length - 2]!,
      y0 = p[p.length - 1]!;
    const d1 = Math.hypot(x1 - x0, y1 - y0),
      d2 = Math.hypot(x2 - x1, y2 - y1);
    if (d1 < 1e-9 || d2 < 1e-9) {
      this.lineTo(x1, y1);
      return;
    }
    const ux = (x1 - x0) / d1,
      uy = (y1 - y0) / d1;
    const vx = (x2 - x1) / d2,
      vy = (y2 - y1) / d2;
    const dp = ux * vx + uy * vy;
    const ang = Math.acos(Math.max(-1, Math.min(1, dp)));
    const tan = Math.tan(ang / 2);
    const d = Math.min(d1, d2);
    const tlen = Math.min(d, r * tan); // tangent length
    const cx = x1 - ux * tlen,
      cy = y1 - uy * tlen;
    const ex = x1 + vx * tlen,
      ey = y1 + vy * tlen;
    // arc center
    const n1x = -uy,
      n1y = ux;
    const midX = (cx + ex) / 2,
      midY = (cy + ey) / 2;
    const dist = Math.hypot(midX - x1, midY - y1);
    const h = Math.sqrt(Math.max(0, r * r - tlen * tlen));
    const ox = x1 + n1x * ((tlen * (r - dist)) / r); // approx
    void ox;
    const ccx = midX + n1x * h,
      ccy = midY + n1y * h;
    void ccx;
    void ccy;
    // fallback: sample a quadratic-ish arc via angle
    const a0 = Math.atan2(cy - (x1 + n1x * h), cx - (x1 + n1y * h));
    void a0;
    this.lineTo(cx, cy);
    // approximate the arc with line segments (rotated frame)
    const ang0 = Math.atan2(cy - (y1 + n1y * h) - (cy - (y1 + n1y * h)), 0);
    void ang0;
    const arcCx = x1 + n1x * h;
    const arcCy = y1 + n1y * h;
    const sAng = Math.atan2(cy - arcCy, cx - arcCx);
    const eAng = Math.atan2(ey - arcCy, ex - arcCx);
    const ccw = sAng < eAng;
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const a = ccw
        ? sAng + ((eAng - sAng + (eAng < sAng ? Math.PI * 2 : 0)) * i) / steps
        : sAng - ((sAng - eAng + (sAng < eAng ? Math.PI * 2 : 0)) * i) / steps;
      const aa = ccw ? a : a;
      this.path.push(arcCx + r * Math.cos(aa), arcCy + r * Math.sin(aa));
    }
  }
  arc(x: number, y: number, r: number, start: number, end: number, ccw = false): void {
    const p = this.path;
    const steps = Math.max(8, Math.ceil(Math.abs(end - start) / (Math.PI / 24)));
    for (let i = 0; i <= steps; i++) {
      const a = ccw ? start - ((start - end) * i) / steps : start + ((end - start) * i) / steps;
      p.push(x + r * Math.cos(a), y + r * Math.sin(a));
    }
  }
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rot: number,
    start: number,
    end: number,
    ccw = false,
  ): void {
    const p = this.path;
    const steps = Math.max(8, Math.ceil(Math.abs(end - start) / (Math.PI / 24)));
    for (let i = 0; i <= steps; i++) {
      const a = ccw ? start - ((start - end) * i) / steps : start + ((end - start) * i) / steps;
      const px = rx * Math.cos(a),
        py = ry * Math.sin(a);
      p.push(
        x + px * Math.cos(rot) - py * Math.sin(rot),
        y + px * Math.sin(rot) + py * Math.cos(rot),
      );
    }
  }

  private pathSegments(): Seg[] {
    const segs: Seg[] = [];
    const p = this.path;
    for (let i = 0; i + 3 < p.length; i += 2) segs.push([p[i]!, p[i + 1]!, p[i + 2]!, p[i + 3]!]);
    return segs;
  }

  private colorOf(style: SoftColor, x: number, y: number): [number, number, number, number] {
    if (style instanceof SoftGradient) {
      let u: number;
      if (style.kind === 'linear') {
        const dx = style.x1 - style.x0,
          dy = style.y1 - style.y0;
        const len2 = dx * dx + dy * dy || 1;
        u = ((x - style.x0) * dx + (y - style.y0) * dy) / len2;
      } else {
        const d = Math.hypot(x - style.x0, y - style.y0);
        u = (d - style.r0) / Math.max(1e-6, style.r1 - style.r0);
      }
      return style.colorAt(u);
    }
    const c = parseColor(style);
    return c;
  }

  private paint(x: number, y: number, rgba: [number, number, number, number]): void {
    if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return;
    const a = rgba[3] * this.globalAlpha;
    if (a <= 0) return;
    const i = (y * this.canvas.width + x) * 4;
    const d = this.canvas.data;
    const sa = a;
    const da = d[i + 3]! / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) return;
    d[i] = Math.round((rgba[0] * sa + d[i]! * da * (1 - sa)) / outA);
    d[i + 1] = Math.round((rgba[1] * sa + d[i + 1]! * da * (1 - sa)) / outA);
    d[i + 2] = Math.round((rgba[2] * sa + d[i + 2]! * da * (1 - sa)) / outA);
    d[i + 3] = Math.round(outA * 255);
  }

  fill(): void {
    const segs = this.pathSegments();
    if (segs.length === 0) return;
    const pts = segs.flatMap((s) => [s[0], s[1], s[2], s[3]]);
    // bbox in world space, then transform corners
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const world: [number, number][] = [];
    for (let i = 0; i < pts.length; i += 2) world.push([pts[i]!, pts[i + 1]!]);
    for (const [x, y] of world) {
      const [sx, sy] = apply(this.t, x, y);
      if (sx < minX) minX = sx;
      if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy;
      if (sy > maxY) maxY = sy;
    }
    const screenSegs = segs.map((s) => {
      const [x1, y1] = apply(this.t, s[0], s[1]);
      const [x2, y2] = apply(this.t, s[2], s[3]);
      return [x1, y1, x2, y2] as Seg;
    });
    const y0 = Math.max(0, Math.floor(minY)),
      y1 = Math.min(this.canvas.height - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) {
      const hits: number[] = [];
      for (const [ax, ay, bx, by] of screenSegs) {
        if (ay === by) continue;
        if (y < Math.min(ay, by) || y > Math.max(ay, by)) continue;
        const t = (y - ay) / (by - ay);
        hits.push(ax + t * (bx - ax));
      }
      hits.sort((a, b) => a - b);
      for (let i = 0; i + 1 < hits.length; i += 2) {
        const ha = Math.max(0, Math.ceil(hits[i]!)),
          hb = Math.min(this.canvas.width - 1, Math.floor(hits[i + 1]!));
        for (let x = ha; x <= hb; x++) this.paint(x, y, this.colorOf(this.fillStyle, x, y));
      }
    }
  }

  stroke(): void {
    const segs = this.pathSegments();
    if (segs.length === 0) return;
    const r = Math.max(0.5, this.lineWidth / 2);
    const screenSegs = segs.map((s) => {
      const [x1, y1] = apply(this.t, s[0], s[1]);
      const [x2, y2] = apply(this.t, s[2], s[3]);
      return [x1, y1, x2, y2] as Seg;
    });
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const [ax, ay, bx, by] of screenSegs) {
      minX = Math.min(minX, ax, bx);
      maxX = Math.max(maxX, ax, bx);
      minY = Math.min(minY, ay, by);
      maxY = Math.max(maxY, ay, by);
    }
    const x0 = Math.max(0, Math.floor(minX - r)),
      x1 = Math.min(this.canvas.width - 1, Math.ceil(maxX + r));
    const y0 = Math.max(0, Math.floor(minY - r)),
      y1 = Math.min(this.canvas.height - 1, Math.ceil(maxY + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let best = Infinity;
        for (const [ax, ay, bx, by] of screenSegs) {
          const dx = bx - ax,
            dy = by - ay;
          const len2 = dx * dx + dy * dy || 1e-12;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
          const px = ax + t * dx,
            py = ay + t * dy;
          const d = Math.hypot(x - px, y - py);
          if (d < best) best = d;
        }
        if (best <= r) this.paint(x, y, this.colorOf(this.strokeStyle, x, y));
      }
    }
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.beginPath();
    this.rect(x, y, w, h);
    this.fill();
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.beginPath();
    this.rect(x, y, w, h);
    this.stroke();
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    const [x0, y0] = apply(this.t, x, y);
    // clear in screen space (ignore rotation for simplicity — used on fresh frames)
    const xa = Math.max(0, Math.floor(x0)),
      ya = Math.max(0, Math.floor(y0));
    const xb = Math.min(this.canvas.width, Math.ceil(x0 + w)),
      yb = Math.min(this.canvas.height, Math.ceil(y0 + h));
    for (let yy = ya; yy < yb; yy++) {
      for (let xx = xa; xx < xb; xx++) {
        const i = (yy * this.canvas.width + xx) * 4;
        this.canvas.data[i] = 0;
        this.canvas.data[i + 1] = 0;
        this.canvas.data[i + 2] = 0;
        this.canvas.data[i + 3] = 0;
      }
    }
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }

  drawImage(img: SoftCanvas, ...args: number[]): void {
    let sx = 0,
      sy = 0,
      sw = img.width,
      sh = img.height,
      dx: number,
      dy: number,
      dw: number,
      dh: number;
    if (args.length === 4) {
      dx = args[0]!;
      dy = args[1]!;
      dw = args[2]!;
      dh = args[3]!;
    } else if (args.length === 8) {
      sx = args[0]!;
      sy = args[1]!;
      sw = args[2]!;
      sh = args[3]!;
      dx = args[4]!;
      dy = args[5]!;
      dw = args[6]!;
      dh = args[7]!;
    } else if (args.length === 2) {
      dx = args[0]!;
      dy = args[1]!;
      dw = img.width;
      dh = img.height;
    } else {
      return;
    }
    if (dw <= 0 || dh <= 0) return;
    for (let py = 0; py < dh; py++) {
      for (let px = 0; px < dw; px++) {
        const srcX = Math.min(img.width - 1, Math.floor(sx + (px / dw) * sw));
        const srcY = Math.min(img.height - 1, Math.floor(sy + (py / dh) * sh));
        const si = (srcY * img.width + srcX) * 4;
        const a = img.data[si + 3]! / 255;
        if (a <= 0) continue;
        const [wx, wy] = apply(this.t, dx + px, dy + py);
        // nearest screen pixel
        const ix = Math.round(wx),
          iy = Math.round(wy);
        this.paint(ix, iy, [img.data[si]!, img.data[si + 1]!, img.data[si + 2]!, a * 255]);
      }
    }
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): SoftGradient {
    return new SoftGradient('linear', x0, y0, x1, y1);
  }
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): SoftGradient {
    return new SoftGradient('radial', x0, y0, x1, y1, r0, r1);
  }
  fillText(_text: string, _x: number, _y: number): void {
    // no-op: text is DOM HUD; canvas labels skipped in preview renders.
  }
  strokeText(_text: string, _x: number, _y: number): void {}
  measureText(): { width: number } {
    return { width: 0 };
  }
  getImageData(): ImageData {
    return {
      width: this.canvas.width,
      height: this.canvas.height,
      data: this.canvas.data,
    } as ImageData;
  }
}
