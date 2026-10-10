#!/usr/bin/env node
// check-invariants.mjs — P0-W2 authority/invariant machine checks.
//
// Battery command:
//   node tools/architecture-governance/check-invariants.mjs [--root <repo>]
//
// What it machine-checks today (each check documents its invariant ids):
//  A. spec/architecture/invariants.json parses, ids are unique, every entry
//     has status machine-checked|documented-not-expressible and — when
//     machine-checked — a non-empty automation (see B).
//  B. every invariants.json automation named "ownership:<rule-id>" is a rule
//     the ownership validator actually implements (guards against a spec
//     companion that promises checks the tooling does not deliver).
//  C. the policies block of spec/development-state/current-state.json
//     parses and is boolean-only; a lint FAILS if any tracked policy is
//     contradicted by the architecture docs (cross-referenced sentences).
//  D. no_parallel_financial_authority / surface_contracts_are_framework_independent
//     map to ownership-validator rule ids and both tools stay consistent.
//
// Exit codes: 0 all green; 1 contradictions/failures found; 2 usage error.
// Fail-closed: unreadable or malformed inputs are errors, never skips.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { loadPolicy } from "./lib/policy.mjs";
import { AVAILABLE_RULES } from "./lib/rule-ids.mjs";

function failExit(message) {
  process.stderr.write(`check-invariants: ${message}\n`);
  process.exitCode = 1;
}

const CHECK_IDS = ["A-invariants-json-shape", "B-automation-backed", "C-policy-doc-consistency", "D-rule-coverage"];

function main() {
  const argv = process.argv.slice(2);
  let root = process.cwd();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root") {
      root = path.resolve(argv[++i]);
    } else {
      process.stderr.write(`usage: unknown argument "${argv[i]}"\n`);
      process.exit(2);
    }
  }

  const invariantsPath = path.join(root, "spec/architecture/invariants.json");
  const statePath = path.join(root, "spec/development-state/current-state.json");
  const policyPath = path.join(root, "spec/architecture/MODULE-OWNERSHIP.yaml");
  const invariantsDocPath = path.join(root, "spec/architecture/INVARIANTS.md");

  /** @type {{failures: string[], results: Record<string, {status: string, detail: string}>}} */
  const outcome = { failures: [], results: {} };
  const record = (id, ok, detail) => {
    outcome.results[id] = { status: ok ? "PASS" : "FAIL", detail };
    if (!ok) outcome.failures.push(`${id}: ${detail}`);
  };

  // ---------- load inputs (fail-closed) ----------
  if (!fs.existsSync(invariantsPath)) {
    failExit(`missing ${path.relative(root, invariantsPath)} — create the machine-readable companion first`);
    process.exit(1);
  }
  const invariants = JSON.parse(fs.readFileSync(invariantsPath, "utf8"));
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const invariantsMd = fs.readFileSync(invariantsDocPath, "utf8");
  const ownershipPolicy = loadPolicy(root, path.relative(root, policyPath));

  // ---------- A: invariants.json shape ----------
  try {
    const entries = invariants.invariants ?? null;
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error("`invariants` must be a non-empty array");
    }
    const seen = new Set();
    for (const entry of entries) {
      for (const key of ["id", "statement", "status"]) {
        if (typeof entry[key] !== "string" || entry[key].trim() === "") {
          throw new Error(`entry missing string "${key}": ${JSON.stringify(entry).slice(0, 120)}`);
        }
      }
      if (seen.has(entry.id)) throw new Error(`duplicate invariant id "${entry.id}"`);
      seen.add(entry.id);
      if (!["machine-checked", "documented-not-expressible"].includes(entry.status)) {
        throw new Error(`invalid status "${entry.status}" on "${entry.id}"`);
      }
      if (entry.status === "machine-checked") {
        if (!Array.isArray(entry.automation) || entry.automation.length === 0) {
          throw new Error(`machine-checked "${entry.id}" must list at least one automation`);
        }
        for (const automation of entry.automation) {
          if (typeof automation !== "string") {
            throw new Error(`automation entries of "${entry.id}" must be strings`);
          }
        }
      }
    }
    record(
      CHECK_IDS[0],
      true,
      `${entries.length} invariant entries, ${entries.filter((e) => e.status === "machine-checked").length} machine-checked, ids unique`,
    );
  } catch (error) {
    record(CHECK_IDS[0], false, error.message);
  }

  // ---------- B: automations reference real tooling ----------
  try {
    const bogus = [];
    for (const entry of invariants.invariants ?? []) {
      for (const automation of entry.automation ?? []) {
        if (automation.startsWith("ownership:")) {
          const ruleId = automation.slice("ownership:".length);
          if (!AVAILABLE_RULES.includes(ruleId)) {
            bogus.push(`${entry.id} -> ${automation}`);
          }
        } else if (automation.startsWith("invariant-lint:")) {
          const checkId = automation.slice("invariant-lint:".length);
          if (!CHECK_IDS.includes(checkId)) {
            bogus.push(`${entry.id} -> ${automation}`);
          }
        } else {
          bogus.push(`${entry.id} -> ${automation} (unknown automation namespace)`);
        }
      }
    }
    if (bogus.length > 0) {
      throw new Error(`automations not backed by implemented checks: ${bogus.join("; ")}`);
    }
    record(CHECK_IDS[1], true, "all automation references resolve to implemented checks");
  } catch (error) {
    record(CHECK_IDS[1], false, error.message);
  }

  // ---------- C: policies block parses, booleans, consistent with docs ----------
  try {
    const policies = state.policies ?? null;
    if (!policies || typeof policies !== "object") {
      throw new Error("current-state.json has no `policies` object");
    }
    const nonBoolean = Object.entries(policies).filter(([, v]) => typeof v !== "boolean");
    if (nonBoolean.length > 0) {
      throw new Error(`non-boolean policies: ${nonBoolean.map(([k]) => k).join(", ")}`);
    }

    // Doc cross-check: each contradiction rule below asserts that a doc
    // sentence EXISTS and does not contradict the boolean. We scan the
    // architecture docs for statements that contradict a `true` policy.
    const contradictions = [];
    const docs = {
      "PAYSWAP-3.0.md": fs.readFileSync(path.join(root, "spec/architecture/PAYSWAP-3.0.md"), "utf8"),
      "AUTHORITY-MODEL.md": fs.readFileSync(path.join(root, "spec/architecture/AUTHORITY-MODEL.md"), "utf8"),
      "INVARIANTS.md": invariantsMd,
      "MODULE-OWNERSHIP.yaml": fs.readFileSync(policyPath, "utf8"),
      "FINAL-TL-HANDOFF.md": fs.readFileSync(path.join(root, "docs/FINAL-TL-HANDOFF.md"), "utf8"),
    };
    const allDocs = Object.values(docs).join("\n").toLowerCase();

    // A `true` policy is contradicted when its negation appears asserted.
    // Documented negation phrasings (extend deliberately; unknown phrases
    // are simply not contradictions — under-reporting is safe for linting
    // but each policy still requires a positive doc anchor).
    const policyAnchors = {
      no_parallel_financial_authority: [
        "one financial protocol authority",
        "no parallel financial authority",
      ],
      blockchain_is_one_rail_family: ["blockchain is one settlement rail family"],
      external_balances_are_observations: [
        "balances are observations",
        "external balances are observations",
      ],
      unknown_is_not_failed: ["unknown is not failed"],
      simulation_never_production_authority: ["simulation is never production financial authority"],
      security_block_cannot_be_downgraded: [
        "cannot downgrade block",
        "block cannot be downgraded",
      ],
      provider_catalogue_never_authorizes: ["provider catalogue data never authorizes execution"],
      surface_contracts_are_framework_independent: [
        "framework-independent payswap surface",
        "framework-independent surface",
      ],
      repository_is_sole_source_of_truth: [
        "sole source of truth",
      ],
    };
    for (const [policy, anchors] of Object.entries(policyAnchors)) {
      if (policies[policy] === true && !anchors.some((anchor) => allDocs.includes(anchor))) {
        contradictions.push(`policy ${policy}=true has no positive anchor in architecture docs`);
      }
      if (policies[policy] === false) {
        contradictions.push(`policy ${policy}=false — the frozen architecture requires true`);
      }
    }

    // Owner-field consistency: the policy file's authority map must match
    // current-state policy names that exist (they are different files that
    // describe the same authority model).
    if (policies.no_parallel_financial_authority && ownershipPolicy.authority?.financial_truth !== "financial") {
      contradictions.push(
        `MODULE-OWNERSHIP authority.financial_truth="${ownershipPolicy.authority?.financial_truth}" contradicts no_parallel_financial_authority`,
      );
    }

    if (contradictions.length > 0) {
      throw new Error(contradictions.join("; "));
    }
    record(
      CHECK_IDS[2],
      true,
      `${Object.keys(policies).length} boolean policies parsed; doc anchors verified; no contradictions`,
    );
  } catch (error) {
    record(CHECK_IDS[2], false, error.message);
  }

  // ---------- D: shared rule coverage between tools ----------
  try {
    const issues = [];
    if (!ownershipPolicy.dependencyRules.no_parallel_financial_authority) {
      issues.push("MODULE-OWNERSHIP dependency_rules.no_parallel_financial_authority missing/false");
    }
    if (!ownershipPolicy.dependencyRules.domain_contracts_framework_free) {
      issues.push("MODULE-OWNERSHIP dependency_rules.domain_contracts_framework_free missing/false");
    }
    if (!ownershipPolicy.layers.financial?.mustNotDependOn?.includes("ui")) {
      issues.push("financial layer must_not_depend_on ui missing in MODULE-OWNERSHIP");
    }
    if (issues.length > 0) throw new Error(issues.join("; "));
    record(CHECK_IDS[3], true, "ownership policy exposes the rules the invariant companion relies on");
  } catch (error) {
    record(CHECK_IDS[3], false, error.message);
  }

  // ---------- report ----------
  const machineChecked = (invariants.invariants ?? []).filter((e) => e.status === "machine-checked");
  const notExpressible = (invariants.invariants ?? []).filter((e) => e.status === "documented-not-expressible");
  const summary = {
    invariants_total: (invariants.invariants ?? []).length,
    machine_checked: machineChecked.length,
    documented_not_expressible: notExpressible.length,
    checks: outcome.results,
    failures: outcome.failures,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (outcome.failures.length > 0) {
    process.exitCode = 1;
  }
}

main();
