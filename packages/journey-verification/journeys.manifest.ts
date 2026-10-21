/**
 * @payswap/journey-verification — the J1–J15 journey manifest.
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

/** A journey id from the J1–J15 map (JOURNEY-MAP.md §1). */
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
  },
] as const;

/** The ordered id list J1..J15 (the map is total; the cross-check pins it). */
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
} as const;
