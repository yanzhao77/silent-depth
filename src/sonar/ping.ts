/**
 * SILENT DEPTH — active sonar ping (src/sonar/ping.ts)
 *
 * FR-04 / GAME_DESIGN §5.1. Runs on ctx.pingEdge when the cooldown is ready:
 *
 *   - costs        : battery −sonar.active.batteryPercent (2 %), cooldown
 *                    sonar.active.cooldownSeconds (6 s), self-exposure
 *                    detection += sonar.active.selfExposureDetection (12) —
 *                    DIRECT mutation of ctx.player.detection, the same
 *                    pattern the ai/detection systems use (never re-applied
 *                    elsewhere).
 *   - returns      : for every enemy within sonar.active.rangeKm (10 km):
 *                    bearing ±bearingErrorDeg (0.5°, ×0.7 per further ping),
 *                    range ±10 % (×0.8 per ping) — uncertainty.ts; signal
 *                    strength (range bands + size override); type guess via
 *                    the classification vote (+pingHitConfidenceGain 25).
 *   - one wave     : all contacts in one ping share the same bearing jitter
 *                    draw (§5.1 "同一 ping 内所有接触的 bearing 误差相同").
 *   - events       : sonar.ping {bearingDeg} at launch; sonar.contact
 *                    {contactIds, pingBearingDeg} when ≥1 contact is hit.
 *                    Escorts hear the ping via ctx.pingEdge + distance in the
 *                    ai system (slot 6) — no extra event needed there.
 *
 * Guards: cooldown not ready → no ping (the edge is consumed); battery below
 * the ping cost → no ping (the submarine system already suppresses the edge
 * at LOW BATTERY — this is a defensive second gate).
 *
 * Task: t-005 sonar (ai-engineer).
 *
 * @pure — zero DOM / browser-API references; randomness only from
 * ctx.forks.sonar (ADR-004).
 */

import type { SystemContext } from '../core/engine'
import type { SonarRuntime } from './sonar'
import {
  compassBearing,
  distKm,
  getOrCreateTrack,
  normalizeDeg,
  recordObservation,
} from './contacts'
import {
  observedNoiseForClass,
  pingSignalFor,
} from './classification'
import {
  pingBearingErrorDeg,
  pingRangeErrorFrac,
} from './uncertainty'

/** Run the active ping (guarded: cooldown + battery). */
export function runActivePing(ctx: SystemContext, rt: SonarRuntime): void {
  const balance = ctx.balance
  const ap = balance.sonar.active
  const player = ctx.player

  if (player.pingCooldown > 0) return
  if (player.battery < ap.batteryPercent) return // defensive second gate

  // --- costs ---
  player.battery = Math.max(0, player.battery - ap.batteryPercent)
  player.pingCooldown = ap.cooldownSeconds
  player.detection = Math.min(100, player.detection + ap.selfExposureDetection)
  player.sonarState = 'ping'
  ctx.bus.emit('sonar.ping', { bearingDeg: player.headingDeg })

  // One sound wave → one shared bearing-jitter draw for every contact (§5.1).
  const waveJitter = ctx.forks.sonar.range(-1, 1)

  const hitContactIds: string[] = []
  for (const ship of ctx.enemies) {
    if (ship.hull <= 0) continue
    const distanceKm = distKm(player.position, ship.position)
    if (distanceKm > ap.rangeKm) continue

    const track = getOrCreateTrack(rt, ship.id)
    // Errors for THIS ping (n-th hit: 10 %→8 %→…, 0.5°→0.35°→…).
    const pingCount = track.pingCount + 1
    const rangeErr = pingRangeErrorFrac(pingCount, balance)
    const bearingErr = pingBearingErrorDeg(pingCount, balance)

    const trueBearing = compassBearing(player.position, ship.position)
    const returnedBearing = normalizeDeg(trueBearing + waveJitter * bearingErr)
    const returnedRange = distanceKm * (1 + ctx.forks.sonar.range(-1, 1) * rangeErr)
    const noise = observedNoiseForClass(ship.shipClass, balance, ctx.forks.sonar)
    const signal = pingSignalFor(distanceKm, ship.shipClass, balance)

    const contact = recordObservation(ctx, rt, track, {
      ship,
      bearingDeg: returnedBearing,
      rangeKm: Math.max(0, returnedRange),
      signal,
      noise,
      isPing: true,
      rng: ctx.forks.sonar,
    })
    hitContactIds.push(contact.id)
  }

  if (hitContactIds.length > 0) {
    ctx.bus.emit('sonar.contact', { contactIds: hitContactIds, pingBearingDeg: player.headingDeg })
  }
}
