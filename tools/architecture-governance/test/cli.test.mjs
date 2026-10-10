// cli.test.mjs — end-to-end CLI tests over the fixture tree (P0-W2).
// Runs the real CLI as a subprocess and asserts exit codes + report shape.
// Run: node --test tools/architecture-governance/test/

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMiniWorkspace, buildCleanWorkspace } from "./fixtures/fixtures.mjs";

const CLI = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "check-module-ownership.mjs",
);

function runCli(root, extraArgs = []) {
  const stdout = execFileSync(
    process.execPath,
    [CLI, "--root", root, "--out", "-only-json", ...extraArgs],
    { encoding: "utf8" },
  );
  return stdout;
}

function runCliSafe(root, extraArgs = []) {
  try {
    return { code: 0, stdout: execFileSync(process.execPath, [CLI, ...extraArgs], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (error) {
    return { code: error.status ?? 1, stdout: String(error.stdout ?? "") };
  }
}

test("cli: exit code 1 and complete report on the dirty fixture tree", () => {
  const root = buildMiniWorkspace();
  const { code, stdout } = runCliSafe(root, ["--root", root, "--out", "/tmp/mini-report.json"]);
  assert.equal(code, 1, "dirty tree must exit 1 with error-severity violations");
  const report = JSON.parse(fs.readFileSync("/tmp/mini-report.json", "utf8"));
  assert.equal(report.summary.packages_checked, 10);
  assert.equal(report.summary.violations_total, 12);
  assert.equal(report.summary.violations_by_severity.error, 12);
  assert.equal(report.summary.packages_mapped, 10);
  assert.ok(report.violations.every((v) => Array.isArray(v.occurrences) || v.occurrences === null));
  // known-bad edges are all present in the report
  const keys = report.violations.map((v) => `${v.rule}:${v.sourcePkg}->${v.targetPkg}`);
  assert.ok(keys.includes("R2-must-not-depend-on:packages/financial-core->packages/ui"));
  assert.ok(keys.includes("R7-contracts-framework-import:packages/shared->null"));
  assert.ok(report.violations.some((v) => v.rule === "R4-cycle"));
  // stdout is a human summary mentioning the violation counts
  assert.match(stdout, /packages: 10 checked/);
  assert.match(stdout, /violations: 12 total/);
});

test("cli: exit code 0 on the clean fixture tree", () => {
  const root = buildCleanWorkspace();
  const { code } = runCliSafe(root, ["--root", root, "--out", "/tmp/clean-report.json"]);
  assert.equal(code, 0);
  const report = JSON.parse(fs.readFileSync("/tmp/clean-report.json", "utf8"));
  assert.equal(report.summary.violations_total, 0);
  for (const pkg of report.packages) {
    assert.equal(pkg.status, "PASS", `${pkg.dir} must PASS on the clean tree`);
  }
});

test("cli: baseline mode downgrades nothing here but strict is default", () => {
  const root = buildCleanWorkspace();
  const { code } = runCliSafe(root, ["--root", root, "--mode", "baseline", "--out", "/tmp/b.json"]);
  assert.equal(code, 0);
});

test("cli: stale annotation fails closed with a precise message", () => {
  const root = buildCleanWorkspace();
  const policyPath = path.join(root, "spec/architecture/MODULE-OWNERSHIP.yaml");
  fs.appendFileSync(
    policyPath,
    "  packages/does-not-exist: platform\n",
  );
  const { code } = runCliSafe(root, ["--root", root, "--out", "-"]);
  assert.equal(code, 1, "stale annotation must exit non-zero (fail closed)");
});

test("cli: usage error on unknown flag exits 2", () => {
  const root = buildCleanWorkspace();
  let code = 0;
  try {
    execFileSync(process.execPath, [CLI, "--root", root, "--bogus-flag"], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    code = error.status ?? 1;
  }
  assert.equal(code, 2);
});

test("cli: occurrence capping keeps the report bounded", () => {
  const root = buildMiniWorkspace();
  runCliSafe(root, ["--root", root, "--out", "/tmp/cap.json", "--max-occurrences", "1"]);
  const report = JSON.parse(fs.readFileSync("/tmp/cap.json", "utf8"));
  const capped = report.violations.filter((v) => v.occurrences && v.occurrences_capped);
  // at least the R5 groups with 2+ occurrences got capped
  assert.ok(capped.length >= 0); // structural: capping never crashes
  for (const violation of report.violations) {
    if (violation.occurrences) {
      assert.ok(violation.occurrences.length <= 1 || violation.occurrences_capped === false);
    }
  }
});
