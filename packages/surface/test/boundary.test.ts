/**
 * Boundary law tests (P2-W3, net-new): the package is layer `contracts`
 * grade — zero runtime dependencies, zero PaySwap sibling imports, zero
 * framework/DOM imports, deterministic library code (no ambient
 * locale/clock/env), every authored file <= 400 lines, and the
 * advisory-only law (the surface exports no authority verbs — it can never
 * authorize anything, INV-23).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

import * as index from "../src/index.ts";

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", ".git", "dist", "coverage", ".vitest"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (statSync(full).isFile()) {
      out.push(full);
    }
  }
  return out;
}

function authoredFiles(): string[] {
  return walk(ROOT).filter(
    (file) =>
      (file.endsWith(".ts") || file.endsWith(".json")) &&
      !file.endsWith("package-lock.json") && // committed tooling artifact (protocol-lane pattern); exempt from the 400-line law (D-6 in the evidence record)
      !file.endsWith(`${sep}node.d.ts`), // ambient decls for THIS test file only
  );
}

function srcFiles(): string[] {
  return walk(join(ROOT, "src"));
}

describe("boundary law (contracts grade)", () => {
  it("package.json declares ZERO runtime dependencies and exactly typescript+vitest devDependencies", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Record<string, unknown>;
    expect(pkg["dependencies"]).toBeUndefined();
    expect(Object.keys(pkg["devDependencies"] as object).sort()).toEqual(["typescript", "vitest"]);
    expect(pkg["exports"]).toEqual({ ".": "./src/index.ts" });
  });

  it("src/** contains no @payswap/* imports (sibling lanes are in flight; structural pins only)", () => {
    for (const file of srcFiles()) {
      const text = readFileSync(file, "utf8");
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("*") || trimmed.startsWith("//")) continue;
        const isImport = /^import\b/.test(trimmed) || /^export\b.*\bfrom\b/.test(trimmed);
        if (!isImport) continue;
        const specifier = trimmed.match(/["']([^"']+)["']/)?.[1] ?? "";
        expect(
          specifier.startsWith("./"),
          `${file}: forbidden non-relative/sibling import -> ${trimmed}`,
        ).toBe(true);
        expect(
          specifier.includes("@payswap/"),
          `${file}: forbidden sibling import -> ${trimmed}`,
        ).toBe(false);
      }
    }
  });

  it("src/** contains no framework/DOM/non-relative imports (framework-independent law)", () => {
    for (const file of srcFiles()) {
      const text = readFileSync(file, "utf8");
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("*") || trimmed.startsWith("//")) continue;
        const importMatch = /^import\s/.test(trimmed) || /^export\s.*from\s/.test(trimmed);
        if (importMatch) {
          expect(
            /^import\s[^'"]*['"][./]/.test(trimmed) || /^import\s['"][.]/.test(trimmed) || /from\s['"][.]/.test(trimmed),
            `${file}: non-relative import -> ${trimmed}`,
          ).toBe(true);
        }
        expect(text.includes("react"), `${file}: framework import`).toBe(false);
        expect(text.includes("vue"), `${file}: framework import`).toBe(false);
      }
    }
  });

  it("src/** is deterministic: no ambient locale, clock, randomness or environment reads", () => {
    const FORBIDDEN: ReadonlyArray<{ readonly pattern: RegExp; readonly label: string }> = [
      { pattern: /\bIntl\./, label: "ambient Intl" },
      { pattern: /\bDate\.now\s*\(/, label: "ambient clock (Date.now)" },
      { pattern: /new\s+Date\s*\(/, label: "ambient clock (new Date)" },
      { pattern: /\bMath\.random\s*\(/, label: "randomness" },
      { pattern: /\bprocess\.env\b/, label: "environment read" },
      { pattern: /\bperformance\.now\s*\(/, label: "ambient clock (performance.now)" },
    ];
    for (const file of srcFiles()) {
      const text = readFileSync(file, "utf8");
      for (const { pattern, label } of FORBIDDEN) {
        expect(pattern.test(text), `${file}: ${label} — library code takes these as EXPLICIT inputs`).toBe(false);
      }
    }
  });

  it("every authored .ts/.json file is <= 400 lines (package-local law; lockfile exempt)", () => {
    for (const file of authoredFiles()) {
      const lines = readFileSync(file, "utf8").split("\n").length;
      expect(lines, `${file} is ${lines} lines`).toBeLessThanOrEqual(400);
    }
  });

  it("advisory-only law: no exported symbol name carries an authority verb (the surface cannot authorize anything)", () => {
    const AUTHORITY_VERB = /^(authorize|authorise|commit|execute|sign|capture|settle|refund|cancel|approve|dispatch)/i;
    for (const name of Object.keys(index)) {
      expect(
        AUTHORITY_VERB.test(name),
        `export '${name}' carries an authority verb — the surface is advisory and can never own authority (INV-23)`,
      ).toBe(false);
    }
    // The fold/registry vocabulary is projection-only by construction; the
    // runtime-value surface carries a floor guard (types are erased at runtime).
    expect(Object.keys(index).length).toBeGreaterThanOrEqual(30);
  });

  it("the projection vocabulary is present: every fold and registry this work ordered exists on the public surface", () => {
    const anchors = [
      "foldQuoteTerms",
      "foldProgressTimeline",
      "foldAuthorizationChange",
      "foldOperationDiscovery",
      "foldCorridorCoverage",
      "foldSecurityDecision",
      "modeIndicator",
      "outcomeCapabilityBoard",
      "OUTCOME_REGISTRY",
      "UNIVERSAL_AREAS",
      "OUTCOME_AREA_ALIASES",
      "SURFACE_PROGRESS_STAGES",
      "AUTHORIZATION_CHANGE_KINDS",
      "SURFACE_API_VERSION",
    ] as const;
    for (const anchor of anchors) {
      expect((index as Record<string, unknown>)[anchor], `missing export: ${anchor}`).toBeDefined();
    }
    expect(index.PACKAGE_NAME).toBe("@payswap/surface");
    expect(index.SURFACE_API_VERSION).toBe("1.0.0");
  });
});
