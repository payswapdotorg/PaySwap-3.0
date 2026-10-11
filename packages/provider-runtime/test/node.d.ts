/**
 * Minimal ambient declarations for node builtins used by test
 * infrastructure only (the boundary scanner). src/** remains free of any
 * non-relative import (pattern ported from packages/protocol and
 * packages/trust — the accepted P1 CI battery runs npm install
 * --no-workspaces with devDependencies typescript+vitest ONLY, so there
 * is no @types/node to walk up to).
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
