# PaySwap Product Identity Contract (Phase 9)

Status: REGISTERED 2026-10-21 by the resident TL (operator handoff: GitHub
Issue #1, "Productize PaySwap 3.0"). This document is the CANONICAL
cross-lane contract for every product-identity value in the PaySwap
default experience. Lanes P9-A (experience), P9-B (distribution) and
P9-C (journeys/verification) implement to THIS spec; conflicts between
this spec and any inherited substrate default resolve in favor of this
spec, EXCEPT where a field is legally required to preserve upstream
attribution (see §4).

## 1. Canonical values

| Field | Value | Owned by |
|---|---|---|
| Product name (user-visible, all surfaces) | `PaySwap` | A (rendered), B (packaging) |
| Desktop `productName` | `PaySwap` | B |
| Desktop package `name` | `@payswap/desktop` | B |
| Desktop `description` | `PaySwap Desktop — the non-custodial economic operating system.` | B |
| Desktop `author` | `PaySwap` | B |
| Linux application ID (appId) | `org.payswap.PaySwap` | B |
| Linux executable name | `payswap` | B |
| Linux package name (.deb) | `payswap` | B |
| Desktop entry / menu name | `PaySwap` | B |
| Browser document title (web) | `PaySwap` (loading) / route-specific `… — PaySwap` | A |
| Web favicon + boot loading mark | the PaySwap mark (§2) | A |
| Desktop window title (main window) | `PaySwap` | A (renderer), B (package fallback) |
| Installer artifact base name | `PaySwap-<version>-<target>` | B |
| Product version scheme | semver, PaySwap-own, starts at `1.0.0` | B |
| Release tag scheme | `v<semver>` (e.g. `v1.0.0`) | B |
| Update channel metadata (`dev-app-update.yml`) | PaySwap feed values, no inherited defaults | B |

The substrate version (`3.14.3`, the upstream ZCode pin) is NOT the
PaySwap product version. The product version lives in the desktop
package and release tags; the upstream pin remains recorded in
`spec/UPSTREAM-BASE.md`, `README.md` lineage section and the About/legal
surfaces (§4).

## 2. The PaySwap mark

The product mark is the existing PaySwap wordmark treatment already
shipped on the `/payswap` public pages (the `PAYSWAP` hero mark and the
`ps-` design system in `packages/ui/src/payswap`). Lane A promotes this
existing identity to THE product identity across web + desktop (loading
screens, window chrome fallback, About, onboarding). Desktop/installer
icon raster formats (.png/.ico/.icns as required by electron-builder)
are derived from the same mark by Lane B.

Design laws (Lane A):

- Original PaySwap identity only. No ZCode mark, wordmark, boot art or
  product name in the default experience.
- No imitation of Apple branding or UI idioms; "Apple-quality" means
  the DISCIPLINE (calm hierarchy, deliberate typography/spacing/motion,
  truthful states), never the trade dress.
- The design token system in `packages/ui/src/payswap` (tokens.css,
  tailwind-theme.css, state-tokens.ts) is the single source of visual
  truth for the product experience.

## 3. Route contract (the default experience)

Canonical routes after P9-A (the cross-lane shape C tests against):

| Route | Surface | Was |
|---|---|---|
| `/` | PaySwap product home (positioning + journey entries + honest coverage) | ZCode client root |
| `/app` | PaySwap product app: auth-honest gate → the eleven operational areas | `/payswap/app` |
| `/capabilities` | capabilities + live coverage | `/payswap/capabilities` |
| `/security` | non-custodial security commitments | `/payswap/security` |
| `/developers` | developer/API authority surface | `/payswap/developers` |
| `/console` | the agent workspace console (the ZCode-derived client) — a SUPPORTING capability, linked from the product, never the default landing | `/` |
| `/payswap`, `/payswap/*` | permanent client-side redirects to the new top-level routes (recorded URLs keep working) | — |
| `/auth/callback`, share routes | unchanged (substrate) | unchanged |

Desktop: the main window opens the PaySwap product experience (home →
app). The agent console is reachable as a supporting surface. The
first-run and no-provider states follow the honesty laws (§5).

## 4. Upstream attribution (legally preserved)

The upstream lineage (`zai-org/ZCode`, pinned `29628c9`, v3.14.3), the
upstream LICENSE, and third-party notices remain in their legal/about
locations: `README.md` lineage section, `spec/UPSTREAM-BASE.md`, the
desktop About/legal surface, and the packaged `notices` staged by the
existing electron-builder flow. Attribution is preserved as ATTRIBUTION,
never as the product brand.

## 5. Honesty laws (unchanged, restated for productization)

These are the Phase 1–8 financial/truth laws applied to the product
surface; Lane A implements them, Lane C tests them:

1. No invented balances, rates, quotes, connected providers, recipients,
   confirmations or completed transfers.
2. `UNKNOWN` is not `FAILED`; a potentially-effective command that timed
   out presents reconciliation, never a made-up outcome.
3. Missing credentials may leave provider activation disabled — shown as
   the truthful setup-required state, never hidden behind fake success.
4. Every visible action works or explains its missing prerequisite with
   the impact and the route to configure/learn more. Zero dead buttons,
   zero misleading active states.
5. Installability is not financial liveness: packaging, integration
   completeness, sandbox verification and live certification remain
   SEPARATE statuses.
6. WCAG 2.2 AA for the core experience (focus visibility, keyboard
   paths, contrast, reduced motion, alt text, semantic landmarks).

## 6. Verification gates (four separate, operator-required)

- **brand/UX implemented** — P9-A accepted: identity contract satisfied
  across web+desktop default experience, WCAG pass, zero ZCode branding
  in normal user surfaces, attribution preserved.
- **GitHub installer published** — P9-B accepted: a real public versioned
  GitHub Release with tested Ubuntu x86_64 assets + SHA-256 checksums +
  README install links.
- **clean-install verified** — the `.deb` (and AppImage if published)
  install + launch + branding + data-path + uninstall verified on a
  clean Ubuntu environment, evidence tied to an exact commit.
- **core journeys verified** — the journey map (JOURNEY-MAP.md) tested:
  navigation, honest states, accessibility, responsive, zero console
  errors, no false success states.

Each gate closes only on its own evidence; none implies another.
