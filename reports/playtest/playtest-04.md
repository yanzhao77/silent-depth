# Playtest 04 — Heavy Escort (t-014 evidence)

- **Version**: 95d3462
- **Mission**: M04 — Heavy Escort (seed 1004, difficulty 4/5)
- **Agent**: scripted-brain-convoy-attack (Convoy attack (M03/M04 best effort))
- **Result**: **DEFEAT** after 2817.7 s (56352 ticks)

## Actions

- pings: 297 · fire inputs: 0 · moving ticks: 56352 · turning ticks: 13234 · fire rejections (tail): 0
- strategy: Approach the convoy at CRUISE, SILENT inside 2.5 km, ping for range, fire at the nearest ranged merchant contact ≤ fire range with a fresh ping; evade (Deep + silent + decoy) when detection is hot or an escort escalates.

## Result

- outcome: **DEFEAT** · score 74.56769360101124 (Failed) · hull 0 · battery 0.0% · detection 0.0
- sunk: none · damage dealt: 0.0 hull points

## Failure

DESTROYED_BY_ESCORT — Player hull reached 0 (escort depth charges / deck gun or collision).

## Difficulty

4/5

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
- objective 0 · damage 0 · stealth 0.03750000000001252 · torpedoEfficiency 0 · time 74.53019360101123 · survival 0 · total 74.56769360101124 · grade Failed

### Stats
- torpedoes fired 0 · hit 0 · remaining 4 · peak detection 99.975 · damage dealt 0.0

### Key events (tail)

- 2795.5s sonar.passive {"source":"engine","bearingDeg":139.69874510272714}
- 2795.9s sonar.passive {"source":"engine","bearingDeg":144.0289011089649}
- 2796.1s sonar.passive {"source":"engine","bearingDeg":138.62054142814102}
- 2796.2s sonar.passive {"source":"engine","bearingDeg":134.27004464698342}
- 2796.4s sonar.passive {"source":"propeller","bearingDeg":119.78983018268977}
- 2796.5s sonar.passive {"source":"propeller","bearingDeg":119.21194839853878}
- 2798.5s sonar.passive {"source":"engine","bearingDeg":140.16297700107913}
- 2798.9s sonar.passive {"source":"engine","bearingDeg":144.9596470925147}
- 2799.1s sonar.passive {"source":"engine","bearingDeg":138.13101112733287}
- 2799.2s sonar.passive {"source":"engine","bearingDeg":133.2081859153206}
- 2799.4s sonar.passive {"source":"propeller","bearingDeg":130.83924885233148}
- 2799.5s sonar.passive {"source":"propeller","bearingDeg":131.2483813758972}
- 2801.5s sonar.passive {"source":"engine","bearingDeg":139.14450751026072}
- 2801.9s sonar.passive {"source":"engine","bearingDeg":144.03066917616135}
- 2802.1s sonar.passive {"source":"engine","bearingDeg":138.74165822876452}
- 2802.2s sonar.passive {"source":"engine","bearingDeg":133.17904853492962}
- 2802.4s sonar.passive {"source":"propeller","bearingDeg":141.8905280014341}
- 2802.5s sonar.passive {"source":"propeller","bearingDeg":141.65870483253153}
- 2804.5s sonar.passive {"source":"engine","bearingDeg":140.7716511935008}
- 2804.9s sonar.passive {"source":"engine","bearingDeg":144.58324324043346}
- 2805.1s sonar.passive {"source":"engine","bearingDeg":137.38673827116256}
- 2805.2s sonar.passive {"source":"engine","bearingDeg":133.07547532480135}
- 2805.4s sonar.passive {"source":"propeller","bearingDeg":150.47071977144577}
- 2805.5s sonar.passive {"source":"propeller","bearingDeg":151.14427740588715}
- 2807.5s sonar.passive {"source":"engine","bearingDeg":139.64542491250603}
- 2807.9s sonar.passive {"source":"engine","bearingDeg":143.0858889559412}
- 2808.1s sonar.passive {"source":"engine","bearingDeg":137.90035508650078}
- 2808.2s sonar.passive {"source":"engine","bearingDeg":132.8669292747425}
- 2808.4s sonar.passive {"source":"propeller","bearingDeg":159.30807035431215}
- 2808.5s sonar.passive {"source":"propeller","bearingDeg":159.2257703364747}
- 2810.5s sonar.passive {"source":"engine","bearingDeg":139.5576074300667}
- 2810.9s sonar.passive {"source":"engine","bearingDeg":144.22290834386843}
- 2811.1s sonar.passive {"source":"engine","bearingDeg":137.50549980988123}
- 2811.2s sonar.passive {"source":"engine","bearingDeg":134.082351388297}
- 2811.4s sonar.passive {"source":"propeller","bearingDeg":165.79894015849888}
- 2811.5s sonar.passive {"source":"propeller","bearingDeg":164.9952449439473}
- 2813.5s sonar.passive {"source":"engine","bearingDeg":138.65482376162885}
- 2813.9s sonar.passive {"source":"engine","bearingDeg":143.02790546784627}
- 2814.1s sonar.passive {"source":"engine","bearingDeg":138.05174450537655}
- 2814.2s sonar.passive {"source":"engine","bearingDeg":134.03941779459376}
- 2814.4s sonar.passive {"source":"propeller","bearingDeg":166.13714359862686}
- 2814.5s sonar.passive {"source":"propeller","bearingDeg":167.12733579802793}
- 2816.5s sonar.passive {"source":"engine","bearingDeg":138.58741119219263}
- 2816.9s sonar.passive {"source":"engine","bearingDeg":142.70860490239897}
- 2817.1s sonar.passive {"source":"engine","bearingDeg":137.8795840328409}
- 2817.2s sonar.passive {"source":"engine","bearingDeg":132.19043696202976}
- 2817.4s sonar.passive {"source":"propeller","bearingDeg":166.12740568036398}
- 2817.5s sonar.passive {"source":"propeller","bearingDeg":166.42232704739047}
- 2817.7s sub.damaged {"source":"collision","amount":23,"hullLeft":0}
- 2817.7s mission.defeat {"scoreParts":{"objective":0,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":0,"time":74.53019360101123,...
