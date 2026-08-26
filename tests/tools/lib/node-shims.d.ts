/**
 * Minimal ambient declarations for the headless screenshot tooling.
 * The project intentionally has no @types/node (zero runtime deps); these
 * shims type only what the tools use, for `tsc --noEmit` (dev-time only).
 */
declare module 'node:fs' {
  export function writeFileSync(path: string, data: Uint8Array | string): void;
  export function readFileSync(path: string): Uint8Array;
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void;
  export function existsSync(path: string): boolean;
}
declare module 'node:zlib' {
  export function deflateSync(data: Uint8Array, opts?: { level?: number }): Uint8Array;
  export function inflateSync(data: Uint8Array): Uint8Array;
}
/** Vitest provides __dirname in transformed ESM test modules. */
declare const __dirname: string;
