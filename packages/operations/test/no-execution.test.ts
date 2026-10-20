import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_EXECUTION_CAPABILITIES,
  OPERATIONS_CAPABILITY_CLASS,
  OPERATOR_AUTHORIZATION_BOUNDARY,
  checkContractsOnlySources,
  classifyCapability,
} from "../src/no-execution.js";

describe("the NO-DEPLOYMENT-EXECUTION law (hard law 9)", () => {
  it("the capability class + the digest-anchored boundary declaration", () => {
    expect(OPERATIONS_CAPABILITY_CLASS).toBe("CONTRACTS_AND_VERIFICATION_ONLY");
    expect(OPERATOR_AUTHORIZATION_BOUNDARY.law).toContain(
      "Production deployment remains subject to explicit operator authorization",
    );
    expect(OPERATOR_AUTHORIZATION_BOUNDARY.law).toContain(
      "never fabricates runtime evidence",
    );
    expect(OPERATOR_AUTHORIZATION_BOUNDARY.digest).toMatch(/^fnv1a64:/);
  });

  it("the forbidden vocabulary is the closed execution set", () => {
    expect(FORBIDDEN_EXECUTION_CAPABILITIES).toContain("node:child_process");
    expect(FORBIDDEN_EXECUTION_CAPABILITIES).toContain("kubectl");
    expect(FORBIDDEN_EXECUTION_CAPABILITIES).toContain("fetch(");
    expect(FORBIDDEN_EXECUTION_CAPABILITIES.length).toBeGreaterThanOrEqual(18);
  });

  it("the scanner flags execution machinery in CODE", () => {
    const report = checkContractsOnlySources([
      {
        path: "src/evil.ts",
        source: 'const kubectlArgs = ["rollout", "undo"];\nexecSync(kubectlArgs.join(" "));\n',
      },
    ]);
    expect(report.ok).toBe(false);
    expect(report.violations.join("\n")).toContain("execSync");
    expect(report.violations.join("\n")).toContain("kubectl");
    expect(report.violations.length).toBe(2);
  });

  it("the scanner ignores comments and string literals (prose is not code)", () => {
    const report = checkContractsOnlySources([
      {
        path: "src/honest.ts",
        source: [
          "/**",
          " * The operator console may run kubectl; this package never does.",
          " */",
          'const DECLARATION = "fetch( and execSync are forbidden vocabulary";',
          "export const LAW = 1;",
        ].join("\n"),
      },
    ]);
    expect(report.ok).toBe(true);
    // The vocabulary file itself is clean under its own scanner:
    // its literals are data, not machinery.
  });

  it("the scanner accepts pure contract code", () => {
    const report = checkContractsOnlySources([
      {
        path: "src/pure.ts",
        source:
          "export function check(x: { a: number }): boolean { return x.a > 0; }\n",
      },
    ]);
    expect(report.ok).toBe(true);
  });

  it("capability classification sorts names against the boundary", () => {
    expect(classifyCapability("verifyDeploymentIdentity")).toBe(
      "IN_PACKAGE_AUTHORITY",
    );
    expect(classifyCapability("kubectl-apply-step")).toBe(
      "OPERATOR_AUTHORIZED_EXECUTION",
    );
    expect(classifyCapability("the spawn( primitive")).toBe(
      "OPERATOR_AUTHORIZED_EXECUTION",
    );
  });
});
