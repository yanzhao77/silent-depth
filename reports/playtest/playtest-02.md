# Playtest 02 — First Ambush (t-014 evidence)

- **Version**: b739063
- **Mission**: M02 — First Ambush (seed 1002, difficulty 2/5)
- **Agent**: scripted-brain-stationary-ambush (Stationary ambush (M02, PROVEN t-013/t-020))
- **Result**: **VICTORY** after 2753.8 s (55075 ticks)

## Actions

- pings: 21 · fire inputs: 2 · moving ticks: 0 · turning ticks: 55075 · fire rejections (tail): 0
- strategy: Hold position STOPPED at Medium depth, sparse pings every 150 s for range, fire point-blank (≤ 1.2 km) with a fresh ping + lead-corrected fire solution; re-fire after torpedo resolution.

## Result

- outcome: **VICTORY** · score 663.5761493209185 (Good) · hull 100 · battery 9.0% · detection 100.0
- sunk: E-01 (Tanker) · damage dealt: 130.0 hull points

## Failure

none — Objective met — mission completed.

## Difficulty

2/5

## Bugs (observed anomalies)

- Torpedo efficiency 2/4 (50%) — 2 torpedo(es) missed or expired without a hit at the effective fire range.
- Shared detection peaked at 100 (≥ 40) — merchants ALERT-scatter (turn 30°, speed to 11 kt for 60 s), which invalidates the lead estimate of in-flight fire solutions.
- Battery pressure: 8.963999999932742% remaining — ping cost (2 %/ping) and CRUISE drain (0.3 %/s) close off long approach-and-fire sequences.
- Detection pegged at 100 despite victory — with no escorts the meter had no combat consequence, but the stealth score component is zeroed: ping self-exposure (+12/ping) accumulates with no silent-running sink over a long session.

## Recommendations

- Balance (t-015): merchant ALERT threshold at detection 40 makes every long shot unreliable after any ping exposure; consider 50+, or a shorter/faster scatter so fire solutions stay predictive.
- Balance (t-015): battery budget — repeated range pings plus CRUISE approach drain make long missions battery-starved; consider a cheaper ping or lower CRUISE drain.
- Balance (t-015): add an ambient detection sink when silent running is off (STOPPED/Medium), so long no-escort sessions do not silently zero the stealth component.

## Evidence

### Score parts
- objective 400 · damage 70 · stealth 0 · torpedoEfficiency 100 · time 43.57614932091852 · survival 50 · total 663.5761493209185 · grade Good

### Stats
- torpedoes fired 4 · hit 2 · remaining 0 · peak detection 100 · damage dealt 130.0

### Key events (tail)

- 2705.9s sonar.passive {"source":"engine","bearingDeg":339.54887276210934}
- 2706.2s torpedo.ready {"tubeId":"T-01","targetContactId":"C-09"}
- 2706.2s torpedo.fired {"tubeId":"T-01","targetContactId":"C-09"}
- 2706.2s torpedo.ready {"tubeId":"T-02","targetContactId":"C-09"}
- 2706.2s torpedo.fired {"tubeId":"T-02","targetContactId":"C-09"}
- 2706.2s sonar.passive {"source":"torpedo","bearingDeg":334.9110326129247}
- 2706.2s sonar.passive {"source":"torpedo","bearingDeg":334.9110326129247}
- 2708.9s sonar.passive {"source":"engine","bearingDeg":338.8199571366854}
- 2711.2s sonar.passive {"source":"torpedo","bearingDeg":334.9110326129247}
- 2711.2s sonar.passive {"source":"torpedo","bearingDeg":334.9110326129247}
- 2711.9s sonar.passive {"source":"engine","bearingDeg":338.85303459581297}
- 2714.9s sonar.passive {"source":"engine","bearingDeg":339.25915875929917}
- 2716.2s sonar.passive {"source":"torpedo","bearingDeg":334.9110326129247}
- 2716.2s sonar.passive {"source":"torpedo","bearingDeg":334.9110326129247}
- 2717.9s sonar.passive {"source":"engine","bearingDeg":340.07291782150094}
- 2720.9s sonar.passive {"source":"engine","bearingDeg":339.91297724402136}
- 2721.2s sonar.passive {"source":"torpedo","bearingDeg":334.9110326129247}
- 2721.2s sonar.passive {"source":"torpedo","bearingDeg":334.9110326129247}
- 2723.9s sonar.passive {"source":"engine","bearingDeg":339.23189285640007}
- 2726.2s sonar.passive {"source":"torpedo","bearingDeg":334.9110326129247}
- 2726.2s sonar.passive {"source":"torpedo","bearingDeg":334.9110326129247}
- 2726.9s sonar.passive {"source":"engine","bearingDeg":340.91978388215676}
- 2729.9s sonar.passive {"source":"engine","bearingDeg":340.8943676498749}
- 2731.2s sonar.passive {"source":"torpedo","bearingDeg":334.9110326129247}
- 2731.2s sonar.passive {"source":"torpedo","bearingDeg":334.9110326129247}
- 2732.9s sonar.passive {"source":"engine","bearingDeg":339.9828326605593}
- 2733.9s torpedo.missed {"torpedoId":"TP-02","targetShipId":"E-01","distM":59}
- 2733.9s torpedo.missed {"torpedoId":"TP-01","targetShipId":"E-01","distM":59}
- 2734.0s torpedo.ready {"tubeId":"T-03","targetContactId":"C-09"}
- 2734.0s torpedo.fired {"tubeId":"T-03","targetContactId":"C-09"}
- 2734.0s torpedo.ready {"tubeId":"T-04","targetContactId":"C-09"}
- 2734.0s torpedo.fired {"tubeId":"T-04","targetContactId":"C-09"}
- 2734.0s sonar.passive {"source":"torpedo","bearingDeg":343.553966754294}
- 2734.0s sonar.passive {"source":"torpedo","bearingDeg":343.553966754294}
- 2735.9s sonar.passive {"source":"engine","bearingDeg":341.73578542970046}
- 2738.9s sonar.passive {"source":"engine","bearingDeg":342.34707631947094}
- 2739.0s sonar.passive {"source":"torpedo","bearingDeg":343.553966754294}
- 2739.0s sonar.passive {"source":"torpedo","bearingDeg":343.553966754294}
- 2741.9s sonar.passive {"source":"engine","bearingDeg":342.091207898473}
- 2744.0s sonar.passive {"source":"torpedo","bearingDeg":343.553966754294}
- 2744.0s sonar.passive {"source":"torpedo","bearingDeg":343.553966754294}
- 2744.9s sonar.passive {"source":"engine","bearingDeg":343.14254967637714}
- 2747.9s sonar.passive {"source":"engine","bearingDeg":343.4544239015696}
- 2749.0s sonar.passive {"source":"torpedo","bearingDeg":343.553966754294}
- 2749.0s sonar.passive {"source":"torpedo","bearingDeg":343.553966754294}
- 2750.9s sonar.passive {"source":"engine","bearingDeg":342.4247745451721}
- 2753.8s torpedo.hit {"torpedoId":"TP-04","targetShipId":"E-01","distM":55}
- 2753.8s ship.sunk {"shipId":"E-01","shipClass":"Tanker"}
- 2753.8s torpedo.hit {"torpedoId":"TP-03","targetShipId":"E-01","distM":55}
- 2753.8s mission.victory {"scoreParts":{"objective":400,"damage":70,"stealth":0,"torpedoEfficiency":100,"time":43.57614932091852,"survival":50...
