/**
 * Minimal ambient declarations for node built-ins used by test
 * infrastructure only (the boundary scanner). src/** remains free of any
 * non-relative import (the accepted CI battery pattern: npm install
 * --no-workspaces with devDependencies typescript+vitest ONLY, so there
 * is no @types/node to walk up to).
 *
 * THE PROCESS LAW (the P1-W2/P2-W1 lesson, machine-enforced): `process`
 * declares `cwd` as a FUNCTION — never a string property, never a second
 * duplicate declaration. This file carries exactly ONE declaration.
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
  export function existsSync(path: string): boolean;
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
