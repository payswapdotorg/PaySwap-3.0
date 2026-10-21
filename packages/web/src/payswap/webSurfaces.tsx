/**
 * @zcode/web — the PaySwap WEB SURFACES switch (P10-B).
 *
 * ONE React tree for the two PaySwap-owned browser surfaces so that
 * navigation between the product and the Agent Workspace is a HISTORY
 * PUSH — never a renderer reload (CONSOLE-WORKSPACE.md §2: "navigation
 * between product surface ↔ workspace sections MUST NOT reload the
 * renderer (desktop hash switch; web history push)"):
 *
 * - product surface (/, /app…, /capabilities…): the PaySwapApp over the
 *   shared web navigation adapter, with the supporting console entry
 *   wired to an IN-TREE push (J14);
 * - console surface (/console, /console/<section>): the PaySwap Agent
 *   Workspace over the same navigation (the "/console…" path space is
 *   the real browser path space on web) + the BROWSER_PROFILE store +
 *   the back-to-product affordance.
 *
 * Surfaces the BOOTSTRAP owns — the advanced developer workspace at
 * /console/advanced (it needs its own server bootstrap + the ZCode Root
 * mount), the conversation-share pages and the OAuth callback — are
 * handed over with a REAL navigation (window.location.assign): they are
 * separate mounts, exactly as in P9-A (the §2 no-reload law covers
 * product ↔ workspace; "advanced" is NOT a workspace section).
 */

import { useEffect, useMemo, useState } from "react";
import {
  HONEST_DEPLOYMENT_CONTEXT,
  NO_EVIDENCE_COVERAGE,
  PAYSWAP_CONSOLE_PATH,
  PaySwapAgentWorkspace,
  PaySwapApp,
  routeDocumentTitle,
  type DevelopersPageView,
} from "@payswap/app";
import { createWebNavigation } from "./webNavigation.js";
import { resolveWebSurface } from "./webRouteGate.js";
import { createBrowserWorkspaceStore } from "./workspaceStore.js";

export interface PaySwapSurfacesProps {
  /** The honest API-runtime view (vite env; typed missing configuration). */
  readonly apiRuntime: DevelopersPageView["apiRuntime"];
}

/**
 * The two PaySwap-owned web surfaces in one reload-free tree. The mount
 * (main.tsx) renders this for every gate decision the product or the
 * workspace owns; the surface re-decides on every path change.
 */
export function PaySwapSurfaces({ apiRuntime }: PaySwapSurfacesProps) {
  // ONE navigation adapter (history push + popstate + the manual-emit
  // trick) and ONE store instance across both surfaces — the adapters
  // are stable for the lifetime of the mount.
  const navigation = useMemo(() => createWebNavigation(), []);
  const store = useMemo(() => createBrowserWorkspaceStore(), []);
  const [path, setPath] = useState(() => navigation.getPath());
  useEffect(
    () => navigation.subscribe(() => setPath(navigation.getPath())),
    [navigation],
  );

  // The pure gate re-decides on every path change (in-tree navigations
  // only ever target product paths or the /console… path space).
  const decision = resolveWebSurface({ pathname: path, hasState: false, hasCodeOrError: false });

  // Document titles are a platform concern: the workspace reads
  // "PaySwap — Agent Console" (CONSOLE-WORKSPACE §1); the product's
  // route titles are reported by its own onRouteChange below.
  useEffect(() => {
    document.title = decision.kind === "console" ? "PaySwap — Agent Console" : "PaySwap";
  }, [decision.kind]);

  // Bootstrap-owned surfaces (advanced developer workspace, share,
  // OAuth callback, legacy /payswap URLs) hand over with a REAL
  // navigation — they are separate mounts with their own bootstrap.
  useEffect(() => {
    if (
      decision.kind === "console-advanced" ||
      decision.kind === "share" ||
      decision.kind === "oauth-callback" ||
      decision.kind === "legacy-redirect"
    ) {
      window.location.assign(path);
    }
  }, [decision.kind, path]);

  if (decision.kind === "console") {
    // The workspace component carries its own PaySwap chrome + back
    // affordance (CONSOLE-WORKSPACE §1) — the switch adds nothing.
    return (
      <PaySwapAgentWorkspace
        navigation={navigation}
        store={store}
        backToProduct={{ label: "PaySwap", onActivate: () => navigation.navigate("/") }}
      />
    );
  }

  return (
    <PaySwapApp
      input={{
        deployment: HONEST_DEPLOYMENT_CONTEXT,
        coverage: NO_EVIDENCE_COVERAGE,
        apiRuntime,
      }}
      navigation={navigation}
      console={{
        label: "Agent console",
        // In-tree push (§2: product → workspace never reloads the page).
        onOpen: () => navigation.navigate(PAYSWAP_CONSOLE_PATH),
      }}
      onRouteChange={(route) => {
        document.title = routeDocumentTitle(route);
      }}
    />
  );
}
