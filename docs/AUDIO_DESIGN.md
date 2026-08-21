# SILENT DEPTH 《深海猎手》 — Audio Design

Version: v1 · Owner: Factory Manager (escalated) · Status: ACCEPTED

## 1. Style
Dark · Minimal · Underwater · Military · Tense. Nothing cheerful, cartoonish,
exaggerated, or EDM. Everything procedurally synthesized via WebAudio
(oscillators + noise + filters + envelopes). Zero external samples ⇒ zero
licensing risk, fully offline.

## 2. Master chain
- AudioContext created lazily on first user gesture (browser autoplay policy).
- Master gain (settings.audio.masterVolume) → compressor (threshold -18dB,
  ratio 3) → destination.
- All SFX routed through a shared `sfxBus` gain (settings.audio.sfxVolume).

## 3. SFX spec (≥10 required; v1 ships all 13)

| # | Name | Purpose | Character | Synthesis approach |
|---|---|---|---|---|
| 1 | sonarPing | active ping outbound | short bright 1.2kHz blip | Sine 900→1250Hz, 180ms, exp decay, lowpass 4kHz, + subtle echo (delay 0.35s, 25% wet) |
| 2 | sonarReturn | echo return on contact | darker return blip | Same ping but 600Hz, 0.5s delay from ping, 40% gain, highpass 1kHz (sounds like distant return) |
| 3 | passiveContact | passive noise rise | low rumble swells | Pink noise 1.2s, bandpass 200-500Hz, slow attack 0.4s, swell +3dB |
| 4 | torpedoLaunch | compressed-air launch | whoosh + clunk | Noise burst (bandpass 300Hz, 0.3s) + sine 90Hz thump 80ms |
| 5 | torpedoTravel | running torpedo (looping) | rhythmic churn | Triangle 55Hz LFO 4Hz on noise, lowpass 800Hz, loop while RUNNING |
| 6 | torpedoHit | impact | loud thud + splash | Sine 60Hz 0.4s decay + noise burst lowpass 1.5kHz 0.5s, gain peak |
| 7 | explosion | ship sunk | deep boom | Sine 45Hz 1.2s decay + brown noise 1.5s lowpass 600Hz + crackle (bandpass noise 2kHz 0.3s) |
| 8 | depthCharge | enemy DC splash/detonation | heavy underwater blasts | Two sine thumps 70Hz at 0s/0.4s + brown noise lowpass 400Hz 1.0s |
| 9 | engine | own engine loop | steady thrum | Sawtooth 48Hz + 96Hz, lowpass 300Hz, gain by speed setting (SILENT→FULL), loop |
| 10 | hullCreak | pressure/stress | metallic groan | Random slow sine glides 80-140Hz, 0.8s, bandpass 600Hz, triggered on depth change/damage |
| 11 | alarm | detection rising / low battery | urgent beeps | Square 880Hz, 90ms on / 90ms off, 3 bursts, highpass 1kHz |
| 12 | uiClick | menu/button | short tick | Sine 1200Hz 25ms exp decay, tiny click |
| 13 | missionSuccess | victory sting | low warm major-ish | Two notes sine 220→330Hz 0.9s, soft, + pad (detuned sines 110/165Hz 2s, lowpass 800Hz) |
| 14 | missionFailed | defeat sting | cold minor descending | Sine 330→220→165Hz 1.6s, minor, + low noise, dark |

## 4. Ambience
- Ocean bed loop: filtered pink noise (lowpass 200Hz) at very low gain (-30dB),
  +1dB louder in Storm, muted in Fog/Night (atmosphere per weather).

## 5. Audio-event wiring (engine events → SFX)
| Engine event | SFX |
|---|---|
| sonar.ping | sonarPing |
| sonar.contact | sonarReturn |
| sonar.passive | passiveContact |
| torpedo.fired | torpedoLaunch |
| torpedo.running (per state change) | torpedoTravel |
| torpedo.hit | torpedoHit |
| ship.sunk | explosion |
| depthCharge.detonated | depthCharge |
| sub.speedChanged | engine (gain retarget) |
| sub.damaged / depthChanged fast | hullCreak |
| detection.threshold | alarm |
| ui.click | uiClick |
| mission.victory / mission.defeat | missionSuccess / missionFailed |

## 6. Acceptance (audio-gate)
- ≥10 distinct SFX synthesized, testable headlessly (pure functions returning
  AudioNode graphs are skipped in node tests; parameter tables tested instead).
- No external files loaded; all code-local.
