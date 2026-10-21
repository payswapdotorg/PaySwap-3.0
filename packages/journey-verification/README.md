# @payswap/journey-verification

The PaySwap **journey acceptance suite** — the J1–J15 map of
`spec/productization/JOURNEY-MAP.md` made testable, per the P9-C work
order (GitHub Issue #1: "make the product claims testable").

## What this package is

- **A Playwright browser acceptance suite** driving a served production
  build of the tested commit (`packages/web/dist`, built one-shot with
  `vite build --minify false --sourcemap false` — the 4GB-box OOM law:
  never dev/watch).
- **The journey manifest** (`journeys.manifest.ts`): the J1–J15 matrix
  (route, control, prerequisite, honest-state law, tier, base surface).
- **The no-orphans cross-check** (`specs/manifest.spec.ts` + 
  `journeys.coverage.ts`): every journey has a covering test; every
  test declares its journeys — both directions enforced, an orphan on
  either side fails the suite.
- **The install-verification runner** (`install/install-verify.mjs`):
  the deb/AppImage install acceptance flows against a PUBLISHED GitHub
  release (flows 11–14) — with honest failure modes (no release yet →
  clean explicit error).
- **The acceptance record** lives at
  `docs/customer-journeys/JOURNEY-ACCEPTANCE-RECORD.md` (repo-level):
  the per-journey verdict matrix, never wholly green by fiat.

## Tier discipline (read before running)

At the P9-C lane base the OLD routes still exist (`/` = ZCode client,
`/payswap/*` = product). The suite therefore runs in two tiers:

- **Tier 1 — green at the base**: `pnpm test:tier1`
  (`--grep-invert @contract`). Drives today's `/payswap/*` surfaces:
  honest states, responsive, axe, zero console errors.
- **Tier 2 — `@contract`, gates at TL integration**: `pnpm test:tier2`
  (`--grep @contract`). Authored against the NEW route contract of
  PRODUCT-IDENTITY.md §3 (`/` = PaySwap home, `/app`, `/console`,
  legacy redirects, no-ZCode-branding, settings/about) which Lane P9-A
  implements. **Expected red at the base — never faked green.**

`pnpm test` runs the FULL suite (both tiers) — this is what CI
(`journeys.yml`) runs, and it is green only on the integrated tree.

## Running

```bash
# one-time: browsers (chromium only, headless)
pnpm --filter @payswap/journey-verification exec playwright install chromium

# the webServer reuses packages/web/dist when present, else builds it
# one-shot (vite build --minify false --sourcemap false):
pnpm --filter @payswap/journey-verification test:tier1

# typecheck
pnpm --filter @payswap/journey-verification typecheck
```

The serving substrate is `scripts/serve.mjs` — a dependency-free static
server with SPA fallback over `packages/web/dist` (documented choice:
the `@zcode/server` static-root mode needs its own build + registry
boot; the suite needs exactly static+SPA and nothing else). Failed
asset requests 404 visibly — the zero-console-error law catches them.

## Layout

```
journeys.manifest.ts   the J1–J15 matrix (id, route, control, prerequisite,
                       honest-state law, tier, baseSurface)
journeys.coverage.ts   the spec ↔ journey registry (the no-orphans law)
playwright.config.ts   desktop 1280×800 + mobile 390×844 projects, webServer
specs/                 one spec per acceptance flow + the manifest cross-check
support/               helpers (console-error law, branding scans) + axe config
scripts/               serve.mjs (static+SPA) + webserver.mjs (build-if-needed)
install/               install-verify.mjs + the install-flow docs
```

Every test title carries `[Jn]` journey tokens (the auditable link the
cross-check enforces); `@contract` in a title marks a tier-2 test.
