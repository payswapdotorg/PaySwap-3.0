# P9-A Verification Record — PaySwap-native product identity and UX

- **Work order**: `delivery/packets/pkt_p9-a.md` (Task ID 96-a; RESUME run —
  a prior session landed commit 1/5 and left uncommitted mid-flight work,
  verified file-by-file against the packet before continuing).
- **Lane worktree**: `/home/z/lanes/p9-a`, branch `work/p9-a`, base `e6ed008`.
- **Commits** (5, linear, no merges):
  1. `b60491d` — extract `@payswap/app` (prior session; re-verified this run)
  2. `7f5d65b` — the top-level route contract + the fifteen-journey IA
  3. `141778c` — the web default experience flip (`/` = PaySwap, `/console`)
  4. `5f6713a` — desktop opens into PaySwap + About identity + focus law
  5. this commit — evidence record + final summary
- **Contracts implemented**: `spec/productization/PRODUCT-IDENTITY.md` (§1
  values, §2 mark, §3 route contract, §4 attribution, §5 honesty laws),
  `spec/productization/JOURNEY-MAP.md` (§1 journeys, §2 navigation IA law).

---

## 1. What moved where (the extraction)

| Was (packages/web) | Now (packages/payswap-app) | Notes |
|---|---|---|
| `src/payswap/pages/**` | `src/pages/**` | `AppEntryPage` deleted (superseded by `AppOverviewPage` + `AreaPage`); `HomePage/CapabilitiesPage/SecurityPage/DevelopersPage/NotFoundPage` moved + re-pointed to top-level routes |
| `src/payswap/shell/PaySwapWebApp.tsx` | `src/shell/PaySwapApp.tsx` | REWRITTEN: platform-agnostic, navigation-adapter-driven (was window-driven) |
| `src/payswap/shell/SiteChrome.tsx` | `src/shell/SiteChrome.tsx` | top-level links + the supporting console entry + footer attribution |
| `src/payswap/{contracts,lib,pins}` | `src/{contracts,lib,pins}` | unchanged laws; `lib/outcome-area-aliases.ts` NET-NEW (the surface mirror) |
| `src/payswap/routes.ts` | `src/routes.ts` | REWRITTEN for §3 (below) |
| `src/payswap/payswap-{product,home}.css` | `src/payswap-{product,home}.css` | + NET-NEW `src/payswap-elevation.css` (§5) |
| `test/payswap/**` (14 files) | `test/payswap/**` (16 files) | moved with the code; updated to the new contract; + `journey-map.test.tsx`, `product-navigation.test.tsx` |
| `src/payswap/apiRuntime.ts` | stays in web | the vite-env platform adapter (no `import.meta.env` in the product package) |

The package is PRESENTATIONAL with injected adapters (INV-23 pattern kept):
no fetch (P-law machine-checked), no ambient window (the navigation seam is
injected), data arrives via explicit `PaySwapProductInput`. Consumers: web
mount (`@zcode/web` dependency + tsconfig reference + workspace import) and
the desktop renderer (tsconfig `paths` + vite alias to the SAME source —
desktop `package.json` belongs to Lane B, so the alias is the
no-second-implementation seam; the TL may promote it to a real dependency
when B owns the manifest).

## 2. Route contract implementation map (PRODUCT-IDENTITY §3 / JOURNEY-MAP)

Web gate: `packages/web/src/payswap/webRouteGate.ts` (pure, total) →
executed by `main.tsx`. Desktop: hash mirror (`payswapDesktop.ts`).

| Route | Surface | Implementation | Journey |
|---|---|---|---|
| `/` | PaySwap home | `PaySwapApp` + history adapter | J1 |
| `/app` | honest gate + eleven-area map + outcome board | `AppOverviewPage` | J2 |
| `/app/<area>` (11 pinned routes) | per-area designed-empty surface | `AreaPage` (`lib/areas.ts` mirror — routes NOT remapped) | J3–J11, J13 |
| `/capabilities` | coverage explorer | `CapabilitiesPage` | J8/J12 |
| `/security` | non-custody commitments | `SecurityPage` | J10 |
| `/developers` | developer/API authority | `DevelopersPage` | J12 |
| `/console` | agent console (the ZCode-derived `Root` + auth flows, wiring untouched) | web: console gate branch; desktop: `#/console` hash | J14 |
| `/payswap`, `/payswap/*` | permanent client-side redirect (prefix stripped) | `resolvePaySwapLegacyRedirect` + `history.replaceState` (no history entry, no reload) | J15 |
| `/share/*`, `/cn/share/*`, OAuth callbacks | UNTOUCHED substrate | gate passes them through unchanged | — |

Auth return-to: the OAuth callback fallbacks moved `"/"` → `"/console"`
(`PAYSWAP_CONSOLE_PATH`) — post-auth lands on the console mount (the surface
that initiates login); share return-tos still win when present.

Journey → control → state machine-check: `test/payswap/journey-map.test.tsx`
renders the REAL shell at every journey's entry route (static, deterministic)
and asserts the control, the prerequisite state and the honest-state law
(J1–J15 + the §2 navigation IA law: outcome actions first, eleven-area nav on
every app route, console reachable-but-secondary — ghost-styled, ordered
after the product CTA).

## 3. Identity replacements (before → after)

| Surface | Before | After |
|---|---|---|
| Web `<title>` | `ZCode` | `PaySwap` (loading) / `… — PaySwap` per route (`routeDocumentTitle`) |
| Web favicon | embedded ZCode PNG | embedded PaySwap-mark PNG (32×32, rasterized from the `ps-` brand geometry: `#131211` rounded square + `#10b981` swap arrows, committed as the base64 data URI) |
| Web boot shell | ZCode logo SVG, `aria-label="Loading..."` | PaySwap mark + `PaySwap` wordmark, `aria-label="Loading PaySwap"`, reduced-motion respected |
| Web console mount title | `ZCode - Web + Server` | `PaySwap — Agent Console` |
| Web OAuth callback title | `ZCode - Sign In` | `PaySwap — Sign In` |
| Web bootstrap-error title | `ZCode - Web` | `PaySwap` |
| Desktop renderer `<title>` / boot | `ZCode` + ZCode startup logo | `PaySwap` + PaySwap mark + wordmark |
| Desktop window title | (document title `ZCode`) | route-specific `… — PaySwap`; console `PaySwap — Agent Console` |
| Desktop app name (`runtimeApplicationName`) | `ZCode` / `ZCode Dev` / `ZCode Preview` | `PaySwap` / `PaySwap Dev` / `PaySwap Preview` (window-title fallback, menus, taskbar, **userData data path under the PaySwap identity**) |
| About panel | `ZCode Desktop App`, `About ZCode`, `© ZCode` | `PaySwap Desktop`, `About PaySwap`, `© PaySwap` + **preserved upstream attribution line** (§4): “Built on the ZCode open-source platform (zai-org/ZCode, Apache-2.0).” / zh equivalent — its own muted legal line |
| Desktop update dialogs | `需要升级 ZCode` / `Update ZCode` | `需要升级 PaySwap` / `Update PaySwap` |
| External-link dialogs | `打开外部 ZCode 链接？` / `Open external ZCode link?` | PaySwap equivalents |
| Endpoint prompt | `ZCode Endpoint` | `PaySwap — Endpoint` |
| Windows Explorer context menu | `在ZCode中打开` / `Open in ZCode` | `在 PaySwap 中打开` / `Open in PaySwap` (registry key `ZCode.OpenInZCode` stays — internal identifier) |
| macOS Finder workflow | `Open in ZCode.workflow` + same labels | `Open in PaySwap.workflow` + PaySwap labels (bundle id stays — internal) |
| Linux deep-link desktop entry | fallbacks `ZCode`/`zcode` | fallbacks `PaySwap`/`payswap` (real registration already passes `app.name` = PaySwap) |
| CUA permission errors | `ZCode Computer Use …` (9 strings) | neutral `Computer Use …` |
| Product footer | (no attribution line) | + “PaySwap is built on the ZCode open-source platform (zai-org/ZCode, Apache-2.0).” — attribution in the legal/about location, never the brand |

Kept intentionally (per the packet): code identifiers, channel/storage key
names (`zcode-theme`, `ZCODE_*` channels), internal process names, the
conversation-share substrate titles (“ZCode 会话分享” — the share route is
explicitly UNTOUCHED), and all §4 legal attribution.

## 4. Design-system decisions (§2 + §4 of the packet)

- The token system (`@zcode/ui/payswap` tokens.css / tailwind-theme.css /
  state-tokens.ts) remains the single source of visual truth; the elevation
  composes tokens, never redefines them. Emerald accent / amber attention /
  red failure-only palette unchanged (no indigo/blue primary).
- NEW `packages/payswap-app/src/payswap-elevation.css`: the new chrome
  (actions row, ghost console link, brand mark, eleven-area nav), area-surface
  components, footer attribution, reduced-motion law, responsive rhythm.
- The console link is deliberately QUIETER than the product CTA (ghost
  treatment, muted color, ordered after the CTA) — J14 “visually secondary”
  in both style and DOM order (machine-checked).
- `@zcode/ui/payswap` base.css: the WCAG 2.2 AA focus law extended to
  buttons/tabs/chips (inputs/selects already had it).
- Desktop console return control: small floating `← PaySwap` pill (fixed,
  bottom-left, focus-visible ring, reduced-motion) — the console's own chrome
  belongs to the ZCode shell (untouched), so the switch renders this
  supporting control instead.

## 5. WCAG 2.2 AA self-assessment (honest, per core page)

| Criterion | Home `/` | `/app` | `/app/<area>` | `/capabilities` `/security` `/developers` | Desktop product |
|---|---|---|---|---|---|
| Keyboard paths (2.1.1/2.1.2) | ✓ all links/anchors, skip link first | ✓ | ✓ | ✓ | ✓ (hash links are anchors) |
| Focus visible (2.4.7/2.4.11) | ✓ product-surface focus law (elevation.css) | ✓ | ✓ | ✓ | ✓ |
| Contrast (1.4.3) | ✓ token-verified fg/bg pairs; muted text `--ps-fg-muted` on `--ps-bg`/`--ps-surface` | ✓ | ✓ | ✓ | ✓ same tokens |
| Reduced motion (2.3.3) | ✓ product-surface + boot shell + desktop pill | ✓ | ✓ | ✓ | ✓ |
| Landmarks/regions (1.3.1) | header/nav/main/footer + `aria-labelledby` sections | ✓ + area nav | ✓ | ✓ | ✓ |
| aria-current (2.4.8) | ✓ site nav | ✓ area nav | ✓ both navs | ✓ | ✓ |
| Target size (2.5.8) | ✓ ≥44px nav/CTA; area-nav 40px links (min 24 AA) | ✓ | ✓ | ✓ | ✓ |
| Responsive 390→1440 | ✓ single-column grids, clamped type, 16px gutters | ✓ | ✓ | ✓ | n/a (windowed) |
| Unknown ≠ failed announcements | ✓ `role=status` states (never alert) | ✓ | ✓ | ✓ | ✓ |

LIMITATION (honest): this is a static-markup + css self-assessment
(machine-checked where testable: naming, landmarks, aria-current, headings,
deep links, reduced-motion rules present). Lane C runs the axe-core +
browser-flow acceptance battery (JOURNEY-MAP §3) — that is the certification
gate, not this record.

## 6. Battery receipts (this run, worktree root, 4GB box)

| Step | Command | Result |
|---|---|---|
| Install | `corepack pnpm install --filter @zcode/web... --filter @zcode/ui... --filter @zcode/desktop... --filter @payswap/app... --no-frozen-lockfile` | exit 0 (3.2s; lockfile up to date) |
| Typecheck | `npx tsc -b packages/payswap-app packages/web packages/ui` | exit 0 (combined cold run — no OOM this run) |
| Product suite | `corepack pnpm --filter @payswap/app test` | **16 files / 154 tests PASS** |
| Web suite | `corepack pnpm --filter @zcode/web test` | **1 file / 10 tests PASS** |
| UI suite | `corepack pnpm --filter @zcode/ui test` | **15 files / 226 tests PASS** |
| Desktop suite | `corepack pnpm --filter @zcode/desktop test` | **11 files / 98 tests PASS** |
| Web prod build | `cd packages/web && corepack pnpm exec vite build --minify false --sourcemap false` | **✓ built in 9.89s** (no OOM; `dist/index.html` verified PaySwap-branded) |

Desktop renderer project typecheck (`tsc -b packages/desktop/tsconfig.renderer.json`)
is clean of P9-A errors. NOTE: the full desktop `tsc -b packages/desktop`
solution build carries **214 pre-existing substrate errors at the base
commit** (main/scheduler projects: rootDir/include strictness, window.zcode
globals, cua test fixtures) — verified identical-in-kind before my changes;
the desktop vitest suite is the sanctioned desktop battery per the packet,
and the renderer is built by the vite pipeline (which type-resolves the same
sources). My net effect on the solution build: −2 errors (the new
`env.d.ts` also fixed the pre-existing `@zcode/ui/styles.css` side-effect
import error).

## 7. Limitations + what remains for Lanes B/C and the TL

1. **Menu label strings live in `packages/shared/src/desktopMenu.ts`**
   (“关于 ZCode”, “ZCode Endpoint”, tray “Open ZCode”…). `packages/shared` is
   OUTSIDE P9-A's write surface → untouched. TL: one small shared-package
   change (or ownership transfer) finishes the desktop menu identity.
2. **Conversation-share page titles** (“ZCode 会话分享” / “ZCode Conversation
   Share”) are substrate route strings — the packet keeps share routes
   UNTOUCHED. TL decision if desired later.
3. **Desktop `package.json`** (Lane B): `@payswap/app` is wired via tsconfig
   paths + vite alias, not a manifest dependency. When B owns the manifest,
   adding `"@payswap/app": "workspace:*"` lets the alias be dropped
   (behavior identical).
4. **Desktop product API runtime**: the honest unconfigured state is shown
   (build-time `VITE_PAYSWAP_API_URL` define added); wiring a real desktop
   API-runtime configuration source is TL accept-time integration.
5. **Session plane**: `/app` renders the honest authentication gate (J2 law)
   — wiring real session authority into the product shell is TL accept-time
   integration, unchanged from the packet's expectation.
6. **The floating `← PaySwap` console-return control** is a deliberate
   integration choice (the ZCode shell chrome is untouched per the write
   surface). TL may promote surface switching into the native application
   menu later.
7. **Electron runtime verification**: no Electron app was booted in this run
   (4GB box, one-shot-only law). The renderer surface switch is verified by
   the pure-seam tests + typecheck; the packaged boot is Lane B/C territory.
8. **axe-core/browser flows** (JOURNEY-MAP §3 acceptance) belong to Lane C.

## 8. Write-surface compliance

`git diff --name-only e6ed008..HEAD` touches ONLY: `packages/payswap-app/**`,
`packages/web/**`, `packages/ui/src/payswap/**`, `packages/desktop/src/**`,
`packages/desktop/test/**`, `packages/desktop/{tsconfig.renderer.json,
vite.config.ts, vitest.config.ts}` (wiring for the package seam),
`pnpm-lock.yaml` (install lockfile), and this evidence record. Nothing under
`packages/desktop/{package.json, electron-builder.config.js, build/,
scripts/, native/, dev-app-update.yml}`, `.github/`, `README.md`, `docs/`
(except this record), or `spec/`.
