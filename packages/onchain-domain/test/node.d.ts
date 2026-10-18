/**
 * Minimal ambient declarations for node built-ins used by test
 * infrastructure only (the boundary/adversarial scanners). src/** remains
 * free of ANY non-relative import — this package is v1 hermetic (zero
 * sibling imports, no tsconfig paths; pattern ported from
 * packages/zcode-bridge/test/node.d.ts and packages/agents/test/node.d.ts).
 *
 * CI note (the twice-learned P1-W2/P2-W1 lesson): the package-local
 * acceptance battery runs `npm install --no-workspaces` with devDependencies
 * typescript + vitest ONLY — no root workspace install exists on the CI
 * runner, so there is no @types/node to walk up to. These ambient
 * declarations keep the test-infrastructure imports type-safe without
 * adding a dependency. The runtime is real Node (vitest), so the
 * declarations describe exactly the surface the scanners use.
 *
 * The global `process` declaration declares `cwd` as a FUNCTION (the
 * accepted protocol-package pattern; a string-property shim is the
 * P1-W2/P2-W1 CI lesson — masked in worker sandboxes by parent
 * node_modules walk-up, fatal in the hermetic battery). Declared exactly
 * ONCE — never duplicated.
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
  export function statSync(path: string): {
    isDirectory(): boolean;
    isFile(): boolean;
  };
}

declare module "node:path" {
  export function join(...segments: string[]): string;
  export function relative(from: string, to: string): string;
  export const sep: string;
}

declare const process: {
  cwd(): string;
};
