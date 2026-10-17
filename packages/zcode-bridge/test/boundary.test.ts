/**
 * Boundary law tests (P3-W3, net-new): the package is platform-adjacent
 * bridge grade — zero runtime dependencies, devDependencies typescript +
 * vitest only, zero PaySwap sibling imports, zero framework/DOM/node:
 * imports in src, deterministic library code (no ambient locale/clock/
 * randomness/environment), every authored file <= 400 lines, the runtime
 * export surface is plain functions / frozen data / strings only (no
 * classes, no singletons), and the never-authorizes law (no authority verb
 * on any export; the bridge cannot authorize anything).
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
      !file.endsWith("package-lock.json") && // committed tooling artifact (protocol-lane pattern); exempt from the 400-line law
      !file.endsWith(`${sep}node.d.ts`), // ambient decls for THIS test infrastructure only
  );
}

function srcFiles(): string[] {
  return walk(join(ROOT, "src"));
}

describe("boundary law (platform-adjacent bridge grade)", () => {
  it("package.json declares ZERO runtime dependencies and exactly typescript+vitest devDependencies", () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(pkg["dependencies"]).toBeUndefined();
    expect(
      Object.keys(pkg["devDependencies"] as object).sort(),
    ).toEqual(["typescript", "vitest"]);
    expect(pkg["exports"]).toEqual({ ".": "./src/index.ts" });
    expect(pkg["name"]).toBe("@payswap/zcode-bridge");
  });

  it("src/** imports are relative ONLY (no node:, no framework, no siblings, no @payswap/*)", () => {
    for (const file of srcFiles()) {
      const text = readFileSync(file, "utf8");
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("*") || trimmed.startsWith("//")) continue;
        const isImport =
          /^import\b/.test(trimmed) || /^export\b.*\bfrom\b/.test(trimmed);
        if (!isImport) continue;
        const specifier = trimmed.match(/["']([^"']+)["']/)?.[1] ?? "";
        if (specifier === "") continue; // multi-line import header; the closing } from "..." line carries the specifier
        expect(
          specifier.startsWith("./") || specifier.startsWith("../"),
          `${file}: forbidden non-relative import -> ${trimmed}`,
        ).toBe(true);
        expect(
          specifier.startsWith("node:"),
          `${file}: forbidden node: import in src -> ${trimmed}`,
        ).toBe(false);
        expect(
          specifier.includes("@payswap/"),
          `${file}: forbidden sibling import -> ${trimmed}`,
        ).toBe(false);
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
      { pattern: /\bcrypto\./, label: "ambient crypto" },
    ];
    for (const file of srcFiles()) {
      const text = readFileSync(file, "utf8");
      for (const { pattern, label } of FORBIDDEN) {
        expect(
          pattern.test(text),
          `${file}: ${label} — library code takes these as EXPLICIT inputs`,
        ).toBe(false);
      }
    }
  });

  it("every authored .ts/.json file is <= 400 lines (package-local law; lockfile exempt)", () => {
    for (const file of authoredFiles()) {
      const lines = readFileSync(file, "utf8").split("\n").length;
      expect(lines, `${file} is ${lines} lines`).toBeLessThanOrEqual(400);
    }
  });

  it("export-surface law: every runtime export is a plain function, frozen data, string or number (no classes, no singletons)", () => {
    const keys = Object.keys(index);
    expect(keys.length).toBeGreaterThanOrEqual(81);
    for (const name of keys) {
      const value: unknown = (index as Record<string, unknown>)[name];
      const kind = typeof value;
      expect(
        kind === "function" ||
          kind === "string" ||
          kind === "number" ||
          (kind === "object" && value !== null),
        `export '${name}' is a ${kind} — the surface is plain functions / frozen data / strings only`,
      ).toBe(true);
      if (kind === "object" && value !== null) {
        expect(
          Object.isFrozen(value),
          `export '${name}' (data) is not frozen`,
        ).toBe(true);
      }
      if (kind === "function") {
        // Plain function only: the source of a class constructor starts
        // with the class keyword; arrow functions have no prototype.
        expect(
          String(value).startsWith("class"),
          `export '${name}' looks like a class constructor — not allowed on the bridge surface`,
        ).toBe(false);
      }
    }
  });

  it("never-authorizes law: no exported symbol name carries an authority verb", () => {
    const AUTHORITY_VERB =
      /^(authorize|authorise|commit|execute|sign|capture|settle|refund|approve|dispatch|pay|hold|reserve)/i;
    for (const name of Object.keys(index)) {
      expect(
        AUTHORITY_VERB.test(name),
        `export '${name}' carries an authority verb — the bridge describes substrate capability and can never own authority`,
      ).toBe(false);
    }
  });

  it("test/node.d.ts declares process.cwd as a FUNCTION global exactly once", () => {
    const text = readFileSync(join(ROOT, "test", "node.d.ts"), "utf8");
    expect(text).toContain("cwd(): string");
    expect((text.match(/declare const process/g) ?? []).length).toBe(1);
  });

  it("the pinned-anchor vocabulary is present on the public surface", () => {
    const anchors = [
      "ZCODE_BRIDGE_VERSION",
      "SUBSTRATE_PIN",
      "SUBSTRATE_AUTHORITY_BOUNDARY",
      "FORBIDDEN_FINANCIAL_AUTHORITY_TERMS",
      "ZCODE_BRIDGE_SURFACES",
      "ZCODE_BRIDGE_SURFACE_COUNT",
      "SESSION_EVENT_TYPES",
      "DWF_RUN_EVENT_KINDS",
      "MCP_TOOL_NAME_PREFIX",
      "RPC_HEADER_SIZE",
      "TOOL_JSON_SCHEMA_DIALECT",
      "RUNTIME_ID_PREFIXES",
    ] as const;
    for (const anchor of anchors) {
      expect(
        (index as Record<string, unknown>)[anchor],
        `missing export: ${anchor}`,
      ).toBeDefined();
    }
    expect(index.PACKAGE_NAME).toBe("@payswap/zcode-bridge");
    expect(index.ZCODE_BRIDGE_VERSION).toBe("1.0.0");
  });
});
