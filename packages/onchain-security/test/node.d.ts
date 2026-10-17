/**
 * Minimal ambient declarations for node built-ins used by test
 * infrastructure only (the boundary scanners). src/** remains free of
 * any non-relative import (the R2-W2 zero-sibling law).
 *
 * CI note (the twice-learned lesson, ported from the accepted
 * packages/execution-graph/test/node.d.ts pattern): the package-local
 * acceptance battery runs `npm install --no-workspaces` with
 * devDependencies typescript + vitest ONLY — no root workspace install
 * exists on the CI runner, so there is no @types/node to walk up to.
 * These ambient declarations keep the test-infrastructure imports
 * type-safe without adding a dependency. The runtime is real Node
 * (vitest), so the declarations describe exactly the surface the
 * scanners use.
 *
 * `process.cwd` is declared as a FUNCTION global, exactly ONCE. The old
 * worker shim declared it twice (once as a string property) — that bug
 * was fatal in the CI-faithful battery and must never return.
 */
declare module "node:fs" {
  export function readdirSync(path: string): string[];
  export function readdirSync(
    path: string,
    options: { withFileTypes: true },
  ): Array<{
    name: string;
    isFile(): boolean;
    isDirectory(): boolean;
  }>;
  export function readFileSync(path: string, encoding: string): string;
  export function statSync(path: string): { isFile(): boolean; isDirectory(): boolean };
}

declare module "node:path" {
  export function join(...segments: string[]): string;
  export function relative(from: string, to: string): string;
  export const sep: string;
}

declare const process: {
  cwd(): string;
};
