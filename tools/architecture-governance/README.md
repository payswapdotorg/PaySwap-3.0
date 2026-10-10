# tools/architecture-governance

PaySwap 3.0 architecture governance tooling (Work Order P0-W2). Machine-checkable
controls for `spec/architecture/MODULE-OWNERSHIP.yaml`, the invariant companion,
and the policy booleans of `spec/development-state/current-state.json`.

## Commands (exact)

```bash
# Ownership validator: per-package declared layer, real import edges,
# PASS/FAIL per rule; writes docs/architecture-governance/reports/module-ownership-report.json
node tools/architecture-governance/check-module-ownership.mjs

# Invariant + policy-consistency lint
node tools/architecture-governance/check-invariants.mjs

# Unit tests (Node 24 built-in runner; note: a directory argument is NOT a
# glob in node 24 — pass the .test.mjs glob exactly as below)
node --test "tools/architecture-governance/test/*.test.mjs"
```

All commands run offline with `node` only — zero dependencies, no node_modules
required. Exit code 0 = clean; 1 = violations found (or tool failure);
2 = usage error.

## Layout

| Path | Purpose |
| --- | --- |
| `check-module-ownership.mjs` | CLI: builds the workspace import graph and evaluates layer rules R1–R7 |
| `check-invariants.mjs` | CLI: invariant-companion shape, automation-reference integrity, policy/doc consistency, rule coverage |
| `lib/yaml-mini.mjs` | Vendored minimal YAML-subset parser (documented subset; fail-closed) |
| `lib/scanner.mjs` | Vendored TS/JS import-specifier scanner (placeholder-based; string/comment immune) |
| `lib/resolver.mjs` | Specifier classification + resolution (exports-map enforcement, deep-import detection) |
| `lib/workspace.mjs` | pnpm workspace discovery + code-file walking |
| `lib/policy.mjs` | MODULE-OWNERSHIP.yaml loading + structural validation |
| `lib/engine.mjs` | Graph building + rule evaluation R1–R7 |
| `lib/rule-ids.mjs` | Single registry of implemented rule ids (cross-checked by the invariant lint) |
| `test/*.test.mjs` | Unit tests: scanner, yaml-mini, engine (fixture tree), CLI end-to-end |
| `test/fixtures/fixtures.mjs` | Deterministic mini-workspace builder (generated under the OS temp dir, never in-repo) |

## Rules (registry)

| Id | Checks | Policy source |
| --- | --- | --- |
| R1-unmapped-package | every workspace package has a `package_layers` annotation | annotation completeness |
| R2-must-not-depend-on | no edge into a `must_not_depend_on` target (layer match or module-name hint) | `layers.*.must_not_depend_on` |
| R3-not-in-may-depend-on | every cross-layer edge is inside `may_depend_on` | `layers.*.may_depend_on` |
| R4-cycle | no package-level import cycles | `dependency_rules.forbid_cycles` |
| R5-deep-import | no subpath imports that bypass the target's `exports` boundary | `dependency_rules.forbid_deep_imports` |
| R6-cross-package-relative | no relative/alias imports that escape the package boundary | boundary integrity (supporting `forbid_deep_imports`) |
| R7-contracts-framework-import | contracts-layer packages import no UI/app framework or runtime | `dependency_rules.domain_contracts_framework_free` |

`must_not_depend_on` entries may name declared layers OR virtual module names
(e.g. `ui`, `model-runtime`, `financial-implementation`); a virtual name matches
a target package when it equals the target's declared layer or directory
basename. This honors the authoritative file's own vocabulary.

## Modes

- `--mode strict` (default, gate semantics): every violation is an error.
- `--mode baseline`: R1 (unmapped) downgrades to warn — for recording the
  honest baseline of inherited trees without blocking on unmapped-ness.

## Fail-closed guarantees

- Stale `package_layers` annotations (pointing at non-packages) abort with exit 1.
- Policy files that leave the documented YAML subset abort with a precise error.
- Duplicate workspace package names abort (name resolution would be ambiguous).
- Scanner limitations are documented in `lib/scanner.mjs` (missed exotic forms
  can under-report violations, never fabricate them).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | no error-severity violations |
| 1 | error-severity violations found, or tool failure (stale annotations, unreadable policy, duplicate package names) |
| 2 | usage error |
