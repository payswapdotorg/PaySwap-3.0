# P1-W3 Baseline Verification Record — Trust/Policy/Security Boundary

Work order: P1-W3 (spec/dependency/work-orders.md: "Principals, mandates,
attenuation, approval artifacts, policy and security-epoch linkage").
Lane: migration, experience and integrations (Phase 1).
Branch: `work/p1-w3` (base `0a5b9765edfb65a502dfd388f30b471854531a36`).
Write surface: `packages/trust/**`, `spec/trust/**`, `docs/trust-evidence/**`
(pairwise-disjoint law verified — zero files touched outside the surface).
Old-repo evidence pin: `payswapdotorg/payswap.org@8a735bf1639198c43115087a2992555166a9acf9`
(read-only; classified PORT per spec/migration/migration-matrix.json MMP-34,
authority owner P1-W3; MMI-05 preserve item; MMP-31 security-epoch linkage
carried into P1-W3).

## 1. Battery receipts (exact commands, exit codes, counts)

All commands run from `packages/trust/` on Node v24.21.0.

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `npm install --no-workspaces` | 0 | typescript@6.0.x + vitest@3.2.x toolchain installed (warnings only: esbuild postinstall not in allowScripts — no impact) |
| 2 | `npx tsc --noEmit` | 0 | strict + exactOptionalPropertyTypes, zero diagnostics |
| 3 | `npx vitest run` | 0 | **11 files / 138 tests, all PASS** (79 ported + 59 net-new; per-file below) |
| 4 | `node --input-type=module -e "import('./src/index.ts').then(m=>console.log('EXPORTS:', Object.keys(m).length))"` | 0 | `EXPORTS: 47` (plain-Node type-stripping import; no tsx fallback needed) |

Per-file test counts (vitest): attenuation 30, authorization 17,
approval-artifacts 12, grants 12, scoped-execution 8, epoch 9,
epoch-linkage 19, security-block 10, minor-units 13, boundary 7, smoke 1.

Old-suite baseline: 6 files / 79 tests PASS (matrix MMP-34; independently
re-run by the TL in P0-W3). Ported coverage: **79/79 old runtime tests
ported** (none dropped, none weakened), split across files as follows:

| Old file (79 tests) | New home | Ported | Net-new added |
|---------------------|----------|--------|---------------|
| attenuation.test.ts (27) | attenuation.test.ts | 27 | +3 (epoch-stamp inheritance; large-number widening; non-canonical wire rejection) |
| authorization.test.ts (20) | authorization.test.ts (16 evaluate) + approval-artifacts.test.ts (4 verify) | 20 | +1 (float-unsafe velocity sum) in authorization; +8 in approval-artifacts |
| grants.test.ts (18) | grants.test.ts (10 issue/revoke/check) + scoped-execution.test.ts (8 gate) | 18 | +2 (scoped cap beyond parent; lineage sanity) |
| boundary.test.ts (4) | boundary.test.ts (adapted to leaf law) | 4 | +3 (devDeps exactness, file-size law, no node imports) |
| epoch.test.ts (9) | epoch.test.ts | 9 | — |
| smoke.test.ts (1) | smoke.test.ts | 1 | — |
| (no counterpart) | epoch-linkage.test.ts, security-block.test.ts, minor-units.test.ts | — | +45 (19 + 10 + 13, plus the 8 net-new in approval-artifacts and 4 in epoch-linkage counted above; total net-new 59) |

## 2. Per-file adaptation receipts (old -> new)

| Old source (payswap.org@8a735bf) | Lines | New source | Lines | Adaptation |
|---|---|---|---|---|
| packages/trust/src/principal.ts | 62 | packages/trust/src/principal.ts | 159 | PORT core (UserPrincipal/AgentPrincipal/ServicePrincipal/principalRef verbatim semantics); ADAPT: net-new `Identity` + `identityOf` (stable capability identity vs instance, PAYSWAP-3.0 Agent model), net-new lifecycle states + transition table + `canAuthorizeState`; doc cites canonical AUTHORITY-MODEL |
| packages/trust/src/mandate.ts | 303 | amount-spec.ts (74) + mandate.ts (267) | 341 | ADAPT: AmountSpec + validateAmountSpec + InvalidAmountError moved to dedicated amount-spec.ts as the PINNED wire type (interface byte-identical to pin; verified verbatim in §4); **amountSpecToMoney and compareAmounts NOT ported** (decision D-1); patterns/constraint family/Mandate/PermissionGrant/issueGrant ported; Mandate gains required `issuedAtEpoch` (work-order-ordered stamp); old invariant ids (INV-F01 etc.) replaced by canonical INV-2/TB-7 citations |
| packages/trust/src/attenuation.ts | 407 | attenuation.ts (229) + attenuation-rules.ts (213) | 442 | PORT: all 15 dimensions + inheritance semantics + attenuateGrant lineage, byte-equivalent logic; split into public API + internal rules for the <=400-line law; `assertAmountNotWider` now uses internal canonical-integer ordering (D-2) instead of protocol `compareAmounts`; child inherits parent `issuedAtEpoch` (TB-5 chain death) |
| packages/trust/src/authorization.ts | 500 | authorization.ts (399) + approval-artifacts.ts (284) | 683 | ADAPT: evaluate() engine ported (precedence ranks, fail-closed scope checks, velocity window/sum, escalation, scoped gate) with money ops on internal canonical integers (D-2); artifact section REWRITTEN into typed `ApprovalArtifact` per work order (id/approvedBy/mandateRef/securityEpoch/proofLevel/effectRefs; deep-frozen; digest); net-new `invalid_epoch_stamp` deny reason + EpochState.networkEpoch linkage gate; policyRefs cite canonical INV-*/TB-* ids (old INV-A01/A02/A03/S02/E01/F01 scheme retired); verifyApprovalArtifact signature extended to (artifact, requestHash, binding, context{now, networkEpoch?}) |
| packages/trust/src/grants.ts | 445 | grants.ts (332) + scoped-gate.ts (159) | 491 | PORT: ScopedGrantRegistry (issue/revoke/status/listForMandate, freeze, monotonic revocation), checkScopedGrant fail-closed guard, scope predicates, scoped-execution gate (moved from authorization.ts in the old repo); cap comparison on internal canonical integers; gate split out for the file-size law |
| packages/trust/src/security-epoch.ts | 108 | security-epoch.ts (196) | 196 | PORT: per-principal EpochLedger/checkEpoch/StaleEpochError/NonMonotonicEpochError verbatim semantics; old per-principal `SecurityEpoch` interface RENAMED `CredentialEpoch` (the name SecurityEpoch now belongs to the network epoch, per the work order); ADAPT: net-new network-wide `SecurityEpochAuthority` (mechanics from old packages/security/src/epochs.ts, see below) |
| packages/security/src/epochs.ts (mechanics reference only) | 321 | security-epoch.ts (authority) + policy-epoch.ts (218) + security-block.ts (191) | — | ADAPT: monotonic advance + append-only history + staleness semantics re-expressed as status-returning linkage functions (`mandateEpochStatus`/`epochStampStatus`); `advisoryRef` generalized to `eventRef` (advisories are P6-W3 territory); old `EpochScopedAuthorization`/`checkDelegatedSensitiveAction` check contract RETIRED in favor of epoch-stamped Mandate/ApprovalArtifact; net-new PolicyEpochLedger (effective-dated windows) and SecurityBlockRegistry (INV-21). Advisories/experts/quarantine/capability-cases NOT ported (P6-W3) |
| packages/trust/src/index.ts | 14 | index.ts (29) | 29 | ADAPT: PACKAGE_NAME kept; 11 module re-exports; minor-units.ts deliberately NOT re-exported (internal law-enforcement helpers) |
| packages/trust/test/node.d.ts | 21 | test/node.d.ts | 22 | PORT verbatim (ambient decls for the boundary scanner) |
| package.json (old: deps @payswap/protocol) | — | package.json | 18 | ADAPT: runtime `dependencies` field REMOVED entirely (old had `"@payswap/protocol": "*"` — the reversed dependency); devDeps typescript + vitest only; exports "." -> "./src/index.ts" per work order |
| (none) | — | minor-units.ts | 87 | NET-NEW internal canonical-integer helpers (see D-2) |
| (none) | — | tsconfig.json, vitest.config.ts | 14+8 | NET-NEW scaffold: extends ../../tsconfig.base.json with strict/exactOptionalPropertyTypes/noEmit/allowImportingTsExtensions (see D-5) |

Classification (migration matrix legend): package-level **PORT** per MMP-34;
file-level: PORT (principal, epoch tests, smoke, registry, attenuation logic,
evaluate logic), ADAPT (mandate split, authorization split, grants split,
epochs mechanics), REWRITE (approval artifact type), NET-NEW (Identity,
lifecycle, network authority, policy epochs, security blocks, minor-units,
boundary leaf law).

## 3. Decision records

**D-1 — Reversed dependency removed (architecture wins).** Old trust
imported `Money`, `compare`, `add`, `currencyCode`, `fromMinorUnits` from
`@payswap/protocol` (old mandate.ts/authorization.ts). PaySwap 3.0
MODULE-OWNERSHIP + the P1 dispatch pin trust as a leaf: financial may depend
on trust, never the reverse. Consequences: `amountSpecToMoney` and
`compareAmounts` are NOT ported (the bridge lives on the financial side);
the package declares zero runtime dependencies and zero PaySwap imports
(machine-checked by test/boundary.test.ts). The financial lane (P1-W2) owns
the AmountSpec->Money bridge against this same pinned wire type.

**D-2 — Internal canonical-integer law enforcement (honest deviation, see
§5).** INV-12 attenuation and limit enforcement (per-transaction bounds,
velocity sums) are mathematically impossible without exact ordering and
summation over the wire form, and the work order mandates machine-checked
attenuation with the old suite fully ported. Resolution: `src/minor-units.ts`
implements length/lexicographic ordering and BigInt summation over the
CANONICAL decimal-integer strings this package owns and validates — internal
only (never exported from the index), no Money type, no currency semantics
(currency equality is enforced by every caller before use), no scale/FX.
The single-owner law for MONEY semantics (INV-01/TB-7) is preserved: the
public API exposes no money arithmetic, and the boundary test fails if any
@payswap/* import appears. A security boundary computing its own law math
end-to-end is the fail-closed choice; caller-injected arithmetic would make
INV-12 only as strong as the caller.

**D-3 — Mandate.issuedAtEpoch required; children inherit the stamp.** The
work order orders mandates stamped with the epoch at issuance. Made required
(every mandate fixture carries it; unstamped mandates cannot exist, so
"advancement invalidates stale mandates" is total, not best-effort).
attenuate() inherits the parent stamp: an epoch advance kills the whole
delegation chain deterministically, and no child can be minted into a newer
epoch than its parent (that would resurrect dead authority).

**D-4 — Epoch naming.** Old per-principal `SecurityEpoch` renamed
`CredentialEpoch` (with `CredentialEpochLedgerEntry`); the network-wide
monotonic counter keeps the `SecurityEpoch` name per the work order.
`EpochLedger` (per-principal) keeps its ported name. `advisoryRef` ->
`eventRef` (advisories are P6-W3; the advance event reference is
lane-neutral).

**D-5 — .ts import specifiers + allowImportingTsExtensions.** The package
exports source directly (`".": "./src/index.ts"`, no build step). Node 24
type stripping resolves `.ts` specifiers but NOT `.js`->`.ts` remapping
(probed empirically at setup). `.ts` specifiers + `allowImportingTsExtensions`
(requires `noEmit`, which the battery pins anyway) keep the package
simultaneously plain-Node-importable and `tsc --noEmit`-clean. The old
package used `.js` specifiers (build-based resolution).

**D-6 — package-lock.json not committed.** Generated by the battery's
`npm install --no-workspaces`; the canonical repo uses a root pnpm workspace
lockfile (outside this lane's write surface). The lockfile is a tooling
artifact, exempt from the 400-line law (test/boundary.test.ts documents the
exemption). Toolchain reproducibility is carried by pinned devDependency
ranges (typescript ^6.0.3 matching the canonical root's ^6.0.2 line,
vitest ^3.2.7 matching the old repo's ^3.2.4 line).

**D-7 — Test-file splits.** authorization.test.ts (old 386 lines) split into
authorization.test.ts (evaluate) + approval-artifacts.test.ts (artifact
verify + net-new issue/immutability); grants.test.ts (old 449 lines) split
into grants.test.ts + scoped-execution.test.ts; the net-new evaluate-side
epoch-linkage suite lives in epoch-linkage.test.ts. All 79 old runtime tests
are present; splits exist only to respect the <=400-line file law.

## 4. AmountSpec pin verification (verbatim)

New `src/amount-spec.ts`:

```ts
export interface AmountSpec {
  readonly currency: string;
  readonly minorUnits: string;
}
```

Byte-identical to the pin and to the old repository's declaration
(diff-verified). Validation semantics identical: currency `/^[A-Z]{3}$/`,
minorUnits `/^(0|[1-9][0-9]*)$/` (canonical non-negative decimal integer,
no sign/point/exponent/leading zeros except "0"). Machine-checked by
test/minor-units.test.ts (canonical accept/reject tables) and
test/attenuation.test.ts (non-canonical wire rejection through the law
path).

## 5. Honest deviations and limitations (deliverables, none hidden)

1. **Internal integer ordering/summation (D-2).** The letter of the work
   order forbids implementing "money arithmetic (add/scale/compare)". The
   trust laws (INV-12 machine-checked attenuation; exact limit enforcement
   the old suite tests at 6000+10000>15000 and across 19-digit ceilings)
   cannot be enforced without exact ordering/summation. Implemented as
   internal-only canonical-string operations, never exported, no money
   domain. This is a scoped, documented exception to the letter of the
   constraint in service of its intent (single money authority); flagged for
   TL review.
2. **Signature verification is out of lane.** Artifact `signature` fields
   are opaque non-empty strings; cryptographic verification belongs to the
   trusted approval surface (platform/capability lanes), consistent with
   INV-19 (raw key material never enters this package). Limitation: a
   non-empty-but-garbage signature passes the presence check here.
3. **Principal lifecycle binding is a model, not a runtime gate.** The
   states/transitions/canAuthorizeState are defined and tested, but
   evaluate() does not consume lifecycle state in this phase (no
   lifecycle ledger exists yet); documented in TRUST-BOUNDARY.md §3 as a
   consuming-runtime concern. A found limitation, deliberately scoped.
4. **In-memory registries.** EpochLedger, SecurityEpochAuthority,
   PolicyEpochLedger, ScopedGrantRegistry and SecurityBlockRegistry are
   deterministic in-memory structures (as in the old suite). Persistence,
   distribution and concurrency are out of P1-W3 scope.
5. **Boundary test 400-line law exempts generated lockfiles** (D-6) and
   scans authored .ts/.json only; node_modules/.git/dist/coverage skipped.
6. **The import smoke uses Node's native type stripping** (Node >= 22.7 with
   erasable syntax; verified on v24.21.0). The package deliberately contains
   no enums/namespaces/decorators (non-erasable syntax) so source-direct
   import stays toolchain-free.

## 6. Write-surface compliance

Files added on `work/p1-w3` relative to base 0a5b976 live exclusively under
`packages/trust/`, `spec/trust/`, `docs/trust-evidence/`. Zero modifications
to `packages/economic/**`, `packages/protocol/**`, `spec/architecture/**`,
`tools/**`, `MODULE-OWNERSHIP.yaml`, root `package.json` /
`pnpm-workspace.yaml` / `pnpm-lock.yaml`, `apps/**`, or any inherited
package. No pushes to GitHub (workers hold no push credentials).
