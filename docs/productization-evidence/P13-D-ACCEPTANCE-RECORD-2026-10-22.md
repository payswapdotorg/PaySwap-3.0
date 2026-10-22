# P13-D acceptance record — the agent-led payment UX wave (Issue #3)

- **Date**: 2026-10-22
- **Integrated tree**: `7c58351` (P13-A/B/C merged) + the P13-D journey/state
  commits (J20–J23 + the map/feature reconciliation)
- **Lanes accepted**: P13-A `57ca4d2` (composer + routing), P13-B `cedf3d4`
  (connection plane + Stripe test-mode machinery), P13-C `1913653`
  (payment mission runtime + authorization + reconciliation)

## The acceptance scope and its evidence tiers (the work-order law)

### TIER: CONTRACT (unit/contract batteries — all green)

| Battery | Result |
|---|---|
| `@payswap/surface` | 18 files / 219 tests (incl. the 22 agent-task contract tests from P13-0) |
| `@payswap/provider-runtime` | 18 files / 236 tests (46 net-new Stripe-adapter tests: declaration/capabilities/oauth-state/transport/probe — incl. secret-leak assertions + the SANDBOX/LIVE boundary) |
| `@payswap/desktop` | 21 files / 220 tests (20 connections-plane: never-ACTIVE, the seal, D3 bindings, restart stability; 16 mission-runtime: the full consequential path; 5 contract mirrors) |
| `@payswap/app` | 31 files / 338 tests (51 net-new: intent router, task session convergence, pin mirrors, composer UI + keyboard/a11y) |
| tsc (host / provider-runtime / app) | exit 0 |
| oxlint | 0 warnings / 0 errors on the changed files |
| architecture:check | 0 violations |

### TIER: BROWSER (the served production web build — Playwright)

- **87 passed / 1 known skip / 0 failed / 0 flaky** (desktop 1280×800 +
  mobile 390×844 projects).
- The P13 journeys J20–J23 (all @contract, gated at this TL integration):
  - J20 the composer on every surface + the pinned honest notes verbatim
    (zero authority, no tools, voice unsupported) + the chat law
    (secret-shaped text refused, no echo).
  - J21 Connections→Stripe card + "connect Stripe" text → ONE resumable
    setup task (RESUMED, never duplicated); the honest never-a-connection
    copy; Stripe the one declared provider.
  - J22 Pay-card + "pay the supplier" → ONE payment-intake task; checkout
    has NO card (no direction in the vocabulary); the honest UNKNOWN
    reply for unresolvable text.
  - J23 minimize→Escape→reopen keeps the draft; a full reload keeps the
    task list (restart resume, browser-profile tier).
- The map: `spec/productization/JOURNEY-MAP.md` §6 (J20–J23 + the deeper
  flows' contract-tier citations); the manifest + coverage + no-orphans
  law updated (23 journeys pinned).

### TIER: PACKAGED (the Ubuntu deb at the station — `delivery/p13-rc-verification/`)

- Production build of `e76bae5` (ZCODE_ENV=production both steps — the P12
  build law); deb SHA-256 `53586504…f82036`.
- Verified: production identity (WM_CLASS `('payswap','PaySwap')`,
  `_NET_WM_WINDOW_TYPE_NORMAL`, MOTIF decorations ALL, WM_PROTOCOLS),
  boot-to-ready ×5, the three required sizes (1280×720, 1024×768, 800×600)
  with reflow + the composer dock VLM-visible at every size, keyboard
  scroll round-trips BYTE-IDENTICAL at all three sizes, keyboard
  navigation home→/app (2 of 3 sizes; the 1024 tab drift recorded),
  WM_DELETE graceful quit, restart with durable state.
- Honest limitation (extends the P12 pointer finding): synthetic-key
  activation of BUTTONS is inert under the minimal WM (anchors activate);
  the composer's full interaction UX is proven at the browser tier with
  real input. Full record: `delivery/p13-rc-verification/VERIFICATION-RECORD.md`.

### TIER: LIVE — NONE (the credentials law)

No Stripe credentials exist in this station. The U1 real-flow E2E gate
(own-store test-mode restricted key → read-only probe → ACTIVE) is
**operator-gated** (ADR-0007 D1/D8): the machinery is complete and
fail-closed without credentials; the sandbox gate is NOT marked passed;
nothing is simulated.

## The shared-journey coverage vs the work order's list

- Connections→Stripe and chat→Stripe converging on the same durable setup
  task: **J21** (browser) + the connections-plane battery (contract).
- Browser return / interruption / retry / expiry / revocation: the D3
  state-binding battery (single-use, 10-minute, monotonic, expired refused
  honestly, user-denied recorded + resumable, revocation deletes the
  credential) — contract tier.
- Sandbox verification: the probe battery (CONFIRMED/UNKNOWN/FAILED paths,
  INV-25 mode binding, key-death detection without echoing provider text)
  — contract tier; the LIVE gate honestly open.
- Pay by button/text/voice: **J22** (browser; voice declared-unsupported).
- Missing-field clarification: the nine-field intake battery (ask order,
  fail-closed captures, INTAKE_INCOMPLETE refusals) — contract tier.
- Authorization block before preview approval: the NLP-origin refusal test
  + the artifact-free dispatch refusal + the full consequential path
  (preview → explicit PREVIEW_UI_ACT → dispatch) — contract tier.
- Resumed long-running task: pause/resume/restart stability + the
  interruption-recovery sweep — contract tier; the composer reload-resume
  — **J23** (browser).
- Authoritative confirmed/failed vs UNKNOWN reconciliation: the
  UNKNOWN→reconcile→CONFIRMED→COMPLETED path + the reconciled-attempt law
  — contract tier.
- PaySwap API/store and blockchain journeys using the shared task shell
  without conflating their auth models: the composer's zero-authority law
  (D7) pinned in every battery + J20's verbatim notes (browser).

## State

**P13-D COMPLETE. P13 REMAINS OPEN** per the work-order law: the
real-flow/sandbox gates are operator-gated on credentials that do not
exist in this station. The next wave (P14 or an operator-credentials
drop) picks up: the U1 real-flow E2E, the payment execution kernel
composition (the UNWIRED authority port), and the voice plane if ever
declared.
