# ADR-0012: P19 — the dispatch act surface (the armed-mission lane)

- **Status:** ACCEPTED (TL-gated, 2026-10-26)
- **Scope:** the `payswap-desktop` channel contract (the mission plane's dispatch members + the armed-effect read); the authorization gate (the mission-scoped armed lookup); a NEW host-side lane resolver; `@payswap/app` (the armed card + the two-act dispatch flow); the desktop renderer composition; the P18-closure carry-forward item 1
- **Resolves:** the P18 closure carry-forward "the dispatch act + the P14-carried execution lanes (an approved mission sits ARMED until a host-side dispatch consumes the artifact)" — the dispatch act surface only; the provider execution lanes stay carried forward (credentials)
- **Law hook:** INVARIANTS.md invariant 29 (frozen architecture changes require ADR + dependency-graph + state updates — this ADR is that record); ADR-0011 D3 (the dispatch-stays-host-side law being NARROWED here, lawfully); the artifact law (`authorization-gate.ts` — single-use, mission+preview+digest bound); INV-25 (the execution-mode brand)

## Context

P18 gave the operator the approval act over the channel (the two
edge-pinned members; the origin pinned PREVIEW_UI_ACT; the single-use
artifact never crossing). But an approved mission sits ARMED forever:
the artifact's only consumer is the P14 E2E script. The runtime's
consequential slice — the two-phase dispatch protocol (write-ahead →
authority → answer; idempotent replay; UNKNOWN-reconciles) — is real
and tested, yet no product surface can fire it or even SEE the armed
state (the gate exposes `artifact(artifactId)` by id only; nothing
lists a mission's unconsumed artifacts).

ADR-0011 D3 drew the boundary deliberately: "The dispatch act stays
HOST-SIDE; the channel observes attempt STATE only." P18 carried the
dispatch surface forward rather than designing it in passing. This ADR
is that design — the same lawful-narrowing pattern ADR-0011 applied to
ADR-0010 D2's approval boundary.

The deployment fact governs everything: zero ACTIVE connections exist
(the station resets destroyed the P13 provider test credentials), so
every product dispatch in THIS deployment is the typed no-eligible-lane
refusal — honestly surfaced, never masked. The golden path is proven
only over clearly-labeled test-tier fixtures (the P18 discipline).

## Decision

**D1 — The dispatch act crosses the channel as TWO members with the
artifact NEVER crossing, not even as an input.**

- `paymentMissionArmedEffect(missionId)` — the READ (the armed card):
  `{ armed, reason?, scope?, expiresAt?, lanes }`. When an unconsumed,
  unexpired artifact exists for the mission: `armed: true` + the scope
  echo (the P18-A approval-scope shape) + the expiry instant + the
  eligible lanes. When not: `armed: false` + the people-language
  reason VERBATIM (no artifact exists / the artifact expired at
  <instant> / the artifact was consumed at <instant> — a fresh preview
  and a fresh explicit approval are required). No artifactId ever
  appears on the shape.
- `paymentMissionDispatch(missionId, connectionRef)` — the ACT: the
  operator-picked lane. The member recomputes the eligible set
  host-side AT ACT TIME (the wire carries a CHOICE, never a grant);
  a connectionRef outside the recomputed set is a typed refusal. The
  artifact (the latest unconsumed one), the operation
  (CREATE_EXTERNAL_EFFECT), and the execution mode (the lane's INV-25
  brand) all resolve HOST-SIDE. The outcome DTO carries outcome facts
  only: `{ kind: DISPATCHED | REPLAYED | REFUSED, attemptId, summary }`
  — no artifactId, no connectionRef echo, no envelope internals beyond
  the summary (the attempt-state projection on the detail DTO carries
  the honest facts after refresh).

The authority question is settled by construction: the dispatch's
authority IS the artifact (minted by the PREVIEW_UI_ACT approval — the
P18 chain); the member takes no origin. The two-act UX discipline (the
armed card → the lane choice → the confirm) keeps the operator act
explicit, mirroring the P18-B scope-card law.

**D2 — The lane eligibility is host-computed over the connections
registry; LIVE is excluded.** A NEW host-side resolver
(`payments/dispatch-lane-resolver.ts`): the eligible lanes are the
ACTIVE connections whose execution mode is SANDBOX (INV-25 — the LIVE
mode requires the live-grant derivation that belongs to the
execution-lane wave's own amendment; a LIVE record is listed as
ineligible with its reason, never silently hidden). Each lane carries
`{ connectionRef, label, providerId }` — the same ids the Connections
section already shows the operator (the registry's own read model);
no credentials, no credential handles, no secrets ever appear. In the
empty deployment: `lanes: []` + the honest empty-lane note — the
dispatch member refuses typed (the no-eligible-lane refusal), and the
panel renders the typed-prerequisite card, never a fabricated lane.

**D3 — The gate grows the mission-scoped armed lookup.**
`authorization-gate.ts` (329 lines — headroom under the file law)
gains `artifactsForMission(missionId)`: the artifacts bound to the
mission's taskRef, mint-ordered, with their consumed/expired states —
enough for the member to derive the latest unconsumed one and the
honest not-armed reasons. The dispatch path's own checks (single-use,
preview binding, digest binding) stay UNCHANGED — the read member
never bypasses them; the expiry the read surfaces is the artifact's
own `expiresAt` (mint +600s), and an expired artifact is presented as
not-armed (the dispatch slice's consume path remains the enforcing
edge for the act itself).

**D4 — The file-disjoint lane map.** P19-A (host lane): the gate
growth + the lane resolver + the two members (a new
`shell/dispatch-members.ts` split per the file law) + the contracts
growth + the renderer client mirror + the drift lists + the host
battery (the armed lookup honesty, the lane eligibility [SANDBOX-only,
LIVE-excluded-with-reason], the choice-validation law [an outside
connectionRef is a typed refusal], the artifact-never-on-the-wire scan
extended to the new shapes, the expiry surfacing). P19-B (app lane):
the armed card + the two-act dispatch flow in the detail view (the
pins growth + `PaymentMissionsArmedCard.tsx`) + the honest states (not
armed / no lane / the unwired truth) + the barrel + the jsdom battery
(the call-order law extended: no dispatch call without the armed card
+ the lane choice; the scan-clean law). P19-C (TL): the composition
growth (the port gains the two members; the wire mapping) + the bridge
battery (the honest empty truth: an unapproved mission → armed:false
with the reason; the golden path over the labeled test-tier gate
environment + the scripted answering authority: armed → lane choice →
dispatch → the attempt state on the detail; the no-lane typed refusal;
byte-identical replays) + the closure. The lanes are file-disjoint: A
owns the desktop host shell + the gate + the resolver + the mirror; B
owns the payswap-app agent files + the barrel; C owns the renderer
composition + the bridge test.

**D5 — The web boundary is unchanged.** ADR-0010 D7 stands: the
mission-plane members exist only on the `payswap-desktop` channel; no
web file changes in P19.

**D6 — The reconcile member stays carried forward.** Closing an
UNKNOWN with reconciliation evidence (an operator-side evidence-input
surface) is NOT designed here; the automatic interruption recovery at
composition stays the only UNKNOWN path in the product. The
reconcile-with-evidence surface is named carry-forward (it composes
with the execution lanes' operator evidence flows).

## Consequences

- The authority chain's surface is complete end-to-end: seed → intake
  → gates → preview → plan selection → the two-act approval → the
  armed card → the lane choice → the dispatch act → the attempt states
  — every step observable, every step honest about the empty
  deployment.
- The ADR-0011 D3 boundary is narrowed, not abandoned: what was "the
  dispatch act stays host-side" becomes "the dispatch act crosses only
  as a lane choice over the host-recomputed eligible set, with the
  artifact never crossing" — the same invariants, enforced at the
  channel edge instead of by absence.
- The artifact lifetime becomes visible: an armed mission whose 600s
  artifact expired shows the honest not-armed reason and the path back
  (a fresh preview + a fresh approval).
- The provider execution lanes (FLW/Paystack adapters, live grants)
  remain the named carry-forward with the operator credentials they
  need; P19's golden path is fixture-proven only.
