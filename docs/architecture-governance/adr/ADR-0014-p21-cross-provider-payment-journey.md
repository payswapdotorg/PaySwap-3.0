# ADR-0014: P21 — the cross-provider payment journey (Flutterwave-only sender → Stripe-only merchant)

- **Status:** ACCEPTED (TL-gated, 2026-10-27)
- **Scope:** the PaySwap agent composer + the payswap-desktop channel (the connection-activation members, the probe runner, the capability bridge, the merchant directory, the kernel composition); `@payswap/app` (the journey lane: the model/difficulty controls, the composer↔mission binding, the stage-progress panel, the wait controls); `@payswap/opportunities` + `@payswap/lab` + `@payswap/route-planning` (the conditional opportunity, the re-check evaluator, the scenario-family completion); the desktop renderer composition roots; the E2E law (web tier + the Electron CDP desktop tier)
- **Resolves:** the operator's P20-order journey ("New Task → model/difficulty → 'Pay merchant X' → typed intent → pinned routine → stage-by-stage progress → provider-evidenced rails → routes/counterfactuals/opportunities → authorization → real execution or honest no-route") + the P20-closure carry-forwards "the provider execution lanes … operator credentials required" (unblocked: the operator supplied fresh test-mode credentials, station-secret-store-only) and "live-provider route evidence (zero connected capability instances)"
- **Law hook:** INVARIANTS.md INV-04/05/06/07/13/19/24/25/29; AGENTS.md financial boundary (the only valid consequential path) + security/data (secrets never in model context/logs/artifacts); ADR-0007 D1/D8 (the credentials gate + the one-change channel law); ADR-0008 D2 (the execution-kernel architecture this ADR composes into the product); ADR-0009 D1-D4 (the routine trigger/manifest laws); ADR-0010 D1/D7 (the renderer composition root; the web-unbound law and its P21 analogue); ADR-0011 D3 (the act-crossing pattern); ADR-0012 D2 (SANDBOX-only lanes); ADR-0013 D2/D6 (the courier-not-source vocabulary; the automatic evidence feeds stay carried)

## Context

P13–P20 built the mission plane end-to-end — intake, gates, preview, two-act approval,
dispatch, reconcile — and bound the route-planning routine (P16/P17) behind the
renderer composition root. Three structural seams keep the operator's ordered journey
from being TRUE: (1) the PaySwap composer's text never reaches the mission plane (the
two-store split — the composer seeds a browser-localStorage task and stops; the
mission verbs exist on the channel but only the Missions intake uses them); (2) zero
ACTIVE connections and zero connected capability instances — the gate environment and
corridor projection are honestly empty, so "provider-evidenced rail discovery" has no
facts to discover; (3) the real Stripe execution kernel is script-proven but composed
nowhere in the product (every in-product dispatch answers `NO_AUTHORITY_WIRED`).

The operator's order fixes the scenario: a sender whose only eligible rail is a
Flutterwave test-mode connection, and a merchant whose only receiving rail is a Stripe
test-mode context. The order's release gate: a provider-evidenced result or an honest,
actionable no-route/waiting result — never a manufactured route, never a fixture
"CONFIRMED", never an LLM-authored score, never "payment completed" without provider
evidence. The order also fixes the truth rules: do not invent a direct
Flutterwave-to-Stripe transfer; do not treat the FLW connection as a Stripe-funding
instrument; do not use `pm_card_visa` to claim Flutterwave funded a Stripe payment.

The source audit (P21-0, three Explore lanes) establishes the capability frontier:
Flutterwave is read-only by construction (`FLUTTERWAVE_OPERATION_IDS` contains exactly
`flutterwave.balances.read`; `refuseConsequentialFlutterwaveGrant` throws on any
consequential class); the route-compiler's frozen shape vocabulary contains no
cross-provider fiat composition ending in a provider-native merchant acceptance; no
intermediary evidence exists. Therefore **no supported FLW→Stripe route exists in this
wave, and none can be manufactured honestly**. The operator's order explicitly
provides for this outcome: "an explicit explanation, a list of conditional
opportunities and a persisted option to wait or revise the request … the UI must not
call it a fulfilled payment."

The fresh operator credentials (Stripe/Flutterwave/Paystack test-mode keys; a Stellar
testnet keypair held for P22) raise the achievable evidence tier: real read-only
probes inside the credential seal, a real Stripe PaymentIntent execution sub-route,
and authoritative retrieval read-back.

## Decision

**D1 — the wave registration.** The operator's order (labeled "P20") registers as
wave **P21** (the repo's P20 is closed; the "e.g." label is not a mandate; P14–P20
history is never rewritten). The follow-on provider-combination redo (Stellar +
Paystack; the GHS→USDC(Stellar)→KES corridor) is wave **P22**, registered only after
P21 closes — it requires a Stellar adapter that does not exist (chain families today:
EVM, SOLANA, UTXO, MOVE, COSMOS, SUBSTRATE, OTHER) and its own ADR.

**D2 — the composer↔mission binding (renderer-side, existing members only).** The
PaySwap composer's classified PAYMENT_MISSION intents seed REAL missions through the
existing `paymentMissionSeed` channel member (the origin stays host-pinned
`COMPOSER_TEXT`); the clarification loop surfaces IN the composer conversation through
the existing `paymentMissionAskNextField` / `paymentMissionCapture` members (the
deterministic nine-field intake, fail-closed capture validation — never invented
inputs); the route-planning session binds over the mission plane (the ONE-port law).
No new host event kinds. The app task store stays the journey's session record
(durable, resumable). **Web keeps the honest localStorage task tier and the unbound
mission note** (the ADR-0010 D7 analogue): the web build renders what is real there —
the task tier — and never fakes the mission tier.

**D3 — the stage-progress projection.** A per-mission stage checklist (the routine's
12 stages) DERIVED from persisted typed events (the mission timeline + the task event
log) + the deterministic engine view — status, human summary, prerequisites,
checkpoint — rendered in the composer/mission surfaces following the substrate
status-panel plan pattern. **No parallel state model, no static checklist, no new host
event kinds.** A `ROUTINE_PINNED` task event (stage 0: routineId + version + skill
digest) lands in the app task store. A stage completes from its service result and
required evidence only — the model writing "done" completes nothing (there is no
model in the loop to write it; the deterministic engines are the only writers).

**D4 — the model/difficulty law.** The AgentComposer gains REAL model + difficulty
controls hydrated from the substrate's model-selection service (the same catalogs the
native composer uses — actual available models, never a fabricated list). The
selection persists on the task record and restores on resume (the taskModelRecovery
pattern). The difficulty (reasoningLevel) drives REAL budget knobs — the routine's
search budget, the scenario budget, the explanation detail tier — and NEVER
eligibility, authorization, security gates or the routine's resource limits. The model
is recorded as the task's model and stamped on routine presentations. **The financial
computation stays deterministic and model-independent; no LLM narration tier is
composed in this wave** — the task discloses that honestly (the actual prerequisite
shown, never a silent substitution, never a fake narration, never a claim that the
selected model produced the financial facts/routes/scores). A full CLI-agent
skill/MCP integration is named as a follow-on candidate (P23), never silently claimed.

**D5 — the connection-activation members (the caller-trust fix).** The channel gains
`connectionSubmitFlutterwaveSecretKey` / `connectionSubmitPaystackSecretKey` (the
existing authority verbs, the same seal path as the Stripe member) and
`connectionRunVerificationProbe(providerId)` — the probe executes **host-side INSIDE
the credential seal** over the real HTTPS transports (`StripeHttpsTransport`,
`FlutterwaveHttpsTransport`, `PaystackHttpsTransport`) and records the outcome through
the authority's own `recordVerificationOutcome` (the ONLY ACTIVE path stays
probe-CONFIRMED). The existing `connectionRecordVerificationOutcome` member stays for
the labeled scripted/fixture tier only. INV-25 unchanged: test-prefix shape checks
fail-closed; LIVE keys are refused; the members never echo secret material. The
naming law holds (no banned prefixes).

**D6 — the connection→capability bridge + the merchant directory (the tier law).** A
host-side bridge converts each ACTIVE connection + its probe evidence into a
capability instance + observations (provider-referenced, freshness-stamped) feeding
the gate environment + corridor projection — **a catalogue entry never becomes an
instance** (INV-13 stays machine-enforced). A labeled TEST_DATA merchant directory
ships the `merchant:stripe-only-test` fixture: a stable identifier, a Stripe test-mode
receiving context mapped to the connected Stripe test account. Fixture facts are
labeled test data, never provider observations; probe evidence is provider
observation, never inflated (the FLW probe proves balance-read only — F3). Every new
fact carries its evidence tier (PROVIDER_OBSERVATION / TEST_DATA / SCRIPTED) and the
tiers never mix.

**D7 — the cross-provider truth decision (the no-route outcome).** For the ordered
scenario **no supported route exists and P21 does not manufacture one**: Flutterwave
has no send operation (fail-closed by construction), no frozen route shape composes
FLW-send→Stripe-receive, and no intermediary evidence exists. **P21 implements no
Flutterwave send/transfer operation** — an FLW transfer terminates at bank/MOMO
destinations and would not create an FLW→Stripe route; inventing one violates the
operator's truth rules. The honest terminal outcome for the original intent is
**NO_ROUTE**: ranked-eligible EMPTY, every exclusion explained with typed reasons,
conditional opportunities created (evidence-backed), and the persisted wait/revise
choice. The UI never calls it a fulfilled payment.

**D8 — the revise-path executable route (the complete operator §7 path).** The
revision option is real: revising the funding request to the declared test funding
instrument (labeled TEST_DATA — the P14 declared-test-corridor precedent; the
published Stripe test payment method) makes the merchant-native-settlement route
(Mode A) genuinely executable. Exercising it runs the complete path: connected test
account → fresh capability eligibility → intent/routine → route selection → preview →
scoped two-act approval → **host dispatch through the composed REAL Stripe kernel**
→ genuine provider response → authoritative retrieval read-back → reconciliation →
truthful terminal state. **The kernel composes ONLY in SANDBOX, ONLY behind the lane
resolver + authorization gate, ONLY for routes whose every leg carries evidence**
(D6 tiers). The unwired authority remains the default when no eligible lane exists.
The mission's funding facts never claim Flutterwave; the Stripe test payment method
is never presented as FLW-funded (F4).

**D9 — the conditional opportunity + the wait lifecycle completion.** A conditional
opportunity composes the existing offer model with a party-change precondition:
required party changes, assumptions, evidence provenance, expiry, privacy/disclosure
controls, opt-in semantics — plus the honest platform-prerequisite note where a party
change alone is insufficient (e.g., an FLW receiving method makes the corridor real
only when an FLW send operation exists — labeled as the platform gap, distinct from
the party prerequisite). The wait lifecycle completes: a user-triggered re-check
("check now") recomputes matches over fresh observations; the cancel control wires;
expiry fires on the declared bound; **a match NEVER auto-dispatches** (the pinned
`waitingNeverDispatches:false` literal) — it leads to fresh planning, preview and new
explicit authorization. Counterfactuals stay advisory (the REPLAY-namespace law); the
scenario families complete with a staleness incident kind, party semantics documented
over the existing intervention kinds, new vocabulary only through the one-change law.

**D10 — the E2E law.** User-level acceptance runs against the REAL application: the
web tier (journey-verification over the built web app — the task-tier journey + the
honest unbound notes; the one-shot build with the documented heap cap) and the
**desktop tier (the bound composition, driven through an Electron CDP harness** —
launch with remote debugging, `chromium.connectOverCDP`, drive the real renderer DOM;
screenshots + structured secret-free receipts at the repository's prescribed test
viewport/package). No mock-rendered page substitutes for the shipped workflow.
Provider receipts record environment, operation type, redacted correlation refs,
response status, provider resource ids where policy allows, and authoritative
read-back state — zero secret material (machine-scanned).

**D11 — the secret law.** The operator's keys live ONLY in the station secret store;
they reach the runtime only through the credential-seal path (D5 members / the E2E
harness env). They never enter model context, renderer DTOs, logs, screenshots,
fixtures, test receipts or any committed artifact. The E2E harness reads them from
the environment at run time; receipts are machine-scanned for the key material.

**D12 — the file-disjoint lane map (max three concurrent).** P21-A (host:
`packages/desktop/src/host/**` + the renderer client mirror + `packages/capability`
bridge types + `scripts/p21/**`); P21-B (app + renderer composition:
`packages/payswap-app/**` + the renderer composition roots, disjoint from A's mirror
files + `packages/surface/**`); P21-C (domain: `packages/opportunities/**` +
`packages/lab/**` + `packages/route-planning/**`). P21-D (TL): the bridge battery,
the CDP E2E, the receipts, the integrated batteries, the maps/state closure.
Sequencing: `P21-0 → {A ∥ C}; A → B; C → B (panel); {A,B,C} → D`.

## Consequences

- The operator's journey becomes TRUE end-to-end at the SANDBOX evidence tier: real
  connections, real probes, real rail snapshots, honest no-route, real conditional
  opportunities, a real revise-path dispatch with authoritative read-back.
- The six truth facts (F1–F6) stay machine-enforced; the evidence tiers stay labeled
  and unmixed; SANDBOX results stay distinctly labeled (never live certification).
- The kernel composition (D8) is the first product-wired consequential provider path
  since P13 — gated behind the full authority chain, SANDBOX-only, and exercised only
  on the revised intent whose funding facts are honestly TEST_DATA.
- Web stays honest (unbound mission tier); the desktop tier carries the full journey.
- The wait lifecycle becomes real (re-check/cancel/expiry) without any background
  scheduler claim — the re-check is user-triggered and honestly labeled.
- Risks: the CDP harness is new test infrastructure (greenfield); the station memory
  law constrains builds (the documented heap caps + scoped tsc gates); the merchant
  directory is fixture-tier (TEST_DATA) and must never drift into provider-observation
  language. All named; none silent.
