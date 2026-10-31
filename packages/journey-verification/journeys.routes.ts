/**
 * @payswap/journey-verification — the ROUTE REGISTRIES (the P22-D
 * file-law split from ./journeys.manifest.ts at the ≤400-line law, along
 * the module's own documented seam: the manifest owns the J-ROWS, this
 * file owns the route registries the suites drive). Re-exported from the
 * manifest so every consumer's import path stays unchanged.
 */

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
