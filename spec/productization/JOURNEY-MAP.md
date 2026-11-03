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

The desktop tier's CDP journey landed (2026-10-28, the P21-D closure):
the Electron CDP harness (scripts/p21/desktop-cdp-journey.mjs +
cdp-harness-lib.mjs) drives the REAL app end-to-end — the honest
zero-financial-authority note, the REAL session-model-catalog member
(zero options honestly — never fabricated), the nine-field guided ask
loop, the typed BLOCKED preview with all six gate reasons verbatim, the
derived stage checklist + the honest no-intent route note, and the
quit/relaunch persistence law (the task, the conversation and the DRAFT
mission all survive) — 9/9 PASS with screenshots + a machine-scanned
secret-free receipt
(docs/productization-evidence/p21-d-cdp-desktop-journey-RECEIPT-2026-10-28.json).
The E2E law caught three real product defects on the way (the
registration call-shape drop, the composition-root boot order, the
route-planning cache freshness) — each fixed and pinned by a test.

## 9. The P23-D reconciliation (2026-10-29) — the opportunity-card journeys

REGISTERED by the resident TL at the P23-D closure (ADR-0015 D10 — the E2E
law's desktop half extended with card-CONTENT assertions + the persistence
recheck; the wave's lane scope named this reconciliation). The
repair-discovery wave (P23) grew the route-planning journey with the three
advisory opportunity sections, and this section reconciles the map with the
journeys that now exist:

- **J24 GROWS (tier 1, web)** — the opportunity-emergence honesty law: the
  web tier's never-composed deployment renders the unbound-engine note
  VERBATIM (the P23-B-grown text naming the repair-discovery engines) with
  ZERO opportunity cards, ZERO advisory-section chrome and ZERO
  people-language card vocabulary (the same testid surfaces the desktop
  journey asserts content through). A card on web would be a FABRICATION —
  the composition requires the platform host's engines, absent BY DESIGN;
  the desktop tier carries the bound card-content journey.
- **THE DESKTOP OPPORTUNITY-CARD JOURNEY (the P23-D CDP emergence journey,
  scripts/p23/desktop-cdp-emergence-journey.mjs)**: the no-route corridor
  journey ("Pay merchant X" → the FLW-wallet funding over the seeded
  scripted-test-world connections → the nine-field intake → the typed
  BLOCKED preview with NO_ROUTE_FOR_CORRIDOR verbatim → the composer's
  route-planning view DISPLAYS the repair cards — 2 party changes + 4
  platform work items + 2 multi-hop hypotheses, ≥3 meaningfully different
  kinds, with the people-language preconditions, the DISTINCT platform
  prerequisites, the UNVERIFIED badges with the honest reasons, the wait
  naming the CONCRETE preconditions and the honest zero-model note → the
  Wait lands → the re-check surfaces the honest consent-gated typed refusal
  → the relaunch re-derives the SAME cards with the EQUAL view digest).
  12/12 PASS, a machine-scanned secret-free receipt
  (docs/productization-evidence/p23-d-cdp-emergence-journey-RECEIPT-2026-10-29.json,
  itself machine-verified by
  packages/desktop/test/payswap/p23-cdp-receipt-verification.test.ts) +
  10 screenshots. The zero-credential honesty: the connection state is
  PRE-SEEDED through the REAL member path over the SCRIPTED provider
  transport (the bridge battery's own six answers — the station holds no
  live keys and the probe transports hardcode the real endpoints); no live
  provider is contacted or claimed; the live-dispatch tier stays the
  a51a30c receipt's.
- **THE P21-0 D7 CONFLATION CORRECTED (recorded)**: the P21-0 gap matrix's
  D7 row credited "available-now routes presented separately from
  conditional opportunities" to the RoutePlanningPanel's distinct sections
  — but until P23 the "conditional opportunities" surface was the
  SCENARIOS-DIGEST list (the advisory counterfactual scenarios), NOT the
  opportunity cards (the reviewer's 2026-10-29 finding: the conditional
  opportunities were never displayed as actionable alternatives). The
  correction: the D7 law is TRUE as of P23-D (available-now first, then the
  three advisory card sections — conditionalOpportunities, platformWork,
  hypotheses — the A.7 order), and every E2E assertion is CARD-SHAPED and
  content-level, never satisfied by the scenarios digest.
- **THE E2E LAW'S CATCHES (fixed in the same wave, each pinned by a
  battery)**: (1) the chains-derived wait-recheck observations source built
  a non-canonical rail key (`fiat:Flutterwave` — the title-cased provider
  display name) so `discoverOpportunity` rejected every record and the
  source silently returned the EMPTY set while the chains were ACTIVE (the
  bridge battery's catch); (2) the substrate RPC serializer's Object
  branch threw on a nested BigInt (`bps: bigint` in the chains' cost
  models) so the `connectionCapabilityChains` reply was lost wholesale —
  the renderer's engine cache stayed empty, the rails derived 'unobserved'
  and the cards never composed (the CDP journey's catch; fixed by the
  marked string round-trip following the serializer's own
  nested-Uint8Array precedent); (3) the P23-B-grown unbound-engine note
  had drifted from the journey suite's verbatim pin (the tier-1 re-run's
  catch). The E2E law keeps working as designed: the DOM-level journeys
  catch real product defects the controller-tier batteries cannot see.

The living suites after P23-D: web tier-1 = J24 (4 tests, incl. the
opportunity-emergence honesty law) + the manifest enforcement — 9/9 green
across both projects; web tier-2 = the composer laws J20–J23 — 8/8 green;
the desktop tier = the P21 CDP journey (9/9) + the P23-D CDP emergence
journey (12/12) + the bridge battery + the no-bypass battery (the ADR-0015
D7 gate) + the emergence battery + the receipt machine-verification.

## 10. The P22-D reconciliation (2026-10-31) — the Stellar corridor journeys

REGISTERED by the resident TL at the P22-D closure (ADR-0016 D10/D12 —
the E2E law's desktop half over the seeded 3-provider corridor plane +
the browser tier's honest J-row; the wave's lane scope named this
reconciliation). The Stellar corridor wave grew the journey surface with
the cross-provider corridor, and this section reconciles the map with
the journeys that now exist:

- **J25 IS REGISTERED (tier 1, web)** — the corridor journey's honest
  web tier: a corridor-shaped ask (the MOVE stem — "Move one thousand
  cedis to a Kenyan bank account over the corridor") lands ONE task on
  the composer's board with its honest draft status; the mission tier's
  unbound note renders VERBATIM (no nine-field corridor intake is
  simulated on web); the route-planning section's unbound-engine note
  renders VERBATIM with ZERO corridor vocabulary — no corridor plan
  card, no leg rows, no custody chain, no issuer-scoped relay-asset
  sentence, no proceed control (the corridor composition is a
  platform-host binding absent from the web deployment BY DESIGN); the
  record survives a full reload. Two tests in
  specs/agent-corridor-tier-journey.spec.ts; the manifest's ordered pin
  grown 24→25 with the no-orphans law green in both directions.
- **THE DESKTOP CDP CORRIDOR JOURNEY (scripts/p22/desktop-cdp-corridor-journey.mjs,
  the p23 pattern)**: the 3-provider corridor plane (FLW GHS + Paystack
  KES + the Stellar testnet rail observing the issuer-scoped USDC)
  pre-seeded through the REAL member path over the scripted transport;
  the nine-field intake over the exact display-name matches; the honest
  typed BLOCK with the D11 corridor hop bound rendered ("at most 6
  hops" — the MOVE direction's own structural allocation); the
  remounted view's honest NO-ROUTE state over the seeded plane (the
  typed exclusions + the corridor-derived conditional + the platform
  work + the never-executable hypotheses); the wait + the consent-gated
  re-check refusal; THE NO-BYPASS LAW OBSERVED LIVE (the approval
  engage on the blocked preview refused GATES_BLOCKED verbatim —
  scope=0 armed=0 engage-dispatch=0 send=0); the persistence law (the
  byte-identical view digest across relaunch). 14/14 steps with the
  machine-verified secret-free receipt (the 6-test verification
  battery).
- **THE E2E LAW'S CATCHES (fixed at source, each a real integration gap
  the scripted-tier batteries could not see)**: (1) the onchain rail's
  capability definition was the thin connection-plane shape — now the
  FULL fourteen-part capability-model declaration; (2) the
  implementation's advisory corridors carried the asset codes as ISO
  currencies ("USDC" is not 3-letter) — now the asset-scoped truth with
  the currencies dimension absent; (3) the instance's refs were outside
  the closed vocabularies — now the registry's own connection ref +
  PROVIDER_DEFINED; (4) THE D11 HOP-BOUND LAW was never implemented in
  the REAL intent compiler (every direction got the direct-payment
  bound 1) — now MOVE/CONVERT ride CORRIDOR_MAX_ROUTE_HOPS=6.
- **THE HONEST TIER SPLIT (recorded, never blurred)**: the four-leg
  corridor plan card, the composite two-act approval and the per-leg
  scripted dispatch are the IN-REPO bridge battery's proof (e8106d4) —
  at the REAL app tier the route-planning engine's evidence bundle
  honestly derives no location observations, conversion rules or routing
  hints from the chains, so the corridor compile honestly yields
  NO_COMPILABLE_ROUTE and the no-route state IS the real-app truth.
  THE ENGINE-TIER CORRIDOR COMPOSITION (the chains-to-evidence
  derivation) is the NAMED CARRY-FORWARD the receipt records.
- **THE FLUTTERWAVE SIX-FACT RECLASSIFICATION (the operator's
  north-star order, landed)**: provider capability, PaySwap
  implementation, account entitlement, environment, observed health and
  PaySwap authorization are SEPARATE facts. Every live surface that
  claimed Flutterwave is read-only "by its own nature" now names the
  IMPLEMENTATION fact (PaySwap's adapter implements read-only classes
  only) and discloses the provider's documented transfer API as a
  capability input this deployment has not implemented, entitled or
  observed. The GHS collection leg is not asserted executable until its
  exact operation and read-back are implemented and proved. The
  historical records (ADR-0014 D7, the P21/P22 gap matrices, the P21
  acceptance record, the on-disk receipts) stay untouched — the
  reclassification lands as the live-surface correction + this record.
- **THE PLATFORM WORK ITEM platform:cross-provider-route-shape IS
  DELIVERED (the docs-tier flip)**: the cross-provider-corridor shape
  (P22-C) + its composite execution (P22-D) compose over the OBSERVED
  onchain middle; the residual gap the row names is the unobserved
  middle and the ENGINE-TIER corridor composition (the carry-forward),
  never a missing vocabulary. The code-side record stays OPEN by design
  (advisory-only).
- **THE LIVE TIERS stay the standing operator action** (the closure
  policy's named gate): the live Stellar testnet READ tier harness is
  in place at scripts/p22/rail-evidence-live-stellar.ts (operator-gated
  on STELLAR_TESTNET_PUBLIC_KEY + STELLAR_TESTNET_SECRET_KEY — exit 2
  verified live with no keys on this station); the live PSP tiers stay
  the a51a30c rail-evidence receipt's. Never a silent pass.

The living suites after P22-D: web tier-1 = J24 (4 tests) + J25 (2
tests) + the manifest enforcement — 11/11 green across both projects;
web tier-2 = the composer laws J20–J23 — 8/8 green; the desktop tier =
the P21 CDP journey (9/9) + the P23-D CDP emergence journey (12/12) +
the P22-D CDP corridor journey (14/14) + the corridor bridge battery +
the no-bypass battery (the ADR-0016 D7 gate) + the receipt
machine-verification (the p23 + p22d batteries).

## 11. The P24-D reconciliation (2026-11-01) — the Stripe conversational connector journeys

REGISTERED by the resident TL at the P24-D closure (ADR-0017 D8/D9/D10
— the handoff §12 verticals on the tier available; the closure policy's
named gate — one genuine end-to-end conversational Stripe flow — met at
the composition tier, honestly labeled; the real Sandbox and real-model
tiers stay OPERATOR_GATED, never renamed). The five handoff journeys,
each with its honest tier split:

- **JOURNEY A (create customer/product/price + payment link)** — the
  two-phase action law E2E at the composition tier: the model proposes
  through `stripe.prepare_action` → the host mints the digest-bound
  prepared action over the REAL census/validator (the P24-2 wiring
  recipe lifted to production) → the EXACT preview pauses the loop →
  the human confirms (the pinned phrase table; STRONG tiers never
  confirm conversationally) → the host-minted single-use authorization
  → the REAL transport dispatch (v1 form encoding, per-connection
  Stripe-Version, Idempotency-Key on the operation's class) → CONFIRMED
  with the authoritative read-back route + the append-only audit. The
  multi-step dependency order (product → price → link) and the partial
  failure compensation law are the P24-3 loop battery's domain. REAL
  Stripe Sandbox: OPERATOR_GATED on STRIPE_SANDBOX_SECRET_KEY +
  STRIPE_SANDBOX_WRITES_ENABLED=1 through the P24-1 harness TIER 2.
- **JOURNEY B (inspect and reconcile payments)** — the read path: the
  D9 permission-filtered domain registry (READ_ONLY + dispatchable +
  the connection's verified RAK scopes), the bounded pagination (the
  P24-1 contracts), INV-04 TIMEOUT_UNKNOWN on undelivered reads (never
  FAILED). The E2E round trip at the composition tier proves the full
  chain (the registry → the channel read member → the seal → the
  transport → the model's answer over the bounded result). Real
  yesterday's-payments totals: OPERATOR_GATED (a real account's
  PaymentIntents).
- **JOURNEY C (refund with exact confirmation and UNKNOWN handling)** —
  the FINANCIAL_IRREVERSIBLE class + the tiered confirmation table +
  the INV-04 UNKNOWN-after-dispatch law with the read-back-only
  reconciliation (the P24-2 execute battery: consume-before-dispatch,
  replay refused, expiry dead). Real refunds: OPERATOR_GATED.
- **JOURNEY D (Connect seller onboarding and payout health)** — U3
  (marketplace-connected-accounts) is declared UNCONFIGURED with the
  exact missing operator configuration; the account-context resolver
  refuses it typed (never ACTIVE from a redirect alone); a connected
  seller is never simulated. The journey's honest current form is the
  refusal itself (the account-context battery).
- **JOURNEY E (conversational model tool integrity)** — the closure
  policy's named gate, MET: the E2E conversational round trip at the
  composition tier (agent-conversation-plane.test.ts) — the REAL shared
  controller over the production binding (both shared seams bound as
  main.tsx binds them), the persisted selection invoked VERBATIM through
  the substrate surface (workspace/generateText: the CLI worker holds
  every credential; no reasoning content crosses), the registered tool
  called, the host answer returned, the final answer recorded in the
  append-only log. The bounds (max steps, byte budgets, timeouts,
  cancellation, resume) are the P24-3 loop battery's; the no-bypass
  laws (the model can reference but never mint an authorization; the
  digest change refuses; the account switch invalidates) are pinned by
  the P24-3 + P24-2 batteries.
- **THE DESKTOP COMPOSITION BINDING (the wave's named integration)** —
  the renderer-tier AgentConversationPlane now binds the REAL host
  plane: agentModelTurn over the substrate agent service's
  generateWorkspaceText + the thirteen stripe members over
  composeStripeActionPlane (the REAL provider-runtime census/validator/
  transport by workspace-source path — the P17-C rootDir precedent
  applied to the host tsconfig) + the executor over the product
  connection plane (the seal, the verified-evidence account context,
  the RAK binding, the api-version state, the durable store). The web
  tier binds nothing — the honest unbound notes render VERBATIM (the
  web honesty law; the P24-3 unbound-tier tests).
- **THE HONEST TIER SPLIT (recorded, never blurred)**: the composition
  tier's scripted model + scripted fetch are the IN-REPO proof; the
  REAL tiers stay the standing operator actions — (1) the real
  conversational journey over a live substrate agent runtime (the
  model plane answers through the real CLI worker; turn-level
  granularity disclosed), (2) the real Stripe Sandbox journeys through
  the P24-1 harness TIER 2 (operator-gated on credentials), (3) the
  Electron CDP receipts (the p22/p23 pattern, held for the operator's
  desktop verification pass). Never a silent pass.

The living suites after P24-D: the composition battery (11 laws — the
census/pagination facts, the two-phase CONFIRMED over the real
transport, the selection-verbatim + tool-choice laws, the absent
postures, the renderer binding + the honest unbound, the E2E round
trip) + the P24-3 composer suites (the loop, the wiring, the log, the
prepared-action flow, the tool registry/runtime/output) + the P24-2
host suites + the P24-1 provider-runtime suites — merged tree 1,956
passed + 7 skipped across the three package batteries (provider-runtime
34f/516t+5sk · desktop 79f/676t+2sk · payswap-app 66f/764t), +46 over
the lane-acceptance base.

## 12. The P25 full-coverage reconciliation (2026-11-02) — everything Stripe can do, through PaySwap

REGISTERED by the resident TL on the operator's direct order ("do an in
depth audit to make sure everything that can be done in stripe can be done
through payswap once the user connects his stripe account; research ways to
fill in the gaps emerged by the audit; write a report on the whole thing;
implement all the suggestions from the audit"). The wave's record is
`P25-0-COVERAGE-AUDIT-2026-11-02.md` (this productization directory) — the
audit, the gap register G1–G12, the researched fills, the deep-dive catches
and the honest boundaries, all in one document.

- **THE AUDIT'S HEADLINE**: at P24-D the connector dispatched 46 of 644
  catalogue operations (7.1%) — the plumbing (validator, transport,
  two-phase executor, RAK, idempotency) was already operationId-parametric,
  but the P24 overlay deliberately gated a reviewed 74-operation surface.
  The honest answer to "can everything be done" was NO.
- **THE P25 SURFACE LAW (the flip)**: the dispatchable surface is now a
  RULE, not a hand-list — every catalogue operation dispatches EXCEPT the
  thirteen held (the credential-admin set + the secrets-law path prefix +
  the reviewed secrets-in-response holds), with IMPLEMENTED_WITH_LIMITS
  marking the three honest limit classes (account entitlement 122 ·
  test-mode helpers 41 · the file-size bound 1). **631 of 644 (98.0%)
  dispatchable**: 284 of 285 reads, 347 of 359 writes, 31 of 32 v2.
- **THE DEEP-DIVE CATCHES (live bugs the audit found while filling G4)**:
  the create-secret escape (`PostAppsSecrets` — a 3-segment path whose
  family derives `apps`, silently past the `apps/secrets` family table;
  fixed with a path-prefix law), five more secrets-in-response surfaces
  (ephemeral keys ×2, customer sessions, terminal connection tokens, the
  v2 account-links twin, the `GetAppsSecretsFind` reveal — all held
  fail-closed), and the under-classified money-mover (`PostTerminalRefunds`
  — a REAL refund at CONFIRM; reclassified FINANCIAL_IRREVERSIBLE at
  STRONG_CONFIRM via the plural-`refunds` path token).
- **THE NEW CAPABILITIES**: multipart file upload (the `file` parameter
  rides base64 through the digest, decoded to a binary part at the wire —
  IMPLEMENTED_WITH_LIMITS at the 100k-char parameter bound ≈ 75 KB), the
  rule-derived read-back routes (the derivation reproduces all 18 reviewed
  P24 routes with zero divergence; 292 verified + 55 honest one-shot
  nulls across 347 dispatchable writes), and the intent filter's ≥3-char
  threshold (`tax`, `core`, `apps` intent-match again).
- **THE GENERATED TOTALITY BATTERY (the flip's proof)**: for EVERY one of
  the 631 dispatchable operations — synthesized minimal valid parameters
  from the committed schema records, strict validation, the fake-transport
  wire (method, substituted path, body shape, Idempotency-Key exactly for
  v1 state-changing POSTs), and the unknown-parameter refusal BEFORE the
  wire. Deterministic, no network, no hand cases.
- **THE HONEST BOUNDARIES (restated, unchanged)**: Sandbox-only by law
  (live keys refused, INV-25/D14); the real tiers stay OPERATOR_GATED
  (real Sandbox credentials, the live substrate runtime, Electron CDP);
  RAK scope filtering and account entitlement decide per connection; the
  v2596 pin boundary; the thirteen holds are recorded decisions, never
  omissions.

The living suites after P25: provider-runtime 35f/528t+5sk (+1f/+12t over
P24-D — the totality battery's four laws + the rewritten census/transport
laws) · desktop 676t+2sk (the fixtures rebased onto the held set) ·
payswap-app 764t (the honest discovery note). The frontier returns to
EMPTY; the next wave is the operator's to name.

## §13 — The P26 reconciliation (2026-11-03): Dashboard parity, the re-authentication flow, the key-ready real tier

The operator's takeover order defined P26 by three proofs. Their honest state at closure:

**JOURNEY F — the REAUTH tier made honest (ADR-0018, LANDED).** A model proposal for an account-link/session operation (PostAccountLinks / PostAccountSessions / PostV2CoreAccountLinks — un-held 631→634, held 13→10) prepares through the ordinary two-phase contract; the card renders the REAUTH step; the operator re-enters the connection's credential through the host security field; the host verifies it by a LIVE GetAccount probe against the SAME account (mismatch = typed refusal), mints the digest-scoped, single-use, 10-minute proof, and the executor consumes it DURABLY BEFORE dispatch. A chat reply still never confirms this tier (the phrase law unchanged). THE CATCH the closure records: un-holding the v2 twin exposed a CONFIRM-tier misclassification masked at P25 by the override hold (family 'core' escapes the credential-admin table) — fixed at source with the reviewed path-prefix law and pinned by the census test. The per-tier anti-drift assertions landed (the P25 prose drift can never recur silently).

**JOURNEY G — the Dashboard mapped (P26-0, LANDED).** The parity matrix (spec/productization/P26-0-DASHBOARD-PARITY-MATRIX-2026-11-03.md) joins Stripe's own documentation (~100 pages, cited) to the totality-checked census partition (644 ops / 149 families / 21 areas, reproducible via scripts/p26/dashboard-parity-facts.ts): 19 Dashboard-only capability classes have NO public API (API keys, team/2FA, Radar rules, event resend, self bank/payout-schedule, …) — irreducible, named `STRIPE_DASHBOARD_ACTION_REQUIRED`, never scraped; the account-gated and ergonomics divergences are recorded both directions. 644 API operations ≠ 644 Dashboard features, and neither set contains the other.

**JOURNEY H — the real-Sandbox tier made runnable (P26-B, LANDED KEY-READY; THE RUNS ARE THE STANDING OPERATOR ACTION).** The harness family (scripts/p26/a1-catalogue-real-sandbox-journey.ts) exercises four gates over the REAL transport — the read journey, the API-version A/B (the P26-C migration's evidence path), the double-gated write journey with its derived read-back, and the re-auth probe law — under the receipt law (env-only key, secret-scan refuse-to-emit, exit 2 without credentials, verified live at the station). The operator run card names the exact supply path. No key exists at any operator store at closure (D-6): the tier marker stays OPERATOR_GATED, never a silent pass.

The version migration (P26-C, LANDED): the per-connection `migrateRequestApiVersion`/`revertRequestApiVersionToLegacy` verbs with durable provenance and the wiring twin proving endive on the wire ONLY for a migrated connection — the default stays 2025-08-27.basil until the operator orders the flip. The auto-walk affordance (G11) closes as UX: the opt-in 10-page bounded walk with honest truncation notes.

The takeover defects D-1..D-6: D-1 and D-2 FIXED at registration (the hermetic tsc + governance drift gates GREEN again); D-3 CORRECTED (the audit appendix + the per-tier census assertions); D-4 FIXED (work-orders reconciled); D-5 superseded (this wave writes the classic acceptance record); D-6 the standing operator action (the run card).

The living suites after P26: provider-runtime 35f/529t+5sk · desktop 80f/696t+2sk · payswap-app 66f/776t · the three desktop scoped tsc gates 0/0/0 · architecture 0/0 · oxlint 0 errors. The carry-forwards: the attachment plane, the response-surface secrets sweep, ADR-0019's live activation bundle, the official-MCP lane, the re-pin path, the live substrate runtime + the Electron CDP receipts. The frontier returns to EMPTY; the next wave is the operator's to name.

## §14 — The P27 reconciliation (2026-11-03): the multi-provider capability network

The operator's order defined P27 as MORE legitimate sender-to-recipient journeys — composed from existing legal capabilities, never laundering through decomposition (INV-30, the wave's law). The honest state at closure:

**JOURNEY I — the U2/U3 Connect journey (P27-A, LANDED; the §B operator items gate the real tier).** The delegated-OAuth machinery (single-use signed expiring state, the secret-only-in-basic-header token exchange, the fail-closed parser) and the Connect platform/connected-account lifecycle (the gates with dated live-doc observations incl. the standard-accounts deprecation and the 2026-10-28.endive census gap recorded fail-closed, REAUTH-gated Account Links, monotonic identity binding, INV-04 reconcile, whsec-gated webhooks, the charge/transfer/payout topology with MoR/liability records and the INV-30 purpose gate) are real and composed at the host edge (seam A: the station env-keyed credential source, the durable §B.2 operator-decision channel, the REAUTH plane, the session-authority registration). Both connection forms stay honestly UNCONFIGURED + KEY_READY — §B (the platform application registration, the redirect/webhook endpoints, the account-model and charge-model/liability decisions) is the operator's, never satisfiable by code.

**JOURNEY J — the Global-Payouts journey (P27-B, LANDED; OPERATOR_GATED on entitlement).** A separately-entitled product slice over the pinned census — never an alias of ordinary payouts, Connect transfers or PaymentIntents (the never-alias law is machine-enforced at the plan factory AND the executor edge, with the honest test that every forbidden alias is itself a real pinned dispatchable operation). The ten-gate eligibility chain (purpose → INV-30 → P2P licences+written approval → origin GA/preview → Treasury entitlement → funding → recipient market → currency → method → amounts) answers exactly ELIGIBLE / OPERATOR_GATED / REFUSED on dated evidence; the journey executes over the pinned v1 Treasury family with the REAUTH-tier hosted recipient form and the STRONG_CONFIRM third-party outbound payment. The Ghana corridor stays the K1 conditional opportunity (H2 27 roadmap label on the refusal, never a route). The TL's pin decision is recorded: KEEP the v1 Treasury pin — the live docs' v2 money_management surface (16 doc-named operations) is a reviewed pin change away, never a silent expansion; the tier-drift (census CONFIRM vs product STRONG_CONFIRM, stricter-of honored) and the unpinned-adjacent operations are typed records. The desktop REAUTH proof seam is wired (seam B): verify + consume BEFORE the wire, the durable entitlement channel the ONLY proof source.

**JOURNEY K — the Paystack Africa journey (P27-C, LANDED; K3/K4 gate the recipient facts).** The typed recipient plane (the candidate vocabulary as NAMES ONLY, the dated-evidence registry that ALONE admits a type, the fail-closed request builder refusing every unverified triple), the collection surface (initialize answers the provider's hosted page — a REQUEST the customer authorizes there; verify pays ONLY on the provider's own success word), the webhook machinery (HMAC-SHA512 over the raw body, constant-time, the event-key single-use law), and the OTP/finalize transfer lane with the INV-30 purpose gate at both seams. The registry SHIPS EMPTY — paystack.com was station-unreachable through thirteen honest attempts (the typed record); the evidence lands only as re-verified dated observations (the c1 harness's evidence-pack gate is the interface). The corridor's KES arrival is composed (seam C): the evidence gate FIRST — the shipped EMPTY registry answers the typed conditional, never a route; with a verified (KE, KES) observation the REAL merchant association composes. The read-only connection scope never widened (D4).

**JOURNEY L — the multi-node journey (P27-D, LANDED; the network ships EMPTY by law).** The node-network intelligence layer: accountable enrollment (legal principal + jurisdiction + roles, Ed25519-signed), signed expiring revocable capability offers (INV-13: an offer is a candidate FACT, never an entitlement — the accepting authority's own ACTIVE instance + AVAILABLE ELIGIBLE observation is decisive), the bounded graph search with truncation receipts + hard gates before ranking + the mandatory direct baseline, and the per-leg saga extending ADR-0016 D13 (one immutable route digest, per-leg authorization shares, idempotency, UNKNOWN stops dependents). THE NO-BYPASS BATTERY makes INV-30 machine-asserted: P2P through five commerce-labelled legs across three admitted nodes stays REFUSED; a sanctioned middle hop two hops away refuses the whole route; the governing class is the max rank over intent + every leg; the direct baseline rejects inferior multi-leg plans; a positive control proves the gates are real. The composite-act seam (D2) binds the saga into the dispatch runtime — each leg its own command on its own lane, compensation projections honest.

**THE TL CLOSURE (P27-E, LANDED).** The four-branch merge (B → C → A → D, conflicts resolved per the D12 ownership table) + the TL's own merged-tree batteries (below) + the shared-file integrations (the INV-30 status note citing the no-bypass coverage map · MODULE-OWNERSHIP.yaml node-network + the seam-B/C composition annotations · the ci.yml matrix growth · the composition-root bindings · the A/B/C/D seam wirings · the P26 harness positional-args fix) + the five composition seams (A the connect plane · B the Global-Payouts plane · C1/C the Paystack Africa corridor · D1/D2 the node-network + saga bindings) + this closure.

The living suites after P27 (the TL's own merged-tree run): provider-runtime 46f/680t+6sk · desktop 92f+2sk/839t+2sk + tsc trio 0/0/0 · payswap-app 69f/800t · capability 20f/255t · route-planning 31f/362t · node-network 9 suites/94t · merchant 26f/365t · route-compiler 375t · opportunities 325t · protocol 279t (the untouched trio EXACT) · provider-runtime hermetic tsc 0 · architecture 0/0 · oxlint 0 errors/384 warnings (the pre-merge baseline) · invariants pass · governance 28/28 · ownership 53 (0 new) · all four harnesses exit 2 without credentials; the a1 wiring dry-run exit 0 (5 GREEN + 2 honest SKIPPED). The carry-forwards: the run card §A–§E operator actions (the standing Stripe sandbox re-supply, the U2/U3 platform registration, the Global-Payouts entitlement, the Paystack per-country accounts, any P2P/remittance model approval), the K1/K2/K3/K4 re-verifications at the entitled accounts, the v2 money_management re-pin decision, ADR-0019's live activation bundle. The frontier returns to EMPTY; the next wave is the operator's to name.
