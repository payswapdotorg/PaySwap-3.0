/**
 * @payswap/app — the PaySwap Agent Workspace (console surface).
 *
 * THE CROSS-LANE SEAM (Phase 10): the exported names on this module path
 * are the compile contract the desktop renderer mount and the web
 * console mount (Lane P10-B) import — PaySwapAgentWorkspace,
 * PaySwapAgentWorkspaceProps, the Mission / WorkspaceStore type family
 * and ModelProviderStatus. The pinned shapes live in ./contracts.ts
 * (byte-exact to spec/surface/CONSOLE-WORKSPACE.md §3/§5) and are
 * re-exported here so the module path stays the single import site.
 *
 * The real shell (CONSOLE-WORKSPACE.md §1/§2/§8, P11 redesign): PaySwap
 * chrome (the ps- design system + ps-theme-light, the wordmark with
 * "Agent Workspace" framing), the eight-section navigation (iconed
 * sidebar with Settings pinned at desktop widths, horizontal scroll
 * nav at mobile), the honest workspace footer (§5 durability fact +
 * live mission count), aria-current on the active section, semantic
 * landmarks, a skip link to the main region, route-specific document
 * titles via the pure consoleDocumentTitle helper + an effect, and the
 * honest not-found for unknown section paths — inside the workspace
 * chrome, never the ZCode shell, never a blank screen. The overview
 * intake-entry actions navigate to the missions intake PREFILLED
 * (in-component request state; the path space is unchanged). Projections
 * only: the store port is the single mutation surface; UNKNOWN never
 * renders as failure or success.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { EmptyState, SkipLink, useReducedMotion } from "@zcode/ui/payswap";
import "@zcode/ui/payswap-styles.css";
import "../payswap-product.css";
import "../payswap-elevation.css";
import "./console.css";
import "./console-sections.css";
import type { PaySwapNavigation } from "../shell/navigation.js";
import { ProductLink } from "../shell/ProductLink.js";
import type {
  ConsoleSectionRecord,
  ModelProviderStatus,
  WorkspaceStorePort,
} from "./contracts.js";
import {
  CONSOLE_ROOT,
  consoleDocumentTitle,
  consoleSection,
  isConsoleAdvancedPath,
  resolveConsoleSection,
} from "./contracts.js";
import {
  ConsoleFooter,
  ConsoleSidebar,
  ConsoleSectionNav,
  ConsoleTopbar,
  type ConsoleBackToProduct,
} from "./ConsoleChrome.js";
import { useWorkspaceStore } from "./useWorkspaceStore.js";
import { storeDurabilityLabel } from "./section-vocabulary.js";
import { OverviewSection, type OverviewIntakePrefill } from "./sections/OverviewSection.js";
import { MissionsSection, type MissionsIntakeRequest } from "./sections/MissionsSection.js";
import { AgentsSection } from "./sections/AgentsSection.js";
import { ApprovalsSection } from "./sections/ApprovalsSection.js";
import { ConnectionsSection } from "./sections/ConnectionsSection.js";
import { ActivitySection } from "./sections/ActivitySection.js";
import { LabSection } from "./sections/LabSection.js";
import { SettingsSection } from "./sections/SettingsSection.js";

/* ====================================================================
 * The pinned cross-lane shapes (re-exported from contracts.ts — the
 * stable seam surface; drift is a defect)
 * ==================================================================== */

export type {
  ConsoleRoute,
  ConsoleSectionId,
  ConsoleSectionRecord,
  MissionAmountSpec,
  MissionDetail,
  MissionDraftStatus,
  MissionEvent,
  MissionEventKind,
  MissionIntakeInput,
  MissionIntentDirection,
  MissionLifecycleRung,
  MissionRecord,
  MissionRungState,
  MissionStructuralValidation,
  MissionSummary,
  ModelProviderStatus,
  WorkspaceStoreDurability,
  WorkspaceStorePort,
} from "./contracts.js";

export {
  CONSOLE_ROOT,
  CONSOLE_ADVANCED_PATH,
  CONSOLE_SECTION_IDS,
  CONSOLE_SECTIONS,
  consoleSection,
  consoleSectionPath,
  consoleDocumentTitle,
  isConsoleAdvancedPath,
  resolveConsoleSection,
} from "./contracts.js";

export interface PaySwapAgentWorkspaceProps {
  /**
   * The console navigation adapter. Path space: "/console" (root →
   * overview) and "/console/<section>" for the eight section ids.
   */
  readonly navigation: PaySwapNavigation;
  /** The workspace store port (DESKTOP_PROFILE or BROWSER_PROFILE). */
  readonly store: WorkspaceStorePort;
  /** The supporting-control back to the PaySwap product surface. */
  readonly backToProduct: {
    readonly label: string;
    readonly onActivate: () => void;
  };
  /** Optional real model-provider connection state; absent = honest none. */
  readonly modelProviders?: readonly ModelProviderStatus[];
  /**
   * Optional platform clock for store mutations (ISO-8601 UTC instants).
   * The default reads the ambient UTC instant once per user-initiated
   * mutation — the pinned port's explicit `now` input (§5), never a
   * displayed value.
   */
  readonly clock?: () => string;
}

/** The honest not-found for an unknown console path (inside the chrome). */
export function ConsoleNotFound({
  path,
  navigation,
  backToProduct,
}: {
  readonly path: string;
  readonly navigation: PaySwapNavigation;
  readonly backToProduct: ConsoleBackToProduct;
}) {
  return (
    <section aria-labelledby="ps-console-notfound-heading" className="ps-console-section">
      <header className="ps-console-section-header">
        <p className="ps-console-eyebrow">PaySwap Agent Workspace</p>
        <h1 id="ps-console-notfound-heading" className="ps-console-section-title">
          Section not found
        </h1>
        <p className="ps-console-section-lede">
          This console address does not name a workspace section. The
          workspace keeps its chrome and answers honestly — never a blank
          screen, never an invented section.
        </p>
      </header>
      <EmptyState
        title="Nothing was found at this console address"
        description={`No workspace section exists at ${path}. The eight sections are overview, missions, agents, approvals, connections, activity, lab and settings.`}
        action={
          <ProductLink
            to={CONSOLE_ROOT}
            navigation={navigation}
            className="ps-console-action ps-console-action--primary"
          >
            Go to the workspace overview
          </ProductLink>
        }
        className="ps-console-empty"
      />
      <p className="ps-console-line-actions">
        <button type="button" className="ps-console-link" onClick={backToProduct.onActivate}>
          {backToProduct.label}
        </button>
      </p>
    </section>
  );
}

/** The real PaySwap Agent Workspace (the seam implementation). */
export function PaySwapAgentWorkspace({
  navigation,
  store,
  backToProduct,
  modelProviders,
  clock,
}: PaySwapAgentWorkspaceProps) {
  const subscribe = useCallback((listener: () => void) => navigation.subscribe(listener), [navigation]);
  const getPath = useCallback(() => navigation.getPath(), [navigation]);
  const path = useSyncExternalStore(subscribe, getPath, getPath);
  const route = resolveConsoleSection(path);
  const workspace = useWorkspaceStore(store, { clock });
  const reducedMotion = useReducedMotion();

  // Route-specific document titles (§1) — a pure helper + an effect,
  // applied only where a document exists (platform-agnostic package).
  const titleKey = route.kind === "section" ? `section:${route.sectionId}` : route.kind;
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = consoleDocumentTitle(route);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- titleKey fully identifies the title change.
  }, [titleKey]);

  const activeSectionId =
    route.kind === "overview" ? "overview" : route.kind === "section" ? route.sectionId : null;

  const openMissionFromOverview = useCallback(
    (id: string) => {
      workspace.openDetail(id);
      navigation.navigate(`${CONSOLE_ROOT}/missions`);
    },
    [navigation, workspace],
  );

  // The overview intake-entry request (P11): the prefill lives in
  // component state (the path space is unchanged — §2); the seq keys the
  // missions intake's remount so each request is consumed exactly once.
  const [intakeRequest, setIntakeRequest] = useState<MissionsIntakeRequest | null>(null);
  const startMissionFromOverview = useCallback(
    (prefill: OverviewIntakePrefill) => {
      setIntakeRequest((current) => ({
        seq: (current?.seq ?? 0) + 1,
        prefill,
      }));
      navigation.navigate(`${CONSOLE_ROOT}/missions`);
    },
    [navigation],
  );

  const sectionById = (id: string): ConsoleSectionRecord => {
    const record = consoleSection(id);
    if (record === undefined) {
      // Fail-closed: the route table never resolves an unknown section,
      // but a drifted IA mirror must never render a half-invented view.
      throw new Error(`PaySwapAgentWorkspace: unknown console section ${JSON.stringify(id)}`);
    }
    return record;
  };

  return (
    <div
      className="ps-theme-light ps-console-root"
      data-reduced-motion={reducedMotion ? "true" : undefined}
    >
      <SkipLink href="#ps-console-main">Skip to main content</SkipLink>
      <ConsoleTopbar backToProduct={backToProduct} />
      <ConsoleSectionNav activeSectionId={activeSectionId} navigation={navigation} />
      <div className="ps-console-shell">
        <ConsoleSidebar activeSectionId={activeSectionId} navigation={navigation} />
        <main id="ps-console-main" tabIndex={-1} className="ps-console-main">
          {route.kind === "overview" ||
          (route.kind === "section" && route.sectionId === "overview") ? (
            <OverviewSection
              section={sectionById("overview")}
              workspace={workspace}
              navigation={navigation}
              onOpenMission={openMissionFromOverview}
              onStartMission={startMissionFromOverview}
            />
          ) : null}
          {route.kind === "section" && route.sectionId === "missions" ? (
            <MissionsSection
              section={sectionById("missions")}
              workspace={workspace}
              navigation={navigation}
              intakeRequest={intakeRequest ?? undefined}
            />
          ) : null}
          {route.kind === "section" && route.sectionId === "agents" ? (
            <AgentsSection section={sectionById("agents")} modelProviders={modelProviders} />
          ) : null}
          {route.kind === "section" && route.sectionId === "approvals" ? (
            <ApprovalsSection section={sectionById("approvals")} />
          ) : null}
          {route.kind === "section" && route.sectionId === "connections" ? (
            <ConnectionsSection
              section={sectionById("connections")}
              navigation={navigation}
              backToProduct={backToProduct}
              modelProviders={modelProviders}
            />
          ) : null}
          {route.kind === "section" && route.sectionId === "activity" ? (
            <ActivitySection
              section={sectionById("activity")}
              workspace={workspace}
              navigation={navigation}
            />
          ) : null}
          {route.kind === "section" && route.sectionId === "lab" ? (
            <LabSection section={sectionById("lab")} />
          ) : null}
          {route.kind === "section" && route.sectionId === "settings" ? (
            <SettingsSection
              section={sectionById("settings")}
              durability={store.durability}
              navigation={navigation}
            />
          ) : null}
          {route.kind === "not-found" ? (
            <ConsoleNotFound path={route.path} navigation={navigation} backToProduct={backToProduct} />
          ) : null}
        </main>
      </div>
      <ConsoleFooter
        durabilityFact={storeDurabilityLabel(store.durability).fact}
        missionCount={
          workspace.list.phase === "ready" ? workspace.list.summaries.length : undefined
        }
      />
    </div>
  );
}
