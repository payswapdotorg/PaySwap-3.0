/**
 * @payswap/journey-verification — the RETIRED JOURNEY ROWS (the P22-D
 * file-law split from ./journeys.manifest.ts at the ≤400-line law, along
 * the module's own documented seam: the manifest owns the LIVING rows,
 * this file owns the frozen history). The rows stay REGISTERED with
 * their retirement reasons (the P21-D reconciliation law: never a
 * silent deletion — the law lives on at the named successor tier) and
 * the manifest concatenates them FIRST so the ordered J1..J25 law and
 * every id stay byte-identical.
 */

import type { JourneyRow } from "./journeys.types.js";

/** The retired rows (J1–J19), in canonical order — frozen history. */
export const RETIRED_JOURNEYS: readonly JourneyRow[] = [
  {
    id: "J1",
    title: "First launch / getting started",
    route: "/",
    control: '"Open the product" CTA → /app',
    prerequisite: "none (public)",
    honestState:
      "positioning + honest gate expectation set BEFORE the click; PaySwap-branded home; zero console errors",
    tier: 1,
    baseSurface: "/payswap",
    integrationNote:
      "the first-launch EXPERIENCE (brand, hero, CTA, gate note, zero console errors) is base-green at /payswap; the route MOVE to / plus the PaySwap favicon/boot mark are @contract (Lane P9-A)",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J2",
    title: "Overview (authenticated)",
    route: "/app",
    control: "overview area",
    prerequisite: "auth (honest gate when unauthenticated)",
    honestState:
      "eleven-area map, designed-empty states with reasons; gate copy truthful; no demo mode, no fabricated session",
    tier: 1,
    baseSurface: "/payswap/app",
    integrationNote:
      "the honest authenticated entry boundary + eleven-area map are base-green at /payswap/app; the route move to /app is @contract",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J3",
    title: "Send / pay / move money",
    route: "/app → payments area",
    control: 'outcome action "Pay"',
    prerequisite: "economic intake plane unconfigured → typed prerequisite",
    honestState:
      '"Not yet dispatchable" + the typed missing prerequisite verbatim + what is missing + configure route; never a dead button, never a fabricated success',
    tier: 1,
    baseSurface: "/payswap",
    integrationNote:
      "the outcome-action dispatchability board with typed prerequisites is base-green on the home + app-entry surfaces; the /app payments area route is @contract",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J4",
    title: "Receive money / recipients",
    route: "/app → receive/recipients area",
    control: 'outcome action "Receive"',
    prerequisite: "same as J3 (economic intake plane unconfigured)",
    honestState: "same honest law as J3; no invented recipients",
    tier: 1,
    baseSurface: "/payswap",
    integrationNote: "same as J3 — the receive action's typed prerequisite is base-green",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J5",
    title: "Convert / compare routes & quotes",
    route: "/app → convert area",
    control: 'outcome action "Convert"',
    prerequisite: "no capability observations (quote projection unconfigured)",
    honestState:
      "quotes only from real observations; none exist → truthful unavailable preview, never an invented quote",
    tier: 1,
    baseSurface: "/payswap",
    integrationNote: "the convert action's typed prerequisite is base-green",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J6",
    title: "Merchant checkout / acceptance",
    route: "/app → checkout area",
    control: "merchant surface",
    prerequisite: "checkout plane wiring pending",
    honestState: "setup-required state, never a demo store",
    tier: 1,
    baseSurface: "/payswap",
    integrationNote:
      "the checkout action's typed prerequisite (no merchant plane — refuse to fabricate a checkout session) is base-green",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J7",
    title: "Activity / progress / receipts / reconciliation",
    route: "/app → activity area",
    control: "activity list",
    prerequisite: "no executed transfers → designed-empty",
    honestState: "UNKNOWN ≠ FAILED; reconciliation copy where ambiguous",
    tier: 1,
    baseSurface: "/payswap/app",
    integrationNote:
      "the activity area's designed-empty contract + the UNKNOWN-is-never-FAILED surface copy are base-green; the activity ledger route is @contract",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J8",
    title: "Providers / capabilities / permissions",
    route: "/app → connections; /capabilities",
    control: "connections + coverage",
    prerequisite: "providerCount 0 → none listed as connected",
    honestState:
      "providers never listed connected without recorded evidence; the no-evidence state renders as itself",
    tier: 1,
    baseSurface: "/payswap/capabilities",
    integrationNote:
      "the honest coverage explorer + home coverage summary at providerCount 0 are base-green; the /capabilities route move is @contract",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J9",
    title: "Opportunities / Lab insights",
    route: "/app → opportunities area",
    control: "opportunities list",
    prerequisite: "advisory evidence only",
    honestState: "simulation never production authority",
    tier: 1,
    baseSurface: "/payswap/app",
    integrationNote:
      "the opportunities area's designed-empty contract (discovery runs on real capability observations only) is base-green",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J10",
    title: "Security / approvals / mandates",
    route: "/security; /app → security area",
    control: "security surface",
    prerequisite: "commitments + mandate states",
    honestState: "structural facts, not marketing",
    tier: 1,
    baseSurface: "/payswap/security",
    integrationNote:
      "the six structural commitments + non-custody page are base-green; the /security route move is @contract",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J11",
    title: "Reports / history",
    route: "/app → reports area",
    control: "reports list",
    prerequisite: "designed-empty with reason",
    honestState: "no fabricated history",
    tier: 1,
    baseSurface: "/payswap/app",
    integrationNote: "the reports area's designed-empty contract is base-green",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J12",
    title: "Developer / API",
    route: "/developers",
    control: "developer surface",
    prerequisite: "MISSING runtime config displayed",
    honestState: "unconfigured state shown, not hidden (env var named, no fabricated URL)",
    tier: 1,
    baseSurface: "/payswap/developers",
    integrationNote:
      'the "Not configured — and shown as such" API runtime state is base-green; the /developers route move is @contract',
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J13",
    title: "Settings / support / about",
    route: "/app → settings; about",
    control: "settings + about",
    prerequisite: "—",
    honestState: "PaySwap identity; upstream attribution present (legal/about)",
    tier: 1,
    baseSurface: "/payswap/app",
    integrationNote:
      "the settings area's honest empty state (nothing configurable without a session) is base-green; the FULL settings + about surface with PaySwap identity and upstream attribution is @contract (Lane P9-A)",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J14",
    title: "Agent console (supporting capability)",
    route: "/console (web) / console surface (desktop)",
    control: "console link from product",
    prerequisite: "auth",
    honestState:
      "never the default landing; the PaySwap Agent Workspace per spec/surface/CONSOLE-WORKSPACE.md — PaySwap chrome, eight sections, honest empties, the §4 ladder; ZCode developer workspace = advanced interface at /console/advanced",
    tier: 2,
    baseSurface: null,
    integrationNote:
      "at the lane base the console IS the substrate root (the ZCode client at /) — no distinct /console surface exists to test honestly; fully @contract. P10 INTEGRATION UPDATE: on the merged console wave (4137bf6) the /console surface EXISTS as the PaySwap Agent Workspace and JOURNEY-MAP.md §3 flows 15–19 are tier-1-green browser flows (this suite's console-*.spec.ts, P10-D) — the @contract pair in navigation.spec.ts still pins the reachability + never-the-default-landing law",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J15",
    title: 'Legacy /payswap/* URLs',
    route: "/payswap, /payswap/*",
    control: "redirect",
    prerequisite: "—",
    honestState: "permanent redirect to the new top-level route (recorded URLs keep working)",
    tier: 2,
    baseSurface: null,
    integrationNote:
      "at the lane base /payswap/* ARE the real product routes (no redirect exists); the redirect contract only exists post-P9-A — fully @contract",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J16",
    title: "Primary payment discovery (the payments action set)",
    route: "/app/payments",
    control: "the typed action set (Pay / Receive / Move / Checkout, anchored by the pinned alias table)",
    prerequisite: "economic intake plane unconfigured / no merchant plane → typed prerequisite per action",
    honestState:
      "every anchored action states dispatchability with its typed prerequisite verbatim + the two real routes forward (configure connections / learn the contract); recipients honestly UNAVAILABLE, approvals → Agent Workspace, activity → ledger, convert → accounts cross-anchor; never a dead button, never a fabricated success",
    tier: 2,
    baseSurface: null,
    integrationNote:
      "the typed payments landing (PaymentsAreaSurface, Lane P12-C) — @contract, gates at TL integration on the merged tree (specs/payments-discovery.spec.ts)",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J17",
    title: "Onchain discovery (the onchain rail)",
    route: "/app/connections → the onchain rail block; /app/accounts (observation anchor)",
    control: "the onchain rail block on the connections area",
    prerequisite: "no wallet / transport / signer wired in this deployment",
    honestState:
      "UNAVAILABLE rows with typed reasons (wallet connection, live network context, transaction preview, scoped signing); REFERENCE rows for declared contracts (fee provenance, simulation & security, the state vocabulary incl. reorg + UNKNOWN); NO_OBSERVATIONS rows (balances, history); the declared chain catalogue; synthetic venue packs labeled AS synthetic; balances are observations and zero are observed",
    tier: 2,
    baseSurface: null,
    integrationNote:
      "the onchain rail surface (foldOnchainRail + ConnectionsAreaSurface + AccountsAreaSurface, Lane P12-C) — @contract, gates at TL integration (specs/onchain-discovery.spec.ts)",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J18",
    title: "PSP connection setup flow",
    route: "/app/connections",
    control: "the PSP setup steps + the connection forms catalogue",
    prerequisite: "provider connection plane not wired (providerCount 0)",
    honestState:
      "a catalogue entry is never a connection; the connect step states its typed prerequisite (never a dead button, never a fabricated login); scopes/effect classes declared; sandbox/live structurally distinct; health honest empty at zero connections; lifecycle transitions lawful",
    tier: 2,
    baseSurface: null,
    integrationNote:
      "the PSP setup surface (foldConnectionsSetup + ConnectionsAreaSurface, Lane P12-C) — @contract, gates at TL integration (specs/psp-connection.spec.ts)",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
  {
    id: "J19",
    title: "Advanced developer workspace access (ZCode-derived, integrated)",
    route: "/developers → /console/advanced",
    control: "the advanced developer workspace entry on the developers surface",
    prerequisite: "entry public; the workspace is a live-backend surface (its honest no-backend state is the truthful render)",
    honestState:
      "the entry is honestly labeled as the advanced developer workspace of the PaySwap Agent Console; routing is SPA (no renderer reload / no durable-state loss — window-marker verified); the Agent Workspace stays primary (/console keeps .ps-console-root)",
    tier: 2,
    baseSurface: null,
    integrationNote:
      "the in-IA advanced entry (DevelopersPage + section-vocabulary, Lane P12-C) — @contract, gates at TL integration (specs/advanced-workspace-access.spec.ts)",
    retirement: {
      at: "P15-strip",
      successor: "the desktop product tier (the PaySwap desktop app carries these surfaces)",
      reason: "the P15 strip removed the pre-strip product surfaces from the web build (the web entry boots the ZCode substrate Root for every pathname — the marketing/app shell these tests drove no longer exists there)",
    },
  },
] as const;
