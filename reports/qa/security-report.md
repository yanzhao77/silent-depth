# Security Audit Report — SILENT DEPTH 《深海猎手》

- **Project**: p-004 "SILENT DEPTH" · offline 2D canvas game (TypeScript + Vite + Vitest)
- **Task**: t-017 security audit · **Role**: Security Engineer
- **Audit date**: 2026-08-21 · **Auditor**: security-engineer (factory role)
- **Scope**: dependency/supply-chain, injection (XSS), runtime network, asset provenance, save-system data safety, file access, secrets, OWASP-style checklist
- **Constraint honored**: audit-only — **no `src/`, `config/`, or asset files were modified**. Only file written: this report.

---

## 0. Verdict (summary)

**CONDITIONAL PASS — ship-blocking issues: none.** The shipped artifact is a static, fully-offline bundle with **zero runtime dependencies**, **zero runtime network calls**, **no XSS-reachable injection surface**, **no secrets**, and **fully-verified procedural asset provenance**. All 292 tests pass, including the 14-test asset-provenance gate.

Outstanding items are **dev-only** or **not-yet-implemented**, none of which affect the shipped game:

1. **HIGH (dev-only)**: known advisories in the dev toolchain (`vite` 5.4.21 → `esbuild` 0.21.5, `vitest` 2.1.9) — 5 vulns (3 moderate, 1 high, 1 critical) per `npm audit` against the official registry. No production dependency is affected; the build output is static and contains none of these components. Upgrade when a non-breaking path exists (vite ≥ 6.4.3 / 7.x) or formally accept the dev-only risk.
2. **LOW**: `src/main.ts:10` uses `innerHTML` for a **static** boot banner (policy deviation per GAME_ARCHITECTURE §12; no data reaches it, so no injection surface).
3. **NOT-TESTED (by design)**: the save system (`src/save/`) does not exist yet. The hardening requirements (schema validation + clamping + version migration, §12) are already specified in the architecture docs and must be verified when the module lands.
4. **LOW (deployment)**: no CSP header on `index.html` (trivial to add for a zero-external-resource static game).

---

## 1. Findings register

| ID | Severity | Location | Finding | Status / Disposition |
|----|----------|----------|---------|----------------------|
| SEC-01 | HIGH (dev-only, not shipped) | `package-lock.json` → vite 5.4.21, esbuild 0.21.5, vitest 2.1.9 | Dev-toolchain advisories: vitest critical (UI server arbitrary file read/exec), vite high (`.map` path traversal, `server.fs.deny` bypass, launch-editor NTLMv2 on Windows), esbuild moderate (GHSA-67mh-4wv8-2f99 dev-server request exposure) | Accept (dev-only) or upgrade when non-breaking; do NOT run `vitest ui`; add dependency-type gate test |
| SEC-02 | LOW | `src/main.ts:10` (also baked into `dist/assets/index-*.js`) | `boot.innerHTML = "<h1>…</h1><p>booting…</p>"` — static literal, no interpolated engine/user data → no injectable value; violates §12 policy (textContent/createElement) | Replace with `createElement` + `textContent` when UI agent replaces the boot stub |
| SEC-03 | LOW | `index.html` | No Content-Security-Policy header/meta | Add `default-src 'self'; script-src 'self'; style-src 'self'` at deployment (offline game needs nothing external) |
| SEC-04 | LOW (tooling) | npm registry config | `npm audit` fails against configured registry mirror (npmmirror.com: `/-/npm/v1/security/*` not implemented, HTTP 404); full audit only works with `--registry=https://registry.npmjs.org` | Use official registry for audits; lockfile integrity hashes make mirror content tamper-evident either way |
| SEC-05 | INFO | `dist/assets/index-*.js` | Vite modulepreload polyfill contains a same-origin `fetch()`; built HTML has **0** `rel="modulepreload"` links → dead code today; any future dynamic chunks would fetch same-origin static assets only | No action; note for future builds |
| SEC-06 | NOT-TESTED (N/A now) | `src/save/` (absent) | Save system not implemented; `localStorage` appears in `src/` only in a determinism comment (`src/core/engine.ts:54`) | Gate when implemented (see §5) |
| SEC-07 | LOW | `tests/toolchain.test.ts` | Smoke test only — does **not** enforce "devDependencies = toolchain only" | Add a manifest gate test (e.g. assert `dependencies` is empty) |

---

## 2. Dependency & supply chain (A08)

**Commands run (real output):**

- `npm audit --omit=dev` → `found 0 vulnerabilities` (exit 0). Trivially true: **`package.json` has no `dependencies` at all** (root `dependencies: undefined`).
- `npm audit` (full) against the configured registry → **FAILED**: `npm warn audit 404 Not Found - POST https://registry.npmmirror.com/-/npm/v1/security/audits/quick - [NOT_IMPLEMENTED]` (exit 1). The configured mirror does not implement the security-audit endpoint (SEC-04).
- `npm audit --registry=https://registry.npmjs.org` (full) → **5 vulnerabilities (3 moderate, 1 high, 1 critical)**, all in the dev toolchain:

```
esbuild  <=0.24.2            moderate  GHSA-67mh-4wv8-2f99 (dev server request exposure)
vite     <=6.4.2             high      path traversal in optimized deps `.map`; server.fs.deny bypass
                                       (Windows); launch-editor NTLMv2 hash disclosure (Windows); via esbuild
vite-node <=2.2.0-beta.2     moderate  (via vite)
@vitest/mocker <=3.0.0-beta.4 moderate (via vite)
vitest   <=3.2.5             critical  Vitest UI server arbitrary file read + execute; via vite/vite-node/@vitest/mocker
fix available via `npm audit fix --force` → vite@8.2.2 (breaking change)
```

**Installed (lockfile-pinned) versions**: typescript 5.9.3 · vite 5.4.21 · vitest 2.1.9 · esbuild 0.21.5.

**Assessment**: these components are **dev-only** — esbuild runs at build time; vite/vitest servers run on the developer machine, never in the shipped artifact. `vite build` output (`dist/`) is static JS/CSS/HTML with `sourcemap: false` (no source disclosure). The vitest UI server (the critical advisory's precondition) is only launched on demand via `vitest ui`; `npm test` (pool: forks, node env) does not use it. **Impact on the deliverable: none.** Residual risk is developer-machine exposure (e.g., visiting a malicious website while a vite dev server is running, Windows-only path bypasses).

**Integrity**:
- `package-lock.json`: `lockfileVersion: 3`, root lists only the 3 devDependencies, `requires: true`.
- `npm ci --dry-run` (official registry) → exit 0, "added 48 packages" — manifest ↔ lockfile consistent.
- Every lockfile entry carries `integrity` (sha512) hashes and pinned `resolved` URLs (npmmirror.com mirror) — content is tamper-evident regardless of which registry serves it.
- `git ls-files` shows `package-lock.json` is committed — reproducible installs.

**Gap (SEC-07)**: `tests/toolchain.test.ts` is a smoke test and does not assert that `dependencies` stays empty. Recommend a manifest gate so a future runtime dependency cannot slip in unnoticed.

---

## 3. Injection & unsafe DOM / XSS (A03)

**Grep (src + index.html)** for `innerHTML|outerHTML|eval\(|new Function|document\.write|insertAdjacentHTML|dangerouslySetInnerHTML|<script`:

- **One hit**: `src/main.ts:10` — `boot.innerHTML = `<h1>SILENT DEPTH 深海猎手</h1><p>booting…</p>``.
  - **Static string literal — no interpolation of engine/user/event data.** There is no injection surface: nothing untrusted can reach this string. Severity LOW; it is a §12 policy deviation, not a vulnerability.
  - `src/main.ts` is explicitly a **stub** (line 1: "boot entry (stub; replaced by ui-engineer with full shell)"). The UI agent is mid-flight — this check reflects audit-time state; **re-run after the UI lands**.
- `index.html:10` `<script type="module" src="/src/main.ts">` — the app's own entry point, not an injection vector.
- **No** `eval`, `new Function`, `document.write`, `insertAdjacentHTML`, `Function(`, string-arg `setTimeout`/`setInterval`, or `setAttribute('on*')` anywhere in `src/`.

**Safe patterns confirmed**:
- `src/main.ts:8,11` uses `createElement`/`appendChild`; `src/rendering/sprites.ts:269-270` guards `document.createElement` with `typeof document !== 'undefined'` (headless-safe).
- `src/core/eventBus.ts:5-6` documents the policy: payloads are pure data, "no eval / no function payloads" (§12).
- GAME_ARCHITECTURE §12 mandates: engine data only via `textContent`/`createElement`; `src/ui/dom.ts` whitelist helper planned.

**Built artifact**: `dist/assets/index-BvtvU-r3.js` contains only the same static boot `innerHTML` stub plus Vite's modulepreload polyfill (see SEC-05). No other markers.

---

## 4. Runtime network (offline-by-construction)

**Grep (src/)** for `fetch(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|https?://|protocol-relative URLs` → **zero hits** (exit 1 = no matches). The game makes **no runtime network requests**.

- `vite.config.ts`: `base: './'` → relative asset paths; static output usable from `file://` or any static host; no CDN.
- Config data (`config/balance.json`, `config/missions.json`, `config/settings.json`) is **bundled at build time** via typed loaders (`src/core/balance.ts`), not fetched at runtime.
- The only `fetch(` in the whole project is Vite's modulepreload polyfill in the built bundle (SEC-05) and dev-toolchain internals in `node_modules/`.
- Dev servers (vite 5173, vitest) are developer-machine only; note the vite/esbuild dev-server advisory (SEC-01) applies only to those.

---

## 5. Save system — data safety

**Present**: nothing. `src/save/` does not exist; `localStorage` appears in `src/` only in a determinism comment at `src/core/engine.ts:54`. No save read/write/import/export code exists anywhere in `src/`.

**Documented design (GAME_ARCHITECTURE §9 + §12, FR-19)** — already encodes the required hardening:
- `src/save/save.ts`, browser shell injects `localStorage`; **engine never touches it** (headless = no-op).
- Key `silent-depth:save:v1`; load path: **schema validation** → **numeric clamping** (0..100 etc.) → **version migration hooks**; invalid data → discard & rebuild defaults (no crash); export = JSON via **Blob + `a[download]`** (file is never executed); import = FileReader → validation; "clear save" = remove key.

**Assessment**: the untrusted-localStorage risk is currently N/A because the module is absent. **NOT-TESTED at audit time.** The security gate for this item must be re-executed when `src/save/` is implemented: validate schema + clamp + migrate on load, ensure no code path interprets save strings as code, and add unit tests (the architecture already lists "存档 schema" in its Vitest unit table).

---

## 6. File access

**Grep (src/)** for `node:fs|require('fs')|writeFile|readFile|createWriteStream|Blob|URL.createObjectURL` → **zero hits**. The game touches no filesystem: no fs APIs, no Blob usage yet (export is planned but unimplemented, see §5).

- Engine is headless-first: no `window`/`document`/`AudioContext`/`localStorage` imports in `src/core|gameplay|sonar|ai|combat|missions|world|sim` (enforced by architecture §1 policy; `tsconfig lib` includes DOM only for rendering/UI).
- The only Node-fs-adjacent surface is the dev-only simulation runner (`npm run sim` / `playtest`, `node --experimental-strip-types`) — developer tooling, not shipped.

---

## 7. Secrets

- Strict regex scan across the whole workspace (excluding `node_modules/`, `.git/`, `dist/`): patterns for API keys, passwords, private-key blocks (RSA/OPENSSH/EC/PGP), AWS `AKIA…`, GitHub `ghp_…`, OpenAI-style `sk-…`, and `bearer …` → **0 matches**.
- **No `.env` files** anywhere; **no** `import.meta.env` / `process.env` usage in `src/` or `tests/`.
- `git ls-files` review: only configs, docs, src, tests, and the lockfile are tracked; `node_modules/`, `dist/`, `*.log` are gitignored. No credentials in any committed file.

---

## 8. OWASP-style checklist

| # | Control | Result | Evidence |
|---|---------|--------|----------|
| A03 | Injection (XSS / code injection) | **PASS** (1 LOW deviation) | No eval/new Function/document.write anywhere; only static-literal `innerHTML` at src/main.ts:10 (SEC-02); engine data path = createElement/textContent (main.ts:8,11; sprites.ts:269); eventBus payloads pure data (eventBus.ts:5-6) |
| A05 | Security misconfiguration | **PASS** (1 LOW hardening note) | `sourcemap: false`; `base: './'`; no CSP (SEC-03); no server.fs exposure config beyond defaults |
| A08 | Software & Data Integrity (supply chain) | **CONDITIONAL PASS** (1 HIGH dev-only finding) | Zero runtime deps; lockfile v3 with integrity hashes + `npm ci --dry-run` OK; dev-toolchain advisories (SEC-01) — no shipped impact |
| CS-1 | Offline / zero runtime network | **PASS** | Zero fetch/XHR/WS/sendBeacon/URL hits in src/ (§4) |
| CS-2 | Untrusted local data handling (localStorage) | **NOT TESTED** | `src/save/` absent; design (schema + clamp + migration, §12) documented — re-audit on implementation |
| CS-3 | Secrets in code/artifacts | **PASS** | 0 regex matches; no .env; no env usage |
| CS-4 | Asset provenance & integrity | **PASS** | 34/34 procedural + CC0 + sha256 verified on-disk; path security enforced by tests/unit/assets.test.ts (§9) |
| CS-5 | Client-side data leakage | **PASS** | No sourcemaps in dist (0 .map); no telemetry code; no storage usage at all yet |

---

## 9. Asset provenance (detail)

Verified programmatically + by tests:

- **Registry**: 34 entries, every one `source: "procedural"`, `license: "CC0"`, `author: "DeepSeek Software Factory"`, `attribution: ""`, `licenseUrl` = only `https://creativecommons.org/publicdomain/zero/1.0/` (license reference, not an asset path).
- **sha256**: all 34 = `433d7dfe61e2f134e911617789b3bfb69c64260bf0625f55dfde199c01d5a29c` — valid 64-hex **and** byte-identical to the on-disk hash of the defining code `src/rendering/sprites.ts` (computed with `node:crypto`). All assets are defined by this one code file, so a shared hash is by design (documented in THIRD_PARTY_ASSETS.md §4).
- **Paths**: all 34 `path` fields = `src/rendering/sprites.ts` — local-relative; **no** `http://`, `https://`, absolute (`/…`), drive-letter, or `..` paths (script-verified).
- **Third-party declaration**: `assets/THIRD_PARTY_ASSETS.md` declares **ZERO third-party assets**; its inventory (34) matches the registry count exactly.
- **No hidden/unexpected files**: `find assets` shows only `registry.json` + `THIRD_PARTY_ASSETS.md`; subdirectories (`audio/ backgrounds/ effects/ ui/ units/`) exist but are **empty** scaffolding — no binaries, no dotfiles, nothing unexpected (`file` + dotfile-aware find).
- **Test gate**: `tests/unit/assets.test.ts` (14 tests, green) enforces the exact field set, 64-hex sha256 equal to the real on-disk hash, path security (no URLs/protocols), license gate (CC0 + procedural + licenseUrl), resolution ≤ 512×512, and ship-class coverage.
- **Full suite**: `npm test` → **292/292 passed** (10 files).

---

## 10. What is NOT TESTED / deferred (honesty statement)

1. **Save-system load hardening** — `src/save/` does not exist yet. Schema validation, numeric clamping, and version migration on load are specified in docs (GAME_ARCHITECTURE §9/§12) but there is **no code to audit**. Re-run item 5 when implemented.
2. **UI/rendering code (mid-flight)** — the UI agent is concurrently writing UI/rendering; `src/main.ts` is still the documented boot stub, and `src/ui/`, `src/rendering/canvas renderer` (beyond `sprites.ts`) do not exist at audit time. The `innerHTML`/XSS check (item 3) and the DOM-safe-pattern check reflect **audit-time state only**; re-run after the UI lands. The `dist/` build is likewise from the stub state.
3. **Deployment-layer controls** — CSP, HSTS, and other static-host headers are deployment concerns with no deployment config in this repo; marked LOW/NOT-TESTED.
4. **`npm audit` against the configured mirror** — not possible (mirror lacks the endpoint, SEC-04); the full audit used `--registry=https://registry.npmjs.org`.
5. **Windows-specific advisories** (vite `server.fs.deny` bypass, launch-editor NTLMv2) — dev-only, Windows-only, untestable on this macOS audit host; tracked under SEC-01.

---

## 11. Recommended actions (for the factory queue, no code changed here)

1. **After UI lands**: replace the boot-stub `innerHTML` with `createElement`/`textContent` (SEC-02) and re-run this audit's greps.
2. **Dev toolchain**: plan upgrade to vite ≥ 6.4.3 / 7.x and matching vitest when the breaking change is acceptable; until then never run `vitest ui`, and keep the dev server on localhost. (SEC-01)
3. **When `src/save/` lands**: verify schema-validation + clamp + version-migration on load, add "存档 schema" unit tests, and re-audit. (SEC-06)
4. **Add a manifest gate test** asserting `dependencies` is empty / devDependencies are toolchain-only. (SEC-07)
5. **Deployment**: add a strict CSP header (`default-src 'self'`). (SEC-03)

---

*End of report — audit-only; no source/config/asset files were modified. All command outputs above are real, captured during this audit session.*

---

## ADDENDUM — post-UI re-verification (factory manager, 2026-08-21)

After the UI task (t-010) landed, the audit-time findings were re-checked:

- **innerHTML (SEC-01)**: re-grep of src/ shows zero actual `innerHTML` usage —
  all remaining matches are doc comments (dom.ts/hud.ts/menus.ts). main.ts boot
  banner replaced by textContent-based dom.ts helpers. → now PASS (was LOW).
- **Runtime network (SEC-02)**: still zero fetch/XHR/WebSocket/sendBeacon in src/. → PASS.
- **Save system (SEC-05)**: src/save/save.ts (404 lines) now implements the §12
  hardening: validateAndClamp on load (version gate, id whitelist, numeric clamps
  0..100, corrupt → default, never throws), injected storage for tests. → now PASS.
- **CSP (SEC-03)**: still not shipped (LOW, deployment hardening; offline static
  build mitigates). → unchanged.
- **Supply chain (SEC-01)**: unchanged — zero runtime deps; dev-toolchain vulns
  (vitest/vite/esbuild) do not ship; `npm audit --omit=dev` = 0. → unchanged.

Verdict after re-verification: **PASS** (no open HIGH/CRITICAL in shipped code;
the only open items are LOW deployment hardening: CSP header).
