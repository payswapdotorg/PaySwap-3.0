# P23 ACCEPTANCE RECORD — 2026-10-29

**Wave:** P23 — general-purpose opportunity emergence (the repair-discovery
wave), registered by the TL progress review of 2026-10-29 (ADR-0015).
**Closed at:** the P23-D TL closure (the bridge battery + the no-bypass
battery + the CDP card-content E2E + the persistence recheck + the web tier
+ the integrated batteries + the maps/state closure).

## The work orders

- **P23-0** (TL, COMPLETE at b0b212c): the gap matrix (seven requirement
  families, every row source-verified) + ADR-0015 (D1–D13 + the frozen
  cross-lane vocabulary appendices A.1–A.8) + the canonical work orders +
  the machine-readable dependency graph + the current-state registration +
  the baseline batteries re-run at registration.
- **P23-A** (worker + TL completion, COMPLETE at 7f3ef72, merged 6d6439b):
  the typed repair-operator catalogue total over the 26 corridor exclusion
  codes (16 operator + 10 non-operator rows, machine-checked), the platform
  work items with the generalized gap-id space, the bounded model-proposal
  interface with the strict A.8 validation (grounded/vocabulary/marker-scan/
  budget/dedup/provenance), the party-change vocabulary growth (the three
  P21 names byte-identical). opportunities 22f/317t + tsc 0.
- **P23-C** (worker + TL completion, COMPLETE at dc3dad7, merged 93cee74):
  the general exclusion→repair derivation through the injected fail-closed
  catalogue port (the P21 byte-identity compat gate proven), the
  hypothetical views under the one-change discipline, the RouteHypothesis
  stage with the REAL planner re-run over the real sub-views (never a
  RoutePlan), the real-facts stage-6 path over the EXISTING Lab kinds.
  route-planning 22f/257t at the lane tip + tsc 0.
- **P23-B** (worker + TL completion, COMPLETE at 38211ac, merged 777533e):
  the actionable cards (the D8 contract), the engine-view pin growth (the
  A.7 optional-section law), the product composition (the REAL lane-A
  catalogue adapter with the fail-closed cross-checks + the emergence
  composition + stage 6's real facts), the wait-recheck BOOT over the
  chains-derived observations (no new host member), the alias triplet
  normalization. desktop 52f/446t + payswap-app 56f/592t + surface 19f/234t.
- **P23-D** (TL, COMPLETE — this closure): the bridge battery + the
  no-bypass battery + the CDP card-content E2E + the persistence recheck +
  the web tier + the integrated batteries + the maps/state closure + PUSH +
  the bundle archive.

## The evidence tiers

1. **THE BRIDGE BATTERY** (`packages/desktop/test/payswap/p23-journey-emergence.test.ts`,
   2 tests incl. the deterministic replay): the no-route journey through
   the REAL channel + the REAL engines with the emergence asserted
   end-to-end — the honest typed no-route; the displayed repair cards
   (3 party changes + 3 platform work items + 2 never-executable
   hypotheses over the fixture world's chains); the A.6 verified/unverified
   distinction with the two honest reason families; the wait naming the
   concrete preconditions; the re-check over the PRODUCT chains-derived
   observations source (LIVE: the boot law exercised — 2 ACTIVE-chain
   records, honestly unmatched) + a scripted fresh discovery that matches
   through the REAL evaluator with the never-dispatch literals; the
   GATES_BLOCKED authorization refusal through the REAL channel; the
   persistence (the emergence-bearing view presents through
   validateRoutePlanningEngineView; the PREVIEW_PRESENTED record carries
   the section counts); the replay byte-identical over the stores + the
   digest + the card sections.
2. **THE NO-BYPASS BATTERY** (`p23-no-bypass.test.ts`, 6 tests): the
   ADR-0015 D7 clauses consolidated at the composition tier — (a) the
   typed refusals (HardGateError on every smuggled artifact family) + the
   compiler-only candidates; (b) the enumeration/gates/ranking
   byte-identical with vs without the emergence; (c) the pure
   authorization gate's GATES_BLOCKED refusal (the channel-tier proof in
   the bridge battery — both tiers); (d) available-now empty + the
   eligible ids unchanged; (e) the deep marker-scan over every artifact
   family + the positive control; the structural falses re-asserted.
3. **THE CDP CARD-CONTENT E2E** (`scripts/p23/desktop-cdp-emergence-journey.mjs`,
   12/12 PASS; the receipt machine-verified by
   `p23-cdp-receipt-verification.test.ts`, 6 tests): the REAL Electron app
   displays the cards (conditional=2 platform=4 hypotheses=2 — ≥3
   meaningfully different kinds over the SERVICE chains' own facts) with
   every D8 content element; the honest typed BLOCKED preview; the Wait
   lands; the re-check surfaces the honest consent-gated refusal; the
   persisted records carry the emergence-bearing presentation; the
   RELAUNCH re-derives the same cards with the EQUAL view digest
   (fnv1a64:4c13a485425f7952 on both launches — the byte-identical
   persistence proof); the refusal recomputes. Secret-free receipt + 10
   screenshots. The zero-credential honesty: the connection state
   pre-seeded through the REAL member path over the SCRIPTED transport
   (disclosed in the receipt; no live provider contacted or claimed).
4. **THE WEB TIER** (journey-verification tier-1, 9/9 across both projects
   + tier-2 8/8): J24 grows the opportunity-emergence honesty law — the
   unbound-engine note verbatim with ZERO cards, ZERO section chrome,
   ZERO card vocabulary; nothing fabricated on the never-composed tier.
5. **THE INTEGRATED BATTERIES** (all green at the tip):
   opportunities 22f/317t · route-planning 23f/260t · lab 19f/176t ·
   route-compiler 29f/353t · payswap-app 56f/592t · surface 19f/234t ·
   desktop 57f/463t+1skipped — the untouched siblings exact-matching
   their P23-B baselines; the three scoped desktop tsc gates 0/0/0;
   architecture:check 0/0/0; oxlint 0 errors.

## The defects the closure caught and fixed at source (each pinned)

1. **The chains-derived observations rail key** (the bridge battery's
   catch): `fiat:${providerName}` with the title-cased display name failed
   PINNED_RAIL_KEY_PATTERN — `discoverOpportunity` rejected every record
   and the source silently returned the empty set while the chains were
   ACTIVE. Fixed: the provider-scoped fiat rail key lowercases the name.
2. **The substrate RPC serializer's BigInt loss** (the CDP journey's
   catch): the Object branch's JSON.stringify throws on a nested BigInt —
   the chains DTO's cost models carry `bps: bigint`, so the
   `connectionCapabilityChains` reply was lost wholesale, the renderer's
   engine cache stayed empty, the rails derived 'unobserved' and the cards
   never composed. Fixed by the marked string round-trip (the serializer's
   own nested-Uint8Array precedent), pinned by
   `p23-rpc-bigint-wire.test.ts`.
3. **The P23-B mirror-check tail** (the tsc gates had never been re-run
   after the lane's acceptance): the duplicate FinancialOpportunity
   import, the CITED_SKELETONS leg-tuple widening and the
   OPERATOR_PRESENTATIONS literal widening — all fixed; the gate's include
   grown to cover the P23 surface (the emergence/repair adapters + the
   P23 test files).
4. **The P23-B unbound-note drift** (the tier-1 re-run's catch): the grown
   ROUTE_PLANNING_ENGINE_UNBOUND_NOTE had drifted from the journey
   suite's verbatim pin — the tier-1 suite had been RED since the P23-B
   acceptance. The pin now matches the grown source byte-for-byte.

## Honest boundaries (carried forward, none a P23 blocker)

1. **The live-model binding** (ADR-0015 D6): the model-proposal port binds
   only when a session model is selected AND the substrate's
   model-provider transport seam is supplied; the journey proves the
   honest UNBOUND_NO_MODEL/UNBOUND_NO_TRANSPORT states and the validation
   contract is pinned over the labeled scripted tier. A live binding is
   the named follow-on.
2. **The consent plane** (D9e): the product re-check surfaces the honest
   consent-gated typed refusal (the CDP journey asserts it); a real
   consent plane is the named carry-forward.
3. **The live-provider legs** stay operator-gated (the a51a30c receipts
   remain the accepted live evidence; the station holds no live keys).
4. **P22 untouched** (the operator's Stellar/Paystack provider-combination
   redo — parked, operator-gated); **the CLI-agent skill/MCP integration**
   stays on the P24 candidate list (the P21-0 §3 D4 reconciliation).
5. **The eleventh station reset** (mid-closure, 2026-10-29): destroyed the
   repo directory and the push credentials AFTER the three P23-D evidence
   commits were PUSHED (19e8310, 179aa06, 81ee7ee — zero committed work
   lost; the uncommitted closure-docs edits were redone from the worklog
   record). The repo is publicly clonable — the recovery clone restored
   main; the final closure-docs push is the operator action (re-supply
   the PAT or push manually: `git push origin main` from
   /home/z/payswap-3.0-repo).

## Verdict

**P23 IS CLOSED.** The review's seven requirement rows are all landed and
verified: the generalized exclusion→repair mapping (the 26-code catalogue),
the typed repair-operator directory, the evidence-backed platform work
items, the multi-hop hypotheses with the REAL planner re-run, the bounded
model-proposal interface with strict validation, the deterministic
financial execution preserved (the no-bypass battery), and the actionable
cards proven end-to-end in Electron (card-CONTENT assertions + the
persistence recheck) and web (the honest-presentation tier). A
documentation-only or test-count-only closure was the named impossibility;
the closure gates (the no-bypass battery + the CDP card-content E2E) are
both green. The frontier returns to P22 (parked, operator-gated) with the
P24 candidates recorded.
