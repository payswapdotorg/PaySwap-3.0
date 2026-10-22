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
