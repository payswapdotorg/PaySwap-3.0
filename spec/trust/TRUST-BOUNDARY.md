# PaySwap 3.0 Trust Boundary — Contract Document

Status: FROZEN FOR IMPLEMENTATION (P1-W3)
Package: `@payswap/trust` (`packages/trust/`)
Authority owner: Trust and Authorization Authority (spec/architecture/AUTHORITY-MODEL.md, PaySwap authority 2)
Work order: P1-W3 (spec/dependency/work-orders.md)
Evidence: docs/trust-evidence/BASELINE-VERIFICATION-RECORD.md

This document is the contract law of the trust plane. The package is the
implementation; where code and this document disagree, that is a defect
(either fix the code or file an ADR — never silently diverge).

## 1. Position in the architecture

The trust plane owns DELEGATED POWER and APPROVAL ARTIFACTS:

- who may act (principals — the identity/authority MODEL, not
  proof-of-identity),
- what power they hold (mandates and their policy constraints),
- how power transfers (strictly attenuated delegation),
- proof that a human approved something (immutable approval artifacts),
- when all of it dies (policy and security-epoch linkage).

It does NOT own: financial truth (INV-1, the financial protocol lane), money
semantics (INV-2 exact/lossless money and the AmountSpec->Money bridge),
capability/connection state (P2), platform authentication or cryptographic
signature verification (platform/capability lanes), or adversarial
intelligence beyond the BLOCK registry law below (P6-W3).

### Layer law

`MODULE-OWNERSHIP.yaml` layer `trust` — `may_depend_on: [contracts]`.
P1-W3 pins trust as a LEAF: **zero runtime dependencies, zero PaySwap package
imports**. The old repository's dependency direction (trust importing
protocol Money) is REVERSED in PaySwap 3.0: financial may depend on trust,
never the reverse. This is machine-checked by the boundary test
(test/boundary.test.ts).

## 2. AmountSpec — the pinned wire format and the single-owner law

The AmountSpec interface is PINNED, byte-identical across all three Phase-1
lanes (P1-W1 economic, P1-W2 financial, P1-W3 trust). Do not deviate:

```ts
interface AmountSpec {
  readonly currency: string;
  readonly minorUnits: string;
}
```

- `currency` matches `/^[A-Z]{3}$/` — fiat ISO-style and onchain symbols
  share the shape. Trust validates SHAPE only; currency knowledge
  (registered codes, minor-unit scales) belongs to the financial lane.
- `minorUnits` is a canonical non-negative decimal integer string: no sign,
  no decimal point, no exponent, no leading zeros except `"0"`.

**Single-owner law (TB-7 / INV-01):** the trust plane owns the wire TYPE and
its STRUCTURAL validation (`validateAmountSpec`, `InvalidAmountError`). It
does NOT implement money arithmetic: no `Money` type, no add/scale/compare
money API is exported from `@payswap/trust`, and no AmountSpec->Money bridge
lives here. Exact-integer money semantics are owned exclusively by the
financial protocol lane (P1-W2). See §8 (deviations) for the internal
canonical-integer ordering used by law enforcement.

## 3. Principals

- `Principal = UserPrincipal | AgentPrincipal | ServicePrincipal` — the
  actor reference presented to authorization evaluation. Authority travels
  ONLY through mandates referenced by an AgentPrincipal's authority envelope
  — never inline on a principal (TB-1).
- `AgentPrincipal` separates the stable capability identity from the runtime
  instance: `bodyRef` names the durable Agent Body (what authority
  conceptually attaches to), `agentKeyFingerprint` names the runtime
  credential/instance key, `packageVersionRef` names the evaluated package.
  `Identity` + `identityOf()` project any principal onto its stable
  capability identity.
- `securityEpoch` on user/agent principals is the per-principal CREDENTIAL
  epoch at issuance (see §6).
- Lifecycle states (`active | suspended | retired`): only `active` may
  exercise delegated authority (`canAuthorizeState`); `retired` is terminal;
  transitions are a lawful, deterministic state table. The lifecycle MODEL is
  owned here; binding a principal's live state at evaluation time is a
  consuming-runtime concern (ledger-side, never forged inline).
- Authentication / credential VERIFICATION is deliberately absent: the trust
  plane owns the identity/authority MODEL, not proof-of-identity. Signature
  fields in artifacts are opaque evidence strings, never verified here.

## 4. Mandates and the policy constraint family

`Mandate` is the complete, versioned statement of delegated power: grantor,
grantee, actions (`ActionPattern`), resources (`ResourcePattern`/`ResourceRef`),
rails/currencies/countries/beneficiaries scopes, limits, cost caps, expiry,
escalation policy, proof requirements, epoch stamp and parent lineage.

Optional scope dimensions are "unrestricted" when absent; restricting them is
always a narrowing. The constraint family — `VelocityLimit`, `MandateLimits`
(per-transaction + velocity), `CostCaps` (total cost + FX spread bps),
`EscalationPolicy`, `ProofRequirement` — is the mandate-carried policy
surface of the Policy and Governance Authority for this phase: mandates
CARRY the constraints; the financial protocol enforces money semantics
against them downstream.

`PermissionGrant` is an issued mandate instance with append-only grant
lineage (`GrantLineage`), so every consequential effect can carry
authorization lineage (INV-05).

## 5. Attenuation law (INV-12 / TB-3)

Child delegation is STRICTLY attenuated on EVERY dimension. A child mandate
can never exceed the parent's action/resource scope, scope dimensions,
limits (amounts, velocity windows/counts), cost caps, validity window
(expiry), escalation strength or proof requirements. Any widening raises
`AttenuationViolationError` naming the exact violated dimension. Omitted
dimensions are inherited verbatim; inheritance can never widen.

Epoch inheritance: a child mandate inherits the parent's `issuedAtEpoch`
stamp, so an epoch advancement kills an entire delegation chain
deterministically (§6). A child can never outlive its parent in time or in
epoch.

## 6. Policy and security-epoch linkage (TB-5)

One monotonic axis — the network `SecurityEpoch` (`SecurityEpochAuthority`,
genesis 0, strictly +1 per advance, append-only history, advances on
security-relevant events) — governs the validity of all delegated authority:

- **Mandates** carry `issuedAtEpoch` (at issuance; inherited by children).
- **Approval artifacts** carry `securityEpoch` (at issuance).
- An instrument is valid ONLY while the current network epoch EQUALS its
  stamp. Advancement past the stamp invalidates it deterministically
  (`stale`); a stamp ABOVE the current epoch is impossible through lawful
  issuance and fails closed as `invalid_future_stamp` (forged).
- Per-principal CREDENTIAL epochs (`EpochLedger`) are the targeted,
  revocation-driven scalpel: `checkEpoch` fails a principal whose credential
  epoch is behind the ledger. Both axes are checked on sensitive delegated
  actions.
- **Policy-configuration epochs** are effective-dated windows ON the same
  axis: a `PolicyConfigurationEpoch` (constraint-set reference owned by the
  Policy and Governance Authority) is effective only within
  `[effectiveFromEpoch, supersededAtEpoch)`. Supersession is append-only and
  monotonic; the boundary epoch belongs to the successor configuration.
  Recording/superseding a policy configuration does NOT advance the network
  epoch — advancing is `SecurityEpochAuthority.advance`'s exclusive power,
  exercised by the governance runtime (separation of powers).
- `evaluate()` enforces the linkage in-engine when `EpochState.networkEpoch`
  is supplied: dead-stamp mandates deny (`stale_security_epoch` /
  `invalid_epoch_stamp`) and ALLOW evidence cites the epoch
  (`epoch:<value>`).

## 7. Approval artifacts (TB-4) and security blocks (INV-21)

**Approval artifacts.** A signed approval artifact — never a chat message,
never an agent's claim — is the only approval authority. An artifact records
WHAT was approved (scope: actions, resources, amount bound), BY WHICH
principal, UNDER WHICH mandate, AT WHICH epoch, WITH WHICH PROOF LEVEL, and
references opaque external effect ids. Artifacts are EVIDENCE records:
immutable once issued (deep-frozen; mutation throws), deterministically
identified (`approvalArtifactDigest` over the canonical signing payload),
and never executed or verified as effects by this package. `verifyApprovalArtifact`
performs the binding checks (signature presence, epoch validity, expiry,
request-hash, supervised-agent binding, action/resource/amount scope);
cryptographic signature verification belongs to the trusted approval surface
(platform/capability lanes).

**Security blocks (INV-21 / TB-6).** A registered BLOCK verdict is STICKY
ACROSS EPOCH ADVANCEMENT: authority is perishable (dies on advancement),
security blocks are the deliberate asymmetry — they survive any advance, to
any epoch, for any reason. There is NO API that downgrades, expires or
weakens a block. The ONLY exit is an explicit higher-authority revocation
(`revokeAsHigherAuthority`), itself append-only, evidence-carrying,
non-repeatable and non-backdatable. Blocks are never retroactive before
their issuance epoch. P6-W3 (adversarial intelligence) integrates ON TOP of
this law: it may add blocks and propose revocations, never downgrade one.

## 8. Trust-boundary law catalog (TB ids cited by code and tests)

| Law | Statement | Canonical invariant |
|-----|-----------|---------------------|
| TB-1 | Authority travels only through mandates, never inline on principals. | AUTHORITY-MODEL |
| TB-2 | A stale security epoch (credential or network) never authorizes a sensitive delegated action. | SECURITY-MODEL |
| TB-3 | Child delegation is strictly attenuated on every dimension. | INV-12 |
| TB-4 | A signed approval artifact is the only approval authority; immutable once issued. | INV-05 lineage |
| TB-5 | Epoch advancement deterministically invalidates epoch-stamped mandates and approval artifacts; policy configurations live in windows on the same axis. | INV-05 |
| TB-6 | A security BLOCK survives epoch advancement; only explicit higher-authority revocation retires it. | INV-21 |
| TB-7 | AmountSpec single-owner law: trust owns wire type + structural validation; money arithmetic belongs to the financial lane. | INV-01 |
| TB-8 | Mandate limits are enforced exactly on the canonical wire form, fail-closed (cross-currency bounds never bind). | INV-2 |

## 9. Determinism and fail-closed posture

Every evaluation function is a pure function of its inputs: no ambient
clock (instants are passed explicitly), no randomness, no external systems.
Anything that cannot be verified from the presented context is NOT
permitted: unresolvable grant references are UNKNOWN and never vouch;
revocation beats expiry; a dead scoped-execution path gates the mandate;
forged future epoch stamps fail closed; a bound in another currency never
bounds an amount.
