/**
 * @payswap/app — the public API of the PaySwap product application.
 *
 * NET-NEW (P9-A): the PaySwap product moved out of @zcode/web/src/payswap
 * into this standalone package so the WEB mount (@zcode/web) and the
 * DESKTOP renderer (@zcode/desktop) consume ONE product surface. The
 * package is PRESENTATIONAL with injected platform/data adapters: pages
 * render from explicit view inputs (no fetch, no ambient session state —
 * INV-23 projection law at the product boundary).
 *
 * Consumers bring:
 * - the design layer: @zcode/ui/payswap (tokens + primitives);
 * - the platform mount: a navigation adapter (web: history; desktop:
 *   hash) + the honest deployment facts for the runtime.
 */

// Route table (PRODUCT-IDENTITY.md §3 — the canonical route contract).
export {
  PAYSWAP_CONSOLE_PATH,
  PAYSWAP_LEGACY_PREFIX,
  isPaySwapLegacyPath,
  isPaySwapProductPath,
  resolvePaySwapLegacyRedirect,
  resolvePaySwapRoute,
  routeDocumentTitle,
  type PaySwapRoute,
} from "./routes.js";

// The product shell + its input contract.
export { PaySwapApp, type PaySwapAppProps, type PaySwapProductInput } from "./shell/PaySwapApp.js";
export {
  AppAreaNav,
  ConsoleLink,
  SiteFooter,
  SiteHeader,
  SiteNav,
  type PaySwapConsoleEntry,
} from "./shell/SiteChrome.js";
export { ProductLink, type ProductLinkProps } from "./shell/ProductLink.js";
export {
  createStaticNavigation,
  type PaySwapNavigation,
} from "./shell/navigation.js";

// The honest harness facts (the deployment truth this repository phase).
export {
  HONEST_DEPLOYMENT_CONTEXT,
  NO_EVIDENCE_COVERAGE,
  WEB_ORACLE_HARNESS,
  WEB_ORACLE_HARNESS_VERSION,
  type WebOracleHarness,
} from "./contracts/harness.js";

// View-model contracts (typed projections consumers build inputs against).
export type {
  CoverageSource,
  CoverageView,
  DevelopersPageView,
  HomePageView,
  NavigationAreaView,
  NavLink,
  OutcomeBoardRow,
  OutcomeBoardView,
} from "./contracts/view-models.js";
