/**
 * @zcode/desktop — the PaySwap PRODUCT surface switch (P9-A; extended
 * P10-B).
 *
 * The desktop main window opens the PaySwap product experience
 * (PRODUCT-IDENTITY.md §3 "Desktop"); the agent workspace console
 * renders when the hash opens the supporting console surface (J14), and
 * the ZCode-derived developer workspace (the substrate Root mount, with
 * ALL its existing services/platform wiring untouched) renders as the
 * ADVANCED TECHNICAL INTERFACE at #/console/advanced. The switch itself
 * is thin glue — every routing decision lives in the pure
 * payswapDesktop.ts seam (node-tested), and the product's own laws are
 * tested in @payswap/app.
 *
 * Document titles follow PRODUCT-IDENTITY §1 + CONSOLE-WORKSPACE §1:
 * the window reads "PaySwap" (the loading title in index.html) and
 * route-specific "… — PaySwap" once the product renders; the workspace
 * console reads "PaySwap — Agent Console"; the advanced developer
 * workspace is titled as what it honestly is — the developer workspace
 * of the PaySwap Agent Console.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  PaySwapApp,
  HONEST_DEPLOYMENT_CONTEXT,
  NO_EVIDENCE_COVERAGE,
  resolvePaySwapRoute,
  routeDocumentTitle,
  type DevelopersPageView,
} from "@payswap/app";
import "./productSurface.css";
import {
  createDesktopConsoleEntry,
  desktopProductPathFromHash,
  resolveDesktopSurface,
  type DesktopHashLocation,
} from "./payswapDesktop.js";

type DesktopRendererImportMetaEnv = {
  VITE_PAYSWAP_API_URL?: string;
};

/**
 * The honest API-runtime state for the desktop build: the base URL is a
 * BUILD-TIME injection (VITE_PAYSWAP_API_URL, same variable the web
 * mount reads); when absent the developers surface states the typed
 * missing configuration — never a fabricated URL.
 */
export function resolveDesktopApiRuntimeInput(): DevelopersPageView["apiRuntime"] {
  const env = ((import.meta as ImportMeta & { env?: DesktopRendererImportMetaEnv }).env ??
    {}) as DesktopRendererImportMetaEnv;
  const baseUrl = env.VITE_PAYSWAP_API_URL?.trim() || null;
  return {
    configured: baseUrl !== null,
    baseUrl,
    envVar: "VITE_PAYSWAP_API_URL",
  };
}

export interface ProductSurfaceSwitchProps {
  /** The injected hash location (browser in production, fake in tests). */
  readonly location: DesktopHashLocation;
  /** The advanced developer console subtree — the existing Root mount, wiring untouched. */
  readonly renderConsole: () => ReactNode;
  /**
   * The PaySwap Agent Workspace subtree (P10-B): the injected component
   * carries its own PaySwap chrome AND its back-to-product affordance —
   * the switch adds no floating button on this surface.
   */
  readonly renderWorkspace: () => ReactNode;
  readonly apiRuntime?: DevelopersPageView["apiRuntime"];
}

export function ProductSurfaceSwitch({
  location,
  renderConsole,
  renderWorkspace,
  apiRuntime = resolveDesktopApiRuntimeInput(),
}: ProductSurfaceSwitchProps) {
  const [hash, setHash] = useState(() => location.getHash());
  useEffect(() => {
    return location.addHashChangeListener(() => {
      setHash(location.getHash());
    });
  }, [location]);

  const navigation = createNavigationAdapter(location);
  const surface = resolveDesktopSurface(hash);

  // Document titles are a platform concern (the window title bar):
  // route-specific "… — PaySwap" on the product; the workspace console
  // is framed as a capability of PaySwap ("PaySwap — Agent Console");
  // the advanced surface is titled as the developer workspace it is.
  useEffect(() => {
    document.title =
      surface === "console"
        ? "PaySwap — Agent Console"
        : surface === "console-advanced"
          ? "Developer Workspace — PaySwap Agent Console"
          : routeDocumentTitle(resolvePaySwapRoute(desktopProductPathFromHash(hash)));
  }, [surface, hash]);

  if (surface === "console") {
    // The workspace component carries its own PaySwap chrome + back
    // affordance — no floating button here (CONSOLE-WORKSPACE §1).
    return <>{renderWorkspace()}</>;
  }

  if (surface === "console-advanced") {
    return (
      <>
        {renderConsole()}
        {/* The supporting-control back to the product. The advanced
            surface's own chrome belongs to the ZCode shell (untouched),
            so the switch renders this small floating affordance instead —
            honest, discoverable, PaySwap-branded. */}
        <button
          type="button"
          className="ps-desktop-back-to-product"
          onClick={() => {
            location.setHash("#/");
          }}
        >
          ← PaySwap
        </button>
      </>
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
      console={createDesktopConsoleEntry(location)}
    />
  );
}

/** One navigation adapter per location identity (stable callbacks for hooks). */
function createNavigationAdapter(location: DesktopHashLocation) {
  const subscribe = useCallback(
    (listener: () => void) => location.addHashChangeListener(listener),
    [location],
  );
  const getPath = useCallback(
    () => desktopProductPathFromHash(location.getHash()),
    [location],
  );
  const navigate = useCallback((to: string) => {
    location.setHash(`#${to}`);
  }, [location]);
  return { subscribe, getPath, navigate };
}
