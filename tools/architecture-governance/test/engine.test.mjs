// engine.test.mjs — unit tests for the ownership engine on the mini
// fixture tree (P0-W2). The fixture encodes BOTH known-good and known-bad
// edges; these tests assert each expected violation fires (a violation
// found is a deliverable, not a failure) and that the clean variant yields
// zero violations.
// Run: node --test tools/architecture-governance/test/

import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph, evaluateRules, applyMode } from "../lib/engine.mjs";
import { loadPolicy } from "../lib/policy.mjs";
import { buildMiniWorkspace, buildCleanWorkspace } from "./fixtures/fixtures.mjs";

function evaluate(root) {
  const policy = loadPolicy(root);
  const graph = buildGraph(root);
  const evaluation = evaluateRules(graph, policy, root);
  return { policy, graph, evaluation };
}

function rulesOf(evaluation, rule) {
  return evaluation.violations.filter((violation) => violation.rule === rule);
}

test("engine: mini workspace discovers all 10 fixture packages", () => {
  const root = buildMiniWorkspace();
  const { graph } = evaluate(root);
  assert.equal(graph.inScope.length, 10);
});

test("engine: B1 platform -> financial layer is caught (R3)", () => {
  const root = buildMiniWorkspace();
  const { evaluation } = evaluate(root);
  const hits = rulesOf(evaluation, "R3-not-in-may-depend-on").filter(
    (v) => v.sourcePkg === "packages/rogue" && v.targetPkg === "packages/financial-core",
  );
  assert.equal(hits.length, 1);
  assert.match(hits[0].detail, /layer "platform" -> layer "financial"/);
});

test("engine: B2 financial -> ui deep import is caught (R2 + R3 + R5)", () => {
  const root = buildMiniWorkspace();
  const { evaluation } = evaluate(root);
  const r2 = rulesOf(evaluation, "R2-must-not-depend-on").find(
    (v) => v.sourcePkg === "packages/financial-core" && v.targetPkg === "packages/ui",
  );
  assert.ok(r2, "financial -> ui must fire R2 (must_not_depend_on ui)");
  assert.match(r2.detail, /must_not_depend_on "ui"/);
  const r3 = rulesOf(evaluation, "R3-not-in-may-depend-on").find(
    (v) => v.sourcePkg === "packages/financial-core" && v.targetPkg === "packages/ui",
  );
  assert.ok(r3, "financial -> ui must also fire R3");
  const r5 = rulesOf(evaluation, "R5-deep-import").find(
    (v) => v.sourcePkg === "packages/financial-core" && v.targetPkg === "packages/ui",
  );
  assert.ok(r5, "import of @mini/ui/deep must fire R5 (not covered by exports)");
  assert.equal(r5.occurrences[0].specifier, "@mini/ui/deep");
});

test("engine: contracts subpath deep import from financial is caught (R5)", () => {
  const root = buildMiniWorkspace();
  const { evaluation } = evaluate(root);
  const r5 = rulesOf(evaluation, "R5-deep-import").find(
    (v) => v.sourcePkg === "packages/financial-core" && v.targetPkg === "packages/shared",
  );
  assert.ok(r5, "@mini/shared/widget must fire R5");
  assert.equal(r5.occurrences[0].deepImportReason, "not-covered-by-exports");
});

test("engine: B3 contracts framework import is caught (R7)", () => {
  const root = buildMiniWorkspace();
  const { evaluation } = evaluate(root);
  const r7 = rulesOf(evaluation, "R7-contracts-framework-import").filter(
    (v) => v.sourcePkg === "packages/shared",
  );
  assert.equal(r7.length, 1);
  assert.match(r7[0].detail, /react/);
});

test("engine: B4 deep import into non-exported subpath is caught (R5)", () => {
  const root = buildMiniWorkspace();
  const { evaluation } = evaluate(root);
  const r5 = rulesOf(evaluation, "R5-deep-import").find(
    (v) => v.sourcePkg === "packages/app" && v.targetPkg === "packages/rogue",
  );
  assert.ok(r5, "app -> @mini/rogue/secret must fire R5");
  assert.equal(r5.occurrences[0].specifier, "@mini/rogue/secret");
});

test("engine: B5 intelligence -> financial proposal path is caught (R3, INV-9 guard)", () => {
  const root = buildMiniWorkspace();
  const { evaluation } = evaluate(root);
  const hit = rulesOf(evaluation, "R3-not-in-may-depend-on").find(
    (v) => v.sourcePkg === "packages/lab" && v.targetPkg === "packages/financial-core",
  );
  assert.ok(hit, "intelligence must not depend on financial");
  assert.match(hit.detail, /layer "intelligence" -> layer "financial"/);
});

test("engine: B6 package cycle is caught (R4)", () => {
  const root = buildMiniWorkspace();
  const { evaluation } = evaluate(root);
  const r4 = rulesOf(evaluation, "R4-cycle");
  assert.equal(r4.length, 1);
  const nodes = r4[0].detail.replace("package dependency cycle: ", "").split(" -> ");
  assert.deepEqual([...nodes].sort(), ["packages/cyclic-a", "packages/cyclic-b", "packages/cyclic-a"].sort());
});

test("engine: known-good edges produce zero violations in the clean tree", () => {
  const root = buildCleanWorkspace();
  const { evaluation } = evaluate(root);
  assert.deepEqual(
    evaluation.violations.map((v) => `${v.rule}:${v.sourcePkg}->${v.targetPkg}`),
    [],
  );
});

test("engine: experience -> contracts edge passes (known-good allow-list)", () => {
  const root = buildCleanWorkspace();
  const { evaluation } = evaluate(root);
  const ui = evaluation.packages.find((pkg) => pkg.dir === "packages/ui");
  assert.equal(ui.declaredLayer, "experience");
  assert.equal(
    evaluation.violations.some((v) => v.sourcePkg === "packages/ui"),
    false,
  );
});

test("engine: applyMode downgrades unmapped packages to warn in baseline mode", () => {
  const root = buildMiniWorkspace();
  const { evaluation } = evaluate(root);
  const fake = [
    ...evaluation.violations,
    { rule: "R1-unmapped-package", severity: "error", sourcePkg: "x", targetPkg: null, detail: "", occurrences: null },
  ];
  const strict = applyMode(fake, "strict");
  const baseline = applyMode(fake, "baseline");
  assert.equal(strict.find((v) => v.rule === "R1-unmapped-package").severity, "error");
  assert.equal(baseline.find((v) => v.rule === "R1-unmapped-package").severity, "warn");
});

test("engine: dirty tree yields exactly the 12 expected violations across all 7 rules", () => {
  const root = buildMiniWorkspace();
  const { evaluation } = evaluate(root);
  assert.equal(evaluation.violations.length, 12);
  const rules = new Set(evaluation.violations.map((v) => v.rule));
  assert.deepEqual(
    [...rules].sort(),
    [
      "R2-must-not-depend-on",
      "R3-not-in-may-depend-on",
      "R4-cycle",
      "R5-deep-import",
      "R7-contracts-framework-import",
    ],
  );
});

test("engine: financial package dependencies include the violating ui edge", () => {
  const root = buildMiniWorkspace();
  const { evaluation } = evaluate(root);
  const financial = evaluation.packages.find((pkg) => pkg.dir === "packages/financial-core");
  assert.deepEqual(
    financial.dependencies.map((dep) => dep.target).sort(),
    ["packages/provider-impl", "packages/shared", "packages/trust-core", "packages/ui"],
  );
});

test("engine: R1 fires for packages missing from package_layers", async () => {
  const fs = await import("node:fs");
  const root = buildMiniWorkspace();
  const policyPath = `${root}/spec/architecture/MODULE-OWNERSHIP.yaml`;
  const text = fs.readFileSync(policyPath, "utf8").replace("  packages/cyclic-a: platform\n", "");
  fs.writeFileSync(policyPath, text, "utf8");
  const { evaluation } = evaluate(root);
  const r1 = rulesOf(evaluation, "R1-unmapped-package");
  assert.equal(r1.length, 1);
  assert.equal(r1[0].sourcePkg, "packages/cyclic-a");
  // cyclic-a -> cyclic-b edge no longer evaluates (unmapped source):
  const bEdge = evaluation.violations.some(
    (v) => v.sourcePkg === "packages/cyclic-a" && v.targetPkg === "packages/cyclic-b",
  );
  assert.equal(bEdge, false);
});
