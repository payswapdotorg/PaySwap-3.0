# ADR-0013: P20 — the reconcile-with-evidence surface (closing an UNKNOWN)

- **Status:** ACCEPTED (TL-gated, 2026-10-27)
- **Scope:** the `payswap-desktop` channel contract (the reconciliation members — the pending read + the evidence-submission act); `@payswap/app` (the reconcile card + the two-act evidence-entry flow); the desktop renderer composition; the P19-closure carry-forward item "the reconcile-with-evidence member (ADR-0012 D6)"
- **Resolves:** ADR-0012 D6 — "Closing an UNKNOWN with reconciliation evidence (an operator-side evidence-input surface) is NOT designed here; the automatic interruption recovery at composition stays the only UNKNOWN path in the product." This ADR is that design. The automatic evidence FEEDS (the verified-webhook mapping, the retrieval service) stay carried (D6 below).
- **Law hook:** INVARIANTS.md invariant 29 (frozen architecture changes require ADR + dependency-graph + state updates — this ADR is that record); INV-04 (UNKNOWN is distinct from FAILED and is reconciled rather than blindly retried); INV-05 (evidence lineage); INV-06 (idempotent/replay-safe commands); INV-24 (no dead financial actions, no fabricated provider effects); INV-25 (the mode brand); ADR-0011 D3 as narrowed by ADR-0012 D1 (the channel observes state; the act crosses only as a validated choice — the pattern P20 repeats a THIRD time); ADR-0008 D3/D4 (the reconciliation read + the reconciled-attempt law)

## Context

P19 completed the authority chain's surface: seed → intake → gates →
preview → plan selection → the two-act approval → the armed card →
the lane choice → the dispatch → the attempt states. But the journey's
last honest state is reachable and then ABANDONED: a dispatch can
answer UNKNOWN (or be interrupted before the answer — the restart
sweep marks it), and the runtime's closer — `reconcile(missionId,
attemptId, evidence, now)`, the ONLY path out of UNKNOWN, battery-
proven since P17 — is unreachable from any product surface. The only
in-product UNKNOWN path is the automatic interruption sweep at
composition. An operator staring at an `OUTCOME_UNKNOWN` attempt on
the detail timeline has nowhere to go: the strongest INV-24
dead-action exposure on the books (a real, tested, typed financial
verb no product surface can reach).

The evidence model already exists host-side:
`PaymentReconciliationEvidence {resolvedTo: CONFIRMED|FAILED, source:
EXTERNAL_PROVIDER_STATEMENT|EXTERNAL_PROVIDER_RETRIEVAL,
evidenceRefs: readonly string[]}` — "the ONLY closer of an UNKNOWN
(never a guess)". The runtime validates fail-closed (bad evidence →
`RECONCILIATION_EVIDENCE_INVALID`, "reconciliation never closes on a
bare assertion"; not-pending / refused / already-reconciled →
`RECONCILIATION_NOT_PENDING` — the reconciliation record is
append-only, one per attempt). On CONFIRMED-of-a-create the mission
COMPLETES; on FAILED it stays open. The registrar's AMBIGUOUS record
exits through the same verb.

The deployment fact stays: zero ACTIVE connections, so real UNKNOWNs
are fixture-only in THIS deployment (the labeled scripted authority);
the golden path is fixture-proven only, and the pending card's empty
state is the designed honest truth.

## Decision

**D1 — The reconcile surface crosses the channel as TWO members; the
runtime verb stays the ONLY closer.**

- `paymentMissionPendingReconciliation(missionId)` — the READ (the
  pending card): `{ pending: readonly { attemptId, startedAt,
  operation, executionMode, summary }[], acceptedSources, note }`.
  The pending set derives by the runtime's OWN rule
  (`attemptIsUnresolved`: an attempt is pending iff it was not
  refused, not already reconciled, and either its envelope says
  UNKNOWN or no answer was ever recorded — the write-ahead/
  interruption case). `acceptedSources` echoes the frozen source
  vocabulary verbatim so the UI renders exactly what is enterable.
  The note is people-language and honest: reconciliation closes an
  unknown outcome with PROVIDER evidence — a statement or a retrieval
  citation — and never guesses. NO envelope internals, NO
  idempotency/command/correlation ids, NO connectionRef, NO artifact
  ids on the shape (the scanner laws).
- `paymentMissionReconcile(missionId, attemptId, evidence)` — the
  ACT: the operator's evidence submission. The member recomputes the
  pending set host-side AT ACT TIME (the P19-A lane-choice law); an
  attemptId outside the recomputed set is the typed
  `INVALID_FIELD_VALUE` refusal BEFORE any runtime call — "no
  reconciliation was recorded", nothing changed. The evidence input
  validates at the edge by the runtime's OWN bounds (source ∈ the
  frozen two-kind vocabulary; refs non-empty, each 1..512 chars)
  BEFORE any runtime call. The runtime's `reconcile()` is then the
  ONLY closer; its typed errors (`RECONCILIATION_NOT_PENDING`,
  `RECONCILIATION_EVIDENCE_INVALID`) rethrow as the app's typed
  classes (the P18-C mapping precedent). The outcome DTO carries
  outcome facts only: `{ attemptId, resolvedTo, summary }` — the
  addressing echo, the resolved direction, people-language prose. The
  evidence refs NEVER echo as structure on any DTO: they live in the
  runtime's reconciliation record and cross as timeline-event prose
  only (the existing law).
- The act's actor is pinned at the channel edge (the P18-A
  discipline): `CHANNEL_RECONCILIATION_ORIGIN = "OPERATOR_EVIDENCE_ACT"`
  and `CHANNEL_RECONCILIATION_PRINCIPAL = "principal:operator"`. The
  runtime takes neither and stays untouched; the pin is the channel
  law (the member-file constants, the census lists, the ADR record).

The single-shot law: the reconciliation record is append-only and one
per attempt, so the act has NO idempotent-replay kind — a re-send
against a closed attempt is the typed `RECONCILIATION_NOT_PENDING`
refusal with the honest "already reconciled" reason, and the detail
re-read shows the RECONCILED facts (INV-06's replay-safety here is
refusal-honesty, not a replay union).

**D2 — The source vocabulary stays the runtime's frozen two-kind set;
the operator is the COURIER, not the source.** The protocol plane caps
operator/UI artifacts at proof P0/P1 ("a screenshot is an assertion");
the desktop plane honors the same spirit without growing a new
provenance vocabulary: the operator TRANSCRIBES provider evidence —
they select WHICH kind they are transcribing (`EXTERNAL_PROVIDER_
STATEMENT` — a provider statement/dashboard/support reference, or
`EXTERNAL_PROVIDER_RETRIEVAL` — a retrieval citation) and supply the
provider-side reference strings; the runtime's non-empty bounded-refs
floor ("reconciliation never closes on a bare assertion") is the
enforcing edge. The `resolvedTo` direction is part of the operator's
transcription (the runtime API requires it; the member never guesses
it and never derives it). A future wave may bridge the desktop
evidence record to the protocol plane's provenance-capped
`EvidenceNode` model — named, not designed here.

**D3 — The pending derivation rides the runtime's own rule; no
parallel state.** The READ (and the act-time recomputation) derive
from the mission's attempt records by the same rule
`attemptIsUnresolved` applies. No second reconciliation state
machine, no cached pending list, no derived store: the card is
computed per read from the same records the runtime enforces over.

**D4 — The file-disjoint lane map.** P20-A (host lane): NEW
`shell/reconcile-contracts.ts` + NEW `shell/reconcile-members.ts`
(the dispatch-contracts/dispatch-members precedents) +
`payment-mission-contracts.ts` grows the interface members + the
re-exports + the ADR-0013 channel-law header note + the service
spread (the SAME resolver + host clock) + the shell index exports +
the renderer mirror growth (`consoleWorkspaceMount.tsx` +
`consolePaymentMissionWire.ts`) + the census/drift updates (the
client member census, the never-crosses list grows `reconcile`, the
delegation method census) + the host battery + the fixtures growth
(the UNKNOWN dispatch fixture over the labeled scripted authority).
The runtime (`payment-dispatch-runtime.ts`, 627 — the deliberate
exception), the gate, `mission-execution.ts`, and the idempotency
registrar are UNTOUCHED. P20-B (app lane): the NEW pins file
(`paymentMissionsReconcilePins.ts` — `paymentMissionsPins.ts` is AT
the 400-line law; the dispatch-pins split precedent) +
`PaymentMissionsReconcileCard.tsx` (the two-act evidence entry: the
pending-fact list, the direction choice CONFIRMED|FAILED, the source
choice from the accepted echo, the refs entry, the confirm
disabled-until-valid — never a guess, never a fabricated provider
effect) + the flow module (IDLE → PENDING_CARD → EVIDENCE_ENTRY →
SUBMITTING → RESOLVED; a thrown typed failure returns to the entry
state with the facts intact) + the detail-view integration beside the
armed card + the barrel growth + the jsdom battery (the call-order
law extended: no reconcile call without the pending card + the
evidence entry; the scan-clean law over the new machine literals).
P20-C (TL): the composition growth (the port gains the two members —
the composed-port structural guard pattern) + the bridge battery
(the honest empty truth: nothing pending reconciliation on a healthy
mission; the golden path over the labeled fixtures: an UNKNOWN
dispatch → the pending card → the evidence submission → RECONCILED
with the mission state side effects [COMPLETED on
CONFIRMED-of-a-create]; the act-time refusal [an outside attemptId →
typed, nothing recorded]; the runtime typed refusals surfaced
honestly; byte-identical detail re-reads) + the closure. The lanes
are file-disjoint: A owns the desktop host shell + the mirror; B
owns the payswap-app agent files + the barrel; C owns the renderer
composition + the bridge test.

**D5 — The web boundary is unchanged.** ADR-0010 D7 stands: the
mission-plane members exist only on the `payswap-desktop` channel; no
web file changes in P20.

**D6 — The automatic evidence feeds stay carried forward.** The
verified-webhook reconciliation mapping (`stripeReconciliationEvidenceOf`
— ONLY `payment_intent.succeeded` → CONFIRMED and
`payment_intent.payment_failed` → FAILED; observations never resolve)
and the retrieval service (`postAmbiguityRetrievalFor`, the
`OPERATOR_INITIATED` reason) compose with the EXECUTION-LANES wave's
operator evidence flows, not with P20's manual surface. The
protocol-plane bridge (the `SettlementReconciliationCase` authority ↔
the desktop mission plane) stays a named question. P20 is the
operator-input surface only.

## Consequences

- The INV-24 dead-action exposure closes: the runtime closer becomes
  reachable through a product surface with the act explicit, the
  evidence bounded, and the actor pinned.
- The operator's journey gains its final leg: … the dispatch → an
  UNKNOWN attempt → the pending card → the two-act evidence entry →
  RECONCILED with the mission state side effects — every step
  observable, every step honest about the empty deployment.
- The ADR-0011 D3 boundary narrows a third time by the same pattern:
  "the channel observes attempt STATE only" becomes "the reconcile
  act crosses only as an evidence submission over the
  host-recomputed pending set, with the runtime verb remaining the
  only closer".
- The evidence refs never become wire structure; the source
  vocabulary never grows operator provenance (the courier-not-source
  law); the runtime, the gate, and the registrar stay untouched.
- Honest deployment truths unchanged: zero ACTIVE connections; real
  UNKNOWNs are fixture-only; the golden path is fixture-proven only
  (the labeled test-tier fixtures); the full tsc -b stays
  station-memory-blocked (the scoped check programs are the gate).
- Carry-forward (named, never claimed): the provider execution lanes
  (FLW/Paystack + the live-grant amendments — operator credentials
  required); the automatic evidence feeds composing with those lanes;
  live-provider route evidence; the §5/payment-mission store
  reconciliation question (ADR-0011 D6); the protocol-plane evidence
  bridge (D2/D6 above).
