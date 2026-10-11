/**
 * Minimal ambient declarations for node built-ins used by test
 * infrastructure only (the boundary scanner). src/** remains free of any
 * non-relative import (pattern ported from packages/trust/test/node.d.ts
 * and packages/economic/test/node.d.ts).
 *
 * CI note (P1-W2 integration): the package-local acceptance battery runs
 * `npm install --no-workspaces` with devDependencies typescript+vitest
 * ONLY — no root workspace install exists on the CI runner, so there is no
 * @types/node to walk up to. These ambient declarations keep the
 * test-infrastructure imports type-safe without adding a dependency. The
 * runtime is real Node (vitest), so the declarations describe exactly the
 * surface the scanner uses.
 */
declare module "node:fs" {
  export function readdirSync(path: string): string[];
  export function readdirSync(
    path: string,
    options: { withFileTypes: true },
  ): Array<{
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }>;
  export function readFileSync(path: string, encoding: string): string;
  export function statSync(path: string): {
    isDirectory(): boolean;
    isFile(): boolean;
  };
}

declare module "node:path" {
  export function join(...paths: string[]): string;
  export function dirname(path: string): string;
  export function relative(from: string, to: string): string;
  export const sep: string;
}

declare const process: {
  cwd(): string;
};
