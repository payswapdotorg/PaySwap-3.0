# ADR-0004: Type-only wire-authority pins across layer boundaries

- Status: PROPOSED
- Date: 2026-10-19
- Author: GOV-W1 (governance reconciliation lane)
- Deciders: resident TL (acceptance required — this is a stub, not a decision)

## Context

The fresh ownership derivation at base `0755624` (GOV-W1; report:
`docs/architecture-governance/reports/module-ownership-report.json`) maps every
real package to its lane-spec-declared layer. Two lanes then show **R3
not-in-may-depend-on** violations on edges that are **type-only** (erased at
runtime, resolved at typecheck time via tsconfig paths — the accepted P1/P2
integration pattern):

| Edge | Layers | Why it exists |
| --- | --- | --- |
| `packages/agents` -> `packages/trust` | intelligence -> trust | `AmountSpec`, `MandateRef`, `AuthorizationDecision`/`AuthorizationRequest` and the authority wire types are pinned type-only from the accepted wire authority (`@payswap/trust`); machine-checked by `packages/agents/test/boundary.test.ts` (every src import relative except the one type-only trust link). |
| `packages/execution-graph` -> `packages/economic` | economic -> economic | type-only `CandidateSkeleton`/`VersionedEconomicInput` lineage pins (cross-package within the same declared layer). |
| `packages/execution-graph` -> `packages/protocol` | economic -> financial | type-only `PrincipalRef`, `TimestampMs`, `Money`, `AuthorizationRef`, `EvidenceNodeKind` wire shapes. |
| `packages/execution-graph` -> `packages/capability` | economic -> capability | type-only `CapabilityObservation`, `ProviderStateEnvelope` shapes. |

Both lane specs (`spec/agents/AGENT-MODEL.md`, `spec/execution-graph/
EXECUTION-GRAPH.md` "Layer law" sections) declare these pins as the accepted
pattern. The current `MODULE-OWNERSHIP.yaml` layer allow-lists
(`intelligence: [economic, capability, contracts]`, `economic: [contracts]`)
predate these packages and do not model type-only dependencies at all — the
validator counts an edge regardless of `typeOnly`.

## Decision (proposed — NOT accepted)

Amend the layer rules to distinguish type-only edges from runtime composition.
Two candidate mechanisms (TL chooses; they are alternatives, not both):

1. Add a per-layer `may_type_pin_on` allow-list (new policy vocabulary;
   `tools/architecture-governance` gains a `typeOnly`-aware R3 evaluation),
   seeding it with the four edges above; OR
2. Add the target layers to the existing `may_depend_on` lists with an
   annotation that the allowance is type-only, and enforce the type-only-ness
   in the engine (occurrences already carry `typeOnly`).

Until an option is accepted, the four R3 violations REMAIN visible in the
report (never suppressed). No runtime composition is claimed or permitted by
either option.

## Consequences

- The honest baseline records 4 R3 violations of this class (plus the separate
  web->provider-runtime R3, see ADR-0005) instead of hiding them.
- The P1/P2 "type-only wire pin" pattern stays machine-checkable per-lane
  (each lane's boundary test) but is not yet centrally adjudicated.
- Accepting this ADR requires updating `spec/architecture/MODULE-OWNERSHIP.yaml`
  + the validator + this report in one governance commit (INV-29 law).

## Alternatives considered

- **Reclassify the packages** (e.g. execution-graph -> intelligence): rejected —
  both lane specs explicitly declare their layers; reclassification would
  silence the violation by moving the goalposts (dishonest).
- **Delete the pins / duplicate the types locally**: rejected — breaks the
  single-wire-authority law (AmountSpec byte-identical pinning is load-bearing)
  and reduces verification quality.
