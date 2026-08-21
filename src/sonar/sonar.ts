/**
 * SILENT DEPTH — sonar system (src/sonar/sonar.ts)
 *
 * FR-04/05/06/07/08 — THE information layer (GAME_DESIGN §5, "P0 最重要系统").
 * Pipeline slot 5 (GAME_ARCHITECTURE §7): runs passive listen FIRST (no
 * self-exposure), then the active ping on ctx.pingEdge when the cooldown is
 * ready. The enemy AI system (slot 6) reads ctx.pingEdge and the event-log
 * tail for its own perception; contacts live in ctx.contacts for the
 * fire-control / UI.
 *
 *   passive → ctx.player.detection UNCHANGED (zero-risk)
 *   ping    → battery −2 %, cooldown 6 s, detection +12 (self exposure)
 *
 * Per-game state lives in a WeakMap keyed on the LIVE ctx.player reference
 * (the same documented pattern as src/ai/ai.ts): each createGame() builds a
 * fresh player object, so re-created / interleaved handles never share sonar
 * state (ADR-004). No engine.ts edits — the factory manager wires
 * `sonarSystem` in place of the t-005 stub.
 *
 * DESIGN DECISIONS:
 *   - sonarState is published as 'ping' on the ping tick and 'passive'
 *     otherwise (passive listening is always on during a mission).
 *   - The ping edge is consumed even when the cooldown blocks it (one-shot
 *     input edge; the cooldown gate lives here and in the submarine system's
 *     LOW BATTERY suppression).
 *
 * Task: t-005 sonar (ai-engineer).
 *
 * @pure — zero DOM / browser-API references; the only randomness is
 * ctx.forks.sonar (ADR-004); module state = the per-game WeakMap.
 */

import type { SystemContext, SystemFn } from '../core/engine'
import type { Contact } from '../core/types'
import { runPassiveListen } from './passive'
import { runActivePing } from './ping'
import { applyDecay } from './contacts'

/** Per-ship sonar bookkeeping (one entry per enemy ship). */
export interface SonarShipTrack {
  /** Linked contact id (also in rt.contactsByShip). */
  contactId: string | null
  /** Number of ping hits on this ship. */
  pingCount: number
  /** Number of gated passive observations. */
  passiveObsCount: number
  /** simTime of the last observation (passive obs or ping hit). */
  lastObservedAt: number
  /** simTime of the last gated passive observation (3 s cadence). */
  lastPassiveObsAt: number
  /** simTime when continuous passive tracking began (bearing convergence). */
  passiveTrackStartAt: number
  /** simTime the decay was last applied (10 s steps past the grace period). */
  lastDecayAt: number
  /** Ratcheting classification confidence (0..100). */
  classifyConfidence: number
  /** True once classifyConfidence ≥ lockTypeConfidence (type frozen). */
  typeLocked: boolean
  /** Latest measured noise signature (0..100). */
  lastNoise: number
}

/** Per-game sonar state (WeakMap keyed on the live player reference). */
export interface SonarRuntime {
  tracks: Map<string, SonarShipTrack>
  /** shipId → live Contact object (also present in ctx.contacts). */
  contactsByShip: Map<string, Contact>
  /** torpedo id → simTime of the last sonar.passive (torpedo) emission. */
  torpedoPassiveAt: Map<string, number>
  /** Explosion event ids already announced via sonar.passive. */
  handledExplosions: Set<number>
  nextContactId: number
}

const sonarRuntimes = new WeakMap<object, SonarRuntime>()

/** Get (or lazily create) the per-game sonar runtime. */
export function getSonarRuntime(ctx: SystemContext): SonarRuntime {
  let rt = sonarRuntimes.get(ctx.player)
  if (rt === undefined) {
    rt = {
      tracks: new Map<string, SonarShipTrack>(),
      contactsByShip: new Map<string, Contact>(),
      torpedoPassiveAt: new Map<string, number>(),
      handledExplosions: new Set<number>(),
      nextContactId: 1,
    }
    sonarRuntimes.set(ctx.player, rt)
  }
  return rt
}

/**
 * Sonar pipeline system (pipeline slot 5, GAME_ARCHITECTURE §7): passive
 * listen → active ping (edge + cooldown) → contact decay. Matches SystemFn —
 * the factory manager wires it into src/core/engine.ts in place of the t-005
 * stub.
 */
export const sonarSystem: SystemFn = (ctx): void => {
  if (ctx.state !== 'MISSION_RUNNING') return
  const rt = getSonarRuntime(ctx)

  // Passive first — the zero-risk information source (§5.2).
  runPassiveListen(ctx, rt)

  // Then the active ping (leverage: precise but exposing).
  if (ctx.pingEdge) runActivePing(ctx, rt)

  // Time-based contact decay / degradation / removal (§5.3).
  applyDecay(ctx, rt)

  // Cooldown countdown + sonar state publishing.
  ctx.player.pingCooldown = Math.max(0, ctx.player.pingCooldown - ctx.dt)
  if (!ctx.pingEdge) ctx.player.sonarState = 'passive'
}
