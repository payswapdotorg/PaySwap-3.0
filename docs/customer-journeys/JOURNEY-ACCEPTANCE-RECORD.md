# PaySwap Journey Acceptance Record (J1–J15)

Status: SKELETON authored by the P9-C lane (base `e6ed008`) — the
verdict matrix is UNTESTED at lane time by design. The TL fills each
verdict cell from the TL's own runs on the integrated tree; a lane
worker never fills a verdict.

Authorities: `spec/productization/JOURNEY-MAP.md` (the map), 
`spec/productization/PRODUCT-IDENTITY.md` (§3 route contract, §5 honesty
laws, §6 the four separate gates), the P9-C work order
(`delivery/packets/pkt_p9-c.md`).

---

## 1. THE RECORD'S LAW (never wholly green by fiat)

1. A journey is **COMPLETE** only with its own green evidence: a run of
   `@payswap/journey-verification` (tier 1 + tier 2 as applicable) at an
   exact commit, or the install-verify runner's PASS receipt at an exact
   release tag. No evidence, no verdict.
2. A journey that cannot execute end-to-end in this configuration is
   labeled **SETUP-REQUIRED** (or **UNAVAILABLE** when the surface does
   not exist yet) — never marked complete, never hidden. The honest
   unavailable state IS the required behavior (JOURNEY-MAP preamble).
3. **The matrix is never wholly green by fiat.** A partial pass is
   recorded as a partial pass; the record never claims the whole map is
   verified from a subset of journeys.
4. The four productization gates (PRODUCT-IDENTITY §6) are SEPARATE:
   brand/UX implemented, GitHub installer published, clean-install
   verified, core journeys verified. None implies another; this record
   is the evidence organ of the fourth and cites the others'.
5. UNKNOWN is not FAILED, installability is not financial liveness, and
   an unexecuted flow is not a passed flow — in this record as on every
   surface.

---

## 2. The journey verdict matrix (J1–J15)

Legend — VERDICT values the TL may write: `PASS` (own green evidence
cited) · `FAIL` (cited failing evidence) · `SETUP-REQUIRED` (journey
honest-unavailable: the typed prerequisite is the outcome) ·
`UNAVAILABLE` (surface does not exist in this configuration) ·
`UNTESTED` (default — no verdict without evidence).

Tier: `1` = base-green coverage exists via the base surface
(`/payswap/*` at the P9-C base); `2` = contract-only (the P9-A route
space; `@contract` tests gate at integration).

| # | Journey | Contract route | Tier | Lane evidence (tier 1 @ e6ed008) | Integration gate (@contract) | VERDICT | Verdict evidence |
|---|---|---|---|---|---|---|---|
| J1 | First launch / getting started | `/` | 1 | first-launch.spec.ts (3 tests) | first-launch.spec.ts (2 @contract) | PASS | TL run @ 9f09387 (43/1/0 full suite; the VERDICTS section) — first-launch specs: identity, hero, CTA, honest-gate note, zero console errors; re-run @ 4137bf6 (65/1/0) |
| J2 | Overview (authenticated) | `/app` | 1 | journey-entry.spec.ts (3), navigation.spec.ts (1) | journey-entry.spec.ts (2), navigation.spec.ts (1) | PASS | TL run @ 9f09387 — eleven-area map behind the honest auth gate; designed-empty reasons verified |
| J3 | Send / pay / move money | `/app` → payments | 1 | setup-required.spec.ts (3) | setup-required.spec.ts (1) | SETUP-REQUIRED | TL run @ 9f09387 — typed prerequisite rendered (economic intake unconfigured); the REQUIRED honest behavior, verified |
| J4 | Receive money / recipients | `/app` → receive | 1 | setup-required.spec.ts (3) | setup-required.spec.ts (1) | SETUP-REQUIRED | TL run @ 9f09387 — same class, verified |
| J5 | Convert / compare routes & quotes | `/app` → convert | 1 | setup-required.spec.ts (3) | setup-required.spec.ts (1) | SETUP-REQUIRED | TL run @ 9f09387 — same class, verified |
| J6 | Merchant checkout / acceptance | `/app` → checkout | 1 | setup-required.spec.ts (3) | setup-required.spec.ts (1) | SETUP-REQUIRED | TL run @ 9f09387 — same class, verified |
| J7 | Activity / progress / receipts / reconciliation | `/app` → activity | 1 | error-unknown.spec.ts (3) | error-unknown.spec.ts (1) | PASS (surface) / SETUP-REQUIRED (live data) | TL run @ 9f09387 — the not-found fix verified here; UNKNOWN≠FAILED copy present; no fabricated history |
| J8 | Providers / capabilities / permissions | `/app` → connections; `/capabilities` | 1 | navigation.spec.ts (1), branding.spec.ts (2) | branding.spec.ts (1), accessibility.spec.ts (1) | PASS (coverage surface) / SETUP-REQUIRED (connections) | TL run @ 9f09387 — providers never listed connected without evidence, verified at providerCount 0 |
| J9 | Opportunities / Lab insights | `/app` → opportunities | 1 | journey-entry.spec.ts (eleven-area map) | (via the /app shell coverage) | SETUP-REQUIRED | TL run @ 9f09387 — advisory-only labeling verified |
| J10 | Security / approvals / mandates | `/security`; `/app` → security | 1 | error-unknown.spec.ts (1), branding.spec.ts (2) | branding.spec.ts (1), accessibility.spec.ts (1) | PASS | TL run @ 9f09387 — non-custody commitments surface verified |
| J11 | Reports / history | `/app` → reports | 1 | journey-entry.spec.ts (eleven-area map) | (via the /app shell coverage) | SETUP-REQUIRED | TL run @ 9f09387 — designed-empty verified |
| J12 | Developer / API | `/developers` | 1 | navigation.spec.ts (1), branding.spec.ts (2) | branding.spec.ts (1), accessibility.spec.ts (1) | PASS | TL run @ 9f09387 — MISSING runtime config displayed, not hidden — verified |
| J13 | Settings / support / about | `/app` → settings; about | 1 | settings-about.spec.ts (1), branding.spec.ts (2) | settings-about.spec.ts (1), branding.spec.ts (1) | PASS | TL run @ 9f09387 — PaySwap identity + preserved upstream attribution verified (the attribution exemption is structural) |
| J14 | Agent console (supporting capability) | `/console` | 2 | — (contract-only at base) | navigation.spec.ts (2); console-workspace.spec.ts, console-mission-lifecycle.spec.ts, console-honest-empties.spec.ts, console-advanced.spec.ts, console-a11y-responsive.spec.ts (P10-D lane @ 94f1445, flows 15-19) | PASS | TL run @ 4137bf6→94f1445 (web build, both viewports): 65 passed / 1 skipped / 0 failed incl. all console flows; the twelve evidence screenshots at test-results/evidence/ |
| J15 | Legacy `/payswap/*` URLs | redirect | 2 | — (contract-only at base) | legacy-redirect.spec.ts (3) | PASS | TL run @ 9f09387 — permanent redirects verified (all four legacy routes + unknown legacy); re-verified in the P10 run @ 4137bf6 (65/1/0) |

The matrix's machine-checked mirror: `packages/journey-verification/
journeys.manifest.ts` + `journeys.coverage.ts` + `specs/manifest.spec.ts`
(the no-orphans cross-check — an orphan journey or an unjourneyed test
fails the suite in both directions).

**Cell-reconciliation note (TL, 2026-10-21, post-release audit):** the
J1–J13 and J15 cells above were found still reading the skeleton's
`UNTESTED` after the TL's runs had filled the VERDICTS section below —
the stale cells UNDER-reported real verified state (the exact inverse
of the never-fiati-green law; a stale cell is as dishonest as a fake
one). Reconciled to the VERDICTS section's own evidence; vocabulary
maps one-to-one (the section's "COMPLETE" is this legend's "PASS";
"SETUP-REQUIRED (honest)" is "SETUP-REQUIRED"). The honest totals
after reconciliation: 9 PASS / 6 SETUP-REQUIRED / 0 FAIL — never wholly
green, exactly as the record's law requires (the six honest
unavailables are the typed prerequisites, verified as such).

---

## 3. Tier-1 local receipts (lane evidence, base e6ed008)

Run by the P9-C lane worker on the station box (Debian 13 x86_64, 4GB
RAM, node 24, corepack pnpm 10.33.2). These receipts are LANE evidence
for the honest state of the suite at the base — they are NOT verdicts
(§1: only the TL's own runs at the integrated commit fill verdicts).

<!-- P9-C-BATTERY-RECEIPTS: filled by the lane worker at 4/4 — see
     docs/productization-evidence/P9-C-VERIFICATION-RECORD.md -->

- [x] one-shot web build (`vite build --minify false --sourcemap false`): exit 0 (webServer one-shot, OOM law)
- [x] `playwright test --grep-invert @contract` (tier 1): **28 passed / 1 skipped / 0 failed** (41.5s; both projects; the one tier-1 failure found at first run — the global focus-outline cascade defect — was root-caused, fixed in Lane A's surface and honestly retagged `@contract`, §2 of the P9-C record)
- [x] `tsc --noEmit` (typecheck): exit 0 (after the strict-mode fix)
- [x] YAML validity of `.github/workflows/journeys.yml`: valid (after the plain-scalar colon fix)
- [x] screenshots sample: the lane's failure-screenshot config (list+HTML+JSON reporters) captured none in the final green run — the durable screenshot evidence is the TL's evidence sets (`delivery/p9-screenshots/` nine web shots + boot receipt; the P10 twelve at `test-results/evidence/` + six desktop-packaged at `delivery/p10-screenshots/`); the `lane-receipts/` path named by the skeleton checklist was never created — receipts live in `docs/productization-evidence/P9-C-VERIFICATION-RECORD.md` §3 (this fill, 2026-10-21)

## 4. The tier-2 integration gate (what the TL runs)

On the merged tree (P9-A route space integrated, lockfile importer
added):

```bash
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm install --frozen-lockfile
pnpm --filter @payswap/journey-verification exec playwright install chromium
pnpm --filter @payswap/journey-verification test   # FULL suite: tier 1 + @contract
```

Expected: the `@contract` count of `<!-- FILL: count -->` tests flips
from red (at the P9-C base, by design) to green. Any remaining red
contract test is a real finding against the route contract — it is
recorded here as a FAIL verdict with the failing test id, never
deleted or skipped. The CI workflow `.github/workflows/journeys.yml`
runs this same full suite on every push/PR to main + manual dispatch.

## 5. Install-flow evidence template (filled by the TL at release)

For the "clean-install verified" gate (PRODUCT-IDENTITY §6) — one block
per verified release:

### v1.0.0 — PUBLISHED BUT DEFECTIVE (station run, 2026-10-21)

```
Release:            v1.0.0 (payswapdotorg/PaySwap-3.0)
Verified commit:    5fbf0c716c87a4b0ee7f2ea747a63ac9009af920
Runner:             packages/journey-verification/install/install-verify.mjs
Runner receipt:      station run — checksum tier PASS (deb 3fa235160d796b2ab…),
                    then honest exit 6 (no root on station; root tier = CI)
Environment:        Debian 13 x86_64 station (no-root tier) + Xvfb GUI launch
deb:                checksums PASS · structure PASS (Name=PaySwap / Icon / ELF)
AppImage:           checksum PASS (24afe2e2d66eb4ae…) · structure PASS
Launch verification: FAIL — the force-update block (see below)
Evidence links:     docs/productization-evidence/P9-RELEASE-CLOSURE-2026-10-21.md
Date + verifier:    2026-10-21, resident TL
```

**The finding**: the packaged app consulted the upstream ZCode service's
force-update floor (`3.5.3`, ZCode version space) against PaySwap
`1.0.0` and blocked main-window creation for every online user — the
app-data dir appears but no product window ever does. Fixed by the
PaySwap update-authority law (commit `e9eef37`) + the install-verify CI
job with real window assertions. v1.0.0 is marked broken (prerelease
warning) once v1.0.1 is verified.

### v1.0.1 — THE CORRECTED RELEASE (VERIFIED, 2026-10-21)

```
Release:            v1.0.1 (payswapdotorg/PaySwap-3.0) — published 12:49:51Z
Verified commit:    456c2b5854f8bd1fe4f3bdc4d9574636235bc13a (tag v1.0.1)
Runner:             packages/journey-verification/install/install-verify.mjs
Runner receipt:      CI verdict PASS (run 39601882563, job install-verify;
                    receipt artifact install-verify-receipt) + station runs
Environment:        clean ubuntu-latest (CI, root tier: apt-get install,
                    Xvfb launch, window identity) + Debian 13 station
                    (no-root tier: checksums triple-source, structure,
                    published-AppImage GUI launch)
deb:                PASS — sha256 9c4fcb8c76d900a2245e7bb54bf700478d439f1abd38265a4867b1e6b2020573
                    (SHA256SUMS == station download == GitHub API digest);
                    apt-get dependency-resolving install ok; desktop entry
                    Name=PaySwap; icon; /opt/PaySwap/payswap ELF; package
                    payswap installed; dpkg -r cleanup ok
AppImage:           PASS — sha256 cb8a604a1479f3c913f9fbb31c34a5f48048b5a950a732eb73b1f6fa956d8248;
                    ELF structure + checksum verified; exec bit = the
                    documented chmod +x user step (recorded note)
Launch verification: PASS (CI + station) — ~/.config/PaySwap appears AND
                    the main window EXISTS: _NET_WM_NAME 'PaySwap',
                    WM_CLASS ('payswap','PaySwap') — the assertion that
                    v1.0.0 could never satisfy
Evidence links:     run https://github.com/payswapdotorg/PaySwap-3.0/actions/runs/39601882563;
                    docs/productization-evidence/P9-RELEASE-CLOSURE-2026-10-21.md
Date + verifier:    2026-10-21, resident TL (CI receipt + station runs)
```

The four release attempts (all zero-download withdrawals before this
one: dpkg-vs-apt, the blocking spawn, the display-less xdotool, the
exec-bit policy) are recorded in the closure doc §5 — each an iteration
of the verification tooling, never of the product artifacts.

Honest failure modes are the runner's exit codes (see
`packages/journey-verification/install/README.md`); exit 3 (no release
exists) remains the documented behavior for any tag without a published
release.

## 6. Truth laws restated (the tested set)

From PRODUCT-IDENTITY.md §5, as enforced by this suite:

1. No invented balances, rates, quotes, connected providers, recipients,
   confirmations or completed transfers — the empty-truthful assertions
   (branding.spec.ts at providerCount 0; setup-required.spec.ts pills).
2. UNKNOWN is not FAILED — the reconciliation vocabulary renders as
   itself (error-unknown.spec.ts).
3. Missing credentials leave activation disabled, shown as the truthful
   setup-required state (setup-required.spec.ts — typed prerequisites
   verbatim; never hidden behind fake success).
4. Every visible action works or explains its missing prerequisite —
   zero dead buttons, zero misleading active states
   (setup-required.spec.ts control audit).
5. Installability is not financial liveness — the four gates stay
   separate (§1 above; the install evidence is §5, not §2).
6. WCAG 2.2 AA for the core experience (accessibility.spec.ts — axe
   critical rules + reduced motion; responsive.spec.ts — the three
   viewports).


---

## VERDICTS (TL-filled, 2026-10-21 — the integration run at commit `9f09387`)

Evidence: `@payswap/journey-verification` FULL suite — **43 passed / 1
skipped / 0 failed** (tier 1 + all 15 `@contract` tier-2; both
projects; the served production build of the tested commit), plus the
TL's manual browser verification of the same tree.

| Journey | Verdict | Evidence |
|---|---|---|
| J1 first launch / getting started | **COMPLETE** | first-launch specs (identity, hero, CTA, honest-gate note, zero console errors; `/` PaySwap-branded; boot title+favicon) |
| J2 overview (authenticated) | **COMPLETE** | eleven-area map behind the honest auth gate; designed-empty reasons verified |
| J3 send/pay/move | **SETUP-REQUIRED (honest)** | typed prerequisite rendered (economic intake unconfigured) — the REQUIRED behavior, verified |
| J4 receive/recipients | **SETUP-REQUIRED (honest)** | same class, verified |
| J5 convert/compare | **SETUP-REQUIRED (honest)** | same class, verified |
| J6 merchant checkout | **SETUP-REQUIRED (honest)** | same class, verified |
| J7 activity/receipts/reconciliation | **COMPLETE** (surface) / **SETUP-REQUIRED** (live data) | the not-found fix verified here; UNKNOWN≠FAILED copy present; no fabricated history |
| J8 providers/capabilities/permissions | **COMPLETE** (coverage surface) / **SETUP-REQUIRED** (connections) | providers never listed connected without evidence — verified at providerCount 0 |
| J9 opportunities/Lab | **SETUP-REQUIRED (honest)** | advisory-only labeling verified |
| J10 security/mandates | **COMPLETE** | non-custody commitments surface verified |
| J11 reports/history | **SETUP-REQUIRED (honest)** | designed-empty verified |
| J12 developer/API | **COMPLETE** | MISSING runtime config displayed, not hidden — verified |
| J13 settings/about | **COMPLETE** | PaySwap identity + preserved upstream attribution verified (the attribution exemption is structural) |
| J14 agent console (supporting) | **COMPLETE** (P10: the Agent Workspace) | the PaySwap Agent Workspace verified at `/console`: PaySwap chrome + the eight-section navigation (zero ZCode branding), mission lifecycle real in the browser (intake findings → draft → intent-review → ladder with verbatim typed prerequisites → events → revise → archive, persisted across reload), honest empties (agents/approvals/activity/lab/connections no-provider), advanced developer workspace at `/console/advanced`, axe-critical + keyboard/focus/reduced-motion + mobile 390×844 green; desktop `#/console` mount verified by node/component batteries (the seam + tri-state routing + channel client); the desktop packaged-GUI inspection completed at v1.1.0 — CI install-verify 39641600925 + the station published-asset console check both PASS (the "P10 RELEASE VERIFICATION" section below; the desktop-packaged mission-intake flow executed through the durable store, six screenshots 13–18) |
| J15 legacy /payswap URLs | **COMPLETE** | permanent redirects verified (all four legacy routes + unknown legacy) |

**The four productization gates (PRODUCT-IDENTITY §6) at this commit:**

- **brand/UX implemented: ✓** — identity contract satisfied across web
  (+desktop renderer source); WCAG critical rules green (axe + the
  suite's keyboard/focus/reduced-motion assertions, post-cascade-fix);
  zero ZCode product branding in normal surfaces (the structural
  attribution exemption documented); attribution preserved.
- **GitHub installer published: ✓ (v1.0.1, 12:49:51Z; superseded by v1.1.0, 17:16:06Z)** — the public
  versioned release with tested Ubuntu x86_64 assets + SHA-256
  checksums; README links tested (all 200, checksum-matching). v1.0.0
  stays visible as a prerelease with the do-not-use warning (nothing
  deleted, nothing hidden). Full story:
  `docs/productization-evidence/P9-RELEASE-CLOSURE-2026-10-21.md`;
  the v1.1.0 receipts are in the P10 ADDENDUM below.
- **clean-install verified: ✓ (v1.0.1; re-verified at v1.1.0)** — the CI install-verify
  receipt (run 39601882563): checksums → apt-get dependency-resolving
  install → identity assertions → Xvfb launch → **PaySwap-branded
  window** → dpkg -r cleanup → AppImage structure+checksum: PASS; plus
  the station's published-asset GUI contrast run (v1.0.0 = no window,
  v1.0.1 = window 'PaySwap'). The v1.1.0 equivalents: CI receipt
  39641600925 + the station published-asset console check (P10 ADDENDUM
  below).
- **core journeys verified: ✓ (web)** — this matrix, at 9f09387. The
  DESKTOP journey verification (packaged app flows) rides the release
  verification (CI install job + operator acceptance) — honestly
  marked, never conflated.

---

## P10 ADDENDUM — the console-productization wave (TL-filled, 2026-10-21)

The Phase 10 wave (spec/surface/CONSOLE-WORKSPACE.md; work orders
P10-A/B/C/D) replaced the `/console` ZCode shell with the PaySwap Agent
Workspace. Evidence at the exact commits:

- **The wave's cross-lane contract**: `spec/surface/CONSOLE-WORKSPACE.md`
  (registered 54f7977; the `@payswap/app` compile seam 645a56c).
- **P10-A** (`work/p10-a` @ 49f5eeb, merged 5309461): the presentation
  contracts in `@payswap/surface` — 17 files / 195 tests, the §4
  prerequisites machine-pinned against the contract doc;
  `SURFACE_API_VERSION` 1.0.0 → 1.1.0 (additive MINOR, TL act at
  integration 4137bf6).
- **P10-B** (`work/p10-b` @ ae2aa8f, merged e9577d7): the desktop
  mission-intake store (DESKTOP_PROFILE, JSON persistence under the
  PaySwap user-data directory, malformed-record quarantine) + the host
  service extension + the renderer tri-state mount (`#/console` → the
  workspace, `#/console/advanced` → the ZCode developer workspace) +
  the channel client with method-parity drift test; the web mount
  (gate split + BROWSER_PROFILE localStorage store). 15f/152t desktop,
  2f/33t web, host+renderer typecheck clean.
- **P10-C** (`work/p10-c` @ 2e7680a, merged 8e1f86e): the workspace
  views in `@payswap/app` — the eight sections, the lifecycle ladder,
  honest empties, WCAG markup assertions; the seam's 17 exported names
  preserved. 21f/236t (incl. the TL's app↔surface pin-mirror
  cross-check added at integration).
- **P10-D** (`work/p10-d` @ 94f1445): the console journey specs
  (JOURNEY-MAP flows 15-19) + this record's J14 verdict.
- **The TL integration run** (4137bf6 → 94f1445, this record's
  verdict basis): surface 17f/195t · app 21f/236t · desktop 15f/152t ·
  web 2f/33t · ui 15f/226t · **journeys 65 passed / 1 skipped / 0
  failed** · oxlint 0 errors (3 inherited warnings) · invariants 0
  failures · ownership report regenerated, zero new violations (the
  P10 additions live inside the documented carry classes).
- **Evidence screenshots** (twelve): `packages/journey-verification/
  test-results/evidence/01…12-*.png` — console overview (empty +
  in-progress), not-found, intake findings, the intent-review step,
  mission detail ladder, archived, connections no-provider, activity
  UNKNOWN-reference, advanced honest state, settings
  identity/attribution, missions mobile 390×844. Mirrored to the
  station delivery directory.

**Honest boundaries (never conflated):** the browser flows verify the
WEB mount of the workspace (the same `@payswap/app` component the
desktop renders); the DESKTOP `#/console` experience is verified at
this commit by the node/component batteries (the seam, the tri-state
routing, the channel client, the store) — its packaged-GUI inspection
rides the v1.1.0 release verification (the CI install-verify job + the
station published-asset check), exactly as the P9 desktop gates did.
The mission store holds demand-side intent only; no execution,
approval or observation plane exists in this deployment, and every
such state renders its typed prerequisite (CONSOLE-WORKSPACE §4).

---

## P10 RELEASE VERIFICATION — v1.1.0 (TL-filled, 2026-10-21, the "recorded below" promise)

The v1.1.0 release (tag `d87834e`, published 17:16:06Z) carries the
Agent Workspace. Its verification, both halves:

- **CI install-verify (run 39641600925, on the tag): PASS** —
  published-asset checksums verified (deb
  `613dfb12…`, AppImage `142251cd…`); apt-get dependency-resolving
  install; identity assertions (desktop entry Name=PaySwap, package
  `payswap`, icon, exec binary); app-data path `~/.config/PaySwap`;
  **Xvfb launch: PaySwap-branded window ok (payswap | PaySwap)**;
  AppImage structure+checksum; dpkg -r cleanup.
- **Station published-asset check (TL, this record's companion
  receipt `delivery/p10-screenshots/desktop-packaged-receipt.json`):
  PASS** — the published AppImage re-downloaded and sha256-verified
  byte-exact, re-extracted from the verified file
  (`X-AppImage-Version=1.1.0`), and launched under Xvfb with CDP:
  - the force-update gate renders **inert** in the published build
    ("no PaySwap update authority is configured — the startup
    force-update gate stays inert" — the v1.0.1 fix confirmed in
    production); the main window is created (app-ready, dom-ready);
  - `#/console` renders the **PaySwap Agent Console** — title
    "PaySwap — Agent Console", brand PaySwap, all eight sections,
    honest empties; the PaySwap product home carries the discoverable
    "Agent console" entry;
  - the **mission-intake flow executed in the packaged app** through
    the durable DESKTOP_PROFILE store: goal + direction MOVE →
    structural validation clean → intent review ("Nothing downstream
    is reachable; the ladder states each typed prerequisite") →
    record intent → mission detail with the ladder (INTENT
    Reached/confirmed; ELIGIBILITY/PLANNING/APPROVAL/EXECUTION/
    OBSERVATION/EVIDENCE each "Not reached — prerequisite" with its
    typed reason) — persisted at
    `~/.config/PaySwap/workspace/workspace-store.json` (mission-1,
    INTENT_RECORDED, events CREATED + INTENT_VALIDATED);
  - connections renders the honest no-provider state verbatim;
    returning the hash to `#/` restores the PaySwap product surface
    **without a renderer reload** (same document, hash-only
    navigation);
  - six desktop-packaged evidence screenshots (13–18) mirror the
    browser set in `delivery/p10-screenshots/`; two (home, mission
    ladder) additionally verified visually.
- **Post-tag fix `8ab034d`** (the packaging-identity law test's
  version literal + README current-release links, caught by journeys
  run #12 on the tag — the artifacts themselves were green): CI #55 +
  journeys #13 both success on the fix commit. The release artifacts
  are unaffected (built from the tag `d87834e`).
- **Honest observations:** the ZCode substrate keeps internal runtime
  paths under `~/.zcode/v2` (crash staging, hardware-accel setting) —
  documented substrate carry, not PaySwap product data; benign
  headless-container noise (dbus, xdg-mime) in the station launch
  log.

## P11 RELEASE VERIFICATION — v1.2.0 (TL-filled, 2026-10-22, the workspace-design port)

The operator design directive ("move the current app from current to
target" — the current.png/target.png pair) became the P11 wave: the
target design ported into the shipped console per the AMENDED
spec/surface/CONSOLE-WORKSPACE.md (presentation-contract amendment
only — §2 IA/routing, §3/§4/§5 pinned shapes, §7, §9 and
`foldWorkspaceOverview` unchanged; Task 99 had realized the same
design at the :3000 preview and the operator confirmed the wave).

- **Integration commit `b4890f0`**: the §1 framing rename (Agent
  Console → Agent Workspace, pinned title literals + chrome +
  mounts), the §6 outcome-first overview home (question, intake-entry
  card, PAY/RECEIVE/MOVE/CONVERT shortcuts, workspace note; attention
  line + in-progress + activity folds retained), the §8 chrome
  (iconed sidebar with Settings pinned, mobile scroll nav, the
  honest workspace footer) + the prefill mechanism + pin-law version
  bumps to 1.2.0. Batteries: payswap-app 239/239, surface 195/195,
  web 33/33, desktop 152/152, journeys **66 passed / 1 skipped /
  0 failed** including the NEW P11 golden path (type a goal →
  "New mission" → the missions intake PREFILLED; outcome shortcut →
  direction-prefilled intake; in-tree, store untouched by the entry),
  typecheck zero new diagnostics, oxlint 0 errors, governance
  invariants 0 failures + ownership exactly the 8 documented carries.
  CI run 39704625757 + journeys run 39704625759 both **success**.
- **Release `v1.2.0`** (tag at `b4890f0`, run 39705000283): both
  jobs success; the CI install-verify receipt **PASS** (artifact
  12394402984: published-asset checksums verified; apt dependency-
  resolving install; identity assertions; `~/.config/PaySwap`
  app-data path; Xvfb launch with the PaySwap-branded window;
  AppImage structure; dpkg cleanup).
- **Station published-asset console check — 39/39 PASS** over the
  sha256-verified published AppImage (`d61de54b…` byte-exact vs the
  published SHA256SUMS): the P11 chrome (title "PaySwap — Agent
  Workspace", iconed sidebar in the pinned order with Settings after
  the divider, mobile nav icons), the outcome-first home, the
  PREFILL golden path, and the full mission-intake flow through the
  durable DESKTOP_PROFILE store — with the store CARRIED from the
  v1.1.0 verification (mission-1 visible in the retained in-progress
  fold; the honest footer count 3→4 across the run) — a real
  durability-across-release demonstration. Connections no-provider
  verbatim; return to `#/` without a renderer reload. Evidence:
  `delivery/p11-screenshots/` (receipts + screenshots 21–26); two
  key shots VLM-verified (the home per the target design; the ladder
  with its typed prerequisites).
- J14 stands COMPLETE with its evidence now including the v1.2.0
  receipts; the four productization gates on Issue #1 remain closed
  on the new release (brand/UX, installer publication, clean-install
  verification, core journeys).

## P12 RELEASE VERIFICATION — v1.3.0 (TL-filled, 2026-10-22, Issue #2 — the desktop experience wave)

The release-blocking Issue #2 handoff: green checks but a failed
desktop experience. The P12 wave answered all three blocks.

- **Integration**: Lane A (`6be5c18` startup cause taxonomy + retryable
  recovery), Lane B (`0dc9615` Linux native frame + viewport/scroll
  contract), Lane C (`aeab9e4` FEATURE-MAP + the first-class payments/
  onchain/PSP surfaces + J16–J19) merged clean at `732da13` + the
  journey-gate fixes. Batteries: desktop **179/179**, app **287/287**,
  root `tsc -b` **0**, lints 0 errors, and the full journey suite
  **77 passed / 1 skipped / 0 failed** — including the 12 NEW J16–J19
  `@contract` tests (payments action set with verbatim prerequisites +
  configure/learn routes; the onchain rail's typed UNAVAILABLE/REFERENCE/
  NO_OBSERVATIONS rows + the chain catalogue + synthetic venue packs +
  the accounts observation anchor; the PSP setup steps with the
  catalogue-never-connection law + the connect typed prerequisite +
  sandbox/live structural; the advanced-workspace entry honestly
  labeled + the web-truth cross-mount handoff) and the no-orphans law
  at the J19 map.
- **The packaged-RC verification** (the Issue #2 acceptance, on the
  production-identity `PaySwap_1.3.0_amd64.deb` payload under Xvfb +
  a purpose-built minimal ICCCM window manager — full record:
  `docs/productization-evidence/P12-RELEASE-CLOSURE-2026-10-22.md` +
  the station delivery receipts): boot-to-ready in ~2.5 s on fresh
  install, after clean close AND after SIGKILL (durable state
  preserved — no dead screen, no lock-out); the native-frame contract
  at the X protocol level (WM_CLASS `('payswap','PaySwap')`,
  `_NET_WM_WINDOW_TYPE_NORMAL`, `_MOTIF_WM_HINTS` decorations ALL,
  `WM_DELETE_WINDOW` honored with exit 0); the five-size resize sweep
  (1280×800, 1440×900, 1024×768, 800×600, 1920×1080) with content
  reflow at every size; the home page keyboard-scrolls with a
  byte-identical top→bottom→top round trip (the v1.2.0 home-crop
  defect fixed — the VLM-verified footer renders fully with the ZCode
  attribution); keyboard navigation to `/app` ("App — PaySwap"
  per-route title) with the bounded-shell internal scroll; the VLM-
  verified `/app` shell renders the eleven-area navigation + the
  honest authentication gate. Honest limitations recorded: XTEST
  pointer clicks inert under the minimal WM (keyboard is the verified
  input path; pointer + window identity additionally covered by the CI
  install-verify receipt and the web journey suite).
- **Release `v1.3.0`** (tag on the closure commit): CI + journeys
  green on the tag; the CI install-verify receipt (clean Ubuntu
  runner: published-asset checksums, apt dependency-resolving install,
  identity assertions, Xvfb launch with the PaySwap-branded window,
  AppImage structure) — the receipt URL recorded in the README
  current-release block with the tested direct asset links.
- **Governance**: the module-ownership report regenerated and
  committed — 13 violations (base 7; the +6 are Lane C's test-only
  mirror imports of onchain/provider-runtime sources, the same
  recorded-debt pattern the base already carries for
  surface/provider-runtime mirror tests; the app `src/**` still
  imports no onchain package — the substrate-layer law holds).
