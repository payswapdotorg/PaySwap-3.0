/**
 * Minimal ambient declarations for node builtins used by test
 * infrastructure only (the boundary scanner). src/** remains free of any
 * non-relative import (the accepted P1/P2 CI battery pattern: npm install
 * --no-workspaces with devDependencies typescript+vitest ONLY, so there is
 * no @types/node to walk up to).
 *
 * THE PROCESS LAW (the P1-W2/P2-W1 lesson, machine-enforced): `process`
 * declares `cwd` as a FUNCTION — never a string property, never a second
 * duplicate declaration (an oxlint duplicate-identifier error closed the
 * P2-W1 lane once; this file carries exactly ONE declaration).
 */
declare module 'node:fs' {
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
  export function existsSync(path: string): boolean;
}

declare module 'node:path' {
  export function join(...paths: string[]): string;
  export function dirname(path: string): string;
  export function relative(from: string, to: string): string;
  export const sep: string;
}

declare const process: {
  cwd(): string;
};
