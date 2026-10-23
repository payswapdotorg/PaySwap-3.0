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

// The PaySwap Agent Workspace (console surface, Phase 10 —
// spec/surface/CONSOLE-WORKSPACE.md). The component + port types are the
// cross-lane seam the desktop renderer mount and the web console mount
// compile against; P10-C owns the implementation under src/console/.
export {
  PaySwapAgentWorkspace,
  type PaySwapAgentWorkspaceProps,
  type MissionDetail,
  type MissionDraftStatus,
  type MissionEvent,
  type MissionEventKind,
  type MissionIntakeInput,
  type MissionIntentDirection,
  type MissionLifecycleRung,
  type MissionAmountSpec,
  type MissionRecord,
  type MissionRungState,
  type MissionStructuralValidation,
  type MissionSummary,
  type ModelProviderStatus,
  type WorkspaceStoreDurability,
  type WorkspaceStorePort,
} from "./console/PaySwapAgentWorkspace.js";

// The agent-led payment UX (P13; the public API for the P15 zcode-shell
// integration — the shared typed-intent composer + the entry actions).
export {
  AgentComposer,
  type AgentComposerProps,
} from "./agent/AgentComposer.js";
export {
  PaySwapAgentExperience,
  type PaySwapAgentExperienceProps,
} from "./agent/AgentExperience.js";
export {
  createAgentComposerController,
  resetSharedAgentComposerController,
  sharedAgentComposerController,
  type AgentComposerController,
} from "./agent/agentComposerController.js";
export {
  routeAgentText,
  AGENT_INTENT_UNKNOWN_REPLY,
} from "./agent/intentRouter.js";
export {
  AGENT_PAYMENT_DIRECTION_ENTRIES,
  agentPaymentDirectionEntries,
  type AgentPaymentDirectionEntry,
} from "./lib/agent-payment-entries.js";
export {
  agentProviderSetupCards,
  type AgentProviderSetupCard,
} from "./lib/agent-provider-entries.js";

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
