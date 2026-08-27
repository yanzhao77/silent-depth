/**
 * SILENT DEPTH — typed event bus (src/core/eventBus.ts)
 *
 * Engine → shell boundary (GAME_ARCHITECTURE §7 step 10, §14). Events are
 * pure data: payload is Record<string, unknown> and never executable code
 * (security, GAME_ARCHITECTURE §12 — no eval / no function payloads).
 *
 * - monotonic event ids (never reused within a session)
 * - ring buffer keeps the tail 50 entries (snapshot eventLog)
 * - simTime is stamped at emission; the engine syncs it each tick via
 *   setSimTime() so emit() keeps the ADR contract signature emit(type, payload)
 *
 * Task: t-003 core runtime (gameplay-engineer).
 *
 * @pure — zero DOM / browser-API references.
 */

import type { EventEntry, EventType } from './types';

/** Ring buffer capacity for the event log tail. */
export const EVENT_LOG_CAPACITY = 50;

export type EventCallback = (entry: EventEntry) => void;
export type Unsubscribe = () => void;

export interface EventBus {
  /** Emit an event; returns the stored entry. Payload must be pure JSON data. */
  emit(type: EventType, payload?: Record<string, unknown>): EventEntry;
  /**
   * Subscribe; returns an unsubscribe function.
   * @internal-reserved — the pub-sub listener layer is currently exercised only
   * by tests. The runtime engine→shell handoff polls `getLog()` / snapshot
   * `.eventLog` (main.ts processNewEvents) rather than subscribing. Kept as a
   * contract API (GAME_ARCHITECTURE §14); do not remove without updating
   * tests/unit/core.test.ts.
   */
  subscribe(cb: EventCallback): Unsubscribe;
  /** Read-only snapshot of the tail (oldest first). */
  getLog(): EventEntry[];
  /** Sync the simTime stamped onto newly emitted entries. */
  setSimTime(simTime: number): void;
  /** Full reset (new session). Resets ids — monotonicity is per session. */
  clear(): void;
}

export function createEventBus(capacity: number = EVENT_LOG_CAPACITY): EventBus {
  return new RingBufferEventBus(capacity);
}

class RingBufferEventBus implements EventBus {
  private readonly ring: Array<EventEntry | null>;
  private readonly capacity: number;
  private head = 0; // index of the oldest entry
  private count = 0;
  private nextId = 1;
  private simTime = 0;
  private listeners = new Set<EventCallback>();

  constructor(capacity: number) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.ring = new Array<EventEntry | null>(this.capacity).fill(null);
  }

  emit(type: EventType, payload?: Record<string, unknown>): EventEntry {
    const entry: EventEntry = { id: this.nextId++, simTime: this.simTime, type, payload };
    const idx = (this.head + this.count) % this.capacity;
    this.ring[idx] = entry;
    if (this.count === this.capacity) {
      this.head = (this.head + 1) % this.capacity;
    } else {
      this.count++;
    }
    // Listeners must never break the engine: each is isolated in try/catch.
    for (const cb of Array.from(this.listeners)) {
      try {
        cb(entry);
      } catch {
        // swallow — event consumers are best-effort (UI/audio/playtest)
      }
    }
    return entry;
  }

  subscribe(cb: EventCallback): Unsubscribe {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  getLog(): EventEntry[] {
    const out: EventEntry[] = [];
    for (let i = 0; i < this.count; i++) {
      const entry = this.ring[(this.head + i) % this.capacity];
      if (entry != null) out.push(entry); // narrows both null and undefined
    }
    return out;
  }

  setSimTime(simTime: number): void {
    this.simTime = simTime;
  }

  clear(): void {
    this.ring.fill(null);
    this.head = 0;
    this.count = 0;
    this.nextId = 1;
    this.simTime = 0;
    this.listeners.clear();
  }
}
