/**
 * Minimal ambient declarations for node built-ins used by test
 * infrastructure only (the boundary scanner and the on-disk source-path
 * verifier). src/** remains free of any node: import (the package-local
 * boundary law). Ported from the canonical packages/surface/test/node.d.ts
 * (P2-W3), which itself ported it from the trust lane — `process.cwd` is
 * declared as a FUNCTION global exactly ONCE (the P2-W1 fix 9905a28 lesson).
 */
declare module "node:fs" {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: string): string;
  export function statSync(path: string): {
    isDirectory(): boolean;
    isFile(): boolean;
  };
}

declare module "node:path" {
  export function join(...paths: string[]): string;
  export const sep: string;
}

declare const process: {
  cwd(): string;
};
