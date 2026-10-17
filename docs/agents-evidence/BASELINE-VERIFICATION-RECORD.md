# P3-W1 Baseline Verification Record — Agent Model

Work order: P3-W1 (spec/dependency/work-orders.md: "Agent Body/Instance/
Package, Organizations, memory boundary and communications").
Lane: R1-W1 (Phase 3, worker-1 — agent/economic plane).
Branch: `work/r1-w1` (base `2999bbb1658443b72ce9644f32cabbebdbecaa37` =
main at dispatch; STATE: P2-W1 ACCEPT, PHASE 2 COMPLETE).
Write surface: `packages/agents/**`, `spec/agents/**`,
`docs/agents-evidence/**` (pairwise-disjoint law — zero files touched
outside the surface; `git diff --name-only 2999bbb..HEAD` lists only this
surface plus the package-local .gitignore).
Old-repo evidence pin: `payswapdotorg/payswap.org@8a735bf1639198c43115087a2992555166a9acf9`
(read-only; evidence not authority — the 3.0 architecture wins).

This is a REBUILD of an accepted-then-lost work item (prior build
work/p3-w1, commits 1cefbae→b15a85a, destroyed by a sandbox reset before
reaching GitHub). The PRIOR-ART ORACLE for that build: 14 files / 131
tests (92 ported/adapted + 40 net-new), tsc 0 diagnostics, zero runtime
deps, single type-only @payswap/trust sibling, every file <= 400 lines
(max 357), no enum/namespace. This rebuild reproduces or beats every
oracle metric (see §5).

## 1. Battery receipts (exact commands, exit codes, counts)

All commands run from `packages/agents/` on Node v24.21.0 /
TypeScript 6.0.3 / vitest 3.2.7 (the CI-faithful, hermetic battery —
`npm install --no-workspaces` with devDependencies typescript + vitest
ONLY; no parent workspace walk-up masking).

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `rm -rf node_modules package-lock.json && npm install --no-workspaces` | 0 | typescript@6.0.3 + vitest@3.2.7 toolchain installed (warnings only: esbuild postinstall not in allowScripts — no impact) |
| 2 | `npx tsc --noEmit` | 0 | strict + exactOptionalPropertyTypes, zero diagnostics (src + test + vitest.config.ts; includes the type-only @payswap/trust link resolved via tsconfig paths, which type-checks the trust sources as a dependency of this program) |
| 3 | `npx vitest run` | 0 | **18 files / 158 tests, all PASS** (92 old-test semantics ported/adapted — 0 dropped, 0 weakened — plus 66 net-new test functions; per-file below) |

Per-file test counts (vitest): reference-runtime 23,
organization-execution 11, package-lifecycle 17, memory-boundary 12,
termination-safety 11, organization 9, communication 9, proposal 11,
boundary 6, budget-ledger 8, body 8, smart-account 8, versioned-graph 7,
strategy-organization 7, authority-port 5, instance 3, runtime 2,
smoke 1.

## 2. Old-suite porting account (92 old tests, 11 files)

Old suite: payswap.org@8a735bf packages/agents — 92 tests in 11 files
(body 8, boundary 4, instance 3, organization-execution 11,
organization 8, package-lifecycle 17, proposal 7, reference-runtime 23,
runtime 2, smart-account 8, smoke 1).

| Old suite (tests) | New home | Ported/adapted | Dropped with reason |
|---|---|---|---|
| smoke.test.ts (1) | smoke.test.ts | 1 (verbatim; PACKAGE_NAME surface) | — |
| body.test.ts (8) | body.test.ts | 8 (verbatim semantics; import paths `.ts`; old INV-G01 citation mapped to the Body-model-independence law) | — |
| instance.test.ts (3) | instance.test.ts | 3 (verbatim) | — |
| runtime.test.ts (2) | runtime.test.ts | 2 (verbatim §20 surface + type-level contract keys) | — |
| smart-account.test.ts (8) | smart-account.test.ts | 8 (verbatim; INV-SC03 citation mapped to canonical INV-19) | — |
| proposal.test.ts (7) | proposal.test.ts | 7 (ADAPTED: fixtures gain `schemaVersion: 1` — the versioned recommendation record; all guard assertions unchanged) | — |
| organization.test.ts (8) | organization.test.ts | 8 (verbatim immutability/content-hash/graph-validation laws) | — |
| package-lifecycle.test.ts (17) | package-lifecycle.test.ts | 17 (verbatim: full walk, skip rejection, terminal RETIRED, ledger records, silent-promotion rejection, certification metadata, sealed publish, integrity) | — |
| organization-execution.test.ts (11) | organization-execution.test.ts | 11 (ADAPTED: trust VALUE imports replaced by the deterministic fake authority adapter with mirrored decision vocabulary; epoch ledger = raised-epoch map over the AuthorityEpochState structural view; grant literals replace issueGrant; BigInt-aware determinism stringify because 3.0 mandates carry issuedAtEpoch. Every assertion — relay order, deny reasons (no_matching_grant, stale_security_epoch), child grant id/lineage/narrowing, rejection reasons, byte-identical traces — is unchanged) | — |
| reference-runtime.test.ts (23) | reference-runtime.test.ts | 23 (ADAPTED: ALLOW/DENY decisions as trust-shaped literals instead of runtime evaluate() calls — the trust lane's own 138-test suite covers evaluate semantics; the revoked-scoped-grant case feeds the same scoped_grant_revoked DENY through the same gate; fromProtocolClock exercised against a local structural bigint clock twin of DeterministicClock. Every runtime assertion — event sequences, state errors, checkpoint/restore, tool-gate reasons — is unchanged) | — |
| boundary.test.ts (4) | boundary.test.ts | 4 semantics across 3 functions (ADAPTED to the accepted capability pattern: old #1 tree scan kept; old #2 declared-workspace-deps law → devDeps-exactly-toolchain + zero-runtime-deps law; old #3+#4 import laws MERGED into the single type-only-@payswap/trust-sibling law, which subsumes the old never-import-@payswap/capabilities rule) | — |

**Ported/adapted total: 92 of 92 old-test semantics (0 dropped, 0
weakened; 91 test functions — old boundary #3+#4 merged into one law
test).** Net-new: **66** (158 total − 92).

## 3. Per-file adaptation receipts (old -> new)

| Old source (payswap.org@8a735bf) | Lines | New source | Lines | Adaptation |
|---|---|---|---|---|
| packages/agents/src/index.ts | 20 | index.ts | 92 | PORT surface + net-new exports (authority port, strategy, memory/comms/budget/termination, runtime seams/tool gate) |
| packages/agents/src/amount.ts | 10 | amount.ts | 25 | ADAPT: AmountSpec re-export is TYPE-ONLY from @payswap/trust via tsconfig paths (the 3.0 wire authority; old repo re-exported the same surface from its workspace dep) |
| packages/agents/src/canonical.ts | 62 | canonical.ts | 71 | PORT verbatim (canonical serialization + FNV-1a digest; INV-G02 citation → canonical INV-3) |
| packages/agents/src/body.ts | 141 | body.ts | 148 | PORT (types + contract key + possession); model-independence type assertions preserved verbatim |
| packages/agents/src/instance.ts | 78 | instance.ts | 81 | PORT verbatim |
| packages/agents/src/proposal.ts | 104 | proposal.ts | 145 | ADAPT: + schemaVersion: 1 (versioned recommendation record, work-order law), + extended marker vocabulary (obligationId/clearingRecordId/settlementInstructionId/reservationId/nettingPositionId/finalityRecordId); scan/guard semantics identical |
| packages/agents/src/package.ts | 142 | package.ts | 145 | PORT (lifecycle vocabulary + transitions; §13) |
| packages/agents/src/package/lifecycle.ts | 289 | package/lifecycle.ts | 290 | PORT (evidence ledger, certification, sealed publish, integrity) |
| packages/agents/src/organization.ts | 221 | organization.ts | 277 | PORT (release/amend/validate) + NET-NEW derivedFrom lineage field with backwards-pointing validation + nextOrganizationVersion |
| packages/agents/src/organization/execution.ts | 309 | organization/execution.ts | 352 | ADAPT: trust VALUE imports (evaluate/attenuateGrant/principalRef) replaced by the INJECTED OrganizationAuthorityAdapter port (src/authority-port.ts); engine semantics (BFS participation, evaluate-before-act, attenuate-only delegation, fail-closed rejections) unchanged; + fail-closed authority presence guard |
| packages/agents/src/runtime.ts | 133 | runtime.ts | 136 | PORT verbatim (§20 contract) |
| packages/agents/src/runtime/reference-runtime.ts | 625 | runtime/runtime-seams.ts (214) + runtime/tool-gate.ts (100) + runtime/reference-runtime.ts (399) | 713 | ADAPT: split for the <=400-line law (old file was 625 lines); `ProtocolClock` type import from @payswap/protocol replaced by the LOCAL structural `ProtocolClockSource` (single-sibling law; the real protocol clock satisfies it structurally); AuthorizationDecision stays TYPE-ONLY from @payswap/trust; the financial tool gate extracted as a pure function with identical outcomes and event payloads |
| packages/agents/src/smart-account.ts | 157 | smart-account.ts | 166 | PORT (session-key bounding + root-credential exclusion; INV-SC03 citation → canonical INV-19) |
| (none) | — | authority-port.ts | 116 | NET-NEW: the injected trust seam + the structural AuthorityEpochState view (the ONE trust type whose runtime construction is class-bound) |
| (none) | — | organization/memory.ts | 188 | NET-NEW: memory boundary store (laws M1-M5) |
| (none) | — | organization/communication.ts | 197 | NET-NEW: deterministic communication relay (laws C1-C5) |
| (none) | — | organization/budget.ts | 225 | NET-NEW: exact budget ledger (laws B1-B5) with internal canonical-integer helpers (not a money API — financial lane owns money semantics) |
| (none) | — | organization/termination.ts | 212 | NET-NEW: termination assessment (fail-closed unknown conditions; approval law) + SafetyPolicyGate (unregistered constraint blocks everything) |
| (none) | — | strategy.ts | 117 | NET-NEW: §7 law in code and types (advisory WHAT; versioned, content-hashed assignment; canStrategyExecuteAlone always false) |
| packages/agents/test/node.d.ts | 21 | test/node.d.ts | 43 | PORT pattern + the accepted process.cwd()-as-FUNCTION global (P1-W2/P2-W1 CI lesson; the old file had the same shape) |
| packages/agents/test/type-utils.ts | 7 | test/type-utils.ts | 7 | PORT verbatim |
| (test scaffolding) | — | test/fixtures.ts | 286 | NET-NEW shared builders incl. the deterministic fake authority adapter (trust-mirroring semantics) |
| (none) | — | memory-boundary/communication/budget-ledger/termination-safety/strategy-organization/versioned-graph/authority-port .test.ts | 601 | NET-NEW: 60 tests across 7 files (see §2 per-file counts) |

## 4. Decision records

**D-1 — Organization execution resolves authority through an injected
port, not a trust import.** The old engine imported @payswap/trust VALUES
(evaluate/attenuateGrant/principalRef). The 3.0 layer law pins this
package to zero runtime dependencies with a single TYPE-ONLY sibling
link, and layer `intelligence` does not runtime-depend on trust. The
`OrganizationAuthorityAdapter` port (method-syntax, bivariant members)
is satisfied DIRECTLY by the real trust functions — compile-time asserted
in test/authority-port.test.ts (`typeof Trust.evaluate` etc. satisfy the
port; `Trust.EpochState` is assignable to the structural
`AuthorityEpochState` view). The engine's laws (participation, no
authority bypass, attenuate-only delegation, fail-closed rejection) are
unchanged and now tested against a deterministic local adapter with the
trust decision vocabulary. The production composition root (TL
integration step) wires the port to @payswap/trust directly.

**D-2 — The reference runtime re-declares the protocol clock shape
locally.** `fromProtocolClock` old-imported the `ProtocolClock` TYPE from
@payswap/protocol. The single-sibling law allows only @payswap/trust
type imports, so the minimal structural shape (`now(): bigint`) is
re-declared as `ProtocolClockSource` (hard-constraint 4: re-declare
minimal structural types locally). The real DeterministicClock satisfies
it structurally; the test uses a local structural twin.

**D-3 — AgentProposal gains `schemaVersion: 1`.** The work order mandates
"a typed, versioned recommendation record". The literal-typed
`schemaVersion` pins the wire shape; `makeProposal` validates it at
runtime. Old proposal tests are adapted by adding the field to fixtures;
no assertion is weakened (the field-set assertion is correspondingly
extended). The marker-field vocabulary is extended with the
financial-protocol artifact ids (obligation/clearing/settlement/
reservation/netting/finality) — a strict addition: every payload the old
suite accepted is still accepted, and payloads the old suite rejected
are still rejected.

**D-4 — Organizations carry explicit `derivedFrom` version lineage.**
Net-new: `OrganizationVersionLineage { version, contentHash }` on the
draft, validated to point strictly backwards, set by
`nextOrganizationVersion` (which derives version N+1 from released N
without mutating it). This makes "Organizations are versioned graphs"
checkable: version chains are unbroken, content-addressed evidence, and
history is preserved (earlier versions stay immutable). Additive to the
old OrganizationDraft shape; the old organization test suite passes
unchanged.

**D-5 — Memory boundary, communications, budgets, termination/safety and
the Strategy-vs-Organization law are net-new modules.** The old package
declared memory/budgets/evaluators/termination/safety as passive wire
types only. The 3.0 work order ("memory boundary and communications";
"Organizations as versioned graphs (communication, delegation, memory,
budgets, evaluators, termination and safety policy)") demands the laws:
M1-M5 (memory), C1-C5 (comms), B1-B5 (budgets), fail-closed termination
+ safety gate, and the §7 strategy/organization separation in code and
types. All are deterministic, in-memory reference implementations with
fail-closed validation; none authorizes anything.

**D-6 — Old invariant citations mapped to canonical 3.0 ids.** Old
INV-G01/G02/G03, A01/A02/A04, E01/E05, X04, SC03, F01 → canonical
INV-2/3/5/9/10/12/19 (spec/architecture/INVARIANTS.md) + FROZEN §7/§12/
§13/§20 section citations (evidence lineage to payswap.org@8a735bf).
Old ids that have no canonical 3.0 equivalent (e.g. INV-X04 monotonic
terminal states) are preserved as domain statements in code comments.

## 5. Prior-art oracle comparison (rebuild vs the lost accepted build)

| Metric | Oracle (work/p3-w1) | This rebuild | Verdict |
|---|---|---|---|
| Battery: install/tsc/vitest | exit 0 / 0 diagnostics / 14 files, 131 tests | exit 0 / 0 diagnostics / 18 files, 158 tests | equal or better |
| Old tests ported/adapted | 92/92, 0 dropped, 0 weakened | 92/92 semantics (91 functions; old boundary #3+#4 merged into one law test), 0 dropped, 0 weakened | equal |
| Net-new tests | 40 | 66 | better |
| Runtime deps | zero (typescript + vitest only) | zero (typescript + vitest only) | equal |
| `node:` imports in src | none | none (machine-checked) | equal |
| test/node.d.ts process shim | process.cwd as function global, declared once | same (accepted capability pattern) | equal |
| Sibling imports | single @payswap/trust TYPE-ONLY via tsconfig paths | same, machine-checked (import type only, every src file) | equal |
| File size law | every src file <= 400 (max 357) | every src file <= 400 (max 399; old 625-line reference-runtime split into seams/tool-gate/class) | equal |
| TS enum/namespace | none | none (machine-checked) | equal |
| Write surface | packages/agents + spec/agents + docs/agents-evidence only | same (verified by `git diff --name-only 2999bbb..HEAD`) | equal |

Deviations from the oracle, all recorded above: 18 test files instead of
14 (finer-grained net-new suites); 158 tests instead of 131 (more
net-new coverage of the 3.0 laws); the reference-runtime split is
three-way (seams + tool gate + class) instead of the oracle's (unknown)
split, to hold the 400-line law with the ported semantics intact.

## 6. Findings

1. The base repo's packages/trust/src/authorization.ts was visually
   suspected of a typo (`andateRef`) during reconciliation; code-point
   inspection showed the real bytes are `[mandateRef` — a display
   artifact of the inspection tool, not a defect. The trust battery was
   re-run (tsc exit 0) to confirm base health before the type-only link
   was relied on.
2. The trust `EpochState.ledger` is a class with private fields
   (nominal). A type-only import would make hermetic test construction
   impossible (no runtime class import allowed), which is why the port
   declares the structural `AuthorityEpochState` view instead — with a
   compile-time assignability assertion so trust-side drift fails THIS
   package's typecheck, not silently.
3. TypeScript weak-type detection makes `{ field?: unknown }` extension
   assertions meaningful (an object type WITHOUT the field does not
   extend the weak target): the old body/proposal/strategy type-level
   "no model/no authority" assertions port verbatim and actually bind.
4. 3.0 mandates carry `issuedAtEpoch: bigint` (TB-5 linkage), so old
   grant fixtures gain `issuedAtEpoch: 0n` and the execution determinism
   test uses a BigInt-aware stringify; the byte-identical assertion is
   preserved.
5. The boundary scanner's `from '...'` import regex can false-positive on
   prose inside template literals; the communication relay's error
   messages use the arrow form (`a -> b`) to stay scanner-clean — same
   convention as the organization validation messages.

## 7. Reproduction

```
cd packages/agents
rm -rf node_modules package-lock.json
npm install --no-workspaces   # exit 0
npx tsc --noEmit              # exit 0, zero diagnostics
npx vitest run                # 18 files / 158 tests, all PASS
```

Exact environment: Node v24.21.0, typescript@6.0.3, vitest@3.2.7
(pinned devDependency ranges; esbuild postinstall warning is
allowScripts-only, no impact).
