/**
 * SILENT DEPTH — minimal ambient node declarations for the playtest tooling
 * (src/sim/node-io.d.ts)
 *
 * t-014 constraint: no new dependencies. The workspace has no @types/node,
 * so the node built-ins used by src/sim/playtest.ts (and the harness in
 * tests/playtest/playtest.test.ts) are declared here with the exact surface
 * used — nothing more. These are ambient (no top-level import/export), so the
 * declarations are visible project-wide (tsconfig includes "src" and "tests").
 *
 * @pure — type declarations only; no runtime code.
 */

declare module 'node:fs' {
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, opts?: { recursive?: boolean; force?: boolean }): void;
  export function writeFileSync(path: string, data: string, encoding?: string): void;
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding?: string): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { size: number; mtimeMs: number };
}

declare module 'node:path' {
  export function basename(path: string): string;
  export function extname(path: string): string;
  export function isAbsolute(path: string): boolean;
  export function resolve(...parts: string[]): string;
  export function join(...parts: string[]): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:child_process' {
  export function execSync(
    command: string,
    opts?: { encoding?: string; stdio?: unknown[] },
  ): string | Buffer;
  export function execFileSync(
    file: string,
    args?: string[],
    opts?: { encoding?: string; stdio?: unknown[] },
  ): string | Buffer;
}

/** Node's process global — only the surface the playtest tooling touches. */
declare const process: {
  execPath: string;
  /** Used to detect the explicit `npm run playtest` entry point. */
  env: Record<string, string | undefined>;
  cwd(): string;
};
