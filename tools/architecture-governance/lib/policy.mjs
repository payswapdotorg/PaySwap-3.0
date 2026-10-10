// policy.mjs — MODULE-OWNERSHIP.yaml policy loading and validation (P0-W2).
//
// Loads the authoritative layer policy and the P0-W2 additive
// `package_layers` annotations, validates them structurally, and exposes a
// strict query API used by the checker. Fail-closed: any structural problem
// (unknown layer, self-referential rule, bad annotation target) is an error,
// never a silent skip.

import fs from "node:fs";
import path from "node:path";
import { parseYamlMini } from "./yaml-mini.mjs";

const BASE_RULE_KEYS = new Set(["owner", "examples", "may_depend_on", "must_not_depend_on"]);
const EXTRA_RULE_KEYS = new Set([
  "cannot_authorize_financial_effects",
  "cannot_downgrade_block",
  "must_not_own_financial_truth",
]);

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function stringList(value, context) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`policy: ${context} must be a list, got ${typeof value}`);
  }
  return value.map((item) => {
    if (typeof item !== "string") {
      throw new Error(`policy: ${context} contains a non-string entry`);
    }
    return item;
  });
}

/**
 * Load and validate the ownership policy.
 * @param {string} root absolute repo root
 * @param {string} policyPath repo-relative policy file path
 * @returns {{
 *   layers: Record<string, {owner: string, mayDependOn: string[],
 *     mustNotDependOn: string[], extra: Record<string, boolean>,
 *     examples: string[] }>,
 *   dependencyRules: Record<string, boolean>,
 *   packageLayers: Record<string, string>,
 *   unmappedExamples: string[],
 * }}
 */
export function loadPolicy(root, policyPath = "spec/architecture/MODULE-OWNERSHIP.yaml") {
  const abs = path.join(root, policyPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`policy file not found: ${policyPath}`);
  }
  const doc = parseYamlMini(fs.readFileSync(abs, "utf8"));

  if (!doc.layers || typeof doc.layers !== "object") {
    throw new Error("policy: missing `layers` mapping");
  }
  if (!doc.dependency_rules || typeof doc.dependency_rules !== "object") {
    throw new Error("policy: missing `dependency_rules` mapping");
  }

  /** @type {Record<string, any>} */
  const layers = {};
  for (const [layerName, rawRules] of Object.entries(doc.layers)) {
    if (rawRules === null || typeof rawRules !== "object") {
      throw new Error(`policy: layer "${layerName}" has no rules`);
    }
    for (const key of Object.keys(rawRules)) {
      if (!BASE_RULE_KEYS.has(key) && !EXTRA_RULE_KEYS.has(key)) {
        throw new Error(`policy: layer "${layerName}" has unknown key "${key}"`);
      }
    }
    const mayDependOn = stringList(rawRules.may_depend_on, `layers.${layerName}.may_depend_on`);
    const mustNotDependOn = stringList(
      rawRules.must_not_depend_on,
      `layers.${layerName}.must_not_depend_on`,
    );
    const overlap = mayDependOn.filter((dep) => mustNotDependOn.includes(dep));
    if (overlap.length > 0) {
      throw new Error(
        `policy: layer "${layerName}" lists ${overlap.join(",")} in both may_depend_on and must_not_depend_on`,
      );
    }
    const unknownMay = mayDependOn.filter((dep) => !(dep in doc.layers));
    if (unknownMay.length > 0) {
      throw new Error(
        `policy: layer "${layerName}" may_depend_on references unknown layers: ` +
          unknownMay.join(","),
      );
    }
    // must_not_depend_on may reference declared layers OR virtual module
    // names (e.g. "ui", "model-runtime", "financial-implementation" in the
    // authoritative file). Virtual names match a target package when they
    // equal the package's declared layer OR its directory basename; they
    // activate automatically once a layer of that name is declared.
    const extra = {};
    for (const key of EXTRA_RULE_KEYS) {
      if (rawRules[key] !== undefined) extra[key] = Boolean(rawRules[key]);
    }
    layers[layerName] = {
      owner: typeof rawRules.owner === "string" ? rawRules.owner : layerName,
      examples: stringList(rawRules.examples, `layers.${layerName}.examples`),
      mayDependOn,
      mustNotDependOn,
      extra,
    };
  }

  /** @type {Record<string, boolean>} */
  const dependencyRules = {};
  for (const [key, value] of Object.entries(doc.dependency_rules)) {
    if (typeof value !== "boolean") {
      throw new Error(`policy: dependency_rules.${key} must be boolean`);
    }
    dependencyRules[key] = value;
  }
  for (const required of ["forbid_cycles", "forbid_deep_imports"]) {
    if (!(required in dependencyRules)) {
      throw new Error(`policy: dependency_rules.${required} is required`);
    }
    if (!dependencyRules[required]) {
      throw new Error(
        `policy: dependency_rules.${required}=false cannot be relaxed by annotations`,
      );
    }
  }

  /** @type {Record<string, string>} */
  const packageLayers = {};
  if (doc.package_layers !== undefined && doc.package_layers !== null) {
    if (typeof doc.package_layers !== "object") {
      throw new Error("policy: package_layers must be a mapping");
    }
    for (const [pkgDir, layer] of Object.entries(doc.package_layers)) {
      if (typeof layer !== "string") {
        throw new Error(`policy: package_layers["${pkgDir}"] must be a layer name string`);
      }
      if (!(layer in layers)) {
        throw new Error(`policy: package_layers["${pkgDir}"] references unknown layer "${layer}"`);
      }
      packageLayers[pkgDir] = layer;
    }
  }

  return { layers, dependencyRules, packageLayers, authority: doc.authority ?? null };
}

/**
 * Does a `must_not_depend_on` entry match a concrete target package?
 * Match semantics (documented): the entry matches when it equals the target
 * package's declared layer, OR the target package's directory basename
 * (module-name hint: "ui" matches packages/ui). Virtual names that match
 * nothing today activate automatically if a layer of that name is declared.
 */
export function matchesForbiddenTarget(forbiddenName, targetLayer, targetDir) {
  if (forbiddenName === targetLayer) return true;
  const basename = targetDir.split("/").pop();
  return forbiddenName === basename;
}

/**
 * Given the policy's `layers[*].examples`, return module-name hints that do
 * NOT map to any annotated package (useful to document coverage gaps).
 */
export function exampleHintsWithoutPackages(policy, workspacePackageDirs) {
  const dirSet = new Set(workspacePackageDirs);
  const hints = [];
  for (const [layerName, layer] of Object.entries(policy.layers)) {
    for (const example of layer.examples) {
      const candidates = [
        `packages/${example}`,
        `apps/${example}`,
        `apps/${example}/packages/${example}`,
      ];
      if (!candidates.some((candidate) => dirSet.has(candidate))) {
        hints.push(`${layerName}:${example}`);
      }
    }
  }
  return hints;
}
