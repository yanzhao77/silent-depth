# Playtest 09 — Generated Convoy + Destroyer (t-014 evidence)

- **Version**: 0be1659
- **Mission**: GEN-04 — Generated Convoy + Destroyer (seed 2004, difficulty 2/5)
- **Agent**: scripted-brain-generic-hunter (Generic hunter (generated missions))
- **Result**: **DEFEAT** after 1747.3 s (34945 ticks)

## Actions

- pings: 158 · fire inputs: 0 · moving ticks: 34945 · turning ticks: 15374 · fire rejections (tail): 0
- strategy: Silent approach (SILENT band, Medium), ping to acquire range, fire at the nearest TRACKED-or-better contact ≤ 1.5 km; evade when detection ≥ 45 or an escort escalates inside 5 km.

## Result

- outcome: **DEFEAT** · score 168.71488797005182 (Failed) · hull 0 · battery 0.0% · detection 0.0
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
- objective 0 · damage 0 · stealth 0.03750000000001252 · torpedoEfficiency 100 · time 68.67738797005181 · survival 0 · total 168.71488797005182 · grade Failed

### Stats
- torpedoes fired 0 · hit 0 · remaining 5 · peak detection 99.975 · damage dealt 0.0

### Key events (tail)

- 1712.0s sonar.passive {"source":"engine","bearingDeg":174.08354715795423}
- 1712.3s sonar.passive {"source":"propeller","bearingDeg":99.30576110767635}
- 1712.6s sonar.passive {"source":"engine","bearingDeg":161.19889215556492}
- 1714.3s sonar.passive {"source":"engine","bearingDeg":172.99561837120137}
- 1715.0s sonar.passive {"source":"engine","bearingDeg":174.1404465603775}
- 1715.3s sonar.passive {"source":"propeller","bearingDeg":111.83853911097373}
- 1715.6s sonar.passive {"source":"engine","bearingDeg":160.41059561166983}
- 1717.4s sonar.passive {"source":"engine","bearingDeg":171.82136794740083}
- 1718.1s sonar.passive {"source":"engine","bearingDeg":172.6996538534999}
- 1718.4s sonar.passive {"source":"propeller","bearingDeg":125.38191689369098}
- 1718.7s sonar.passive {"source":"engine","bearingDeg":159.84414537084598}
- 1720.4s sonar.passive {"source":"engine","bearingDeg":172.70141169745958}
- 1721.1s sonar.passive {"source":"engine","bearingDeg":174.21691013623413}
- 1721.4s sonar.passive {"source":"propeller","bearingDeg":136.90767782145875}
- 1721.7s sonar.passive {"source":"engine","bearingDeg":160.71604626994983}
- 1723.5s sonar.passive {"source":"engine","bearingDeg":171.76671677176267}
- 1724.2s sonar.passive {"source":"engine","bearingDeg":174.47214355698847}
- 1724.5s sonar.passive {"source":"propeller","bearingDeg":149.3124827037114}
- 1724.8s sonar.passive {"source":"engine","bearingDeg":159.59501491188536}
- 1726.5s sonar.passive {"source":"engine","bearingDeg":171.6107649860184}
- 1727.2s sonar.passive {"source":"engine","bearingDeg":174.31194792090824}
- 1727.5s sonar.passive {"source":"propeller","bearingDeg":159.99956720877464}
- 1727.8s sonar.passive {"source":"engine","bearingDeg":159.04408710405366}
- 1729.6s sonar.passive {"source":"engine","bearingDeg":172.32918843589655}
- 1730.3s sonar.passive {"source":"engine","bearingDeg":172.80398494483458}
- 1730.6s sonar.passive {"source":"propeller","bearingDeg":169.32860177227784}
- 1730.9s sonar.passive {"source":"engine","bearingDeg":160.05579836641232}
- 1732.6s sonar.passive {"source":"engine","bearingDeg":172.99956532549825}
- 1733.3s sonar.passive {"source":"engine","bearingDeg":174.18266511243144}
- 1733.6s sonar.passive {"source":"propeller","bearingDeg":178.9332472626228}
- 1733.9s sonar.passive {"source":"engine","bearingDeg":158.71392333023505}
- 1735.7s sonar.passive {"source":"engine","bearingDeg":171.17051805931013}
- 1736.4s sonar.passive {"source":"engine","bearingDeg":173.7846985550385}
- 1736.7s sonar.passive {"source":"propeller","bearingDeg":186.38431818057438}
- 1737.0s sonar.passive {"source":"engine","bearingDeg":160.4074204882804}
- 1738.7s sonar.passive {"source":"engine","bearingDeg":172.9373963082405}
- 1739.4s sonar.passive {"source":"engine","bearingDeg":173.8789411139727}
- 1739.7s sonar.passive {"source":"propeller","bearingDeg":186.92374485767954}
- 1740.0s sonar.passive {"source":"engine","bearingDeg":159.7019627109586}
- 1741.8s sonar.passive {"source":"engine","bearingDeg":172.76394808023343}
- 1742.2s sub.damaged {"source":"collision","amount":18,"hullLeft":15}
- 1742.5s sonar.passive {"source":"engine","bearingDeg":172.6768777376875}
- 1742.8s sonar.passive {"source":"propeller","bearingDeg":186.42258357104552}
- 1743.1s sonar.passive {"source":"engine","bearingDeg":159.54304682538944}
- 1744.8s sonar.passive {"source":"engine","bearingDeg":171.51928597922102}
- 1745.5s sonar.passive {"source":"engine","bearingDeg":173.13683314017538}
- 1745.8s sonar.passive {"source":"propeller","bearingDeg":178.2898924082816}
- 1746.1s sonar.passive {"source":"engine","bearingDeg":158.77571299365215}
- 1747.3s sub.damaged {"source":"collision","amount":19,"hullLeft":0}
- 1747.3s mission.defeat {"scoreParts":{"objective":0,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":100,"time":68.6773879700518...
