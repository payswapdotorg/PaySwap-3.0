/**
 * Minimal ambient declarations for node built-ins used by TEST files only
 * (css/source scanning) — the canonical packages' test-infra pattern
 * (ported from packages/surface/test/node.d.ts, which itself ported it
 * from payswap.org@8a735bf).
 */
declare module "node:fs" {
  export function readFileSync(path: string, encoding: string): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): {
    isDirectory(): boolean;
    isFile(): boolean;
  };
}

declare module "node:path" {
  export function join(...paths: string[]): string;
  export const sep: string;
  export function dirname(p: string): string;
  export function resolve(...paths: string[]): string;
  export function relative(from: string, to: string): string;
}

declare const process: {
  cwd(): string;
};
