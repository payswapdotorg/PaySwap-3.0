# P4-W2 Baseline Verification Record — Onchain Security (R2-W2 rebuild)

Work order: P4-W2 (spec/dependency/work-orders.md: "onchain security —
signing requests, simulation, state diff, scoped authorization, security
gate and immediate recheck"), rebuilt under lane R2-W2 (a rebuild of the
accepted-then-lost work/p4-w2).
Branch: `work/r2-w2` (base `69998881ab71a12e71b2e7d600c07dea292671d1` =
main: "MERGE R1-W2: execution-graph package — R1 WAVE COMPLETE",
verified with `git log --oneline -1` after checkout).
Write surface: `packages/onchain-security/**`, `spec/onchain-security/**`,
`docs/onchain-security-evidence/**` (pairwise-disjoint law; hard
constraint 8: zero files touched outside the surface — verified by the
manifest diff in §6).
Old-repo evidence pin: `payswapdotorg/payswap.org@8a735bf1639198c43115087a2992555166a9acf9`
(read-only; classified PORT per spec/migration/migration-matrix.json
MMI-18 / MMP-21 + MMP-22, authority owner P4-W2).

## 1. Battery receipts (exact commands, exit codes, counts)

All commands run from `packages/onchain-security/` on Node v24.21.0
(the CI-faithful battery, from a clean tree).

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `rm -rf node_modules package-lock.json && npm install --no-workspaces` | 0 | typescript@6.0.x + vitest@3.2.x toolchain installed (warnings only: esbuild postinstall not in allowScripts — no impact) |
| 2 | `npx tsc --noEmit` | 0 | strict + exactOptionalPropertyTypes, **zero diagnostics** |
| 3 | `npx vitest run` | 0 | **31 files / 384 tests, all PASS** |
| 4 | runtime export census (plain `node` type-stripping import of each subpath) | 0 | **197 named runtime exports** = kernel barrel **91** + `./threat-intel` **96** + `./adapters/*` **10** (eip712 6 + erc1271 4); exported declarations incl. type-only: kernel 203 + threat-intel 137 = **340** |

Prior-art oracle (the lost accepted build): battery 31 files / 331
tests; 176 runtime exports (70 + 96 + 10); 292 declarations. Reproduced
and exceeded on every axis: 384 ≥ 331 tests, 197 ≥ 176 runtime exports
(threat-intel exactly 96, adapters exactly 10, kernel 91 ≥ 70), 340 ≥
292 declarations.

## 2. Test classification (old evidence → new suite)

Old evidence (payswap.org@8a735bf): `packages/onchain-security`
11 files / 144 tests + `packages/onchain-threat-intel` 14 files / 162
tests (recorded counts; 306 total). All 25 old files ported + adapted;
6 net-new files for the 3.0 laws. Note: runtime (vitest) counts exceed
the recorded static counts where the old suites used parameterized
loops (e.g. old recheck.test.ts: 5 static `it(` → 12 loop instances + 5
= 17 runtime tests — the port preserves the loop structure verbatim).

| New file | Tests | Class | Notes |
|---|---|---|---|
| test/smoke.test.ts | 2 | PORT | package identity + digest determinism |
| test/boundary.test.ts | 11 | PORT+ADAPT | REWRITTEN for the 3.0 law: zero sibling imports (was: allowlist of 3), no tsconfig paths, EVM isolation, determinism guards, secret hygiene, type-level proof, module existence, ≤400-line law, no enum/namespace, toolchain devDeps, pinned subpaths |
| test/stages.test.ts | 19 | PORT | prepare/simulation/diff stages |
| test/gates.test.ts | 33 | PORT | all 10 guard dimensions |
| test/delegation.test.ts | 22 | PORT | attenuation/registry/coverage (+ `issuedAtEpoch` on the pin fixture) |
| test/authorization.test.ts | 12 | PORT | request building + verification reasons |
| test/recheck.test.ts | 17 | PORT | all drift dimensions (loop-parameterized, as in the old suite) |
| test/pipeline.test.ts | 11 | PORT | stage discipline + terminality |
| test/secrets.test.ts | 16 | PORT | scan law |
| test/signers.test.ts | 9 | PORT | adapter port + signing requests |
| test/security-composition.test.ts | 6 | PORT+ADAPT | drives the STRUCTURAL WIRING DOUBLE (see deviation D-1) |
| test/helpers.ts | — | PORT+ADAPT | registerCurrency dropped (3.0 shape-only law); Principal/Mandate/SmartContractExtension via pins |
| test/pins.test.ts | 15 | NET-NEW | pinned wire shapes |
| test/state-machine.test.ts | 7 | NET-NEW | declared state machine (definition validation + terminality) |
| test/no-downgrade-law.test.ts | 11 | NET-NEW | the encoded cannot_downgrade_block law (type/runtime/rejection) |
| test/secrets-law.test.ts | 11 | NET-NEW | the non-custody law (redaction, opaque refs, no custody API) |
| test/wire-compat.test.ts | 8 | NET-NEW | consumer seams (surface fold shape, AmountSpec pin identity, stamps) |
| test/threat-intel/smoke.test.ts | 2 | PORT+ADAPT | surface name → `@payswap/onchain-security/threat-intel` |
| test/threat-intel/boundary.test.ts | 7 | PORT+ADAPT | REWRITTEN: relative-only imports for the subpath (was: allowlist of 4); venue/execution vocab bans kept; old dependency-allowlist test dropped (old-repo law) |
| test/threat-intel/families.test.ts | 6 | PORT | |
| test/threat-intel/evidence.test.ts | 12 | PORT | |
| test/threat-intel/confidence.test.ts | 7 | PORT | |
| test/threat-intel/observations.test.ts | 10 | PORT | |
| test/threat-intel/signals.test.ts | 5 | PORT | |
| test/threat-intel/policy.test.ts | 14 | PORT | |
| test/threat-intel/detectors.test.ts | 49 | PORT | all 13 family detectors |
| test/threat-intel/agent.test.ts | 7 | PORT | |
| test/threat-intel/verdict.test.ts | 14 | PORT+ADAPT | 'rule 27' citation → canonical INV-21 |
| test/threat-intel/fixtures-corpus.test.ts | 17 | PORT | |
| test/threat-intel/secret-free.test.ts | 6 | PORT | |
| test/threat-intel/immune-composition.test.ts | 6 | PORT+ADAPT | drives the STRUCTURAL WIRING DOUBLE (D-1) |
| test/threat-intel/helpers.ts | — | PORT+ADAPT | |
| test/threat-intel/no-downgrade.test.ts | 12 | NET-NEW | the threat-layer no-downgrade lattice |
| **Total** | **384** | 25 ported + 6 net-new | all PASS |

## 3. Per-file source adaptation receipts (old → new)

Kernel (old `packages/onchain-security/src`, 15 files / 4,100 lines →

| Old source | Old L | New source | New L | Adaptation |
|---|---|---|---|---|
| types.ts | 208 | types.ts (210) + pins/smart-contract.ts (83) | 293 | PORT identity contracts; SmartContractExtension pinned structurally (capability lane); INV citations re-homed to canonical (SC01→INV-20, E01→INV-5) |
| digest.ts | 92 | digest.ts | 95 | PORT verbatim semantics (FNV-1a 64 + canonical serialization) |
| secrets.ts | 292 | secrets.ts (327) + secrets-policy.ts (130) | 457 | PORT scan law; NET-NON-CUSTODY redaction + opaque vault refs (D-3); split for the ≤400-line law |
| write-intent.ts | 268 | write-intent.ts | 276 | PORT (AmountSpec via the pin) |
| simulation.ts | 131 | simulation.ts | 137 | PORT (OUTCOME_UNKNOWN first-class) |
| diff.ts | 194 | diff.ts | 202 | PORT |
| gates.ts | 660 | gates-policy.ts (259) + gates.ts (368) + gates-simulation.ts (136) | 763 | PORT the full 10-dimension evaluation; split for the ≤400-line law; INV citations canonicalized |
| (no counterpart) | — | block-law.ts | 202 | NET-NEW: the encoded cannot_downgrade_block layer law (type + runtime + rejection) |
| delegation.ts | 353 | delegation.ts | 358 | PORT (Mandate/action patterns via the pin) |
| authorization.ts | 647 | authorization.ts (374) + authorization-verify.ts (314) | 688 | PORT construction + trusted surface + 3-stage verification; split for the ≤400-line law; trust wire via pins |
| recheck.ts | 235 | recheck.ts | 245 | PORT (13 drift dimensions) |
| pipeline.ts | 465 | pipeline-machine.ts (125) + pipeline.ts (394) | 519 | PORT; the declared machine now uses the LOCAL pinned state machine (old: @payswap/protocol import) |
| signers.ts | 167 | signers.ts | 174 | PORT |
| adapters/eip712.ts | 200 | adapters/eip712.ts | 207 | PORT |
| adapters/erc1271.ts | 120 | adapters/erc1271.ts | 124 | PORT |
| (no counterpart) | — | pins/{errors,money,principal,mandate,authorization-wire,quote,state-machine,index}.ts | 736 | NET-NEW: the structural pins (the zero-sibling law) |
| (no counterpart) | — | version.ts (31) + index.ts (89) | 120 | NET-NEW: wire stamps + barrel |

Threat-intel (old `packages/onchain-threat-intel/src`, 14 files / 4,196
lines → `src/threat-intel/`, the "./threat-intel" subpath of the SAME
package — the security layer owns the vocabulary; D-2):

| Old source | Old L | New source | New L | Adaptation |
|---|---|---|---|---|
| families.ts | 177 | families.ts | 186 | PORT |
| evidence.ts | 287 | evidence.ts | 294 | PORT (+ isRationalString export) |
| confidence.ts | 160 | confidence.ts | 160 | PORT |
| observations.ts | 571 | observations.ts (256) + observations-intel.ts (119) + observations-chain.ts (231) | 606 | PORT; split for the ≤400-line law; kernel imports become relative; quote disclosures via the pin |
| signals.ts | 133 | signals.ts | 139 | PORT |
| policy.ts | 473 | policy.ts (387) + policy-evaluation.ts (134) | 521 | PORT; split; verdictForSignal moved to the evaluation module (same barrel surface) |
| detectors.ts | 1382 | detectors-context.ts (116) + detectors-approvals.ts (387) + detectors-infra.ts (209) + detectors-mev-bridge.ts (251) + detectors-state.ts (173) + detectors-consistency.ts (297) + detectors.ts (73) | 1506 | PORT all 13 detectors verbatim; split 5 ways for the ≤400-line law |
| agent.ts | 220 | agent.ts | 225 | PORT |
| verdict.ts | 261 | verdict.ts | 258 | PORT ('rule 27' → INV-21) |
| advisory-bridge.ts | 463 | advisory-bridge.ts (328) + threat-signatures.ts (133) | 461 | PORT; split for the ≤400-line law |
| index.ts | 69 | index.ts | 55 | PORT (+ wire stamp re-export) |

Every new file ≤ 400 lines (max: pipeline.ts 394). Zero `@payswap/*`
module specifiers anywhere (grep `from "@payswap` = 0 in src AND test;
machine-checked by both boundary tests). No `node:` imports in src.
`process.cwd` declared exactly ONCE as a FUNCTION global in
test/node.d.ts.

## 4. Deviations from the old evidence (recorded with reasons)

| # | Deviation | Reason |
|---|---|---|
| D-1 | The old security-composition + immune-composition tests drove the REAL `@payswap/security` machinery (SecurityAdvisoryRegistry / QuarantineLedger / SecurityEpochAuthority / SecurityGate / ThreatSignatureRegistry). The rebuild drives a STRUCTURAL WIRING DOUBLE (test/security-wiring.ts) with the same observable laws. | In PaySwap 3.0 at base 6999888 no security-immune package exists (P6-W3 territory), and the R2-W2 zero-sibling law forbids ANY @payswap/* import, including tests (the hermetic battery installs only typescript + vitest). The composition CONTRACT (advisory→quarantine/restrict/retire→kernel BLOCK; epoch advance→voided authorizations; release requires verified remediation + closure) is proven against the double; the TL wires the real machines at accept-time. |
| D-2 | The old separate package `@payswap/onchain-threat-intel` becomes the `./threat-intel` SUBPATH of `@payswap/onchain-security`. | The work order: "the onchain threat-intel vocabulary... which the security layer explicitly owns" — ported INTO the same package; MODULE-OWNERSHIP layer `security` examples include threat-intel. Package exports: `.`, `./threat-intel`, `./adapters/eip712`, `./adapters/erc1271` (matching the accepted build's export surface). |
| D-3 | Net-new: `redactSecretShapedValues`, `opaqueCredentialRef`, `isOpaqueCredentialRef`, `OpaqueCredentialRef`, `REDACTED_MARKER_KINDS` (secrets-policy.ts); net-new `block-law.ts` (GATE_DECISION_RANK, stricterGateDecision, joinGateDecisions, attemptBlockDowngrade, assertNoBlockDowngrade, NoBlockDowngrade, BlockProjection); net-new wire stamps (version.ts). | Hard constraint 5 (cannot_downgrade_block encoded as type + runtime with tests) and constraint 6 (secrets = shapes + policy: redaction, opaque refs — never custody). |
| D-4 | `registerCurrency("USC"/"ETH", ...)` dropped from test helpers. | The 3.0 trust lane validates the AmountSpec SHAPE only (currency knowledge is a financial-lane concern); the pin is shape-identical. No behavior change in any ported test. |
| D-5 | Old gates/authorization invariant citations (INV-A01..A05, S01..S03, F01, X01, X04, L01, SC01..SC04, E01, R02; AGENTS.md rules 9/10/25–29) replaced by canonical INV ids (INV-2/3/4/5/11/12/17/18/19/20/21). | Canonical INVARIANTS.md mapping; semantics unchanged (evidence: all ported gate/authorization/recheck/pipeline/secrets tests pass unmodified except the one citation assertion, updated to INV-21). |
| D-6 | The pipeline's state machine uses a LOCAL pinned `defineStateMachine` (src/pins/state-machine.ts) instead of `@payswap/protocol`'s. | Zero-sibling law. The pin is a structural mirror of the protocol lane's machine (same declared-graph semantics + terminality discipline), tested in test/state-machine.test.ts; TL integration may swap in the protocol machine (assignable by construction). |
| D-7 | Kernel boundary test INVERTED: old allowed 3 declared workspace imports; new requires EVERY src specifier relative + no tsconfig paths. Old threat-intel dependency-allowlist (web/test/dependency-audit-allowlist.json) check dropped. | Hard constraint 4 (zero sibling imports) + the 3.0 boundary doctrine; the old repo's web-allowlist law does not exist in 3.0 (its successor is the root dependency audit, outside this work order's write surface). |
| D-8 | The verdict composition lives in `src/threat-intel/verdict.ts` importing the kernel's `attachAgentFlag` RELATIVELY (old: a cross-package import of `@payswap/onchain-security`). | D-2's re-homing: same package, relative import, zero-sibling law preserved. Signature/semantics unchanged. |

## 5. Findings

1. The old threat-intel suite has NO dedicated advisory-bridge test
   file (its 14 files are agent/boundary/confidence/detectors/evidence/
   families/fixtures-corpus/immune-composition/observations/policy/
   secret-free/signals/smoke/verdict): advisory-bridge +
   threat-signature coverage lived inside immune-composition.test.ts
   ("threat signature registration in the REAL ThreatSignatureRegistry")
   — the port preserves exactly that structure, and every assertion
   holds against the wiring double.
2. The old `delegation.ts` had a dead `unreachable` branch
   (`params.parentMandate.id !== params.delegationId && ...`) — not
   ported (dead code); no test relied on it.
3. Old `gates.ts` carried a defensive `write.protocol!` non-null
   assertion pattern; the rebuild preserves semantics with local
   narrowing (typecheck-clean under strict).
4. Runtime export census method: plain `node --experimental-strip-types`
   import of each subpath barrel, counting `Object.keys` — the same
   plain-Node compatibility the accepted 3.0 packages assert (no tsx,
   no loaders): the package is directly importable by Node 24
   type-stripping, consistent with the no-enum/no-namespace boundary
   law.
5. No `package-lock.json` committed (the battery deletes it; the
   package installs hermetically from the toolchain versions).

## 6. Manifest receipt

`git diff --name-only 69998881ab71a12e71b2e7d600c07dea292671d1..HEAD`
contains ONLY paths under `packages/onchain-security/`,
`spec/onchain-security/` and `docs/onchain-security-evidence/`
(hard constraint 8 — pnpm-workspace.yaml, pnpm-lock.yaml,
MODULE-OWNERSHIP.yaml, .github/workflows, other packages and other
spec/ paths untouched). SHA-256 manifest: `~/MANIFEST.sha256` (workspace
delivery).
