# The operator's counterfactual families → the Lab intervention/incident kinds (P21-C, ADR-0014 D9)

**Status:** documentation (P21-C, lane C) · **Authority:** `src/interventions.ts` (the
7 named intervention kinds), `src/simulation-plan.ts` (the incident taxonomy incl.
`STALE_OBSERVATION`), `@payswap/opportunities src/conditional.ts` (the party-change
precondition vocabulary).

## The honest layer split (read this first)

The Lab plane is **simulation-world and party-free**: an intervention names exactly
ONE changed assumption about rails, pools, demands, incidents, third-party nodes or
credit — it never names a sender, a recipient or a merchant, and it never becomes
production evidence (the REPLAY-namespace law, INV-L01). **Party semantics live in
the conditional layer** (`@payswap/opportunities` `ConditionalOpportunity`): the
typed `requiredPartyChanges` precondition (`{party: "RECIPIENT", change:
"ENABLES_FLUTTERWAVE_RECEIVING_METHOD"}` and its frozen closed vocabulary) says WHO
must change WHAT; the Lab intervention says what the WORLD looks like after the
change. The two compose — the conditional is the party-semantic contract, the
scenario is its party-free counterfactual replay.

## The mapping

| The operator's counterfactual family | The Lab expression | The party-semantic carrier |
|---|---|---|
| "the recipient enables an eligible rail" (e.g. an FLW receiving method) | `RAIL_ADDED` — the rail enters the variant world with its observed parameters + pools | `ConditionalOpportunity` precondition `{party: "RECIPIENT", change: "ENABLES_FLUTTERWAVE_RECEIVING_METHOD"}`; the platform-prerequisite note labels what the platform must still provide (the FLW send operation — the platform gap, distinct from the party prerequisite) |
| "the sender adds a payment instrument" (e.g. a Stripe-compatible instrument) | `RAIL_ADDED` — the same world-level expression: the instrument's rail/liquidity enters the variant | precondition `{party: "SENDER", change: "ADDS_STRIPE_COMPATIBLE_INSTRUMENT"}`; the assumption list carries what must hold (the receiving rail's restriction sets must admit the corridor) |
| "a verified intermediary is introduced" | `THIRD_PARTY_NODE_JOINS` with `role: "intermediary"` (the node brings its own rails + pools) | precondition `{party: "THIRD_PARTY", change: "INTERMEDIARY_INTRODUCED"}`; the platform-prerequisite note names the missing cross-provider route shape (a governance-level frozen-vocabulary change) |
| "the rail becomes eligible after setup/verification" | `RAIL_ADDED` at the world level — but ELIGIBILITY itself is a corridor-level law (the freshness policy, the connected-instance scope, the restriction sets), owned by route-planning's rail snapshot over the REAL capability projection, **never a Lab concern** | the conditional's grounding evidence cites the corridor exclusion facts that made the rail ineligible; re-eligibility is re-observed, not simulated |
| provider downtime | `INCIDENT_APPLIED` with `{incidentType: "PROVIDER_OUTAGE", railId}` — the rail leaves the routing set from the step on | none (an incident is world truth, not a party change) |
| delays / congestion / write ambiguity | `INCIDENT_APPLIED` with `APPROVAL_DELAY` / `CONGESTION` / `DELAYED_WRITE` (the last yields UNKNOWN-requires-reconciliation) | none |
| **observations go stale** | `INCIDENT_APPLIED` with `{incidentType: "STALE_OBSERVATION", railId}` (P21-C) — the rail's observed facts are marked stale from the step on; settlements grounded on them cannot be CLAIMED (UNKNOWN-tier honesty, the DELAYED_WRITE accounting discipline applied to fact freshness). The production mirror of this law: a stale observation NEVER matches (`evaluateWaitCriteria` / the rail snapshot's `STALE_OBSERVATION` exclusion) | none (the freshness law is a platform law; the wait re-check reports staleness facts) |
| a deadline is missed | the demand's own `deadlineMs` + the `EXPIRED` outcome / `deadlineMisses` metric | none |
| the FX spread moves | `INCIDENT_APPLIED` with `FX_VOLATILITY` (`spreadIncreaseBps`) — exact bigint, never floating point | none |
| liquidity dries up / arrives | `LIQUIDITY_SHORTAGE` (a pool is drained) / `POOL_FUNDED` / `RAIL_REMOVED` | none |
| a batch of demands changes | `GROUP_DEMAND_ADDED` (optionally annotated debtor/creditor — the simulation's demand shape stays party-free; the parties live on the intervention record, never invented or dropped) | none |
| credit is extended | `CREDIT_COMMITMENT` — an evidenced STAND-IN drawn only under the variant program's `useNetworkCredit` flag (credit is never liquidity) | none |

## What this mapping deliberately does NOT say

- It does not invent party semantics in the Lab: no `SENDER_`/`RECIPIENT_`-prefixed
  intervention kinds exist, and none may be added without a one-change vocabulary
  law move plus an ADR.
- It does not make scenario results evidence: a counterfactual is advisory REPLAY
  output over digest-pinned frozen base facts — it never updates production facts,
  never grounds an offer, and never permits execution (`scenariosPermitExecution()`
  is the literal false).
- It does not promise that a party change suffices: where the platform itself lacks
  the capability (the FLW send operation; a cross-provider route shape), the
  conditional's `platformPrerequisites` note says so explicitly — labeled DISTINCT
  from the party prerequisite, never conflated, never hidden.
- A fee-schedule-change intervention kind is deliberately NOT added this wave (the
  one-change cost was not bounded by the P21-C order); fee movement is expressible
  today only through `FX_VOLATILITY` (spread) and the rails' declared fees. Named
  here as the honest gap it is.
