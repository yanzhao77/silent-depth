# V2.3 Evidence Manifest

## Evidence status

This manifest deliberately separates direct Chromium observations from build- and test-backed integration evidence. It does not label an unobserved effect as visually verified.

| ID | Evidence | What it supports | Status | Limitation |
|---|---|---|---|---|
| EV-01 | `/home/ubuntu/v23-qa-evidence/m05-night-glb-hud.webp` | M05 reaches `RUNNING`; WebGL world, night sky, player silhouette and world-first HUD are present in Chromium. | Direct observation | The player is below the surface and the GLB surface/readability cannot be judged as a finished store hero shot. |
| EV-02 | `public/assets/v3/models/hero-submarine-lod1..3.glb` | Local, project-owned hero-submarine GLB LOD family exists and is registered with actual hashes. | Build/test verified | No V2.3 close surface screenshot obtained through this automation pass. |
| EV-03 | `public/assets/v3/models/destroyer-lod1..3.glb` | Local, project-owned destroyer GLB LOD family exists and has an async procedural fallback. | Build/test verified | No destroyer reached the observed camera frame. |
| EV-04 | `public/assets/v3/models/tanker-lod1..3.glb` | Local, project-owned tanker GLB LOD family exists and has an async procedural fallback. | Build/test verified | No tanker reached the observed camera frame. |
| EV-05 | `reports/v2.3/real-browser-qa.md` | Browser run and synthetic keyboard-automation limitation. | Direct observation | The automation viewport navigated to `about:blank` after non-navigation key injection; this is not attributed to game code. |
| EV-06 | `npm test`, `npm run typecheck`, `npm run build` | V2.3 rendering integration preserves automated behavioral regression suite and production compilation. | Automated verification | This is not a substitute for human visual assessment on target hardware. |

## Scorecard

The score is an implementation-and-evidence score rather than an unsupported claim of store-ready art. Categories without a direct gameplay frame are not promoted solely because a source file exists.

| Category | V2.2.5 baseline | V2.3 evidence score | Rationale |
|---|---:|---:|---|
| Player submarine asset pathway | 2.5 | 5.0 | A project-owned GLB family with actual LODs, PBR material groups and procedural fallback is integrated; the final close-shot look still needs human surface capture. |
| Enemy-ship asset pathway | 2.0 | 4.5 | Destroyer and tanker GLB families are present, registered and safely integrated; live silhouette proof remains missing. |
| Ocean, foam and wake | 3.0 | 4.5 | Multi-scale water was retained and speed/heading-driven local wake foam was added; target-hardware hero-frame review remains required. |
| Night and storm environment | 4.0 | 4.5 | Existing sky/weather systems gained storm-volume treatment; M05 stays deliberately very dark underwater and is not yet a marketing-quality night frame. |
| Periscope and tactical semantics | 4.0 | 4.0 | The existing optical and uncertainty treatment was retained; no semantic changes were made. |
| Combat presentation | 3.0 | 4.0 | Depth charge plume is now explicitly distinct from torpedo-hit color/flash; a real triggered combat frame remains outstanding. |
| HUD and capture presentation | 2.5 | 4.5 | Low-threat world-first reduction and a transient F12 capture class were implemented. Automated direct F12 observation is unavailable. |

> **Result:** V2.3 establishes the required production asset and presentation path, but does not yet earn a claimed `>=7/10` cinematic/storefront score from the available direct evidence. The release gate is target-hardware capture of the GLB submarine and two ship classes at readable surface distances, plus an actual torpedo hit and depth-charge frame.
