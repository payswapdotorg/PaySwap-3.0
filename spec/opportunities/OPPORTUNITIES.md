# @payswap/opportunities — Lane Specification (P6-W2, lane r4-w2)

Status: DELIVERED (4-commit protocol complete; see docs/opportunities-evidence/BASELINE-VERIFICATION-RECORD.md)
Package: `packages/opportunities` — `@payswap/opportunities` v0.1.0
Work Order: P6-W2 (opportunities — evidence-backed FinancialOpportunity discovery across rails; no direct authorization)
Rebuild lane: r4-w2 (base `0755624` = origin/main at dispatch, P7-E2E accepted)
Porting source (evidence, not authority): payswap.org @ `8a735bf1639198c43115087a2992555166a9acf9` — packages/onchain-opportunities (P4-W3-002; src 8 files / 2,152 lines; tests 10 files / 122 titled sites)

## 1. What this package is

Evidence-backed FinancialOpportunity discovery across rails as ONE
deterministic, zero-dependency package: the versioned SupportingObservation
lineage (the primary observation grounds identity; the chain is carried
verbatim — no constructor path without evidence), the rail-aware model
(ONCHAIN chain, FIAT scheme, FX corridor under the pinned canonical
`${namespace}:${network}` law), the mandated typed first-class fields
(capital, expected-return ESTIMATE with explicit uncertainty bounds,
liquidity, fees, exit path, lock-up, both risks, maximum-loss bound WHERE
KNOWABLE, freshness, policy eligibility), the structural
no-guaranteed-returns vocabulary law, the deterministic discovery policy
that surfaces adversarial observations (stale evidence, manipulated APYs,
fake incentives, vanished liquidity, honeypot exits, unapproved
strategies) as ineligible/UNKNOWN — never as attractive, the deterministic
read-time invalidation, the opportunity -> proposal -> decision seam
typed against the pinned agents proposal wire, the runtime secret-free
scrubber, and the Lab family registration as pure-data searchable
capabilities (test-layer composition; searchable, never executable).

## 2. The load-bearing laws

1. **Evidence-backed ONLY (hard law 1).** Every opportunity carries a
   non-empty chain of VERSIONED SupportingObservations (positive
   observationVersion — the pinned capability-lane monotonic discipline,
   own bounded freshness, own venue/protocol/adapter/observer provenance,
   non-empty evidence refs). The model validator enforces lineage
   coherence (unique versioned observations, the primary IS element zero,
   opportunity-level freshness IS the primary's window); discovery-input
   validation fails closed BEFORE anything is constructed.
2. **No direct authorization (hard law 2).** Opportunities are inputs to
   decisions, never financial authority: the structural
   DISCOVERY_NEVER_AUTHORIZATION tier (phantom brand, derived-only
   construction, runtime re-derivation, the always-throwing execution
   gate) plus the opportunity -> proposal -> decision seam — advisory
   strategy drafts on the pinned AgentProposal wire, gated by the pinned
   18 protocol-command marker fields before return; stale opportunities
   are never proposed as if current; the decision authority is explicitly
   downstream.
3. **Agent-cannot-execute (hard law 3).** Agents may discover/surface but
   cannot execute: `agentCanExecuteOpportunities()` is literal false; an
   opportunity is structurally INCOMPATIBLE with the pinned INV-13
   instance scope (no instanceId, no authorization, no permission state,
   no exported conversion — test-enforced).
4. **Determinism (hard law 4).** Pure functions only: caller-supplied
   instants, exact rationals via BigInt (no floating point anywhere), no
   ambient clock, no randomness, no network in src; identical inputs
   yield byte-identical outputs (JSON round-trip tested).
5. **Secret-free (hard law 5).** No credential-shaped constants anywhere;
   the runtime scrubber (deep forbidden-key + credential-shaped-value
   scan) proves agent-facing artifacts carry no key material; the
   detection fixtures are assembled AT RUNTIME from fragments so no full
   secret shape appears in source.
6. **Zero sibling imports — the leaf-in-flight law.** Every cross-lane
   contract shape is a LOCAL STRUCTURAL PIN (`src/pins/*.ts`, each naming
   its authority): onchain-domain (rail-key/asset-ref/symbol/minor-unit
   laws), capability (two-axis availability, versioned observations,
   INV-13), economic (AmountSpec, versioned-input kinds, intent
   archetypes), route-compiler (ExactRational + QuoteFreshness + the
   inclusive staleness law), lab (the search wire for the family
   registration surface — PINNED, never imported: INV-L01), agents (the
   proposal wire + the marker fields). The TL wires the authoritative
   shapes at integration.

## 3. Module families

- **Pins** — `src/pins/{index,onchain-domain,capability,economic,
  route-compiler,lab,agents}.ts` (commit 1/4: every external seam).
- **Exact value laws** — `rational.ts` + `freshness.ts` (the
  route-compiler laws re-implemented locally, behaviour-identical),
  `errors.ts` (the 10-class typed taxonomy).
- **Model family** — `model.ts` (the record + vocabularies),
  `knowable.ts`, `model-fields.ts`, `model-validation-sections.ts`,
  `model-validation.ts` (the file-law split of the old monolith),
  `vocabulary.ts` (the guarantee-language law).
- **Discovery family** — `estimation.ts` (honest bounds),
  `discovery-input.ts` + `discovery.ts` (the ONE constructor),
  `eligibility.ts` (the deterministic policy), `observation.ts`
  (read-time invalidation).
- **Authority seams** — `discovery-tier.ts` (the structural tier),
  `proposal-seam.ts` (opportunity -> proposal -> decision),
  `secret-free.ts` (the runtime scrubber).
- **Lab registration** — `lab-registration.ts` (pure-data family
  descriptors compiling into the pinned CapabilityDefinition shape).

## 4. Battery (hermetic)

```
cd packages/opportunities && rm -rf node_modules package-lock.json
npm install --no-workspaces    # exit 0
npx tsc --noEmit               # 0 diagnostics
npx vitest run                 # 12 files / 181 tests, ALL PASS, ~3s, fully offline
node -e "import('./src/index.ts')..."   # 113 exports (76 functions + 37 consts)
```

## 5. Known limitations (honest, recorded — never hidden)

1. The pins are LOCAL structural pins (SUBSET-typed) of the
   onchain-domain/capability/economic/route-compiler/lab/agents lane
   shapes; the TL wires the authoritative shapes at integration (the
   leaf-in-flight law — same as the accepted P6-W1 lab and P4-W1
   onchain-domain siblings).
2. The Lab composition proofs drive the PINNED Lab wire shapes through a
   test-layer harness that implements the Lab's own INV-13 selection law
   over those pins (the old package drove the REAL @payswap/lab from its
   test layer; the stricter zero-sibling law forbids even that import).
   The real Lab composition is TL-wired at integration; the pinned laws
   are asserted byte-identical by test/pins.test.ts.
3. The old package's REAL-kernel execution proofs (the W1-002
   prepare/simulate/settlement validators) are re-based onto the pinned
   authorization surfaces (the INV-13 instance scope, the
   protocol-command marker scan) — the same laws, proven against pins;
   the real kernel contrast tests live with the rails lanes' own suites.
4. The rail vocabulary is deliberately minimal (ONCHAIN | FIAT | FX under
   the canonical rail-key law); rail-specific semantics (finality,
   cutoffs, corridors) belong to the rails/capability lanes and stay
   pinned-opaque here.

## 6. Ownership + write surface

This package owns `packages/opportunities/**`,
`spec/opportunities/**`, `docs/opportunities-evidence/**` — nothing
else. Zero runtime dependencies; devDependencies exactly `typescript` +
`vitest`; every file ≤ 400 lines (src max 350 `model.ts`; test max 377 `fixtures.ts`);
fully offline deterministic tests only; no `node:` imports in src.

## 7. Delivery note (lane r4-w2)

Delivered by the single-session worker lane on branch `work/r4-w2`
(base `0755624`): commits 1/4 `acffae1` (pins), 2/4 `3d6d71a`
(implementation), 3/4 `a247a3b` (the ported corpus), 4/4 (this spec +
the evidence record). The per-commit LAW-2 bundles and the app-root
mirror were refreshed after every commit.
