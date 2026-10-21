/**
 * @payswap/app — the PaySwap product root (platform-agnostic).
 *
 * NET-NEW (P7-W1, MMP-36; P9-A REWRITE): the product app shell. A
 * navigation-adapter-driven router (the platform mount injects history
 * (web) or hash (desktop) routing — the product itself never touches the
 * ambient window) renders the public pages + the honest authenticated app
 * surface per the TOP-LEVEL route contract (routes.ts — PRODUCT-IDENTITY
 * §3). All page data arrives via the explicit PayswapProductInput
 * (presentation-only: no fetch in the product's view layer).
 *
 * The shell mounts the PaySwap token theme (ps-theme-light) so the
 * product's tokens apply independent of the substrate theme state, and
 * reports route changes to the mount (document titles are a PLATFORM
 * concern: "… — PaySwap" per PRODUCT-IDENTITY §1).
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { SkipLink } from "@zcode/ui/payswap";
import "@zcode/ui/payswap-styles.css";
import "../payswap-product.css";
import "../payswap-home.css";
import "../payswap-elevation.css";
import type { CoverageSource, DevelopersPageView } from "../contracts/view-models.js";
import type { OutcomeDeploymentContextPin } from "../pins/surface-pins.js";
import { foldCoverage } from "../lib/coverage.js";
import { foldNavigation } from "../lib/navigation.js";
import { foldOutcomeBoard } from "../lib/outcome-board.js";
import { resolvePaySwapRoute, type PaySwapRoute } from "../routes.js";
import { HomePage } from "../pages/HomePage.js";
import { CapabilitiesPage } from "../pages/CapabilitiesPage.js";
import { SecurityPage } from "../pages/SecurityPage.js";
import { DevelopersPage } from "../pages/DevelopersPage.js";
import { AppOverviewPage } from "../pages/AppOverviewPage.js";
import { AreaPage } from "../pages/AreaPage.js";
import { NotFoundPage } from "../pages/NotFoundPage.js";
import type { PaySwapNavigation } from "./navigation.js";
import {
  AppAreaNav,
  SiteFooter,
  SiteHeader,
  SiteNav,
  type PaySwapConsoleEntry,
} from "./SiteChrome.js";

/** Everything the product needs as EXPLICIT input (no ambient reads). */
export interface PaySwapProductInput {
  readonly deployment: OutcomeDeploymentContextPin;
  readonly coverage: CoverageSource;
  readonly apiRuntime: DevelopersPageView["apiRuntime"];
}

const DEVELOPER_CONTRACTS: readonly string[] = [
  "The five outcome actions with honest dispatchability facts",
  "The quote/terms disclosure projection — fees, rate provenance, expiry, estimate-vs-guarantee labels",
  "The one-truthful-lifecycle progress states (16 stages)",
  "The BLOCK/ALLOW/UNKNOWN security vocabulary in people language",
  "Exact integer minor-unit money display",
];

export interface PaySwapAppProps {
  readonly input: PaySwapProductInput;
  /** The platform navigation adapter (history on web, hash on desktop). */
  readonly navigation: PaySwapNavigation;
  /** The supporting console entry (J14: reachable, visually secondary). */
  readonly console?: PaySwapConsoleEntry;
  /** Route-change reporting (platform mounts derive document titles). */
  readonly onRouteChange?: (route: PaySwapRoute, path: string) => void;
}

export function PaySwapApp({ input, navigation, console: consoleEntry, onRouteChange }: PaySwapAppProps) {
  const subscribe = useCallback((listener: () => void) => navigation.subscribe(listener), [navigation]);
  const getPath = useCallback(() => navigation.getPath(), [navigation]);
  const path = useSyncExternalStore(subscribe, getPath, getPath);
  const route = resolvePaySwapRoute(path);

  const coverageView = foldCoverage(input.coverage);
  const navigationView = foldNavigation();
  const outcomeBoard = foldOutcomeBoard(input.deployment);
  const isAppRoute = route.kind === "app-overview" || route.kind === "app-area";

  // Report route changes to the platform mount (document titles are a
  // platform concern). An effect, never a render-phase side channel.
  const routeKey = route.kind === "app-area" ? `app-area:${route.areaId}` : route.kind;
  useEffect(() => {
    onRouteChange?.(route, path);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- routeKey + path fully identify the change.
  }, [routeKey, path]);

  return (
    <div className="ps-theme-light ps-product-root">
      <SkipLink href="#ps-main">Skip to main content</SkipLink>
      <SiteHeader navigation={navigation} console={consoleEntry} />
      <SiteNav currentPath={path} navigation={navigation} />
      {isAppRoute ? (
        <AppAreaNav
          currentPath={path}
          navigation={navigation}
          areas={navigationView.areas.map((area) => ({
            id: area.id,
            label: area.label,
            route: area.route,
          }))}
        />
      ) : null}
      <main id="ps-main" className="ps-product-main">
        {route.kind === "home" ? (
          <HomePage
            view={{
              positioning: {
                headline:
                  "A non-custodial economic operating system for the payment providers and rails you already use.",
                subheadline:
                  "PaySwap connects you to your providers and rails — pay, receive, move, convert and reconcile in one place, with authorization and evidence for every financial action. You keep custody of your money and your credentials. Always.",
              },
              outcomeBoard,
              coverageSummary: coverageView,
              commitments: [
                "We never hold your credentials",
                "We never hold your money",
                "Every action carries evidence",
              ],
            }}
            navigation={navigation}
          />
        ) : null}
        {route.kind === "capabilities" ? <CapabilitiesPage view={coverageView} /> : null}
        {route.kind === "security" ? <SecurityPage /> : null}
        {route.kind === "developers" ? (
          <DevelopersPage
            view={{
              apiRuntime: input.apiRuntime,
              consumableContracts: DEVELOPER_CONTRACTS,
            }}
          />
        ) : null}
        {route.kind === "app-overview" ? (
          <AppOverviewPage navigation={navigationView} outcomeBoard={outcomeBoard} />
        ) : null}
        {route.kind === "app-area" ? (
          <AreaPage
            areaId={route.areaId}
            navigation={navigationView}
            outcomeBoard={outcomeBoard}
          />
        ) : null}
        {route.kind === "not-found" ? <NotFoundPage path={route.path} /> : null}
      </main>
      <SiteFooter navigation={navigation} />
    </div>
  );
}
