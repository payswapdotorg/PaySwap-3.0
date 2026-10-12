/**
 * Minimal ambient declarations for node built-ins used by test
 * infrastructure only (the boundary scanner). src/** remains free of any
 * non-relative import except the TYPE-ONLY @payswap/trust link (pattern
 * ported from packages/trust/test/node.d.ts and
 * packages/protocol/test/node.d.ts).
 *
 * CI note: the package-local acceptance battery runs `npm install
 * --no-workspaces` with devDependencies typescript + vitest ONLY — no root
 * workspace install exists on the CI runner, so there is no @types/node to
 * walk up to. These ambient declarations keep the test-infrastructure
 * imports type-safe without adding a dependency. The runtime is real Node
 * (vitest), so the declarations describe exactly the surface the scanner
 * uses.
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
}

declare module "node:path" {
  export function join(...segments: string[]): string;
  export function relative(from: string, to: string): string;
}

// P2-W1 integration fix (2026-10-12, P1-W2 CI lesson recurrence): the
// original shim declared node:process with cwd as a string PROPERTY —
// masked in the worker sandbox by parent node_modules walk-up, fatal in
// the CI-faithful battery. The accepted protocol-package pattern is a
// GLOBAL process declaration with cwd() as a function.
declare const process: {
  cwd(): string;
};

declare const process: {
  readonly cwd: string;
};
