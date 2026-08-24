# Playtest 07 — Generated Cargo Pair (t-014 evidence)

- **Version**: 5409c51
- **Mission**: GEN-02 — Generated Cargo Pair (seed 2002, difficulty 1/5)
- **Agent**: scripted-brain-generic-hunter (Generic hunter (generated missions))
- **Result**: **VICTORY** after 1374.6 s (27492 ticks)

## Actions

- pings: 83 · fire inputs: 2 · moving ticks: 27492 · turning ticks: 25580 · fire rejections (tail): 0
- strategy: Silent approach (SILENT band, Medium), ping to acquire range, fire at the nearest TRACKED-or-better contact ≤ 1.5 km; evade when detection ≥ 45 or an escort escalates inside 5 km.

## Result

- outcome: **VICTORY** · score 697.2949478049404 (Good) · hull 100 · battery 0.0% · detection 0.0
- sunk: E-02 (Cargo) · damage dealt: 110.0 hull points

## Failure

none — Objective met — mission completed.

## Difficulty

1/5

## Bugs (observed anomalies)

- Torpedo efficiency 2/4 (50%) — 2 torpedo(es) missed or expired without a hit at the effective fire range.
- Shared detection peaked at 100 (≥ 40) — merchants ALERT-scatter (turn 30°, speed to 11 kt for 60 s), which invalidates the lead estimate of in-flight fire solutions.
- Battery pressure: 0% remaining — ping cost (2 %/ping) and CRUISE drain (0.3 %/s) close off long approach-and-fire sequences.
- Detection pegged at 100 despite victory — with no escorts the meter had no combat consequence, but the stealth score component is zeroed: ping self-exposure (+12/ping) accumulates with no silent-running sink over a long session.

## Recommendations

- Balance (t-015): merchant ALERT threshold at detection 40 makes every long shot unreliable after any ping exposure; consider 50+, or a shorter/faster scatter so fire solutions stay predictive.
- Balance (t-015): battery budget — repeated range pings plus CRUISE approach drain make long missions battery-starved; consider a cheaper ping or lower CRUISE drain.
- Balance (t-015): add an ambient detection sink when silent running is off (STOPPED/Medium), so long no-escort sessions do not silently zero the stealth component.

## Evidence

### Score parts
- objective 400 · damage 60 · stealth 0 · torpedoEfficiency 100 · time 87.2949478049404 · survival 50 · total 697.2949478049404 · grade Good

### Stats
- torpedoes fired 4 · hit 2 · remaining 0 · peak detection 100 · damage dealt 110.0

### Key events (tail)

- 1337.8s sonar.passive {"source":"torpedo","bearingDeg":100.31676217469825}
- 1338.8s sonar.passive {"source":"engine","bearingDeg":359.98263118538114}
- 1339.7s sonar.passive {"source":"engine","bearingDeg":70.46802876692811}
- 1341.8s sonar.passive {"source":"engine","bearingDeg":359.72214859239597}
- 1342.8s sonar.passive {"source":"engine","bearingDeg":69.35144085516184}
- 1342.9s sonar.passive {"source":"torpedo","bearingDeg":100.39123128691818}
- 1342.9s sonar.passive {"source":"torpedo","bearingDeg":100.39123128691818}
- 1344.9s sonar.passive {"source":"engine","bearingDeg":359.1065564415518}
- 1345.8s sonar.passive {"source":"engine","bearingDeg":69.0818883097293}
- 1347.9s sonar.passive {"source":"engine","bearingDeg":359.7803108821564}
- 1347.9s sonar.passive {"source":"torpedo","bearingDeg":100.46266256275136}
- 1347.9s sonar.passive {"source":"torpedo","bearingDeg":100.46266256275136}
- 1348.9s sonar.passive {"source":"engine","bearingDeg":69.14408498076132}
- 1351.0s sonar.passive {"source":"engine","bearingDeg":358.55600778643526}
- 1351.6s torpedo.expired {"torpedoId":"TP-02","targetShipId":"E-02"}
- 1351.6s torpedo.expired {"torpedoId":"TP-01","targetShipId":"E-02"}
- 1351.6s torpedo.ready {"tubeId":"T-03","targetContactId":"C-02"}
- 1351.6s torpedo.fired {"tubeId":"T-03","targetContactId":"C-02"}
- 1351.6s torpedo.ready {"tubeId":"T-04","targetContactId":"C-02"}
- 1351.6s torpedo.fired {"tubeId":"T-04","targetContactId":"C-02"}
- 1351.7s sonar.passive {"source":"torpedo","bearingDeg":1.5464993163533618}
- 1351.7s sonar.passive {"source":"torpedo","bearingDeg":1.5464993163533618}
- 1351.9s sonar.passive {"source":"engine","bearingDeg":67.6594328285967}
- 1354.0s sonar.passive {"source":"engine","bearingDeg":359.7670287762041}
- 1354.6s sub.depthChanged {"layer":"Deep"}
- 1355.0s sonar.passive {"source":"engine","bearingDeg":66.224458287018}
- 1356.7s sonar.passive {"source":"torpedo","bearingDeg":1.2396742643839753}
- 1356.7s sonar.passive {"source":"torpedo","bearingDeg":1.2396742643839753}
- 1357.1s sonar.passive {"source":"engine","bearingDeg":358.5587768128658}
- 1358.0s sonar.passive {"source":"engine","bearingDeg":65.37696549997519}
- 1360.1s sonar.passive {"source":"engine","bearingDeg":359.22922861927384}
- 1361.1s sonar.passive {"source":"engine","bearingDeg":65.74666256001689}
- 1361.8s sonar.passive {"source":"torpedo","bearingDeg":0.9353101942924591}
- 1361.8s sonar.passive {"source":"torpedo","bearingDeg":0.9353101942924591}
- 1363.2s sonar.passive {"source":"engine","bearingDeg":358.49384129106545}
- 1364.1s sonar.passive {"source":"engine","bearingDeg":64.88367992712143}
- 1366.2s sonar.passive {"source":"engine","bearingDeg":357.5379412757302}
- 1366.8s sonar.passive {"source":"torpedo","bearingDeg":0.6364904199677368}
- 1366.8s sonar.passive {"source":"torpedo","bearingDeg":0.6364904199677368}
- 1367.2s sonar.passive {"source":"engine","bearingDeg":63.35836427297256}
- 1369.3s sonar.passive {"source":"engine","bearingDeg":356.937522845447}
- 1370.2s sonar.passive {"source":"engine","bearingDeg":62.44338642826276}
- 1371.9s sonar.passive {"source":"torpedo","bearingDeg":0.34620075898838576}
- 1371.9s sonar.passive {"source":"torpedo","bearingDeg":0.34620075898838576}
- 1372.3s sonar.passive {"source":"engine","bearingDeg":355.50662694826485}
- 1373.3s sonar.passive {"source":"engine","bearingDeg":61.207597314717}
- 1374.6s torpedo.hit {"torpedoId":"TP-04","targetShipId":"E-02","distM":55}
- 1374.6s ship.sunk {"shipId":"E-02","shipClass":"Cargo"}
- 1374.6s torpedo.hit {"torpedoId":"TP-03","targetShipId":"E-02","distM":55}
- 1374.6s mission.victory {"scoreParts":{"objective":400,"damage":60,"stealth":0,"torpedoEfficiency":100,"time":87.2949478049404,"survival":50,...
