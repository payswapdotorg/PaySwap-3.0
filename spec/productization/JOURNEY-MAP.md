# PaySwap Journey Map (Phase 9) — the canonical testable journey contract

Status: REGISTERED 2026-10-21 by the resident TL (operator handoff:
GitHub Issue #1). This is the cross-lane contract Lane A implements
(information architecture + navigation) and Lane C tests (acceptance
flows). Every journey maps to a REAL route, an accessible control, a
prerequisite state and an honest-state law. Where a journey is not
executable end-to-end in this configuration, the REQUIRED behavior is
the honest unavailable/setup-required state — never a fake success.

Routes follow PRODUCT-IDENTITY.md §3 (canonical route contract).

## 1. Primary journey map

| # | Journey | Entry route | Primary control | Prerequisite state shown | Honest-state law |
|---|---|---|---|---|---|
| J1 | First launch / getting started | `/` | "Open the product" CTA → `/app` | none (public) | positioning + honest gate expectation set BEFORE the click |
| J2 | Overview (authenticated) | `/app` | overview area | auth (honest gate when unauthenticated) | eleven-area map, designed-empty states with reasons |
| J3 | Send / pay / move money | `/app` → payments area | outcome action "Pay" | economic intake plane unconfigured → typed prerequisite | "Not yet dispatchable — action required" + what is missing + configure route |
| J4 | Receive money / recipients | `/app` → receive/recipients area | outcome action "Receive" | same as J3 | same honest law; no invented recipients |
| J5 | Convert / compare routes & quotes | `/app` → convert area | outcome action "Convert" | same as J3 | quotes only from real observations; none exist → truthful empty |
| J6 | Merchant checkout / acceptance | `/app` → checkout area | merchant surface | checkout plane wiring pending | setup-required state, never a demo store |
| J7 | Activity / progress / receipts / reconciliation | `/app` → activity area | activity list | no executed transfers → designed-empty | UNKNOWN ≠ FAILED; reconciliation copy where ambiguous |
| J8 | Providers / capabilities / permissions | `/app` → connections; `/capabilities` | connections + coverage | providerCount 0 → none listed as connected | providers never listed connected without recorded evidence |
| J9 | Opportunities / Lab insights | `/app` → opportunities area | opportunities list | advisory evidence only | simulation never production authority |
| J10 | Security / approvals / mandates | `/security`; `/app` → security area | security surface | commitments + mandate states | structural facts, not marketing |
| J11 | Reports / history | `/app` → reports area | reports list | designed-empty with reason | no fabricated history |
| J12 | Developer / API | `/developers` | developer surface | MISSING runtime config displayed | unconfigured state shown, not hidden |
| J13 | Settings / support / about | `/app` → settings; about | settings + about | — | PaySwap identity; upstream attribution present (legal/about) |
| J14 | Agent console (supporting capability) | `/console` (web) / console surface (desktop) | console link from product | auth | never the default landing; the PaySwap Agent Workspace per spec/surface/CONSOLE-WORKSPACE.md (P10); ZCode developer workspace = advanced interface at `/console/advanced` |
| J15 | Legacy `/payswap/*` URLs | `/payswap`, `/payswap/*` | redirect | — | permanent redirect to the new top-level route |
| J16 | Primary payment discovery | `/app/payments` | the typed action set (Pay / Receive / Move / Checkout — pinned alias anchors) | economic intake / merchant plane unconfigured → typed prerequisite per action | every action states dispatchability with its verbatim prerequisite + configure/learn routes; recipients honestly UNAVAILABLE; approvals → Agent Workspace; activity → ledger; convert → accounts cross-anchor; never a dead button |
| J17 | Onchain discovery | `/app/connections` → the onchain rail; `/app/accounts` (observation anchor) | the onchain rail block | no wallet / transport / signer wired | UNAVAILABLE rows with typed reasons; REFERENCE rows for declared contracts (fee provenance, simulation, state vocabulary incl. reorg + UNKNOWN); NO_OBSERVATIONS rows (balances, history); declared chain catalogue; synthetic venue packs labeled AS synthetic; nothing fabricated |
| J18 | PSP connection setup | `/app/connections` | the PSP setup steps + forms catalogue | provider connection plane not wired (providerCount 0) | a catalogue entry is never a connection; connect states its typed prerequisite (never a dead button / fabricated login); scopes + sandbox/live structural; health honest empty; lifecycle lawful |
| J19 | Advanced developer workspace access | `/developers` → `/console/advanced` | the advanced developer workspace entry | entry public; workspace is a live-backend surface | honestly labeled as the advanced developer workspace OF the PaySwap Agent Console; SPA routing (no renderer reload / durable-state loss); the Agent Workspace stays primary |
| J20 | Shared agent entrypoints — one composer, every surface | `/` → `/app` → `/app/payments` → `/app/connections` → `/app/accounts` → `/console` | the persistent, toggleable PaySwap agent composer (dock + panel) | none (standalone browser-profile mode, honestly labeled) | every entrypoint drives the ONE shared controller; zero-authority + no-tools + declared-unsupported VOICE notes verbatim; never a mic control; secrets refused before recording |
| J21 | Connections → Stripe and chat → "connect Stripe" converge on ONE setup task | `/app/connections` (agent-led setup section) | the Stripe connect cards + the composer text path | no provider connection exists (the honest empty) | card click + typed text → the SAME resumable CONNECTION_SETUP task (RESUMED, never duplicated); seeding connects nothing; Stripe is the one declared provider; U2/U3 state their exact missing operator configuration |
| J22 | Pay by button and text — the same payment-intake task; voice honestly unsupported | `/app/payments` (agent-led payments section) | the Pay/Receive/Move direction cards + the composer text path | no payment can dispatch (preview → authorization → execution is host-side) | Pay-card + "pay the supplier" seed the SAME PAYMENT_MISSION task; checkout has NO card (no direction in the mission vocabulary); starting a task pays nothing; voice never simulated |
| J23 | Composer durability — minimize/reopen and reload never lose context | any integrated surface | the dock/panel toggle + the browser-profile task store | the standalone persistence (honestly labeled: not synced, cleared with site data) | minimize returns focus to the dock keeping draft + transcript + tasks; reopen restores; a full reload preserves the task list (restart resume, browser-profile tier) |

## 2. Navigation IA law (Lane A)

- Primary tasks (J1–J9) are discoverable from `/` and the `/app` shell
  without scrolling-hunting: outcome actions first, provider/developer
  features reachable but not crowding the main flow.
- Every navigation item and visible action works; a non-executable
  capability shows its typed prerequisite + impact + configure/learn
  route.
- The console (J14) is reachable but visually secondary.

## 3. Acceptance flows (Lane C — the tested set)

Playwright browser flows (web, against a served production build of the
tested commit):

1. **first-launch**: `/` loads PaySwap-branded home; title/favicon/boot
   mark = PaySwap; zero console errors; hero + J1 CTA present.
2. **primary-navigation**: `/` → every top-level route renders its
   surface with correct title; nav is keyboard-traversable; focus
   visible; landmarks present.
3. **journey-entry**: J1 CTA → `/app` honest gate visible when
   unauthenticated; gate copy truthful.
4. **setup-required**: J3–J6 areas render typed prerequisites; no dead
   buttons; no fabricated live states.
5. **error-unknown**: app error boundary + unknown-state rendering
   verified (deterministic fixture or route-level check).
6. **settings-about**: J13 shows PaySwap identity + upstream attribution.
7. **no-zcode-branding**: normal user surfaces (J1–J13) contain no
   "ZCode" product branding (attribution in legal/about exempt).
8. **legacy-redirect**: `/payswap`, `/payswap/capabilities` redirect.
9. **responsive**: core flows at 1280×800, 1440×900, 390×844 — no
   clipped essential content, no broken nav.
10. **accessibility**: axe-core (or equivalent) pass on core pages for
    WCAG 2.2 AA critical rules; reduced-motion respected.

Install flows (verified on a clean Ubuntu environment against the
published release):

11. **deb-install**: download `.deb` → checksum verify →
    `sudo apt install ./<file>.deb` → launch → PaySwap-branded window,
    icon, menu entry; data path under PaySwap identity; no-provider
    launch shows truthful states.
12. **appimage-run** (if published): chmod +x → run → same checks.
13. **upgrade-uninstall**: install over/above, uninstall clean.
14. **release-page**: README links resolve to the real release assets.

Console flows (Phase 10 — verified against a served production build;
the desktop store path additionally verified by the station desktop GUI
inspection per CONSOLE-WORKSPACE.md §9):

15. **console-workspace**: `/console` renders the PaySwap Agent
   Workspace (PaySwap chrome + the eight-section navigation), zero
   console errors; returning to the product works without a renderer
   reload; unknown section paths render the workspace honest not-found.
16. **console-mission-lifecycle**: mission creation intake → structural
   validation findings rendered → draft recorded → intent recorded (the
   review step) → detail ladder (INTENT reached; downstream rungs
   verbatim typed prerequisites) → real event timeline → revise →
   archive.
17. **console-honest-empties**: agents/approvals/activity/lab sections
   render designed-empty states with typed reasons; no fabricated
   agents/approvals/activity/experiments; connections shows the honest
   no-provider state.
18. **console-advanced**: `/console/advanced` opens the developer
   workspace, clearly labeled as the upstream platform's developer
   interface; settings shows PaySwap identity + upstream attribution.
19. **console-a11y-responsive**: axe-core critical pass on the console
   sections (desktop 1280×800, mobile 390×844); keyboard traversal,
   visible focus, landmarks; reduced-motion respected.

## 4. Evidence obligations

- All browser flows: receipts at the exact tested commit (screenshots +
  structured results) — Lane C run at station/CI.
- Install flows: CI run URL + logs + station receipts — tied to the
  release tag.
- The user-journey matrix (this map + per-journey pass/fail) ships in
  the acceptance record; journeys not executable end-to-end are labeled
  unavailable/setup-required — the map is never marked wholly complete
  by a partial pass.

## 5. P12 reconciliation (Issue #2 — the desktop wave)

The P12 Lane C reconciliation of the map with the ACTUAL desktop routes
(every journey's steps name real routes/components — the manifest rows
in packages/journey-verification/journeys.manifest.ts are the
machine-checkable mirror, no-orphans enforced by specs/manifest.spec.ts):

- J1–J13, J15: unchanged — the P9 route contract holds on the desktop
  build (the desktop renderer loads the same @payswap/app surfaces;
  verified in the P11 packaged-app run).
- J14 + mission lifecycle: unchanged — the console mount stays the
  PaySwap Agent Workspace (ConsoleChrome + PaySwapAgentWorkspace + the
  mission ladder); the mission lifecycle flows remain the P10 set
  (console-mission-lifecycle.spec.ts).
- J16–J19 are the P12 journeys (all tier-2 @contract — the surfaces are
  Lane P12-C work, gated at TL integration on the merged tree):
  - J16 payments discovery: the typed action set on /app/payments
    (PaymentsAreaSurface; anchored pay/receive/move/checkout by the
    pinned alias table; recipients/approvals/activity/convert rows).
  - J17 onchain discovery: the onchain rail on /app/connections
    (foldOnchainRail + ConnectionsAreaSurface; the accounts observation
    anchor on /app/accounts — AccountsAreaSurface).
  - J18 PSP connection setup: foldConnectionsSetup + the forms
    catalogue on /app/connections (provider-runtime vocabulary pinned,
    mirror-tested against the sources).
  - J19 advanced workspace access: the /developers entry to
    /console/advanced (DevelopersPage), honestly labeled, SPA-verified.
- FEATURE-MAP.md (P12, NEW) is the capability survey that drove these
  surfaces: every capability family mapped to its real
  route/component/service with honest operational states.


## 6. P13 reconciliation (Issue #3 — the agent-led payment UX wave)

The P13 lanes (A: composer + routing; B: connection plane; C: payment
mission runtime) are integrated at the TL station. The map gains
J20–J23 (the composer journeys — all tier-2 @contract, gated on the
merged tree at TL integration, exactly as J16–J19 were in P12):

- J20 shared agent entrypoints: the composer on home/app-overview/
  payments/connections/accounts + the Agent Workspace
  (specs/agent-composer-surfaces.spec.ts).
- J21 connection convergence: the Connections Stripe card and the typed
  "connect Stripe" reach ONE resumable setup task
  (specs/agent-composer-convergence.spec.ts).
- J22 payment-intake convergence + honest checkout exclusion
  (same spec).
- J23 composer durability: minimize/reopen + reload resume
  (same spec).

The DEEPER connection and payment flows (key seal → verification probe
→ ACTIVE; the D3 provider-return discipline; the preview → explicit
scoped authorization → dispatch → UNKNOWN-reconciles path) run in the
DESKTOP HOST process — they are evidenced by the CONTRACT-tier
batteries, not by web journeys (the web renderer honestly runs the
composer's browser-profile store only):

- `packages/desktop/test/payswap/connections-plane.test.ts` (20 tests:
  the never-ACTIVE law, the credential seal, the D3 single-use
  10-minute monotonic state bindings, expiry/revocation, restart
  stability — Lane P13-B).
- `packages/desktop/test/payswap/payments-mission-runtime.test.ts`
  (16 tests: the full consequential path — preview → explicit
  PREVIEW_UI_ACT authorization → UNKNOWN → reconcile → CONFIRMED →
  COMPLETED; pause/resume/cancel/expire; restart + the recovery sweep
  — Lane P13-C).
- `packages/desktop/test/payswap/payments-contract-mirrors.test.ts`
  (the by-value pins vs the REAL @payswap/surface + @payswap/economic
  sources).
- `packages/provider-runtime/test/adapters/*.test.ts` (46 tests: the
  Stripe adapter contracts, the read-only verification probe, the
  secret-leak assertions — Lane P13-B).

EVIDENCE SEPARATION (the P13-D work-order law): the web journeys above
are BROWSER-tier evidence for the composer UX; the desktop unit
batteries are CONTRACT-tier evidence for the host planes; the packaged
Ubuntu app run (P13-RELEASE) is the SHIPPED-APP tier. NO LIVE-TIER
evidence exists in this wave: no Stripe credentials exist in this
station, so the U1 real-flow E2E gate stays operator-gated (ADR-0007
D1/D8) and P13 stays OPEN at close (the work-order law) — the sandbox
gate is NOT marked passed.

## 7. P16 reconciliation (Issue #6 — the loadable payment route planning routine)

The P16 lanes (A: route discovery contracts; B: counterfactual +
protocol semantics; C: opportunities + wait lifecycle; D: TL
integration) are closed at the CONTRACT tier. No new web journey is
claimed — the composer's route-planning panel is an honest PROJECTION
until the platform host binds the engine port — but the panel's own
laws are browser-tested, and the routine's engines are contract-tested
end-to-end:

- `packages/payswap-app/test/payswap/route-planning-session.test.ts`
  (12 laws: proceed is a REQUEST that never writes AUTHORIZATION_GRANTED;
  a match records OPPORTUNITY_MATCHED and the task STAYS WAITING;
  cancel/expire return to ACTIVE; determinism).
- `packages/payswap-app/test/payswap/route-planning-panel.test.tsx`
  (6 render laws: the separated sections, the honest notes verbatim,
  NO dispatch/execute/authorize button anywhere, the unbound engine's
  honest note).
- `packages/payswap-app/test/payswap/route-planning-acceptance.test.ts`
  (4 laws: pin fidelity REAL→PIN; the golden path present→proceed→wait→
  match STAYS WAITING with the REAL engines bound through the engine
  port — REAL trigger/manifest/corridor/compiler/scoring/lab/
  opportunities; byte-identical deterministic replays).
- `packages/route-planning/test/routine-composition.test.ts` (5 laws:
  the full offline/contract E2E — trigger→manifest→stages 2–5 REAL
  corridor+compiler→stage 6 REAL lab→stage 7 REAL opportunities,
  byte-identical receipts, unbound ports fail CLOSED).

EVIDENCE SEPARATION: these are CONTRACT-tier batteries. ~~The next
frontier (live-app engine binding + stage-9a desktop authority wiring)
is what would promote the panel to a real journey; nothing here claims
live-tier evidence.~~ **P17 PROMOTION (2026-10-26, commits
`fe89b6b`+`406f698`+`9868d24`)**: the panel is now a REAL COMPOSED
journey at the CONTRACT+BRIDGE tier — the desktop renderer composition
root binds the REAL engines behind `RoutePlanningEnginePort` at the
business-root init (ADR-0010 D1; the bridge-tier battery
`packages/desktop/test/payswap/route-planning-binding.test.ts` drives
the REAL channel members end-to-end: seed → nine-field capture →
presentPreview [BLOCKED typed over the honest empty environment, INV-7]
→ the engine's honest NO_VALIDATED_INTENT state; and the golden path
over the DI'd mission source → the REAL presented view → proceed
records the REQUEST + the stage-9a plan-selection on the mission
plane → byte-identical replays). Still NO LIVE-TIER claim: zero
connected capability instances exist, so no user-visible route
evidence exists in this deployment — the honest empty evaluation IS
the presented truth. The approval/observation UX over the newly
exposed mission plane remains the P14-carried frontier.

## 8. P18 reconciliation (the approval/observation UX over the exposed mission plane)

The P18 lanes (A: the approval members + the attempt-state projection;
B: the observation panels; C: the renderer composition + the bridge
battery) are closed at the CONTRACT+BRIDGE tier. The operator's
mission-observation journey is REAL over the desktop channel — and the
approval act crosses the channel lawfully (ADR-0011 D2):

- `packages/desktop/test/payswap/payment-approval-plane.test.ts`
  (12 laws: the verbatim scope echo, the typed no-preview/blocked
  failures, the APPROVE golden path + the artifact deep-scan, DECLINE +
  single-use, the origin-pin proof [a COMPOSER_TEXT decision is REJECTED
  by the gate with no effect; a grant through the member proves the
  edge pin], five attempt-outcome derivations, fail-closed).
- `packages/payswap-app/test/payswap/payment-missions-panel.test.tsx`
  + `payment-missions-seam.test.tsx` (21 laws: the honest states, the
  seam laws, the golden path over a fake port, the decline path, the
  TWO-ACT call-order law [no requestApproval → no resolveApproval],
  the six BLOCK reasons byte-identical to the real gates, the
  scan-clean law over 23 machine literals).
- `packages/desktop/test/payswap/payment-missions-binding.test.ts`
  (5 bridge laws over the REAL channel service: the honest empty
  environment [the preview BLOCKS typed through the port, INV-7;
  requestApproval fails TYPED — the honest unreachability], the golden
  path over the labeled test-tier gate environment [requestApproval
  echoes the persisted preview verbatim → resolveApproval grants with
  the scope echo, the artifact NEVER on the wire], the decline path,
  byte-identical deterministic replays, the plane-not-configured path
  [all seven members reject with the app's typed error]).

EVIDENCE SEPARATION: CONTRACT+BRIDGE tier, no LIVE-tier claim. The
approval machinery is REAL but unreachable in this deployment until a
real connection observes a funding source (INV-7 blocks the compile in
the honest empty environment — zero connected capability instances);
the bridge battery proves the golden path over a clearly-labeled
test-tier gate environment (the only replaced seam). The dispatch act
stays host-side by law (ADR-0011 D3): an approved mission sits ARMED
until a host-side dispatch consumes the single-use artifact — the
panel says so honestly. Carried forward: the dispatch surface + the
P14-carried execution lanes; live-provider route evidence; the
§5/payment-mission store reconciliation question.

**P19 DISPATCH LEG (2026-10-26, commits `7e79167`+`d493503`+`6d508e2`)**:
the authority chain's surface is now COMPLETE end-to-end — the armed
card (the scope echo, the absolute expiry instant, the lane radio
choices with ineligible lanes visible-with-reason, never hidden), the
TWO-ACT send (the send control stays disabled until a lane is chosen;
confirming fires dispatch with EXACTLY (missionId, connectionRef)),
and the honest states (NOT-ARMED with the verbatim reason + the path
back; NO-LANE — the typed prerequisite, never a fabricated lane; the
REFUSED/DISPATCHED outcome notes through the label map). The artifact
NEVER crosses the channel — not even as an input (the lane choice is a
CHOICE, the eligible set recomputed host-side at act time; an outside
connectionRef is a typed refusal with no attempt recorded and the
artifact intact). Bridge evidence
(`packages/desktop/test/payswap/payment-missions-dispatch-binding.test.ts`,
5 laws over the REAL channel): the honest empty truth (armed:true with
ZERO lanes over the empty registry; the typed act-time refusal), the
golden path over the labeled fixtures (the REAL connection session
authority with a seeded ACTIVE SANDBOX lane + the scriptedAuthority
CONFIRMED), the REFUSED unwired path, byte-identical replays, and the
artifact-never-on-the-wire scan. Still NO LIVE-TIER claim: zero ACTIVE
connections exist in this deployment (the resets destroyed the P13
provider credentials) — the golden path is fixture-proven only; the
provider execution lanes and the reconcile-with-evidence member stay
carried forward.

**P20 RECONCILIATION LEG (2026-10-27, commits `02ea4937`+`a4211624`+`e8e03deb`)**:
the journey's final honest state is now reachable AND closable — an
UNKNOWN attempt (a dispatch answering UNKNOWN, or an interrupted
write-ahead marked by the restart sweep) renders the pending-
reconciliation card, and the operator can close it with provider
evidence through the TWO-ACT entry (the pending-fact list, the
direction choice CONFIRMED|FAILED, the source choice from the
accepted-sources echo, the references entry; the confirm stays
DISABLED-UNTIL-VALID — never a guess, never a fabricated provider
effect). The runtime verb stays the ONLY closer (ADR-0013 D1): the
member recomputes the pending set host-side AT ACT TIME (an outside
attemptId is the typed refusal with nothing recorded); the evidence
bounds validate at the edge by the runtime's own bounds (source ∈ the
frozen two-kind vocabulary — the operator is the COURIER, not the
source; refs non-empty and bounded — "reconciliation never closes on a
bare assertion"); the origin (OPERATOR_EVIDENCE_ACT) + the principal
stay pinned host-side at the channel edge. The outcome carries facts
only (the addressing echo, the resolved direction, people-language
prose — the evidence refs NEVER echo as structure, they live in the
runtime record + the timeline prose). On CONFIRMED-of-a-create the
mission COMPLETES; on FAILED it stays open; a re-send against the
closed attempt is the honest append-only typed refusal. Bridge
evidence (`packages/desktop/test/payswap/payment-missions-reconcile-binding.test.ts`,
7 laws over the REAL channel): the honest empty truth (the empty
pending card with the note; a CONFIRMED dispatch leaves nothing
pending), the golden path over the labeled fixtures (the scriptedAuthority
answering UNKNOWN → the pending card → the reconcile through the PORT →
RECONCILED + the mission COMPLETED + byte-identical details; the
FAILED variant open), the act-time refusal (the record byte-identical),
the double-reconcile refusal, the scanner law. Still NO LIVE-TIER
claim: zero ACTIVE connections — real UNKNOWNs are fixture-only; the
automatic evidence feeds (the verified-webhook mapping + the retrieval
service) stay carried with the execution lanes (ADR-0013 D6).

## 5. The P21-D reconciliation (2026-10-28) — the web tier's post-strip truth

REGISTERED by the resident TL at the P21-D closure (ADR-0014 D10 — the
E2E law's web half). This section reconciles the map with the WEB
BUILD's truth since the P15 strip (spec/MIGRATION-FROM-ZCODE.md): the
web entry boots the ZCode substrate Root for EVERY pathname
(packages/web/src/substrateRoutes.ts — no route gate stands between
the browser and the Root); the pre-strip marketing/app shell this
map's §1 rows J1–J19 were authored against NO LONGER EXISTS in the web
build.

The reconciliation laws:

- **J1–J19 are RETIRED from the web tier** (their manifest rows carry
  the `retirement` field with the reason and the successor). The
  surfaces they drove — the PaySwap-branded home, the eleven-area
  `/app` shell, the capabilities/security/developers pages, the
  `/payswap/*` redirect, the browser-rendered Agent Workspace console
  — moved to the DESKTOP product tier (the PaySwap desktop app is the
  product; its E2E proof is the ADR-0014 D10 desktop tier — the
  Electron CDP harness). Retirement is a REGISTERED fact, never a
  silent deletion: the rows stay in the manifest with their reasons,
  and the nineteen spec files that drove them retired in the same
  change (journeys.coverage.ts carries the record).
- **J20–J23 (the composer laws) are RE-SCOPED to the substrate
  shell**: the composer mounts on every substrate surface (the dock,
  the one shared controller, the zero-authority/no-tools/voice notes,
  the secret-refusal chat law, the browser-profile durability). The
  pre-strip surface ENTRYPOINTS (the Connections connect-cards, the
  Payments direction cards) retired with the strip; where a law's
  substance was the card, the law is retired; where the substance is
  the composer itself (the text path, the convergence, the notes),
  the law stands and is proven green at the substrate routes.
- **J24 is REGISTERED (tier 1)** — the web tier's own journey: the
  task-tier agent journey ("Pay merchant X" → ONE task on the board →
  the model/difficulty controls' honest unbound-catalog note VERBATIM
  with ZERO model options → the mission tier's honest unbound note →
  the routine-stage and route-planning unbound notes → the record
  survives a full reload; the responsive 390×844 law). This is the
  ADR-0014 D10 web-tier deliverable: the task-tier journey + the
  honest unbound notes — the web build renders the task tier and
  states its gaps; the full bound journey (the pinned routine, the
  rail snapshots, the honest no-route, the dispatch, the read-back)
  is the DESKTOP tier's law.
- **The suite's serving shape**: the journey suite serves the REAL
  substrate HTTP server (packages/server entry-http) over the built
  dist — a static-only serve renders the app's own "Web bootstrap
  failed" report (the substrate Root fail-fasts its WebSocket
  connect), and "no mock-rendered page substitutes for the shipped
  workflow" (ADR-0014 D10). The one-shot build keeps the documented
  heap cap (1600MB — the OOM law).
- **The finding the E2E law caught** (fixed in the same change): the
  composer panel's tasks section collapsed to ZERO height whenever
  the sibling sections' min-content exceeded the panel's max-height
  (`flex: 1 1 auto` + `min-height: 0` on `.ps-agent-tasks`) — the
  task board rendered into scrollable overflow: a11y-present,
  invisible, unclickable. The panel now scrolls as ONE body (the
  `.ps-agent-panel-body` wrapper; the header and input stay fixed).
  This is the E2E law working as designed: the first DOM-level
  journey through the real built app caught a real product defect the
  controller-tier batteries could not see.

The living web-tier suite: tier-1 = J24 + the manifest enforcement
(7 tests green); tier-2 = the composer laws J20–J23 (8 tests green).
The desktop tier carries the product-surface journeys (ADR-0014 D10).
