/**
 * @payswap/app — the console SECTIONS bridge for a HOST SHELL (P15).
 *
 * The PaySwap Agent Workspace's eight sections rendered INSIDE a host
 * shell's main content area (the ZCode workspace): the host provides
 * the chrome (its own sidebar nav, breadcrumb, scroll container) and
 * names the ACTIVE SECTION; this bridge provides the section content —
 * the SAME rendering core the full console uses (ConsoleSectionSwitch,
 * shared by construction, never a fork).
 *
 * Mounting laws:
 * - The section path space stays "/console", "/console/<section>" —
 *   kept alive on an in-memory navigation adapter, so the sections'
 *   cross-links (overview → missions intake, empty-state actions) work
 *   unmodified. The host mirrors the active section (onSectionChange)
 *   and drives it (the sectionId prop) — two-way, loop-free.
 * - The store is the BROWSER_PROFILE workspace store (restored P10-B
 *   laws: localStorage persistence, quarantine, fail-closed writes).
 * - No document-title side effects here: the HOST owns the title in
 *   this mode (the full console keeps its own §1 titles).
 * - The parallel-token law: the sections render ps-* under
 *   ps-theme-light inside whatever the host's main area is — never
 *   cross-wired with the host's design tokens.
 */

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useReducedMotion } from "@zcode/ui/payswap";
import "@zcode/ui/payswap-styles.css";
import "../payswap-product.css";
import "../payswap-elevation.css";
import "./console.css";
import "./console-sections.css";
import type {
  ConsoleSectionId,
  ModelProviderStatus,
} from "./contracts.js";
import {
  CONSOLE_ROOT,
  consoleSection,
  consoleSectionPath,
  resolveConsoleSection,
} from "./contracts.js";
import { createMemoryNavigation } from "./memoryNavigation.js";
import { createBrowserWorkspaceStore } from "./browserWorkspaceStore.js";
import { useWorkspaceStore } from "./useWorkspaceStore.js";
import { ConsoleSectionSwitch } from "./ConsoleSectionSwitch.js";
import { ConsoleNotFound } from "./PaySwapAgentWorkspace.js";

export interface PaySwapConsoleSectionsProps {
  /**
   * The active console section (the host nav's source of truth). A
   * string by contract (the shell hands back what the nav items
   * declared); an id that names no section renders the console's
   * honest not-found — never an invented section, never a crash.
   */
  readonly sectionId: string;
  /**
   * The host mirror: called when an in-section link navigates to a
   * different section, so the host's nav highlight follows.
   */
  readonly onSectionChange?: (sectionId: ConsoleSectionId) => void;
  /** The back-to-host affordance (the supporting control's target). */
  readonly onNavigateBack?: () => void;
  /** Optional real model-provider connection state; absent = honest none. */
  readonly modelProviders?: readonly ModelProviderStatus[];
  /** Injectable store clock (tests); default = the pinned ambient seam. */
  readonly clock?: () => string;
}

/** The path an id maps to: its canonical section path, or its own
 * (not-found-resolving) path when it names no section. */
function consolePathForId(id: string): string {
  const section = consoleSection(id);
  return section !== undefined
    ? consoleSectionPath(section.id)
    : `${CONSOLE_ROOT}/${id}`;
}

/** The host-shell console sections bridge (see module header). */
export function PaySwapConsoleSections({
  sectionId,
  onSectionChange,
  onNavigateBack,
  modelProviders,
  clock,
}: PaySwapConsoleSectionsProps): React.ReactNode {
  // ONE in-memory navigation for the mount's lifetime; the prop drives
  // it, and its changes mirror back out (two-way, loop-free below).
  // An id that names no section maps to its (not-found-resolving) path.
  const navigation = useMemo(
    () => createMemoryNavigation(consolePathForId(sectionId)),
    // The initial path only — remounting the navigation per section
    // would drop in-section history; the effect below keeps it in sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const path = useSyncExternalStore(
    useMemo(() => navigation.subscribe.bind(navigation), [navigation]),
    navigation.getPath.bind(navigation),
    navigation.getPath.bind(navigation),
  );
  const route = resolveConsoleSection(path);
  const store = useMemo(() => createBrowserWorkspaceStore(), []);
  const workspace = useWorkspaceStore(store, { clock });
  const reducedMotion = useReducedMotion();

  // Host → bridge: a new active section from the host nav navigates the
  // in-memory path space (same-section clicks are no-ops — loop-free).
  // Unknown ids keep their not-found path (the honest answer stays).
  useEffect(() => {
    const target = consolePathForId(sectionId);
    if (navigation.getPath() !== target) {
      navigation.navigate(target);
    }
  }, [navigation, sectionId]);

  // Bridge → host: an in-section navigation mirrors the resolved
  // section back so the host nav highlight follows. Guarded to fire
  // only on CHANGE (the prop-sync above does not re-echo).
  useEffect(() => {
    if (onSectionChange === undefined) {
      return;
    }
    return navigation.subscribe(() => {
      const resolved = resolveConsoleSection(navigation.getPath());
      const next =
        resolved.kind === "overview"
          ? ("overview" as const)
          : resolved.kind === "section"
            ? resolved.sectionId
            : null;
      if (next !== null && next !== sectionId) {
        onSectionChange(next);
      }
    });
  }, [navigation, onSectionChange, sectionId]);

  const backToProduct = useMemo(
    () => ({
      label: "Back to the host workspace",
      onActivate: () => {
        onNavigateBack?.();
      },
    }),
    [onNavigateBack],
  );

  return (
    <div
      className="ps-theme-light ps-console-sections-bridge"
      data-reduced-motion={reducedMotion ? "true" : undefined}
    >
      {route.kind === "not-found" ? (
        <ConsoleNotFound
          path={route.path}
          navigation={navigation}
          backToProduct={backToProduct}
        />
      ) : (
        <ConsoleSectionSwitch
          route={route}
          workspace={workspace}
          navigation={navigation}
          backToProduct={backToProduct}
          modelProviders={modelProviders}
        />
      )}
    </div>
  );
}
