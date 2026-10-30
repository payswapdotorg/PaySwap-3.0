# ADR-0015: P23 — general-purpose opportunity emergence (the repair-discovery wave)

- **Status:** ACCEPTED (TL-gated, 2026-10-29)
- **Scope:** `@payswap/opportunities` (the typed repair-operator catalogue, the platform work items, the bounded model-proposal interface, the vocabulary growth); `@payswap/route-planning` + `@payswap/lab` (the general exclusion→repair derivation, the hypothetical views, the multi-hop hypothesis stage, the real stage-6 measurement, the pins); `@payswap/app` + `@payswap/surface` + the desktop renderer composition roots (the engine-view pin growth, the actionable opportunity cards, the session growth, the product composition and boot); the E2E law (the Electron CDP desktop tier extended with card-content assertions + the web tier)
- **Resolves:** the TL progress review of 2026-10-29 — P21 is closed, but the opportunity-emergence objective is NOT implemented: the conditional derivation recognizes exactly one hardcoded corridor pattern (Flutterwave-wallet funding declined by a Stripe receiving rail), the general-purpose discovery engine, the platform work items, the multi-hop hypotheses and the model-assisted exploration do not exist, and no E2E receipt asserts that the three P21 conditional opportunities are displayed to the user as actionable alternatives
- **Law hook:** INVARIANTS.md INV-04/07/09/11/13/19/24/25/29; AGENTS.md financial boundary (the only valid consequential path) + financial truth (agents, models, Lab, simulation and optimizers cannot declare financial finality); ADR-0004 (type-only wire pins); ADR-0009 D1–D4/D7 (the routine laws; push-at-acceptance); ADR-0010 D1/D7 (the renderer composition root; the web-unbound law); ADR-0014 D7/D9 (the no-route truth decision; the conditional opportunity + platform-prerequisite labeling this wave generalizes)

## Context

P21 closed the cross-provider journey with three evidence-backed conditional
opportunities for exactly one corridor pattern. The 2026-10-29 TL progress review
verdict is precise and source-verified:

1. **The solution space is predefined.** `deriveConditionalOpportunities`
   (packages/route-planning/src/conditional-stage.ts:185–317) recognizes ONLY the
   typed P21 corridor pattern — its own doc comment says "never generalized to a
   foreign corridor" (conditional-stage.ts:20–23). The party-change vocabulary is
   closed at three provider-specific members (conditional.ts:66–70). Nothing
   systematically generates and evaluates possible changes such as adding a
   connector operation, introducing a new funding instrument, converting through a
   supported asset, or discovering a compatible intermediate provider.
2. **The UI evidence is weaker than the domain evidence.** `PinnedConditionalOpportunity`
   — documented as "the P21-B panel's consumption surface"
   (route-planning/src/pins/opportunities.ts:127–133) — has ZERO consumers outside
   route-planning's own tests. The product engine adapter never calls
   `deriveConditionalOpportunities`; its stage 6 runs with `interventions: []` and
   empty recorded facts, so even the counterfactual list is structurally always
   empty in the shipped app (routePlanningEngineAdapter.ts:305–316). The wait-recheck
   composition is never booted (`composeWaitRecheckBinding` has no caller in
   main.tsx). The CDP receipt's nine assertions never cover conditional opportunities
   being displayed; step run1-6 records the NO_VALIDATED_INTENT empty state.
3. **The general data surface already exists.** `groundedFactsOf`
   (conditional-validation.ts:137–155) projects EVERY typed exclusion from both rail
   snapshots in canonical order — but only `FUNDING_METHOD_NOT_SERVED` is ever
   consumed. The corridor projection can surface 26 stable machine codes
   (capability/src/corridor-types.ts:48–75) and the planner consumes one.

The review's requirement table is the wave's acceptance basis: generalize the
exclusion-to-repair mapping; add a typed repair-operator catalogue; generate explicit
platform/integration work items with evidence; generate hypothetical graphs and
re-run the real planner over their verified legs; add a bounded, grounded
model-proposal interface with strict validation; keep financial execution
deterministic; present opportunities to the user with actionable cards and prove the
full journey in Electron and web. The review also fixes the governance boundary:
opportunity emergence registers as a NEW wave — P22 (the Stellar/Paystack
provider-combination redo, the operator's order) is neither redefined nor blocked by
this work.

## Decision

**D1 — the wave registration and the scope split.** This wave registers as **P23 —
general-purpose opportunity emergence**, beside (never instead of) P22. P22's scope
(the provider-combination redo over Stellar/Stripe/Flutterwave/Paystack, gated on
the operator's test-mode credentials and a Stellar adapter that does not exist) is
untouched. The informal note in P21-0 GAP-MATRIX §3 D4 that named "the full CLI-agent
skill/MCP integration" as a "P23 candidate" is reconciled here: that scope moves to
the **P24 candidate list** (recorded in this wave's carry-forward, never silently
dropped); P23 is the repair-discovery architecture the review ordered. The frontier
holds both: P22 (parked, operator-gated) and the P23 lanes (dispatchable now, over
honest fixtures and the existing SANDBOX connections).

**D2 — the typed repair-operator catalogue (the exclusion→repair mapping).**
`@payswap/opportunities` gains NEW `repair-operators.ts`: a FROZEN TABLE of typed
repair operators, each carrying `operatorId`, `kind`
(`PARTY_CHANGE | PLATFORM_WORK | MULTI_HOP`), `applicableExclusionCodes` (a subset
of the 26 `CORRIDOR_EXCLUSION_CODES`, cited verbatim), side conditions, the
party-change member or platform gap it proposes, and the evidence law (grounded in
the verbatim exclusion facts, never invented). The catalogue is TOTAL over the 26
codes: codes that are honestly NOT repairs carry explicit non-operator rows with
reasons — `STALE_OBSERVATION`, `AVAILABILITY_UNKNOWN`, `OBSERVATION_ELIGIBILITY_UNKNOWN`
are recheck triggers; `CUTOFF_PASSED`, `AMOUNT_BELOW_MINIMUM`, `QUOTA_EXHAUSTED`,
`AVAILABILITY_UNAVAILABLE` are wait triggers; `MISSING_REQUIRED_FIELDS` belongs to
the intake ask loop; `AMOUNT_CURRENCY_MISMATCH` belongs to the revise path. The
party-change vocabulary grows by the general members
`ENABLES_COMPATIBLE_RECEIVING_METHOD`, `ADDS_COMPATIBLE_FUNDING_INSTRUMENT`,
`COMPLETES_PROVIDER_PERMISSIONS` beside the three P21 members, which are PRESERVED
(byte-compat). **The most-specific-applicable-operator rule:** on the FLW→Stripe
corridor the P21-specific operators shadow the general ones — the existing three
conditionals are produced byte-identically; a foreign corridor never emits the P21
names. The catalogue's frozen ids and members live in this ADR's appendix — the
cross-lane contract both domain lanes pin against.

**D3 — the general exclusion→repair derivation.** `@payswap/route-planning` gains
NEW `exclusion-repair.ts`: the stage-7 general derivation consuming ALL grounded
exclusion facts through the INJECTED `RepairOperatorCataloguePort` (fail-closed
unbound default; the REAL `@payswap/opportunities` catalogue binds at the
composition root — the leaf-in-flight law, zero sibling imports in src). The output
is the typed repair set: conditional-construction requests (party changes — through
the existing `ConditionalOpportunityConstructionPort`), platform-work derivations
(D4) and multi-hop hypothesis requests (D5), each grounded in the verbatim facts,
deterministic and fail-closed (an exclusion code with no registered operator derives
NOTHING — the honest empty set, never a guess). **The P21 compat gate:**
`deriveConditionalOpportunities` keeps its exported contract; with the catalogue
port unbound it follows the P21 path byte-identically (the existing tests stay green
unmodified); with the catalogue bound the general path runs and — over the FLW→Stripe
corridor — produces the SAME three conditionals (the D2 shadowing rule).

**D4 — the platform work items.** `@payswap/opportunities` gains NEW
`platform-work.ts`: `PlatformWorkItem` records — `{workItemId, gapId, title,
requiredByOperatorIds, evidenceBasis (the verbatim grounded exclusion facts with
lineage), status: OPEN, advisoryOnly: true}` — derived by the D3 derivation through
a construction port. The P21 gap ids (`platform:flutterwave-send-operation`,
`platform:cross-provider-route-shape`) generalize into the id space
`platform:<gap-kind>[:<subject>]` (connector-operation, provider-integration,
permission-model, route-shape). These are the review's "explicit platform/integration
work items with evidence": what PaySwap itself would need to build, each citing the
exclusions that prove the gap, never a backlog fabrication, never conflated with a
party prerequisite (the ADR-0014 D9 labeling law, now first-class).

**D5 — the multi-hop hypotheses (hypothetical graphs; the real planner re-run).**
`@payswap/route-planning` gains NEW `hypothetical-views.ts` + `hypothesis-stage.ts`.
The hypothetical view follows the Lab intervention discipline EXTENDED to corridor
views without crossing INV-L01 (production corridor data never becomes Lab
simulation facts and vice versa): tamper-check the base merged-view digest FIRST;
exactly ONE named augmentation per variant; variant identity
`hypothesis:<baseViewDigest>:<operatorId>`; the augmentation kinds (ADR-frozen):
`ADD_ASSUMED_RAIL`, `ADD_ASSUMED_CONVERSION_ASSET`, `ADD_ASSUMED_CONNECTOR_OPERATION`
— typed `HypotheticalRail`-shape records that are DISTINCT types, never fake real
rails, never carrying fabricated observation ids. The hypothesis stage re-runs the
REAL planner over the REAL sub-views (the sender-side and recipient-side snapshots
through the existing machinery) to establish the segments verifiable TODAY, and
composes the `RouteHypothesis` record: the assumption (verbatim augmentation), the
verifiedSegments (real planner output over real views), the hypotheticalSegments
(labeled), the cited frozen shape skeleton (provenance — NOT a compiled plan), the
blockers (the remaining REAL exclusions), `wouldCompose` (the honest structural
assessment), `neverExecutable: true`, `advisoryOnly: true`. **The frozen nine-shape
vocabulary is UNCHANGED** (the P21-0 C8 law): the cross-provider fiat composition
remains the named platform work item; a hypothesis cites existing skeletons only.
A hypothesis is never a `RoutePlan`, never enters available-now, never feeds
eligibility — structural typing plus the D7 battery.

*(Corrected 2026-10-29, the P23 correctness patch: the shipped `wouldCompose`
computation — `verifiedSegments.length > 0 && hypotheticalSegments.length > 0` —
combined with the desktop re-run port's enumeration over the UNCHANGED real
snapshots let a valid real route and an UNRELATED assumed rail/asset/connector
coexist into a false `PLANNER_VERIFIED` (the badge meant "some real route was
eligible", not "the assumed element participates"). The corrected law: the
re-run returns `assumedElementPlanIds` — the plan ids over the AUGMENTED view
that PROVABLY incorporate the EXACT assumed element — and `wouldCompose` is TRUE
only when that set is non-empty. The proof is the NEW `bridge-proof.ts` typed
deterministic compile: exact-element binding, pair connectivity (the element
spans the corridor's declared currency pair) and bridge-worthiness (every
remaining REAL blocker's code is answered by the element's augmentation kind —
the frozen per-kind answerable sets mirroring the A.3 operator semantics). A
port that cannot prove participation returns the empty set and the hypothesis
stays UNVERIFIED. The plan ids are namespaced `hypothesis-plan:` advisories,
never compiled RoutePlan ids, and the disjointness law (a real-plan id can never
appear in the proof set) fails a lying port closed. Regression + positive
control batteries pin both directions: a real route + an unrelated element
NEVER verifies; a country-blocked corridor whose only blockers the element
answers DOES verify through the full composition.)*

**D6 — the bounded, grounded model-proposal interface.** `@payswap/opportunities`
gains NEW `repair-proposals.ts`: the `ModelProposalPort` (injected, fail-closed
unbound default) and the STRICT validation contract. A model (LLM) may PROPOSE
repair candidates; it can never invent repair kinds, eligibility or authority:
(a) **grounded** — every proposal must cite the exclusion facts it answers (code +
routeId matching the derivation input; ungrounded → typed rejection);
(b) **vocabulary** — the proposed operator/party-change must be a catalogue member
(out-of-vocabulary → typed rejection; models are structurally not responsible for
route eligibility); (c) **bounded** — maxProposals per the difficulty budget (the
existing `modelBudgetOf` law), truncation receipts; (d) **marker-scan** —
`pinnedAssertNotProtocolCommand` at every nesting depth (command/authority shape
fails closed); (e) **dedup** — a proposal matching a deterministic operator folds
into it (provenance records the model's corroboration), never a duplicate card;
(f) **provenance** — `{source: MODEL_PROPOSAL, modelId, proposedAt}` stamped; the
presentation digest excludes it where the P21 precedent demands (the
model-independent computation digest). The composition (D9) binds the port to the
substrate's model-provider transport ONLY when a session model is selected; the
empty deployment (zero configured models — the CDP-proven truth) renders the honest
unbound note. **No live-model claim is made this wave**: the journey evidence proves
the validation contract over the labeled scripted tier; the live-model binding is a
named carry-forward.

**D7 — the deterministic-gate inviolability (the no-bypass battery).** A dedicated
battery proving no conditional, no hypothesis, no platform work item and no model
proposal can: (a) enter the stage-4/5 compile/rank path as a candidate (typed
refusals); (b) alter the hard-gate evaluation; (c) cross the authorization gate;
(d) render as available-now; (e) carry protocol-command marker fields at any depth.
The structural falses are re-asserted (`conditionalsPermitExecution`,
`discoveryPermitsExecution`, `agentCanExecuteOpportunities`, `waitingNeverDispatches`,
`rejectConditionalForExecution`). The architecture check stays 0/0/0.

**D8 — the presentation contract (the actionable cards).** The engine-view pin
grows THREE advisory sections (ADR-frozen order after available-now/exclusions):
`conditionalOpportunities` (the pinned mirror + the verification pairing),
`platformWork`, `hypotheses`. The panel renders ACTIONABLE CARDS: title, the
party-change preconditions in people language, assumptions, platform prerequisites
DISTINCT, expiry, the verified/unverified badge (`PLANNER_VERIFIED` — the D5 re-run
composed a rank-eligible route over the party-changed view — vs `UNVERIFIED` with
the honest remaining reason), the hypothesis's verified vs assumed segments, and
per-party "what would need to change" (sender / merchant / third party /
PaySwap-platform). The section-order law: available-now FIRST, the advisory repairs
after, visually distinct — the ROUTINE-CONTRACT stage-8 "distinct current routes vs
conditional opportunities" finally TRUE at the surface. The wait proposal's criteria
line names the CONCRETE preconditions (not just trigger categories). The P21-0 D7
conflation (the scenarios-digest list standing in for opportunity presentation) is
corrected: the new E2E assertions are card-shaped and content-level.

**D9 — the product composition and boot.** The renderer composition root:
(a) binds the REAL `ConditionalOpportunityConstructionPort` +
`RepairOperatorCataloguePort` + `ModelProposalPort` (the `@payswap/opportunities`
machinery via the established alias triplet); (b) runs the general derivation + the
hypothesis stage within the search budget; (c) makes stage 6 REAL: recorded
production facts derive from the rail snapshots; the derived repair interventions
(the EXISTING Lab kinds — `RAIL_ADDED` for an assumed rail; NO Lab vocabulary
change) run the counterfactual → the ReplayDelta attaches to the hypothesis as
advisory measurement; (d) main.tsx BOOTS `composeWaitRecheckBinding` with the
observations source mapped from the existing `connectionCapabilityChains` member —
**NO new host member** (the census/mirror law untouched; the waitRecheckComposition
named follow-on realized as renderer-side composition); (e) the consent source stays
the honest NOT-GRANTED default until a real consent plane exists (named carry-forward).
Web keeps the honest unbound notes (the ADR-0010 D7 analogue).

**D10 — the E2E law.** The CDP desktop journey grows the opportunity assertions:
the cards' CONTENT (preconditions text, platform-prerequisite note, expiry, the
verified badge, ≥3 meaningfully different repairs displayed — a party change, a
platform work item, a multi-hop hypothesis), the wait-criteria naming the
preconditions, and the persistence recheck (the conditionals survive relaunch; the
re-check recomputes over fresh observations). The web tier asserts the honest
presentation tier. No assertion is satisfied by the scenarios-digest list.

**D11 — the vocabulary/pin governance.** Every vocabulary growth
(`CONDITIONAL_PARTY_CHANGES`, the operator catalogue, the augmentation kinds, the
section ids) is byte-pinned by tests in the SAME commit; route-planning's pins
mirror the new opportunities shapes against THIS ADR's appendix values; the
fidelity is TL-verified at integration (P23-D). The file law (≤400 lines) holds;
splits follow the dispatch-pins precedent.

**D12 — the file-disjoint lane map (max three concurrent).** P23-A (opportunities:
`packages/opportunities/**`); P23-C (route-planning + lab:
`packages/route-planning/**` + the lab-adapter growth); P23-B (app + surface + the
renderer composition roots: `packages/payswap-app/**` + `packages/surface/**` + the
renderer composition files). P23-D (TL): the bridge battery, the E2E, the no-bypass
battery, the integrated batteries, the maps/state closure, PUSH, the bundle archive.
Sequencing: `P23-0 → {A ∥ C}; {A, C} → B; {A, B, C} → D`.

**D13 — the honest boundaries.** No new `ROUTE_SHAPE_ID` (the cross-provider fiat
composition stays the platform work item — the P21-0 C8 law). No fabricated LLM
output; the model-proposal tier is structurally advisory and validation-fail-closed.
The live-provider execution legs stay operator-gated (the P21 closure carry-forward
unchanged; the a51a30c receipts remain the accepted live evidence). P22's scope is
untouched. The six truth facts stay machine-enforced. Web stays honest.

## Appendix — the frozen cross-lane vocabularies (the pin contract)

**A.1 The party-change vocabulary growth** (`CONDITIONAL_PARTY_CHANGES`, canonical
order — the three P21 members preserved):

```
ENABLES_FLUTTERWAVE_RECEIVING_METHOD, ADDS_STRIPE_COMPATIBLE_INSTRUMENT,
INTERMEDIARY_INTRODUCED, ENABLES_COMPATIBLE_RECEIVING_METHOD,
ADDS_COMPATIBLE_FUNDING_INSTRUMENT, COMPLETES_PROVIDER_PERMISSIONS
```

**A.2 The repair-operator kinds:** `PARTY_CHANGE | PLATFORM_WORK | MULTI_HOP`.

**A.3 The operator catalogue (initial frozen set — ids stable, `←` lists the
applicable exclusion codes):**

| operatorId | kind | applies to |
|---|---|---|
| `repair:recipient-enables-flw-receiving-method` (P21) | PARTY_CHANGE | FUNDING_METHOD_NOT_SERVED ∧ the FLW-wallet corridor pattern |
| `repair:sender-adds-stripe-compatible-instrument` (P21) | PARTY_CHANGE | FUNDING_METHOD_NOT_SERVED ∧ a Stripe receiving rail |
| `repair:recipient-enables-served-funding-method` | PARTY_CHANGE | FUNDING_METHOD_NOT_SERVED (general; shadowed on the P21 corridor) |
| `repair:sender-adds-served-funding-instrument` | PARTY_CHANGE | FUNDING_METHOD_NOT_SERVED ∧ any receiving rail (general; shadowed on the P21 corridor) |
| `repair:recipient-enables-served-payout-method` | PARTY_CHANGE | PAYOUT_METHOD_NOT_SERVED |
| `repair:sender-completes-provider-permissions` | PARTY_CHANGE | MISSING_PERMISSIONS, AUTHORIZATION_NOT_ACTIVE |
| `repair:intermediary-introduced` (P21) | MULTI_HOP | the honest no-route state (rails both sides, nothing eligible) |
| `repair:convert-through-supported-asset` | MULTI_HOP | SOURCE_CURRENCY_NOT_SUPPORTED, DESTINATION_CURRENCY_NOT_SUPPORTED |
| `repair:bridge-via-intermediary-rail` | MULTI_HOP | SOURCE/DESTINATION_COUNTRY_NOT_SERVED, the no-route state |
| `repair:split-below-maximum` | MULTI_HOP | AMOUNT_ABOVE_MAXIMUM |
| `platform:connector-operation` | PLATFORM_WORK | NOT_EXECUTABLE_CAPABILITY, IMPLEMENTATION_SCOPE_NOT_SERVED, INSTANCE_INELIGIBLE |
| `platform:provider-integration` | PLATFORM_WORK | SOURCE/DESTINATION_COUNTRY_NOT_SERVED, SOURCE/DESTINATION_CURRENCY_NOT_SUPPORTED, CUSTOMER_TYPE_NOT_SERVED, RECIPIENT_TYPE_NOT_SERVED, INSTANCE_GEOGRAPHY_NOT_SERVED, INSTANCE_CURRENCY_NOT_SUPPORTED |
| `platform:permission-model` | PLATFORM_WORK | MISSING_PERMISSIONS (where the credential model cannot express the grant) |
| `platform:cross-provider-route-shape` (P21) | PLATFORM_WORK | the cross-provider fiat pair gap |
| `platform:flutterwave-send-operation` (P21) | PLATFORM_WORK | the FLW send-operation gap |

**A.4 The non-operator rows (honest non-repairs, total over the 26 codes):**
`STALE_OBSERVATION`, `AVAILABILITY_UNKNOWN`, `OBSERVATION_ELIGIBILITY_UNKNOWN`,
`OBSERVATION_NOT_ELIGIBLE` → recheck triggers (the wait-recheck plane);
`AVAILABILITY_UNAVAILABLE`,
`QUOTA_EXHAUSTED`, `CUTOFF_PASSED`, `AMOUNT_BELOW_MINIMUM` → wait triggers (bounded
in time, never a repair card); `MISSING_REQUIRED_FIELDS` → the intake ask loop;
`AMOUNT_CURRENCY_MISMATCH` → the revise path; `AMOUNT_BELOW_MINIMUM` /
`AMOUNT_ABOVE_MAXIMUM` → the split operator / the wait trigger as listed.

*(Amended at dispatch, 2026-10-29: the initial table left three codes unassigned
— `INSTANCE_GEOGRAPHY_NOT_SERVED` and `INSTANCE_CURRENCY_NOT_SUPPORTED` join the
platform:provider-integration operator row; `OBSERVATION_NOT_ELIGIBLE` joins the
recheck triggers. The A.3 operator-applicable set is now 16 codes, the A.4
non-operator set is 10 — 26 total, the totality law exact. The lanes pin against
these amended values.)*

**A.5 The hypothetical augmentation kinds:** `ADD_ASSUMED_RAIL`,
`ADD_ASSUMED_CONVERSION_ASSET`, `ADD_ASSUMED_CONNECTOR_OPERATION`.

**A.6 The verification vocabulary:** `PLANNER_VERIFIED | UNVERIFIED` (the pairing
type on the derivation output; the opportunities record shape is unchanged —
byte-compat). *(Corrected 2026-10-29: `PLANNER_VERIFIED` means the D5 re-run's
BRIDGE PROOF compiled a typed candidate incorporating the EXACT assumed element
— never merely that a real route was rank-eligible. See the D5 correction note.)*

**A.7 The engine-view section ids growth** (`ROUTE_PLANNING_SECTION_IDS`):
`availableNow, exclusions, truncation, scenarios, conditionalOpportunities,
platformWork, hypotheses, waiting`.

**A.8 The model-proposal provenance:** `source: "MODEL_PROPOSAL"`, `modelId`,
`proposedAt`; the rejection codes `MODEL_PROPOSAL_UNGROUNDED`,
`MODEL_PROPOSAL_OUT_OF_VOCABULARY`, `MODEL_PROPOSAL_COMMAND_SHAPE`,
`MODEL_PROPOSAL_BUDGET_EXCEEDED`.

## Alternatives considered

- **Silently folding opportunity emergence into P22** — rejected: the review's
  governance requirement (distinct scopes, distinct registration, P22 stays the
  provider-combination redo); conflating a domain-discovery wave with a
  provider-adapter wave breaks the disjoint-lane law.
- **A general LLM-driven discovery engine** — rejected: models become responsible
  for route eligibility; the AGENTS.md financial boundary and INV-09 forbid it. The
  D6 interface inverts the responsibility: models propose within a frozen
  vocabulary, validation grounds them in typed facts, deterministic engines decide.
- **Extending the Lab intervention vocabulary with corridor-repair kinds** —
  rejected: Lab facts are simulation facts (INV-L01); production corridor data must
  never become Lab facts. The D5 discipline extends the PATTERN (one change, tamper
  check, variant identity) into route-planning's own advisory tier, and stage 6
  reuses the EXISTING Lab kinds over snapshot-derived facts.
- **Growing the host shell with opportunity members** — rejected for this wave: the
  census/mirror cost is unjustified when `connectionCapabilityChains` already
  carries the observations the recheck needs (D9d). A host member becomes warranted
  only if a discovery-plane authority must live host-side (a P24 question).
- **Manufacturing a cross-provider route shape** — rejected (the P21-0 C8 law
  restated): the shape vocabulary is ADR-frozen; the honest repair is the platform
  work item, and the multi-hop hypothesis cites existing skeletons only.

## Authority impact

None. The Financial Protocol Authority, the authorization gates, the hard gates and
the compiler stay the ONLY execution authorities. The new surfaces are advisory
tiers of the opportunities/route-planning packages (the discovery plane). The
proposal seam (`opportunity -> proposal -> decision`) remains the only route onward
from discovery. No frozen architecture document changes; this ADR extends the
ADR-0014 D9 conditional machinery into a general derivation.

## Package/dependency impact

`@payswap/opportunities` (NEW repair-operators.ts, platform-work.ts,
repair-proposals.ts; conditional.ts vocabulary growth; barrels; batteries).
`@payswap/route-planning` (NEW exclusion-repair.ts, hypothetical-views.ts,
hypothesis-stage.ts; conditional-stage.ts gains the optional catalogue port;
lab-adapter.ts gains the real-facts path; pins growth; batteries).
`@payswap/lab` — NO src change (the existing kinds serve; documented mapping).
`@payswap/app` (routePlanningPins.ts growth, RoutePlanningPanel.tsx cards,
routePlanningSession.ts growth; batteries). `@payswap/surface` (mirror growth if
the section law demands). The desktop renderer composition (adapter + boot). The
desktop host shell — UNTOUCHED (no new members). The capability package — UNTOUCHED
(the 26 codes are consumed, not changed).

## Security impact

The marker-field scan extends to every new DTO (model proposals, hypotheses,
platform items). Secrets never enter model context (the D6 proposals carry typed
facts, never credentials). The secret-free scan covers the new batteries. The
no-bypass battery (D7) is a named acceptance gate.

## Financial-truth impact

None. No new financial authority; no execution path; UNKNOWN stays distinct from
FAILED; a match or a verified hypothesis NEVER auto-dispatches — the only route
onward is fresh planning, preview and NEW explicit authorization (the pinned
literals).

## Migration impact

Additive only. The P21 corridor behavior is byte-identical (the D3 compat gate);
the P21 tests and the bridge assertions stay green unmodified. The engine-view pin
growth is backward-compatible (new sections; the digest grows — pinned on both
sides in the same wave).

## Verification plan

Per-lane failing-first batteries; the P21 byte-compat gate; the no-bypass battery;
the bridge battery (the full journey through the REAL channel with the cards
asserted); the integrated batteries (desktop + payswap-app + surface + the four
domain packages); the architecture check 0/0/0; the CDP desktop E2E with
card-content assertions + persistence recheck; the web tier; PUSH at acceptance;
the bundle archive (ADR-0009 D7).

## Rollback

Revert the wave commits; the additive pin growth and the new modules carry no
data migration; the P21 behavior is never mutated (the compat gate guarantees the
rollback target equals the pre-wave behavior on the P21 corridor).

## Required updates

- dependency graph: spec/dependency/P23-DEPENDENCY-GRAPH.json (this registration)
- development state: spec/development-state/current-state.json (frontier + the
  P23-0 record; the P21-0 §3 D4 naming reconciliation)
- work orders: spec/dependency/work-orders.md (P23-0/A/C/B/D)
- gap matrix: spec/productization/P23-0-GAP-MATRIX-2026-10-29.md
- module ownership: unchanged (no new packages)
- tests/fixtures/evidence: per-lane batteries + the P23-D receipts
  (docs/productization-evidence/)
