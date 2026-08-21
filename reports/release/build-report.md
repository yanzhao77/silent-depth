# Build Report — SILENT DEPTH (深海猎手) p-004

- **Task**: t-016 — Final production build (offline, verified, evidence report)
- **Role**: Build/Release Engineer
- **Date**: 2026-08-21 19:47–19:50 CST
- **Version**: silent-depth@1.0.0
- **Environment**: macOS darwin-arm64, Node v22.23.2, vite 5.4.21, TypeScript via `tsc --noEmit`
- **Config evidence**: `package.json` `build = "tsc --noEmit && vite build"`; `vite.config.ts` → `base: './'`, `outDir: 'dist'`, `assetsDir: 'assets'`, `sourcemap: false`, `chunkSizeWarningLimit: 1500` (offline-first static build, no CDN).

---

## 0. Build Timeline (two runs — why)

Two build runs were executed and both are documented honestly:

| Run | Time | Source tree state | Result |
|---|---|---|---|
| **#1** | 19:46 CST | baseline (pre-t-021) | ✅ exit 0, JS `index-BaBM_22f.js` |
| **#2 (FINAL)** | 19:48 CST | includes concurrent **t-021** change (`src/combat/torpedo.ts`: Storm weather ×0.85 torpedo range factor) | ✅ exit 0, JS `index-CQsMNzoQ.js` |

At 19:47 a working-tree change from another role landed in `src/combat/torpedo.ts` (t-021 replan-v2 drill) **after** run #1. To keep the release artifact consistent with the current source tree, the build was re-run (run #2). Run #2 also proves t-021 passes `tsc --noEmit`. **The final artifact is run #2.** All numbers below refer to run #2 unless noted.

## 1. Final Build Command — Real Output (run #2)

Command: `npm run build` (exit code **0**)

```
> silent-depth@1.0.0 build
> tsc --noEmit && vite build

vite v5.4.21 building for production...
transforming...
✓ 49 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.41 kB │ gzip:  0.30 kB
dist/assets/index-EBHjOkg3.css    9.50 kB │ gzip:  2.30 kB
dist/assets/index-CQsMNzoQ.js   160.65 kB │ gzip: 50.98 kB
✓ built in 205ms
BUILD_EXIT=0
```

- `tsc --noEmit`: **PASS** (no TypeScript errors, incl. t-021).
- `vite build`: **PASS** — 49 modules transformed, single JS chunk + single CSS file (no code-split chunks, no dynamic imports).
- Run #1 output was identical except JS `index-BaBM_22f.js` 160.38 kB — the +0.27 kB delta is the t-021 change.

## 2. Dist Inventory — Real Sizes + SHA-256 (final)

```
dist/index.html                      414 bytes
dist/assets/index-CQsMNzoQ.js    161,407 bytes  (gzip 50.98 kB)
dist/assets/index-EBHjOkg3.css     9,502 bytes  (gzip  2.30 kB)
Total: ~171.3 kB raw / ~53.6 kB gzipped
```

| File | SHA-256 |
|---|---|
| `dist/index.html` | `92d9098329c1366603b3b8ac52185a64563c2e3f21685d1ea7cd043ec56afc1b` |
| `dist/assets/index-CQsMNzoQ.js` | `cf35fd9c88b02f1cd5da874d4e5a30303466547b2d2b346ff8981f904dc85542` |
| `dist/assets/index-EBHjOkg3.css` | `7afd982f19d7b81abb333de8439cad85fd0631150356bdbe5c6ca76ce38606e2` |

- Sourcemaps in dist: **0** (`find dist -name '*.map'` → 0).
- `dist/` contains exactly: `index.html` + `assets/index-CQsMNzoQ.js` + `assets/index-EBHjOkg3.css`. Nothing else.

## 3. Offline Verification — grep Evidence

Grep of `dist/assets/index-CQsMNzoQ.js` and `dist/assets/index-EBHjOkg3.css` (counts are raw occurrences in the concatenated bundle):

| Pattern | Matches | Verdict |
|---|---|---|
| `http://` | 0 | ✅ clean |
| `https://` | 0 | ✅ clean |
| `//cdn` | 0 | ✅ clean |
| `XMLHttpRequest` | 0 | ✅ clean |
| `new URL(` | 0 | ✅ clean (no URL constructor calls) |
| `fetch(` | 1 | ⚠️ inspected — dead code, see below |
| `modulepreload` | 1 | ⚠️ inspected — dead code, see below |
| `createObjectURL` | 1 | ✅ local blob download (save export), no network |
| dynamic `import(` | 0 | ✅ (`_e.import(...)` is the game save-file import method, not a module import) |

### fetch( / modulepreload — dead-code analysis (inspected, not assumed)

The single `fetch(` occurrence lives inside Vite's `__vitePreload` modulepreload polyfill:

```js
const n=document.createElement("link").relList;
if(n&&n.supports&&n.supports("modulepreload"))return;   // modern browsers short-circuit here
for(const t of document.querySelectorAll('link[rel="modulepreload"]'))i(t);
new MutationObserver(...).observe(document,{childList:!0,subtree:!0});
...
function i(t){if(t.ep)return;t.ep=!0;const a=o(t);fetch(t.href,a)}  // only fetch call site
```

The `fetch` is reachable **only** if a `link[rel="modulepreload"]` element exists in the DOM. Evidence it never runs:

1. `grep -c 'modulepreload' dist/index.html` → **0** — the built HTML contains no modulepreload links.
2. The bundle has **no dynamic imports** — Vite only emits modulepreload links for dynamically-imported chunks, and there are none.
3. All supported browsers (`target: 'es2022'`) short-circuit via `supports("modulepreload")` before the observer is registered.

**Verdict: zero reachable runtime network references. The offline claim holds.**

### index.html — local references only

`dist/index.html` references exactly two assets, both local relative paths (`base: './'`):

```html
<script type="module" crossorigin src="./assets/index-CQsMNzoQ.js"></script>
<link rel="stylesheet" crossorigin href="./assets/index-EBHjOkg3.css">
```

No external origins, no CDN, no absolute URLs. ✅

## 4. Preview + HTTP Smoke Test — Real Results (final)

Server: `npx vite preview --port 4173 --strictPort` (background, killed after test — confirmed down).

| Request | HTTP | Content-Type | Bytes served | Matches dist? |
|---|---|---|---|---|
| `GET /` | 200 | text/html | 414 | ✅ byte-exact |
| `GET /assets/index-CQsMNzoQ.js` | 200 | text/javascript | 161,407 | ✅ byte-exact |
| `GET /assets/index-EBHjOkg3.css` | 200 | text/css | 9,502 | ✅ byte-exact |

(Note: a request for a nonexistent asset returns 200 with the SPA index.html fallback — expected Vite preview behavior for a client-side routed SPA; harmless for offline static hosting.)

## 5. NOT TESTED (honest disclosure)

- **Visual browser smoke test: NOT TESTED.** This build was executed in a headless environment — no real browser was launched, so no visual/rendering/input/audio verification was performed. Evidence for correctness currently rests on the UI engineer's build, the passing `tsc`, and the Node test suite (356 tests green, per prior project reports — run before t-021; t-021 itself is a small balance change verified to compile but not re-test-gated here, that is QA's gate).
- **Recommended manual pass** (required before release sign-off): `npm run preview` → open http://localhost:4173/ → visually confirm menu, map render, sonar sweep, combat, audio, save/load, and Storm-weather torpedo behavior (t-021).
- Gameplay/balance/playtest evidence lives in `reports/playtest/` and `reports/balance/` (out of scope for this build task).

## 6. Final Verdict

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ PASS |
| `vite build` | ✅ PASS (exit 0, ×2 runs) |
| Offline (no external URLs; fetch/XHR unreachable) | ✅ PASS |
| index.html local-only references | ✅ PASS |
| dist inventory (index.html + JS + CSS only, no sourcemaps) | ✅ PASS |
| Preview HTTP smoke (200 + correct content-type, byte-exact) | ✅ PASS |
| Visual browser smoke | ⚠️ NOT TESTED (headless) — manual pass required |

**BUILD STATUS: SUCCESS — `dist/` is a self-contained, offline-capable static artifact ready for release.**

## 7. Recommended Run Instructions

```bash
# 1. Production build (idempotent, regenerates dist/)
npm run build

# 2. Local dev (hot reload)
npm run dev                # http://localhost:5173

# 3. Preview the production build (recommended manual visual pass)
npm run preview            # http://localhost:4173

# 4. Serve dist/ from any static host (offline capable — base is './', so
#    dist/index.html can even be opened directly via file://)
```
