# Playtest 09 — Generated Convoy + Destroyer (t-014 evidence)

- **Version**: be271a0
- **Mission**: GEN-04 — Generated Convoy + Destroyer (seed 2004, difficulty 2/5)
- **Agent**: scripted-brain-generic-hunter (Generic hunter (generated missions))
- **Result**: **DEFEAT** after 2703.8 s (54075 ticks)

## Actions

- pings: 287 · fire inputs: 0 · moving ticks: 54075 · turning ticks: 12739 · fire rejections (tail): 0
- strategy: Silent approach (SILENT band, Medium), ping to acquire range, fire at the nearest TRACKED-or-better contact ≤ 1.5 km; evade when detection ≥ 45 or an escort escalates inside 5 km.

## Result

- outcome: **DEFEAT** · score 144.41948091573065 (Failed) · hull 0 · battery 0.0% · detection 0.0
- sunk: none · damage dealt: 0.0 hull points

## Failure

DESTROYED_BY_ESCORT — Player hull reached 0 (escort depth charges / deck gun or collision).

## Difficulty

2/5

## Bugs (observed anomalies)

- Shared detection peaked at 99.975 (≥ 40) — merchants ALERT-scatter (turn 30°, speed to 11 kt for 60 s), which invalidates the lead estimate of in-flight fire solutions.
- Detection peaked at 99.975 — escorts escalated (SUSPICIOUS→ALERT→HUNTING) and engaged the player.
- Escort attack damaged the player to hull 0 (depth charges / deck gun).
- Battery pressure: 0% remaining — ping cost (2 %/ping) and CRUISE drain (0.3 %/s) close off long approach-and-fire sequences.

## Recommendations

- Balance (t-015): merchant ALERT threshold at detection 40 makes every long shot unreliable after any ping exposure; consider 50+, or a shorter/faster scatter so fire solutions stay predictive.
- Balance (t-015): escort passive detection (F3 base 0.05 %/s over 6 km, any noise ≥ 1) escalates before a scripted ambush can form; consider a noise floor or slower escalation at SUSPICIOUS.
- Balance (t-015): battery budget — repeated range pings plus CRUISE approach drain make long missions battery-starved; consider a cheaper ping or lower CRUISE drain.

## Evidence

### Score parts
- objective 0 · damage 0 · stealth 0.03750000000001252 · torpedoEfficiency 100 · time 44.38198091573064 · survival 0 · total 144.41948091573065 · grade Failed

### Stats
- torpedoes fired 0 · hit 0 · remaining 5 · peak detection 99.975 · damage dealt 0.0

### Key events (tail)

- 2668.3s sonar.passive {"source":"propeller","bearingDeg":245.7739091814334}
- 2668.5s sonar.passive {"source":"engine","bearingDeg":140.77652773180168}
- 2668.6s sonar.passive {"source":"engine","bearingDeg":147.42481310403514}
- 2670.9s sonar.passive {"source":"engine","bearingDeg":152.17493979791038}
- 2671.3s sonar.passive {"source":"propeller","bearingDeg":232.5426957293837}
- 2671.5s sonar.passive {"source":"engine","bearingDeg":140.90905683986688}
- 2671.6s sonar.passive {"source":"engine","bearingDeg":148.17222316727802}
- 2673.9s sonar.passive {"source":"engine","bearingDeg":151.96731779495423}
- 2674.3s sonar.passive {"source":"propeller","bearingDeg":220.11026009704608}
- 2674.5s sonar.passive {"source":"engine","bearingDeg":141.13858709249436}
- 2674.6s sonar.passive {"source":"engine","bearingDeg":146.75334053582682}
- 2676.9s sonar.passive {"source":"engine","bearingDeg":151.7850375101412}
- 2677.3s sonar.passive {"source":"propeller","bearingDeg":209.49666894863748}
- 2677.5s sonar.passive {"source":"engine","bearingDeg":140.18067137308736}
- 2677.6s sonar.passive {"source":"engine","bearingDeg":148.39171425639321}
- 2679.9s sonar.passive {"source":"engine","bearingDeg":152.25250263403902}
- 2680.3s sonar.passive {"source":"propeller","bearingDeg":196.85978077884252}
- 2680.5s sonar.passive {"source":"engine","bearingDeg":139.8020825422273}
- 2680.6s sonar.passive {"source":"engine","bearingDeg":147.31529679219136}
- 2682.9s sonar.passive {"source":"engine","bearingDeg":151.07126521407181}
- 2683.3s sonar.passive {"source":"propeller","bearingDeg":186.3130057390094}
- 2683.5s sonar.passive {"source":"engine","bearingDeg":140.89067953238}
- 2683.6s sonar.passive {"source":"engine","bearingDeg":147.7052454770374}
- 2685.9s sonar.passive {"source":"engine","bearingDeg":151.66670419301508}
- 2686.3s sonar.passive {"source":"propeller","bearingDeg":176.2639138256722}
- 2686.5s sonar.passive {"source":"engine","bearingDeg":140.27374223634513}
- 2686.6s sonar.passive {"source":"engine","bearingDeg":147.5807936495849}
- 2688.9s sonar.passive {"source":"engine","bearingDeg":151.62078428459608}
- 2689.3s sonar.passive {"source":"propeller","bearingDeg":166.64164933933554}
- 2689.5s sonar.passive {"source":"engine","bearingDeg":139.58235219786732}
- 2689.6s sonar.passive {"source":"engine","bearingDeg":147.36599666313955}
- 2691.9s sonar.passive {"source":"engine","bearingDeg":150.8665867448531}
- 2692.3s sonar.passive {"source":"propeller","bearingDeg":159.00762452144826}
- 2692.5s sonar.passive {"source":"engine","bearingDeg":139.1453055372417}
- 2692.6s sonar.passive {"source":"engine","bearingDeg":146.44420197027168}
- 2694.9s sonar.passive {"source":"engine","bearingDeg":150.79837717218558}
- 2695.3s sonar.passive {"source":"propeller","bearingDeg":156.25229575628626}
- 2695.5s sonar.passive {"source":"engine","bearingDeg":139.3847985726832}
- 2695.6s sonar.passive {"source":"engine","bearingDeg":147.20081658958748}
- 2697.9s sonar.passive {"source":"engine","bearingDeg":150.81165748602209}
- 2698.3s sonar.passive {"source":"propeller","bearingDeg":156.94107660307012}
- 2698.5s sonar.passive {"source":"engine","bearingDeg":139.2668361624954}
- 2698.6s sonar.passive {"source":"engine","bearingDeg":147.26276231591655}
- 2698.8s sub.damaged {"source":"collision","amount":18,"hullLeft":15}
- 2700.9s sonar.passive {"source":"engine","bearingDeg":151.19675262693127}
- 2701.3s sonar.passive {"source":"propeller","bearingDeg":160.6937295151366}
- 2701.5s sonar.passive {"source":"engine","bearingDeg":139.35571356233578}
- 2701.6s sonar.passive {"source":"engine","bearingDeg":147.24598180695878}
- 2703.8s sub.damaged {"source":"collision","amount":19,"hullLeft":0}
- 2703.8s mission.defeat {"scoreParts":{"objective":0,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":100,"time":44.3819809157306...
