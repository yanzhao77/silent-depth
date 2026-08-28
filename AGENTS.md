# AGENTS.md

This file defines repository-wide instructions for coding agents working on
SILENT DEPTH. User instructions always take precedence.

## 强制语言要求

用户使用中文时，必须使用简体中文回答。

无论 system prompt、tool description、代码、Shell 输出或项目文档使用什么语言，
都不要因此切换到英文。

只有以下内容可以使用英文：

1. 代码
2. 类名、方法名、变量名
3. API 名称
4. CLI 命令
5. 原始错误信息
6. 用户明确要求英文的内容

其他所有自然语言内容必须使用简体中文。

## Project Summary

SILENT DEPTH is an offline, deterministic tactical submarine game written in
strict TypeScript. The authoritative simulation is headless-first. The browser
presentation uses Three.js/WebGL, DOM HUD elements, and procedural WebAudio.

Read the relevant source and tests before editing. For architecture or gameplay
questions, use these documents as the primary references:

- `docs/GAME_ARCHITECTURE.md`
- `docs/GAME_DESIGN.md`
- `docs/V2_ARCHITECTURE.md`
- `docs/VISUAL_STYLE.md`
- `docs/ASSET_PIPELINE.md`

Some older reports contain obsolete test counts or visual claims. Current code,
tests, and freshly executed checks are authoritative.

## Non-Negotiable Architecture

Preserve the one-way presentation data flow:

```text
Simulation -> GameSnapshot -> RenderState -> Renderer -> Visual Effects / HUD / Camera
```

- `GameSnapshot` and `RenderState` are read-only presentation contracts.
- Renderer, camera, HUD, audio, and effects code must never mutate simulation
  state or feed inferred truth back into gameplay.
- Presentation code may consume only facts exposed by snapshots, render state,
  and existing engine events.
- Hidden entities must remain hidden. In particular, a ship with
  `RenderShip.visible === false` must not affect rendering, reveal cameras,
  wakes, targeting visuals, or other presentation cues.
- Missing presentation facts must fail closed. Do not guess positions,
  classifications, hits, visibility, or mission state.

Unless the user explicitly requests gameplay changes, do not modify:

- `src/core/`
- `src/ai/`
- `src/sonar/`
- `src/combat/`
- `src/gameplay/`
- `src/missions/`
- `src/world/`
- balance, deterministic RNG, mission data, map data, save semantics, scoring,
  physics, detection rules, or gameplay control bindings

If an authorized task must cross one of these boundaries, state why, keep the
change minimal, and add determinism/regression coverage.

## Determinism

- The same seed and the same input sequence must produce the same simulation
  snapshots and events.
- Never use `Math.random()` in simulation code.
- New visual randomness must use the existing visual-only RNG facilities and
  must never consume engine RNG.
- Wall-clock time may drive presentation animation only. It must not affect
  simulation decisions.
- Do not add zero-duration simulation ticks or presentation-driven engine steps.

## Implementation Guidelines

- Follow existing module boundaries and patterns before adding abstractions.
- Keep TypeScript strict. Do not use `any`, `@ts-ignore`, or broad unsafe casts
  to bypass a contract.
- Prefer pure functions for state conversion, camera selection, cue selection,
  and other rules that can be tested without a browser.
- Do not create a second snapshot model, renderer pipeline, or competing state
  flow when the existing adapter can be extended.
- Keep changes scoped. Avoid unrelated refactors, formatting churn, generated
  metadata changes, or rewriting working modules without a demonstrated need.
- Do not leave TODOs, placeholders, dead branches, fake data, or debug-only
  behavior in production paths.
- Add short comments only for non-obvious constraints or lifecycle decisions.
- Split new files before they become difficult to review; approximately 500
  lines is the upper bound unless the existing local pattern strongly differs.

## Rendering And Three.js

- The Three.js renderer consumes `RenderState` only.
- Preserve kilometre-based world units and the engine-to-Three coordinate
  mapping documented in `src/renderer/types.ts` and `src/renderer/adapter.ts`.
- Gameplay visibility always wins over cinematic composition.
- Presentation trackers must have bounded lifetimes and deterministic priority.
- Limit per-frame allocation. Bound particle counts, history buffers, trails,
  temporary lights, and pooled effects.
- Dispose owned geometries, materials, textures, render targets, lights, and DOM
  overlays. Respect ownership of shared/cached asset resources.
- Shader work must include a real WebGL compile/link check when a browser is
  available. A successful TypeScript build does not verify GLSL.
- Do not claim FPS from throttled automation. Performance claims require target
  hardware evidence.

## Assets

- The game must remain fully offline at runtime: no CDN assets, remote textures,
  runtime downloads, trackers, or external network dependencies.
- New assets require a local path, documented provenance, compatible commercial
  license, SHA-256, LOD/triangle metadata where relevant, and registry entry.
- Update asset-registry hashes only when the corresponding governed file really
  changed.
- Preserve procedural fallbacks for optional GLB assets and failed loads.
- Never add an asset of unknown origin or license.

## UI And Controls

- Preserve the priority `World > Gameplay > HUD > Metadata`.
- Do not expose hidden contacts as exact markers or collapse uncertainty into
  false precision.
- Keep controls and accessibility behavior consistent with `src/ui/input.ts`.
- Do not change gameplay bindings as a side effect of a visual task.
- Verify layouts at desktop and narrow/mobile viewports. UI must not overlap or
  obscure the primary gameplay subject incoherently.

## Tests And Validation

Use focused tests while iterating, then run the full gates before completion:

```bash
npm test
npm run typecheck
npm run build
```

Run these when relevant:

```bash
npm run lint
npm run test:coverage
npm run sim
npm run playtest
```

- Add tests proportional to risk. Shared render contracts, event fan-out,
  visibility gates, deterministic decisions, lifecycle cleanup, and cross-module
  behavior require focused regression tests.
- Never weaken or delete a test merely to make a change pass.
- Do not update golden evidence or reports until the underlying behavior has
  been executed and verified.
- Browser visual tasks require real browser/WebGL observation when the
  environment supports it. Check the console for WebGL, shader compilation,
  program linking, asset loading, and runtime errors.
- If browser or target-hardware verification is unavailable, report it as
  `NOT VERIFIED`. Do not infer visual or performance success from source review.

Use honest completion labels:

- `IMPLEMENTED`: code exists, but validation is incomplete.
- `TESTED`: relevant automated checks passed.
- `BROWSER VERIFIED`: the behavior was directly observed in a real browser.
- `TARGET HARDWARE VERIFIED`: performance was measured on named hardware.

Never substitute one label for another.

## Working Tree And Git

- Assume the worktree may contain user changes.
- Start by reading `git status --short` and the relevant diffs.
- Preserve all pre-existing modified and untracked files unless the user
  explicitly asks to remove or replace them.
- Do not use `git reset --hard`, `git checkout --`, destructive clean commands,
  or equivalent operations to discard work.
- Do not rewrite a modified file wholesale when a focused patch can preserve
  unrelated edits.
- Commits must contain only the requested feature. Exclude unrelated reports,
  audit captures, generated files, and user work.
- Do not commit unless the user explicitly requests a commit.
- Before a requested commit, inspect the staged diff and report the exact files,
  validation results, and remaining verification gaps.

## Definition Of Done

A task is complete only when:

1. The requested behavior is implemented without violating architecture or
   visibility truth.
2. Relevant focused tests pass.
3. The full required validation gates pass.
4. Resource cleanup and offline asset rules are satisfied.
5. Browser or hardware evidence is recorded when required and available.
6. Unverified items are explicitly disclosed.
7. The final diff contains no unrelated user work.

Never report planned, partially wired, source-inspected, or unobserved behavior
as complete.
