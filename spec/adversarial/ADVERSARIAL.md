# PaySwap 3.0 Adversarial — Contract Document

Status: FROZEN FOR IMPLEMENTATION (P6-W3; r4-w3 consolidated rebuild)
Package: `@payswap/adversarial` (`packages/adversarial`)
Subpaths: `.` (immune plane + integration) · `./provider-intel`
Authority owner: Policy and Governance Authority — hard constraints
(spec/architecture/AUTHORITY-MODEL.md); the security layer
(spec/architecture/MODULE-OWNERSHIP.yaml, layer `security`)
Work order: P6-W3 (spec/dependency/work-orders.md: "Adversarial
onchain/provider threat intelligence and immune-system integration;
deterministic BLOCK remains authoritative")
Evidence: docs/adversarial-evidence/BASELINE-VERIFICATION-RECORD.md
Rebuild: lane r4-w3 on base 0755624 (consolidating the old repository's
`packages/adversarial` (W2-007) + `packages/security` (W2-005) trees)

This document is the contract law of the adversarial/immune plane. The
package is the implementation; where code and this document disagree,
that is a defect (either fix the code or file an ADR — never silently
diverge).

## 1. Position in the architecture

This package owns the security plane's IMMUNE SYSTEM plus the
onchain/provider threat intelligence that feeds it:

- the component-identity model and the threat-signature registry
  (matchable indicators scoped to vulnerable component identities and
  version ranges);
- the network-wide security-advisory registry with the GLOBAL
  restriction view (an advisory restricts affected components
  everywhere — no scope parameter exists);
- the monotonic security-epoch authority (an epoch advance VOIDS every
  epoch-scoped authorization issued under it);
- the quarantine ledger (release ONLY through evidence-backed VERIFIED
  remediation plus advisory closure — never time-based);
- the cached-state-bypass rejection (a cached capability view is an
  observation of the past and can never bypass an active quarantine);
- the composed immune gate (advisory → quarantine/restrict/retire,
  optional epoch advance, the sensitive-action check);
- the capability-case ledger and the immutable security-learning feed;
- the expert human-fallback bridge (versioned resolutions consumable
  ONLY as branded evidence artifacts — never hidden authority);
- the provider threat intelligence (`./provider-intel`): the eleven
  provider threat families (the old W2-007 fault taxonomy, 1:1),
  deterministic detectors over provider observation bundles,
  evidence-chain-mandatory signals with integer-bps calibrated
  confidence, the recovery-path contracts, and the recommendation-only
  adversarial provider agent;
- the D-1 integration bridges: the immune-state projection onto the
  onchain-security kernel's composed `OnchainSecurityState`, the
  advisory bridge (kernel-shaped `ThreatAdvisoryProposal` → the REAL
  registry → enforcement; provider assessments → advisory publications
  + capability cases; the kernel's advisory-only flag channel), and
  the harden-only BLOCK escalation records.

It does NOT own: the deterministic onchain gate dimensions or the
threat policy (the merged @payswap/onchain-security, R2-W2 — composed
through pins, never imported), the trust plane's mandate evaluation or
its SecurityBlockRegistry (P1-W3 — pinned record shapes; the only
block exit is the trust plane's explicit higher-authority revocation),
per-principal credential epochs (the trust lane's EpochLedger), money
semantics beyond the pinned AmountSpec (the financial lane, INV-1/2),
or the participation/financial-plane fault laws the old corpus also
exercised (their 3.0 homes are separate work orders; see the evidence
record's out-of-lane accounting).

### Layer law (r4-w3)

MODULE-OWNERSHIP.yaml layer `security` — `may_depend_on: [trust,
capability, contracts]`; `cannot_downgrade_block: true`. This package
is a **ZERO-SIBLING leaf under the R2-W2 pattern**: no `@payswap/*`
module specifier anywhere (src or test), no tsconfig `paths` entries,
zero runtime dependencies, devDependencies exactly typescript +
vitest. Every cross-lane contract shape is pinned STRUCTURALLY in
`src/pins/`: the protocol lane's ValidationError + content digest; the
trust lane's AmountSpec / Principal / SecurityEpoch /
SecurityBlockRecord / BlockRevocationRecord; the onchain-domain
chain/asset vocabulary; and the onchain-security D-1 seam (the kernel
gate wire — GateDecision, OnchainSecurityState, AgentSecurityFlag,
GatedEvaluation, guard vocabulary — plus the threat-intel wire:
verdicts, the 13 families, severities, methods, signals, assessments,
advisory proposals, evidence refs, immune component kinds, the policy
view). Each pin is a structural mirror; drift fails typecheck at the
TL's integration station (integration is TL accept-time).
Machine-checked by test/boundary.test.ts.

## 2. The INV-21 law — encoded (block authority)

Canonical INV-21: "Security/adversarial intelligence cannot downgrade
BLOCK." This package encodes it at three levels
(src/block-authority.ts; tests test/block-authority.test.ts +
test/escalation.test.ts):

1. **TYPE** — `NoBlockDowngrade<From, To>` resolves to `To` when the
   projection does not leave BLOCK, and to a descriptive error union
   otherwise; `EscalationOnly<From, To>` resolves to `To` when the
   projection never decreases restriction (a decision table over the
   four-value verdict vocabulary).
2. **RUNTIME** — `joinVerdicts` (the four-value lattice join over the
   pinned VERDICT_RANK) and `composeAdvisoryWithKernelDecision` (the
   escalate-only composition of advisory intelligence with a kernel
   gate decision, supplied as pinned pure data) are the ONLY
   composition primitives: a kernel BLOCK is TERMINAL (the advisory
   layer only corroborates); an advisory BLOCK ESCALATES over a kernel
   ALLOW (adversarial intelligence detects threats the deterministic
   gate dimensions do not model, and its BLOCK-grade detections bind);
   a kernel UNKNOWN is never silently allowed (the
   REQUIRE_CONFIRMATION floor, INV-4 discipline); over a kernel ALLOW
   the advisory verdict can only harden.
3. **REJECTION** — `attemptAdvisoryDowngrade` and `attemptBlockBypass`
   ALWAYS throw (tested first-class contracts);
   `assertEscalationOnly` is the fail-closed guard for
   re-evaluation flows.

The security-block surface extends the same law: adversarial
intelligence PROPOSES block registrations (`proposeBlockEscalation` —
BLOCK-grade intelligence only, evidence-mandatory) shaped exactly like
the trust plane's pinned record, and records them in an append-only
escalation ledger. There is deliberately NO API to downgrade, weaken,
expire, re-date or revoke a block: a block SURVIVES epoch advancement;
the ONLY exit is the trust plane's explicit higher-authority
revocation (outside this package).

## 3. The D-1 wiring contract (the onchain-security seam)

Composed through `src/pins/` (never an import), proven by
test/onchain-bridge.test.ts:

- **advisory outcomes map to quarantine / restrict / retire** — the
  advisory action vocabulary is ordered restrict < quarantine < retire
  (`ADVISORY_ACTION_RANK`); `enforceThreatAdvisoryProposal` consumes
  the kernel's `ThreatAdvisoryProposal` wire (pinned), publishes it
  into the REAL advisory registry and enforces it through the immune
  gate (quarantine records for quarantine-grade actions; restriction
  and retirement computed live from the active set);
  `advisoryInputsFromProviderAssessment` derives the same publications
  from provider assessments (advisory-grade families only, action
  derived per severity with retirement gated behind the explicit
  `retireCompromisedContracts` policy opt-in — irreversible steps are
  never a heuristic default);
- **an epoch advance voids authorizations granted under it** — the
  epoch authority's advance invalidates every epoch-scoped
  authorization issued at a lower epoch (`checkSensitiveActionAuthorization`
  throws `StaleAuthorizationEpochError`); the bridge's optional
  `advanceEpoch` wires advisory enforcement to the global hammer;
- **release from any restricted state requires VERIFIED remediation
  (evidence-backed, not time-based)** — quarantine release requires
  non-empty complete evidence refs AND closure of every driving
  advisory, where closure itself requires verified remediation; there
  is no time-based release, no expiry, no amnesty;
- **the immune machinery projects onto the kernel's composed state** —
  `projectOnchainSecurityState` is a pure deterministic projection
  (network epoch, active quarantine keys, restricted keys, active
  advisory refs) onto the pinned `OnchainSecurityState` the kernel's
  security_state guard consumes.

## 4. The provider threat intelligence (`./provider-intel`)

The eleven families keep the old W2-007 taxonomy 1:1 (ids snake_cased,
semantics preserved): duplicated_commands, lost_webhooks,
ambiguous_provider, account_takeover, malicious_agent,
package_compromise, incentive_sybil_collusion_wash, leaderboard_gaming,
provider_outage, clock_skew, partial_payment. Each family DECLARES the
canonical invariants it endangers (re-cited from the old W2-006/W2-007
ids to the canonical 3.0 set) and carries its RECOVERY-PATH CONTRACT
(ordered steps as pure data — the old harness's exact-recovery-path
law in declarative form). Detectors are pure functions over the
provider observation bundle with explicit typed thresholds (no hidden
constants; the default set is exported data); every detection carries
a MANDATORY evidence chain (observation refs + digests + exact deltas)
and an integer-bps calibrated confidence (the accepted method table,
mirrored — no parallel calibration). The sweep runs every family
exactly once and fails closed on coverage gaps. The adversarial
provider agent is RECOMMENDATION-ONLY: its output composes exclusively
through the escalate-only seam (§2) and the D-1 bridge (§3) — evidence,
never authority.

## 5. Determinism + secret-free laws

Deterministic only: pure functions; no ambient clock (callers pass
every instant), no randomness, no timers, no network in src; exact
integer arithmetic (shortfalls are exact BigInt bps; no floating
point). Machine-checked by test/boundary.test.ts. Secret-free: no
credential-shaped literal anywhere; test fixtures are
runtime-fragment-assembled (INV-19 discipline); the raw-key-shaped
(64-hex) literal scan covers src AND test.

## 6. Boundary + file laws

Zero sibling imports (src AND test: every module specifier relative;
vitest and declared node: builtins are the only test-infra
allowances), no tsconfig paths, devDependencies exactly typescript +
vitest, zero runtime dependencies, no `node:` imports in src, every
file ≤ 400 lines, no TS enum, no TS namespace (plain-Node
type-stripping compatibility — the census imports both barrels with
plain `node --experimental-strip-types`). Machine-checked by
test/boundary.test.ts.
