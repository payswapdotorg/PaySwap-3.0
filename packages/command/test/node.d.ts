/**
 * Minimal ambient declarations for node built-ins used by test
 * infrastructure ONLY (the boundary scanner + the REAL crypto fixtures).
 * src/** remains free of ANY non-relative import (machine-checked).
 *
 * CI note: the package-local acceptance battery runs `npm install
 * --no-workspaces` with devDependencies typescript + vitest ONLY — no root
 * workspace install exists on the CI runner, so there is no @types/node
 * to walk up to. These ambient declarations keep the test-infrastructure
 * imports type-safe without adding a dependency. The runtime is real Node
 * (vitest), so the declarations describe exactly the surfaces used.
 *
 * The `process` global declares `cwd` as a FUNCTION (the accepted
 * protocol/capability package pattern — a string-property global masked
 * the bug in an earlier lane and is fatal in the CI-faithful battery).
 */
declare module 'node:fs' {
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

declare module 'node:path' {
  export function join(...segments: string[]): string;
  export function relative(from: string, to: string): string;
}

declare module 'node:crypto' {
  export function createHash(algorithm: 'sha256'): {
    update(data: string, inputEncoding: 'utf8'): { digest(encoding: 'hex'): string };
  };
  export function createHmac(algorithm: 'sha256', key: string): {
    update(data: string, inputEncoding: 'utf8'): { digest(encoding: 'hex'): string };
  };
}

declare const process: {
  cwd(): string;
};
