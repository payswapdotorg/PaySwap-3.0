# @payswap/lab — Lane Specification (P6-W1, lane R4-W1)

Status: DELIVERED (4-commit protocol complete; see docs/lab-evidence/BASELINE-VERIFICATION-RECORD.md)
Package: `packages/lab` — `@payswap/lab` v0.1.0
Work Order: P6-W1 (Reality Engineering Lab: replay, counterfactuals, fault injection, Organization/Strategy search, robustness, shadow/canary promotion)
Rebuild lane: R4-W1 (recovery; base `25a8fbb247665aefb2bc76786da0006060ab4352`)
Porting source (evidence, not authority): payswap.org @ `8a735bf1639198c43115087a2992555166a9acf9` — packages/lab (109 titled test sites / 10 src files, 4,433 lines)

## 1. What this package is

The Reality Engineering Lab as ONE deterministic, zero-dependency
package: the namespaced seed-deterministic simulation engine
(bigint-exact money, injected instants), scenario composition over
the full incident taxonomy, Domain Packs and the searchable
building-block index (certified smart contracts, DECLARED_CAPABILITY
blocks, connector capabilities, participation mechanisms), the
evaluator (hard constraints BEFORE optimization), replay and
counterfactual over immutable recorded facts, executable
Organization/Strategy search grounded in live instances +
observations, replaceable search plug-ins, the authority-free
candidate registry, the versioned reversible shadow/canary promotion
ledger, and the Director control surface. It is the P6 lab lane the
program's intelligence layer references for advisory evidence
(WISE-OPERATING-MODEL, ECONOMIC-MODEL).

## 2. The load-bearing laws

1. **Simulation is never production financial authority (INV-11).**
   The simulation namespace is isolated and branded
   (`INV-L01`): no export path converts a simulation result into any
   production-evidence type; the engine family imports nothing
   external.
2. **Promotion is evidence-mandatory and reversible (`INV-L02`/`L03`).**
   Promotion to SHADOW or beyond requires the complete evidence
   bundle (replay + counterfactual + robustness plus the per-stage
   shadow/canary reports) — `PromotionEvidenceError`, no override
   path. The promotion ledger is append-only and versioned; rollback
   appends, history is never rewritten.
3. **Executable search is instance + observation grounded (INV-13).**
   Search runs over `ConnectedCapabilityInstance` +
   `CapabilityObservation` — never catalogue definitions alone; the
   two-axis UNKNOWN resolution (REACHABLE→state;
   UNREACHABLE/UNKNOWN→UNKNOWN) is preserved verbatim from the
   capability vocabulary.
4. **No composition prior (INV-15).** Provider-native incumbents
   compete in search results without a mode-based ranking advantage.
5. **Lab composition is a proposal, not authority (INV-9).** The
   composed organization DRAFT carries no budgets, no delegation
   edges, no mandate — the registry is deliberately authority-free.
6. **Zero sibling imports — the leaf-in-flight law.** Every
   cross-lane contract shape is a LOCAL STRUCTURAL PIN
   (`src/pins/*.ts`, each naming its authority): capability
   (CapabilityClass vocabulary, DECLARED_CAPABILITY block kind,
   resolver matrix), observation (CapabilityDefinition /
   ConnectedCapabilityInstance / CapabilityObservation /
   ProviderCatalogueEntry / ExecutionMode), certification
   (CertificationRecord, `searchableByLabAfterCertification`),
   agents (OrganizationDraft / AgentBody / AgentInstance /
   AgentPrincipalRef / VersionedRef), execution-graph (the accepted
   P3-W2 advisory seam). The TL wires the authoritative shapes at
   integration.

## 3. Module families

- **Kernel** — `canonical.ts` (stableStringify digest + deepFreeze),
  `random.ts` (seed-deterministic PRNG; no ambient randomness),
  `errors.ts` (10-class typed taxonomy).
- **Simulation family** — `simulation-world.ts`,
  `simulation-plan.ts`, `simulation-metrics.ts`, `simulation.ts`
  (namespaced engine, bigint-exact money, injected instants,
  fault-injection hooks), `scenarios.ts` (incident-taxonomy
  composition), `baseline-candidates.ts`, `robustness.ts`.
- **Ground family** — `domain-packs.ts` (building-block index:
  certified contracts, DECLARED_CAPABILITY blocks, connector
  capabilities, participation mechanisms), `evaluator.ts` (hard
  constraints BEFORE optimization), `replay.ts` +
  `counterfactual.ts` (immutable recorded facts).
- **Search family** — `search.ts` (instance + observation grounded),
  `search-plugins.ts` (replaceable plug-ins).
- **Proposal family** — `candidates.ts`, `candidate-organization.ts`
  (authority-free DRAFTs), `promotion.ts` +
  `promotion-comparison.ts` (versioned reversible ledger),
  `director.ts` (the control surface).
- **Pins** — `src/pins/{index,capability,observation,certification,
  agents,execution-graph}.ts`.

## 4. Battery (hermetic)

```
cd packages/lab && rm -rf node_modules package-lock.json
npm install --no-workspaces    # exit 0
npx tsc --noEmit               # 0 diagnostics
npx vitest run                 # 16 files / 147 tests, ALL PASS, ~8s, fully offline
```

## 5. Known limitations (honest, recorded — never hidden)

1. The pins are LOCAL structural pins (SUBSET-typed) of the
   capability/connectors/agents lane shapes; the TL wires the
   authoritative shapes at integration (the leaf-in-flight law —
   same as the accepted R3-W1/R3-W2/R3-W3 siblings).
2. The execution-graph pin re-declares the accepted P3-W2 advisory
   seam; the candidate registry + promotion ledger deliberately
   live HERE (P6 territory), re-authorized by the P3-W2 acceptance
   record which ported the director/search/evaluator surface as
   advisory only.
3. The work-order renames were applied at the wire:
   `LabSearchQuery.executionMode` → `execution`; the old
   SERVICE_ACCESS block kind → `DECLARED_CAPABILITY` (vocabulary
   '1.0.0', 13 capability classes).

## 6. Ownership + write surface

This package owns `packages/lab/**`, `spec/lab/**`,
`docs/lab-evidence/**` — nothing else. Zero runtime dependencies;
devDependencies exactly `typescript` + `vitest`; every file ≤ 400
lines; fully offline deterministic tests only.

## 7. Delivery note (lane R4-W1)

The worker lane's chat was platform-recycled after commit 3/4; the
delivery was harvested from the per-commit git bundle + MANIFEST
salvage (the LAW-2 incremental bundles). Commits 1–3 are the
worker's verbatim; commit 4/4 (this spec + the evidence record) was
authored by the TL from the station-side hermetic battery receipts
and the worker's salvaged worklog plan. Full receipt:
docs/lab-evidence/BASELINE-VERIFICATION-RECORD.md §7.
