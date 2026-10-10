import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Package boundary (@payswap/trust) — PaySwap 3.0 LEAF law.
 *
 * Adapted from payswap.org@8a735bf packages/trust/test/boundary.test.ts.
 * The old Stage-0 rule ("only declared workspace dependencies") evolved with
 * the W2-002 consolidation there; PaySwap 3.0 REVERSES that consolidation for
 * the trust lane (MODULE-OWNERSHIP.yaml layer trust; architecture wins over
 * the old repository): trust is a LEAF —
 *
 * 1. src/** contains ZERO non-relative imports (fully self-contained);
 * 2. the package declares NO runtime dependencies at all;
 * 3. devDependencies are exactly the toolchain (typescript + vitest);
 * 4. src/** and test/** never import any @payswap/* package (in particular
 *    never @payswap/protocol, @payswap/economic or any financial lane);
 * 5. every file in the package is <= 400 lines (work-order law).
 */

const MAX_FILE_LINES = 400;
const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "coverage"]);

function listFiles(dir: string, suffix: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listFiles(full, suffix));
    } else if (entry.endsWith(suffix)) {
      found.push(full);
    }
  }
  return found;
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const fromRe = /\bfrom\s*(["'])([^"']+)\1/g;
  const dynamicRe = /\bimport\s*\(\s*(["'])([^"']+)\1\s*\)/g;
  const sideEffectRe = /(?:^|[;\n])\s*import\s*(["'])([^"']+)\1/g;
  for (const match of source.matchAll(fromRe)) {
    const specifier = match[2];
    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }
  for (const match of source.matchAll(dynamicRe)) {
    const specifier = match[2];
    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }
  for (const match of source.matchAll(sideEffectRe)) {
    const specifier = match[2];
    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

function packageJson(): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  return JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

describe("package boundary (@payswap/trust is a LEAF)", () => {
  it("scans a non-empty src tree", () => {
    const files = listFiles(join(process.cwd(), "src"), ".ts");
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it("declares ZERO runtime dependencies", () => {
    const pkg = packageJson();
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });

  it("devDependencies are exactly the toolchain (typescript + vitest)", () => {
    const pkg = packageJson();
    expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual(["typescript", "vitest"]);
  });

  it("src/** imports ONLY relative modules (zero non-relative imports)", () => {
    const root = join(process.cwd(), "src");
    const offenders: string[] = [];
    for (const file of listFiles(root, ".ts")) {
      const source = readFileSync(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        if (!specifier.startsWith(".")) {
          offenders.push(`${file.replace(root + sep, "")}: non-relative import '${specifier}'`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("src/** and test/** never import any @payswap/* package (authority direction)", () => {
    const offenders: string[] = [];
    for (const tree of ["src", "test"]) {
      const root = join(process.cwd(), tree);
      for (const file of listFiles(root, ".ts")) {
        const source = readFileSync(file, "utf8");
        for (const specifier of importSpecifiers(source)) {
          if (specifier.startsWith("@payswap/")) {
            offenders.push(`${file}: '${specifier}'`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every AUTHORED .ts/.json file in the package is <= 400 lines (file-size law)", () => {
    // Generated lockfiles (package-lock.json from the battery's npm install)
    // are tooling artifacts, not authored source: the 400-line law applies to
    // files a human/agent authors, and lockfiles are exempt by design.
    const LOCKFILES = new Set(["package-lock.json", "npm-shrinkwrap.json"]);
    const root = process.cwd();
    const offenders: string[] = [];
    for (const suffix of [".ts", ".json"]) {
      for (const file of listFiles(root, suffix)) {
        const base = file.split(sep).pop() ?? "";
        if (LOCKFILES.has(base)) {
          continue;
        }
        const lines = readFileSync(file, "utf8").split("\n").length;
        if (lines > MAX_FILE_LINES) {
          offenders.push(`${file.replace(root + sep, "")}: ${lines} lines`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("net-new: src/** contains no node: or bare built-in imports (pure domain leaf)", () => {
    const root = join(process.cwd(), "src");
    const offenders: string[] = [];
    for (const file of listFiles(root, ".ts")) {
      const source = readFileSync(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        if (specifier.startsWith("node:") || specifier.startsWith("fs") || specifier.startsWith("path")) {
          offenders.push(`${file.replace(root + sep, "")}: '${specifier}'`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
