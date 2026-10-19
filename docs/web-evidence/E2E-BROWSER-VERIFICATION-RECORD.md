# P7-E2E (Gate D) — Live Browser Verification Record

- **Date**: 2026-10-19T22:05–23:05Z (resident TL station, post-rollback recovery window)
- **Verifying agent**: resident TL (this record is TL-authored; no worker self-report is used)
- **Code identity**: `main` @ `9e481f2caf9ae3134d6567cd302fda25660a971b` (state: P6-W1
  COMPLETE) — the exact audited HEAD; plus one TL-authored defect fix committed on top
  (see §4; SHAs in §6).
- **Deployment under test**: the real `@zcode/web` product built from source at the
  station: `vite build` (production bundle, no-minify/no-sourcemap station profile)
  served by `vite preview` (127.0.0.1:5173) with the real `@zcode/server`
  (`packages/server/dist/entry-http.js`, :3030) behind the `/api` + `/ws` proxy, in the
  default `ZCODE_ENV=test` deployment context.
- **Browser**: the station's live Chrome 143 (CDP-driven), authenticated through the
  real Z.ai OAuth consent flow as `ali25@payswap.org` (the operator's account session;
  consent screen → terms checkbox → Continue → code issuance → web callback).

## 1. What was exercised (all live, no mocks)

| Step | Route / flow | Observed result |
|---|---|---|
| Landing + auth entry | `/` | "ZCode - Web + Server" title; three connect paths (Z.ai Global / BigModel CN / API key); **0 console errors** |
| OAuth | popup `chat.z.ai/auth/oauth/authorize` | consent screen for `client_P8X5CMWmlaRO9gyO-…`, account `ali25@payswap.org`, scope "view profile info"; Continue gated on a terms checkbox (honest consent); completes to code issuance |
| Authenticated shell | `/` after OAuth | onboarding wizard (3 steps, skippable) → shell: command palette (New task/Search/Automations/Plugin Marketplace), project `payswap3-0` detected, composer with @/context affordances, quick actions, user greeting `Ali25` |
| PaySwap product | `/payswap` | full product surface renders (see §2) |
| Honest gate + area map | `/payswap/app` | authentication-honest gate + the eleven operational areas, each with its designed-empty state (see §2) |
| Capabilities | `/payswap/capabilities` | "Providers are never listed as connected when the recorded evidence says otherwise — and providers with no recorded evidence are never listed at all" |
| Security | `/payswap/security` | non-custodial commitments page ("structural facts of the repository, not marketing") |
| Developers | `/payswap/developers` | API-authority page; **runtime state shown as `MISSING — VITE_PAYSWAP_API_URL is not set` — the unconfigured state is displayed, not hidden** |

## 2. Honest-state verification (the product/UI law)

- The five outcome actions (Pay / Receive / Move / Convert / Checkout) each render
  `Not yet dispatchable — action required` with a **typed prerequisite** naming the
  missing plane (economic intake / capability observations / merchant checkout plane).
  **Zero dead buttons, zero fabricated success states, zero invented quotes.**
- The eleven-area map (Overview, Payments, Accounts, Activity, Opportunities,
  Connections, Capabilities, Security, Reports, Developers, Settings) renders every
  area as `empty by design — inactive` with the honest reason (e.g. Accounts: "every
  number an OBSERVATION of an external provider, never PaySwap custody — none have
  been observed in this deployment").
- The UNKNOWN law is rendered as product copy: "When a provider answer is ambiguous,
  the product renders UNKNOWN and works the reconciliation — UNKNOWN is never silently
  turned into success or failure."
- The auth gate copy: "This is the honest gate: there is no demo mode with fake
  balances, no pretend login and no fabricated session."
- Non-custody commitments: credentials/money never held; evidence lineage on every
  consequential action.

## 3. Console-error inventory (full, unfiltered)

1. `Access to fetch at 'https://zcode.z.ai/api/v1/client/configs?app_version=3.14.3'
   from origin 'http://localhost:5173' has been blocked by CORS` +
   `Failed to load resource: net::ERR_FAILED` — the zcode test-endpoint client-config
   fetch, CORS-blocked when the production bundle is served from a localhost origin.
   **Environmental** (station deployment boundary), not a product defect: the same
   bundle served from its designed origin does not cross origins. No other console
   errors on any route.
2. Local test server reports `providerCount: 0` ("No model available. Upgrade or set a
   custom model" in the shell) — the unconfigured test-env model provider, shown
   honestly by the shell. Not a defect.

## 4. Defect found and fixed during this gate (TL-authored)

- **Finding**: the checkout action's typed prerequisite still said "merchant checkout
  **lands with** Work Order P5-W3" — a forward reference authored before R3-W3 landed
  (bbc9a93). P5-W3 (the merchant package) has since merged, so the copy was stale;
  the *deployment* claim (no checkout plane wired here) remained true.
- **Fix** (surgical, 4 files / +6−6): the canonical reason string in
  `packages/surface/src/outcomes.ts` (`NO_MERCHANT_PLANE`) + its web mirror
  (`packages/web/src/payswap/lib/outcome-registry.ts`) + the desktop consumer
  (`packages/desktop/src/host/payswap/product/mission-surface.ts`) + the web test
  assertion (`packages/web/test/payswap/home.test.tsx`); two stale comments updated.
  New copy states the merchant package landed (P5-W3) and the checkout-plane wiring
  is pending — preserving the honest-gate semantics and the tested prefix.
- **Verification of the fix**: `@payswap/surface` — `tsc --noEmit` 0 diagnostics;
  `vitest run` **11 files / 106 tests ALL PASS**. `@zcode/web` — `vitest run`
  **14 files / 116 tests ALL PASS** (oracle-exact count, includes the updated
  render assertion). Production rebuild → live re-verification: the new copy renders
  verbatim at `/payswap` in the browser (captured below).
- **Known environmental limitation (documented, pre-existing)**: `tsc --noEmit` at
  `packages/web` reports TS6305 (sibling `ui`/`shared`/`client` dists not built in
  this fresh clone) — the project-references build-order class; unrelated to this
  change (the failures reference files this diff does not touch, and predate it in
  this workspace). Root `tsc -b` for ui/web/desktop is the documented F4
  environmental OOM class on this station tier.

## 5. Station constraints encountered (recorded for reproduction)

- The 4 GB station cannot hold replay stack + `vite build` concurrently: the build
  requires a console-paused window (TL rebuilt with the console ring temporarily
  stood down; stack fully restored immediately after — console :3000 200, gateway
  :3100 200, CDP :9222 alive). Dev-server (`vite`) OOMs on this tier (3× observed);
  the no-minify/no-sourcemap one-shot build + `vite preview` profile is the viable
  station recipe (build ~11 s).
- `vite preview` binds `127.0.0.1` when asked; the dev server binds `[::1]` only —
  note for browser-driven verification.

## 6. Evidence artifacts

- Live screenshots (station-side, TL custody, mirrored to the station delivery
  directory): landing, OAuth consent, main shell, `/payswap` surface (×2),
  honest-gate area map, capabilities, security, developers, post-fix checkout copy.
- The rendered text of every route is quoted verbatim in §1–§2 (the text itself is
  the reproducible evidence: same build + same routes → same honest states).
- Reproduction: clone @ `9e481f2`+fix → `pnpm install` → build `packages/web`
  (`vite build`) → serve (`vite preview --host 127.0.0.1 --port 5173`) + run
  `node packages/server/dist/entry-http.js` (:3030) → browse `/` → OAuth → `/payswap*`.

## 7. Verdict

**P7-E2E (Gate D): PASS — browser acceptance established.** The P7-W1 web product
renders live from source at the audited HEAD, the OAuth path works end-to-end with a
real account session, the PaySwap surface implements the honest-state product law
(typed prerequisites, no dead financial actions, no fake success, UNKNOWN-not-failure,
evidence lineage copy), and the one stale-copy defect found during verification was
fixed and re-verified live. Remaining P8 items (financial certification,
security/client certification, release) stay operator-gated per program law.
