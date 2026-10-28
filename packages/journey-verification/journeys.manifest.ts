/**
 * @payswap/journey-verification — the J1–J24 journey manifest.
 *
 * Authority: spec/productization/JOURNEY-MAP.md §1 (the primary journey
 * map, REGISTERED by the TL) + PRODUCT-IDENTITY.md §3 (the route contract
 * this matrix is resolved against). Every row below is carried from that
 * map — id, route, control, prerequisite and the honest-state law — plus
 * the two lane-local fields the suite needs:
 *
 * - `tier`:
 *   - 1 = at least part of this journey's acceptance is verifiable GREEN
 *     at the P9-C lane base (e6ed008) via `baseSurface` — the PaySwap
 *     product surfaces that exist TODAY under `/payswap/*` on the
 *     @zcode/web substrate (P7-W1, additive mount).
 *   - 2 = contract-only: the journey cannot be verified at the base
 *     because its surface is part of the NEW route contract Lane P9-A
 *     implements (`/` = PaySwap home, `/app`, `/console`, legacy
 *     redirects). Coverage exists ONLY as `@contract` tests that gate at
 *     TL integration on the merged tree.
 * - `baseSurface`: the route the tier-1 tests drive at the lane base
 *   (null for contract-only rows). The tier-1 tests assert the SAME
 *   honest-state laws on that surface; the ROUTE MOVE itself is the
 *   contract-gated part, not the honesty of the surface.
 *
 * THE NO-ORPHANS LAW (both directions, enforced by specs/manifest.spec.ts):
 * every manifest row must be covered by at least one test in the suite,
 * and every test must declare the journey id(s) it covers (via the `[Jn]`
 * title convention + journeys.coverage.ts). An orphan journey fails the
 * suite; an unjourneyed test fails it too.
 */

/** A journey id from the J1–J24 map (JOURNEY-MAP.md §1 + the P21-D J24 row). */
export type JourneyId = `J${number}`;

/** Where a journey's acceptance can run green. */
export type JourneyTier = 1 | 2;

/** One row of the canonical journey map, made machine-checkable. */
export interface JourneyRow {
  readonly id: JourneyId;
  /** Journey name (JOURNEY-MAP.md §1 column 2). */
  readonly title: string;
  /** Canonical CONTRACT route (PRODUCT-IDENTITY.md §3 — post-P9-A). */
  readonly route: string;
  /** Primary control (JOURNEY-MAP.md §1 column 4). */
  readonly control: string;
  /** Prerequisite state shown (JOURNEY-MAP.md §1 column 5). */
  readonly prerequisite: string;
  /** The honest-state law this journey must satisfy (column 6, condensed). */
  readonly honestState: string;
  /** 1 = base-green via baseSurface; 2 = contract-only (see file header). */
  readonly tier: JourneyTier;
  /** The route tier-1 tests drive at the lane base; null for tier 2. */
  readonly baseSurface: string | null;
  /** What remains contract-gated even for tier-1 rows. */
  readonly integrationNote: string;
  /**
   * (P21-D reconciliation) Present when the journey's WEB surface was
   * retired by the P15 strip (the web entry boots the ZCode substrate
   * Root for every pathname — spec/productization/JOURNEY-MAP.md §5).
   * A retired row is exempt from the coverage law (law 4): its spec
   * files retired with it; the law itself lives on at the named
   * successor tier. NEVER a silent deletion — the row stays REGISTERED
   * with its reason.
   */
  readonly retirement?: {
    readonly at: string;
    readonly successor: string;
    readonly reason: string;
  };
}

export const JOURNEYS: readonly JourneyRow[] = [
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
  {
    id: "J20",
    title: "Shared agent entrypoints — one composer, every surface",
    route: "/ → /console (the substrate shell — every pathname boots the substrate Root; the composer mounts on all of it)",
    control: "the persistent, toggleable PaySwap agent composer (dock + panel)",
    prerequisite: "none (the composer works standalone in the browser profile, honestly labeled)",
    honestState:
      "the composer mounts on the home, app overview, payments, connections and accounts surfaces AND the Agent Workspace — every entrypoint drives the ONE shared controller (one task list, one history); the panel renders the zero-authority note, the no-tools note and the declared-unsupported VOICE statement verbatim; never a microphone control; secrets never enter chat (secret-shaped text is refused before it is recorded)",
    tier: 2,
    baseSurface: null,
    integrationNote:
      "the composer plane (packages/payswap-app/src/agent/, Lane P13-A) — @contract, gates at TL integration on the merged tree (specs/agent-composer-surfaces.spec.ts)",
  },
  {
    id: "J21",
    title: "Chat → “connect Stripe” seeds the ONE resumable setup task",
    route: "/ (the composer text path on the substrate shell)",
    control: "the composer text path (the pre-strip connect CARDS retired with the P15 strip — the desktop product tier carries the surface entrypoints)",
    prerequisite: "no provider connection exists (the honest empty; a catalogue entry is never a connection)",
    honestState:
      "a card click and a typed “connect Stripe” reach the SAME resumable CONNECTION_SETUP task inside the window — CREATED then RESUMED, never a duplicate; the task record states nothing is connected (a connection exists only when the connection plane records real provider evidence); Stripe is the one declared provider and no other is ever offered; the U2/U3 forms state their exact missing operator configuration (never simulated OAuth)",
    tier: 2,
    baseSurface: null,
    integrationNote:
      "the convergence law (agent-task seedOrResume + the Connections integration, Lane P13-A; the connection plane machinery, Lane P13-B) — @contract, gates at TL integration (specs/agent-composer-convergence.spec.ts)",
  },
  {
    id: "J22",
    title: "Pay by text — the payment-intake task; voice honestly unsupported",
    route: "/ (the composer text path on the substrate shell)",
    control: "the composer text path (the pre-strip direction CARDS retired with the P15 strip — the desktop product tier carries the surface entrypoints)",
    prerequisite: "no payment can dispatch (the preview→authorization→execution path is host-side; the composer holds zero financial authority)",
    honestState:
      "a Pay-card click and a typed “pay the supplier” seed the SAME resumable PAYMENT_MISSION task; checkout has NO card (no direction exists in the mission vocabulary — never a guessed seed); the card copy states starting a task pays nothing; voice input is not supported in this deployment and is never simulated",
    tier: 2,
    baseSurface: null,
    integrationNote:
      "the payment-intake seeding (agent-payment-entries + the Payments integration, Lane P13-A; the mission runtime, Lane P13-C) — @contract, gates at TL integration (specs/agent-composer-convergence.spec.ts)",
  },
  {
    id: "J23",
    title: "Composer durability — minimize/reopen and reload never lose context",
    route: "/ (any substrate-shell surface)",
    control: "the composer dock/panel toggle + the browser-profile task store",
    prerequisite: "the standalone browser-profile persistence (honestly labeled: not synced anywhere, clearing site data removes it)",
    honestState:
      "minimize returns focus to the dock and keeps the draft + transcript + tasks; reopen restores them; a full page reload preserves the task list and history (restart resume at the browser-profile tier); Escape minimizes; the transcript is a polite live region",
    tier: 2,
    baseSurface: null,
    integrationNote:
      "the composer UI-state + task-store persistence (Lane P13-A) — @contract, gates at TL integration (specs/agent-composer-convergence.spec.ts)",
  },
  {
    id: "J24",
    title: "The task-tier agent journey — New Task through the composer; the mission/model tiers honestly unbound",
    route: "/console",
    control: "the composer dock → the panel's text input (the New Task path)",
    prerequisite: "none (the composer works standalone in the browser profile, honestly labeled)",
    honestState:
      "a payment-shaped request (e.g. \"Pay merchant X\") seeds ONE task that lands on the composer's task board with its honest draft status; the model/difficulty controls render the honest unbound-catalog note VERBATIM with ZERO model options (never a fabricated list); the mission tier's honest unbound note renders VERBATIM in the conversation; the routine-stage checklist and the route-planning section render their honest unbound notes with ZERO fabricated progress, ZERO routes, ZERO choice controls; the task record survives a full reload (browser-profile tier)",
    tier: 1,
    baseSurface: "/console",
    integrationNote:
      "the P21-D web-tier E2E law (ADR-0014 D10 + D2's web analogue: the web build renders the task tier + the honest unbound notes, never a faked mission tier — the desktop tier carries the full bound journey). The J20–J23 composer surfaces are LANDED in the merged tree, so this row is tier-1 base-green. POST-P15 ROUTING: every pathname boots the same substrate shell with the composer mounted beside it — /console is the console surface this row drives. SERVING: the suite serves the built dist through the REAL substrate HTTP server (ZCODE_WEB_STATIC_ROOT + /ws) — the P15-stripped app cannot boot static-only (see scripts/webserver.mjs). The JOURNEY-MAP.md §1 J24 row + the map reconciliation are the TL's closure item (recorded in the P21-D worklog)",
  },
] as const;

/** The ordered id list J1..J24 (the map is total; the cross-check pins it). */
export const JOURNEY_IDS: readonly JourneyId[] = JOURNEYS.map((row) => row.id);

/** Tier lookup for the cross-check (tier-1 journeys need non-@contract tests). */
export function journeyTier(id: JourneyId): JourneyTier {
  const row = JOURNEYS.find((candidate) => candidate.id === id);
  if (row === undefined) {
    throw new Error(`journeys.manifest: unknown journey id ${JSON.stringify(id)}`);
  }
  return row.tier;
}

/** Is `id` a row of the canonical map? (The no-invented-ids half of the law.) */
export function isJourneyId(id: string): id is JourneyId {
  return JOURNEYS.some((row) => row.id === id);
}

/**
 * The routes the TIER-1 suite drives (the PaySwap product surfaces).
 *
 * INTEGRATION UPDATE (P9, TL): at the lane base these were the P7-W1
 * `/payswap/*` additive-mount paths; the P9-A merge moved the surfaces
 * to their canonical top-level homes (PRODUCT-IDENTITY.md §3) and the
 * legacy paths became permanent redirects (covered by
 * legacy-redirect.spec.ts via CONTRACT_ROUTES.legacy*). Post-merge,
 * the "base surface" of every tier-1 journey IS the canonical route —
 * the tier tag still documents WHAT was verifiable at the lane base;
 * the href assertions must expect the canonical targets the app now
 * (correctly) emits.
 */
export const BASE_ROUTES = {
  home: "/",
  capabilities: "/capabilities",
  security: "/security",
  developers: "/developers",
  appEntry: "/app",
  notFound: "/no-such-journey-route",
} as const;

/**
 * The routes of the NEW route contract (PRODUCT-IDENTITY.md §3) the
 * tier-2 @contract tests are authored against. These gate at TL
 * integration on the merged tree (Lane P9-A implements them).
 *
 * The console block (P10-D, JOURNEY-MAP.md §3 flows 15–19 — all J14):
 * the eight-section workspace path space (CONSOLE-WORKSPACE.md §2), the
 * advanced developer-workspace mount, and the unknown-section probe
 * the honest-not-found flow drives. The console-* specs import their
 * routes from HERE (the single canonical route registry).
 */
export const CONTRACT_ROUTES = {
  home: "/",
  app: "/app",
  capabilities: "/capabilities",
  security: "/security",
  developers: "/developers",
  console: "/console",
  consoleMissions: "/console/missions",
  consoleAgents: "/console/agents",
  consoleApprovals: "/console/approvals",
  consoleConnections: "/console/connections",
  consoleActivity: "/console/activity",
  consoleLab: "/console/lab",
  consoleSettings: "/console/settings",
  consoleAdvanced: "/console/advanced",
  consoleUnknownSection: "/console/does-not-exist",
  legacyHome: "/payswap",
  legacyCapabilities: "/payswap/capabilities",
  legacySecurity: "/payswap/security",
  legacyDevelopers: "/payswap/developers",
  legacyApp: "/payswap/app",
  unknown: "/no-such-contract-route",
  // The P12 Lane C area surfaces (J16–J19 drive these; the pinned
  // eleven-area IA — INV-22 — owns the literals).
  appPayments: "/app/payments",
  appAccounts: "/app/accounts",
  appActivity: "/app/activity",
  appConnections: "/app/connections",
} as const;
