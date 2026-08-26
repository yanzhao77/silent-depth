/**
 * SILENT DEPTH — safe DOM helpers (src/ui/dom.ts)
 *
 * GAME_ARCHITECTURE §12 (security, NFR-4): all engine-derived text MUST be
 * rendered via textContent / createElement — never innerHTML. This module is
 * the whitelisted helper layer for the whole shell (HUD, menus).
 *
 * Rules enforced here:
 *  - el() builds elements with createElement only; children are appended as
 *    nodes; string children become TEXT NODES (never parsed as markup).
 *  - setText() is the diff-minimal text writer used by the HUD hot path:
 *    it only touches textContent when the value actually changed (no DOM
 *    write churn per frame, GAME_ARCHITECTURE §11).
 *  - There is deliberately NO innerHTML-based builder in this module.
 *
 * DESIGN DECISIONS:
 *  - props.style is a plain record (camelCase CSS properties); the module
 *    assigns property-by-property so it stays allocation-light and typed.
 *  - No dynamic event payloads are ever accepted; callbacks receive native
 *    events only.
 *
 * Task: t-010 ui-engineer (browser presentation layer).
 * @pure-at-import — document is only touched inside functions.
 */

/** Element properties accepted by el(). */
export interface ElProps {
  className?: string;
  id?: string;
  /** Static text (safe — becomes a text node). */
  text?: string;
  title?: string;
  /** Static HTML attributes (whitelisted by usage; never engine data). */
  attrs?: Record<string, string>;
  /** Inline styles (camelCase keys, e.g. { color: '#fff' }). */
  style?: Record<string, string>;
  dataset?: Record<string, string>;
  onclick?: (e: MouseEvent) => void;
  onchange?: (e: Event) => void;
  oninput?: (e: Event) => void;
  onwheel?: (e: WheelEvent) => void;
  onpointerdown?: (e: PointerEvent) => void;
  onpointermove?: (e: PointerEvent) => void;
  onpointerup?: (e: PointerEvent) => void;
  onkeydown?: (e: KeyboardEvent) => void;
}

export type Child = Node | string | number | null | undefined;
export type ChildrenArg = Child | Child[];

/**
 * Create an element. Strings in `children` become TEXT NODES — they are never
 * parsed as HTML (security: no innerHTML with engine data). Nested arrays are
 * flattened (callers may pass element lists).
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: ElProps,
  ...children: ChildrenArg[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props) {
    if (props.className !== undefined) node.className = props.className;
    if (props.id !== undefined) node.id = props.id;
    if (props.title !== undefined) node.title = props.title;
    if (props.attrs) {
      for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
    }
    if (props.style) {
      for (const [k, v] of Object.entries(props.style)) {
        // Style keys are static literals from our own code (never engine
        // data); assigning via style.setProperty avoids parsing issues.
        node.style.setProperty(k, v);
      }
    }
    if (props.dataset) {
      for (const [k, v] of Object.entries(props.dataset)) node.dataset[k] = v;
    }
    if (props.text !== undefined) node.textContent = props.text;
    if (props.onclick) node.addEventListener('click', props.onclick as EventListener);
    if (props.onchange) node.addEventListener('change', props.onchange as EventListener);
    if (props.oninput) node.addEventListener('input', props.oninput as EventListener);
    if (props.onwheel) node.addEventListener('wheel', props.onwheel as EventListener);
    if (props.onpointerdown)
      node.addEventListener('pointerdown', props.onpointerdown as EventListener);
    if (props.onpointermove)
      node.addEventListener('pointermove', props.onpointermove as EventListener);
    if (props.onpointerup) node.addEventListener('pointerup', props.onpointerup as EventListener);
    if (props.onkeydown) node.addEventListener('keydown', props.onkeydown as EventListener);
  }
  for (const child of children) appendChildren(node, child);
  return node;
}

function appendChildren(node: HTMLElement, child: ChildrenArg): void {
  if (Array.isArray(child)) {
    for (const c of child) appendChildren(node, c);
    return;
  }
  if (child === null || child === undefined) return;
  if (typeof child === 'string' || typeof child === 'number') {
    node.append(document.createTextNode(String(child)));
  } else {
    node.append(child);
  }
}

/** Create a text node (explicit helper for append-only call sites). */
export function text(value: string | number): Text {
  return document.createTextNode(String(value));
}

/** Remove every child (screen transitions). */
export function clearChildren(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/**
 * Diff-minimal text writer for the HUD hot path: assigns textContent only
 * when the value differs from the current content (GAME_ARCHITECTURE §11 —
 * no per-frame DOM write churn).
 */
export function setText(node: HTMLElement, value: string | number): void {
  const v = String(value);
  if (node.textContent !== v) node.textContent = v;
}

/** Toggle a CSS class (true adds, false removes). */
export function toggleClass(node: HTMLElement, className: string, on: boolean): void {
  node.classList.toggle(className, on);
}
