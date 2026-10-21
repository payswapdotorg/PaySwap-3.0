/**
 * @payswap/app — the PaySwap web product root.
 *
 * NET-NEW (P7-W1, MMP-36): the product app shell on the @zcode/web
 * substrate. A minimal history-based router (the substrate is a Vite SPA —
 * no Next.js; the old product's file-routes are re-expressed as the
 * resolvePaySwapRoute table) renders the public pages + the honest
 * authenticated entry boundary. All page data arrives via the explicit
 * PayswapProductInput (presentation-only: no fetch in the product's view
 * layer — the runtime host wires transport at TL accept-time integration).
 *
 * The shell mounts the PaySwap token theme (ps-theme-light) so the
 * product's tokens apply independent of the ZCode substrate theme state.
 */

import { useEffect, useState } from "react";
import { SkipLink } from "@zcode/ui/payswap";
import "@zcode/ui/payswap-styles.css";
import "../payswap-product.css";
import "../payswap-home.css";
import type { CoverageSource, DevelopersPageView } from "../contracts/view-models.js";
import type { OutcomeDeploymentContextPin } from "../pins/surface-pins.js";
import { foldCoverage } from "../lib/coverage.js";
import { foldNavigation } from "../lib/navigation.js";
import { foldOutcomeBoard } from "../lib/outcome-board.js";
import { resolvePaySwapRoute } from "../routes.js";
import { HomePage } from "../pages/HomePage.js";
import { CapabilitiesPage } from "../pages/CapabilitiesPage.js";
import { SecurityPage } from "../pages/SecurityPage.js";
import { DevelopersPage } from "../pages/DevelopersPage.js";
import { AppEntryPage } from "../pages/AppEntryPage.js";
import { NotFoundPage } from "../pages/NotFoundPage.js";
import { SiteFooter, SiteHeader, SiteNav } from "./SiteChrome.js";

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

function usePathname(): string {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPopState = (): void => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  return pathname;
}

export function PaySwapWebApp({ input }: { readonly input: PaySwapProductInput }) {
  const pathname = usePathname();
  const route = resolvePaySwapRoute(pathname);
  const coverageView = foldCoverage(input.coverage);
  const navigation = foldNavigation();
  const outcomeBoard = foldOutcomeBoard(input.deployment);

  return (
    <div className="ps-theme-light ps-product-root">
      <SkipLink href="#ps-main">Skip to main content</SkipLink>
      <SiteHeader currentPath={pathname} />
      <SiteNav currentPath={pathname} />
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
        {route.kind === "app-entry" ? (
          <AppEntryPage navigation={navigation} outcomeBoard={outcomeBoard} />
        ) : null}
        {route.kind === "not-found" ? <NotFoundPage path={route.path} /> : null}
      </main>
      <SiteFooter />
    </div>
  );
}
