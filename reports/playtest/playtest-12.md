# Playtest 12 — Sonar Training (t-014 evidence)

- **Version**: be271a0
- **Mission**: M01 — Sonar Training (seed 1001, difficulty 1/5) — determinism run B
- **Agent**: scripted-brain-ping-until-track (Determinism double-run (M01))
- **Result**: **VICTORY** after 120.8 s (2415 ticks)

## Actions

- pings: 3 · fire inputs: 0 · moving ticks: 2415 · turning ticks: 2415 · fire rejections (tail): 0
- strategy: Re-runs the ping-until-track brain on M01/seed 1001 twice; the harness asserts the two final snapshots are byte-identical.

## Result

- outcome: **VICTORY** · score 876 (Excellent) · hull 100 · battery 22.7% · detection 24.0
- sunk: none · damage dealt: 0.0 hull points

## Failure

none — Objective met — mission completed.

## Difficulty

1/5

## Bugs (observed anomalies)

- none observed

## Recommendations

- none

## Evidence

### Score parts
- objective 400 · damage 100 · stealth 126 · torpedoEfficiency 100 · time 100 · survival 50 · total 876 · grade Excellent

### Stats
- torpedoes fired 0 · hit 0 · remaining 4 · peak detection 24 · damage dealt 0.0

### Key events (tail)

- 2.1s sub.speedChanged {"band":"FULL","speedKt":0.1,"noise":46}
- 32.0s escape.escaped {"missionId":"M01","durationSeconds":30}
- 108.7s sonar.ping {"bearingDeg":263.1428584778349}
- 108.7s contact.detected {"contactId":"C-01","state":"UNKNOWN"}
- 108.7s contact.classified {"contactId":"C-01","classification":"LargeSurface","confidence":25}
- 108.7s contact.classified {"contactId":"C-01","classification":"LargeSurface","confidence":25}
- 108.7s sonar.contact {"contactIds":["C-01"],"pingBearingDeg":263.1428584778349}
- 114.7s sonar.ping {"bearingDeg":263.5683570330018}
- 114.7s sonar.contact {"contactIds":["C-01"],"pingBearingDeg":263.5683570330018}
- 120.8s sonar.ping {"bearingDeg":263.8402768210467}
- 120.8s contact.classified {"contactId":"C-01","classification":"LargeSurface","confidence":75}
- 120.8s sonar.contact {"contactIds":["C-01"],"pingBearingDeg":263.8402768210467}
- 120.8s detection.threshold {"detection":24,"band":"Suspicious"}
- 120.8s mission.victory {"scoreParts":{"objective":400,"damage":100,"stealth":126,"torpedoEfficiency":100,"time":100,"survival":50,"total":87...
