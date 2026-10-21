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
| J1 | First launch / getting started | `/` | 1 | first-launch.spec.ts (3 tests) | first-launch.spec.ts (2 @contract) | UNTESTED | — |
| J2 | Overview (authenticated) | `/app` | 1 | journey-entry.spec.ts (3), navigation.spec.ts (1) | journey-entry.spec.ts (2), navigation.spec.ts (1) | UNTESTED | — |
| J3 | Send / pay / move money | `/app` → payments | 1 | setup-required.spec.ts (3) | setup-required.spec.ts (1) | UNTESTED | — |
| J4 | Receive money / recipients | `/app` → receive | 1 | setup-required.spec.ts (3) | setup-required.spec.ts (1) | UNTESTED | — |
| J5 | Convert / compare routes & quotes | `/app` → convert | 1 | setup-required.spec.ts (3) | setup-required.spec.ts (1) | UNTESTED | — |
| J6 | Merchant checkout / acceptance | `/app` → checkout | 1 | setup-required.spec.ts (3) | setup-required.spec.ts (1) | UNTESTED | — |
| J7 | Activity / progress / receipts / reconciliation | `/app` → activity | 1 | error-unknown.spec.ts (3) | error-unknown.spec.ts (1) | UNTESTED | — |
| J8 | Providers / capabilities / permissions | `/app` → connections; `/capabilities` | 1 | navigation.spec.ts (1), branding.spec.ts (2) | branding.spec.ts (1), accessibility.spec.ts (1) | UNTESTED | — |
| J9 | Opportunities / Lab insights | `/app` → opportunities | 1 | journey-entry.spec.ts (eleven-area map) | (via the /app shell coverage) | UNTESTED | — |
| J10 | Security / approvals / mandates | `/security`; `/app` → security | 1 | error-unknown.spec.ts (1), branding.spec.ts (2) | branding.spec.ts (1), accessibility.spec.ts (1) | UNTESTED | — |
| J11 | Reports / history | `/app` → reports | 1 | journey-entry.spec.ts (eleven-area map) | (via the /app shell coverage) | UNTESTED | — |
| J12 | Developer / API | `/developers` | 1 | navigation.spec.ts (1), branding.spec.ts (2) | branding.spec.ts (1), accessibility.spec.ts (1) | UNTESTED | — |
| J13 | Settings / support / about | `/app` → settings; about | 1 | settings-about.spec.ts (1), branding.spec.ts (2) | settings-about.spec.ts (1), branding.spec.ts (1) | UNTESTED | — |
| J14 | Agent console (supporting capability) | `/console` | 2 | — (contract-only at base) | navigation.spec.ts (2) | UNTESTED | — |
| J15 | Legacy `/payswap/*` URLs | redirect | 2 | — (contract-only at base) | legacy-redirect.spec.ts (3) | UNTESTED | — |

The matrix's machine-checked mirror: `packages/journey-verification/
journeys.manifest.ts` + `journeys.coverage.ts` + `specs/manifest.spec.ts`
(the no-orphans cross-check — an orphan journey or an unjourneyed test
fails the suite in both directions).

---

## 3. Tier-1 local receipts (lane evidence, base e6ed008)

Run by the P9-C lane worker on the station box (Debian 13 x86_64, 4GB
RAM, node 24, corepack pnpm 10.33.2). These receipts are LANE evidence
for the honest state of the suite at the base — they are NOT verdicts
(§1: only the TL's own runs at the integrated commit fill verdicts).

<!-- P9-C-BATTERY-RECEIPTS: filled by the lane worker at 4/4 — see
     docs/productization-evidence/P9-C-VERIFICATION-RECORD.md -->

- [ ] one-shot web build (`vite build --minify false --sourcemap false`): _FILL_
- [ ] `playwright test --grep-invert @contract` (tier 1): _FILL — files/tests passed_
- [ ] `tsc --noEmit` (typecheck): _FILL_
- [ ] YAML validity of `.github/workflows/journeys.yml`: _FILL_
- [ ] screenshots sample: `docs/customer-journeys/lane-receipts/` _FILL_

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

```
Release:            <tag> (<repo>)
Verified commit:    <sha>
Runner:             packages/journey-verification/install/install-verify.mjs
Runner receipt:      <path to install-verify-receipt.json>
Environment:        <clean Ubuntu <version> x86_64 — host/CI + method>
deb:                PASS/FAIL — checksums, desktop entry Name=PaySwap, icon, binary, dpkg -r
AppImage (if any):  PASS/FAIL/NONE — structure, checksum, exec bit
Launch verification: PASS/FAIL/NOT-RUN — display availability, ~/.config/PaySwap
Evidence links:     <CI run URL / screenshots / logs>
Date + verifier:    <date> <who>
```

Honest failure modes are the runner's exit codes (see
`packages/journey-verification/install/README.md`); exit 3 (no release
exists) is the expected state until the P9-B gate ships the first
release — recorded as such, never worked around.

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
| J14 agent console (supporting) | **COMPLETE** | reachable-but-secondary verified (ghost link, DOM order); the honest no-backend bootstrap report verified |
| J15 legacy /payswap URLs | **COMPLETE** | permanent redirects verified (all four legacy routes + unknown legacy) |

**The four productization gates (PRODUCT-IDENTITY §6) at this commit:**

- **brand/UX implemented: ✓** — identity contract satisfied across web
  (+desktop renderer source); WCAG critical rules green (axe + the
  suite's keyboard/focus/reduced-motion assertions, post-cascade-fix);
  zero ZCode product branding in normal surfaces (the structural
  attribution exemption documented); attribution preserved.
- **GitHub installer published: PENDING THE TAG** — the workflow, the
  identity and the verified build pipeline are in-tree; publication =
  the `v1.0.0` tag push + the CI release run (this record updates with
  the release URL + checksums when it lands).
- **clean-install verified: PENDING THE RELEASE** — the lane's no-root
  dpkg-deb verification passed (Package payswap / Name=PaySwap / icons
  / ELF); the root-tier `apt install` + GUI launch run in CI against
  the published artifacts (the install-verify runner).
- **core journeys verified: ✓ (web)** — this matrix, at 9f09387. The
  DESKTOP journey verification (packaged app flows) rides the release
  verification (CI install job + operator acceptance) — honestly
  marked, never conflated.
