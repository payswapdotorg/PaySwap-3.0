# ADR-0011: P18 — the approval/observation UX over the exposed mission plane

- **Status:** ACCEPTED (TL-gated, 2026-10-26)
- **Scope:** the `payswap-desktop` channel contract (the mission plane's approval members + the detail DTO's attempt-state projection); `@payswap/app` (the payment-missions observation panels); the desktop renderer composition; the P17-closure carry-forward item 1
- **Resolves:** the P17 closure carry-forward "the approval/observation UX over the exposed mission plane (the narrowed P14 renderer-exposure frontier)" — `spec/development-state/current-state.json` P17 closure notes
- **Law hook:** INVARIANTS.md invariant 29 (frozen architecture changes require ADR + dependency-graph + state updates — this ADR is that record); ADR-0010 D2 (the channel law being AMENDED here, lawfully and narrowly); the authorization origin law (`authorization-gate.ts` — only PREVIEW_UI_ACT decides)

## Context

P17 exposed the payment-mission plane on the `payswap-desktop` channel with
read/input members only (board/detail/seed/askNextField/capture/
presentPreview/recordPlanSelection) and bound the REAL route-planning
engines behind the panel's port. But the exposure is machine-facing: the
only consumer of the board/detail members is the route-planning engine's
mission linkage. The operator has NO surface to observe a payment mission
(board, timeline, intake, preview gates, plan selection), and the approval
act — the P14-carry-forward's "renderer exposure of the payments plane"
narrowed by P17 to "the approval/observation UX" — remains headless (the
P14 E2E script is the only caller of `requestAuthorization`/
`resolveAuthorization`).

ADR-0010 D2 drew the boundary deliberately: "NO authorization member is
exposed: requestAuthorization / resolveAuthorization / dispatch stay
HOST-SIDE … approval is minted only by a PREVIEW_UI_ACT behind the origin
law, and the channel never sees it." P17 carried the approval UX forward
rather than designing it in passing. This ADR is that design.

## Decision

**D1 — The observation surface is a pinned-port panel family in
`@payswap/app`, mounted inside the agent experience.** New files
(`src/agent/paymentMissionsPins.ts`, `PaymentMissionsMount.tsx`,
`PaymentMissionsPanel.tsx` + splits as the ≤400-line law requires): the
board (newest-updated-first rows — direction, goal, status,
intent/preview presence, plan selection), the detail view (the
append-only timeline with people-language summaries, the intake fields,
the compiled 11-key intent, the presented preview with every BLOCK
reason VERBATIM, the plan selection, the attempt states), the intake
capture UX (`askNextField` → answer → `capture`), and the honest states:
NOT-WIRED (no port bound), PLANE-NOT-CONFIGURED (the typed
`PaymentPlaneNotConfiguredError` caught and phrased), EMPTY (the
designed-empty contract — zero missions), and BLOCKED (the gates'
reasons verbatim, `dispatchable: false`, never a fabricated intent).
The panel consumes a pinned `PaymentMissionsPort` (typed DTO mirrors of
the channel contracts — the RoutePlanningPanel precedent). The mount
takes the port as a prop with a module-level shared seam
(`bindPaymentMissionsPort`/`sharedPaymentMissionsPort`/
`resetSharedPaymentMissionsPort` — the P17-B session-seam pattern); the
unbound default renders the honest not-wired note. `AgentExperience.tsx`
gains the missions surface (a rail entry toggling the board panel) — the
panel is part of the agent-led payment UX, a sibling surface of the
composer, never a child of the substrate Root.

**D2 — The approval act crosses the channel as TWO members with the
origin PINNED at the edge — the lawful amendment of ADR-0010 D2.** New
members on the mission plane, mirroring the runtime 1:1 with edge
pinning (the `paymentMissionSeed` COMPOSER_TEXT pin is the precedent):

- `paymentMissionRequestApproval(missionId)` → the request DTO
  (`requestId`, `previewId`, `scope` verbatim, `scopeSummary`,
  `expiresAt`) — the scoped request over the mission's PERSISTED
  preview; the scope copies the preview verbatim (the
  material-change `intentDigest` binding stays host-side).
- `paymentMissionResolveApproval(requestId, decision)` → the
  resolution DTO (the outcome: `GRANTED` with the scope echo + expiry,
  `DECLINED`, or the typed failure) — the renderer supplies ONLY the
  `requestId` and `"APPROVE" | "DECLINE"`; the channel edge pins
  `origin := "PREVIEW_UI_ACT"` and `principalRef := "principal:operator"`
  (the P14 E2E literal) — the renderer can NEVER supply, forge or see
  an origin through this channel.

The laws this amendment preserves BY CONSTRUCTION: (a) the origin law —
approval is minted only by an explicit user act on the presented
preview; the member is callable only over a persisted preview and the
origin is pinned at the edge, so the act IS a preview UI act; (b) the
artifact law — the single-use `PaymentAuthorizationArtifact` NEVER
crosses the channel (no artifactId on any wire shape; the observable
truth is the mission state + the `AUTHORIZATION_GRANTED`/
`AUTHORIZATION_DECLINED` events on the timeline); (c) the DTO law — no
credentials, no secrets, no authorization artifacts, no
consumed-artifact lineage; (d) the no-authority-verb naming law — the
member names carry the `paymentMission` prefix and do not match the
banned prefix set (`test/payswap/desktop-console-client.test.ts`).
The panel's approve flow is TWO explicit operator acts (engage the
approve control → the scope card renders the request's scopeSummary +
expiry → confirm or decline), making the preview-act law visible in the
UX. The panel prose carries no authority-surface machine literals (the
P16-D scan-clean law; `AUTHORIZATION_GRANTED` never appears in
composer-authored strings).

**D3 — The dispatch act stays HOST-SIDE; the channel observes attempt
STATE only.** No member fires a dispatch. The detail DTO grows an
`attempts` projection — outcome facts only, derived host-side from the
attempt records: `{ attemptId, startedAt, operation, executionMode,`
`outcome, summary }` with `outcome ∈ STARTED | CONFIRMED | FAILED |
OUTCOME_UNKNOWN | RECONCILED | REFUSED` (the `mission-execution.ts`
helpers derive it). The projection carries NO idempotency keys, NO
command/correlation ids, NO connection refs, NO authorization artifact
ids — the consumed-artifact lineage stays host-side (the ADR-0010 D2
DTO law). The dispatch surface composes with the P14-carried execution
lanes (a future wave's D2-style amendment); P18's operator can observe
everything and approve nothing into flight.

**D4 — The file-disjoint lane map.** P18-A (host lane): the desktop
host shell — the approval member contracts + implementations (a new
`shell/approval-members.ts` split as the file law requires), the detail
DTO's attempt projection, the service wiring, the renderer-side client
mirror (`consoleWorkspaceMount.tsx` — the drift-tested re-declaration),
and the host battery (the origin pin proven, the artifact never on the
wire proven, the attempt projection honest). P18-B (app lane):
`@payswap/app` — the pins/mount/panel family + the barrel exports +
the panel battery (jsdom; the honest states; the full intake→preview→
approve flow over a fake port). P18-C (TL): the renderer composition
(`paymentMissionsComposition.ts` — the channel members bound to the
port at the business root, honest failure keeps the not-wired default)
+ the bridge battery over the REAL channel service (seed → ask →
capture → preview → requestApproval → resolveApproval → board/detail
with the attempt state; byte-identical replays) + the closure
registration. The lanes are file-disjoint: A owns
`packages/desktop/src/host/payswap/shell/**` + the mirror + the
channel tests; B owns `packages/payswap-app/src/agent/paymentMissions*`
(NEW) + `AgentExperience.tsx` + the barrel + the app tests; C owns the
renderer composition + `main.tsx`'s binding line + the bridge test.

**D5 — The web boundary is unchanged.** ADR-0010 D7 stands: the
mission-plane members exist only on the `payswap-desktop` channel; the
web app keeps its honest unbound note. No web file changes in P18.

**D6 — The §5 missions section and the payment-mission board stay
DISJOINT.** The console workspace's "missions" section renders the §5
demand-side intake store (`console-sections.ts` — a different store by
design, the P17 gap row 10 verdict). P18 does not merge them: the
payment-missions board is the agent-led plane's own surface inside the
agent experience. A future wave may reconcile the two mission stores;
P18 only names the distinction honestly in the panel's empty state.

## Consequences

- The operator can finally SEE the agent-led payment journey end-to-end:
  seed → intake → gates → preview → plan selection → approval state →
  attempt outcomes — every surface honest about the empty deployment
  (zero connected capability instances; INV-7 blocks the compile until a
  real connection observes a funding source).
- The ADR-0010 D2 boundary is narrowed, not abandoned: what was "the
  channel never sees the approval act" becomes "the channel sees the
  approval act only as an edge-pinned PREVIEW_UI_ACT with no artifact
  crossing" — the same invariants, now enforced at the channel edge
  instead of by absence.
- The dispatch act remains the last host-side authority step (carried
  forward with the execution lanes); an approved mission sits armed
  until a host-side dispatch consumes the artifact — the panel says so
  honestly.
- The barrel grows the missions composition surface (additive); the
  module-ownership report gains no new edges (the renderer composition
  consumes `@payswap/app` only — the existing exempted edge).
