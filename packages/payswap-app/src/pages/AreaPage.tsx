/**
 * @payswap/app — one AREA surface of the app (/app/<area>).
 *
 * P9-A NET-NEW (JOURNEY-MAP §1, J3–J13): every journey that "lands in an
 * area" gets its real, focused surface — not a dead overview card. The
 * page renders, in order:
 *
 * 1. The area's pinned identity: label + purpose (the canonical
 *    eleven-area IA — the versioned contract).
 * 2. The designed-empty state, VERBATIM from the pinned emptyState
 *    contract: why the area is empty and the real next action — never a
 *    spinner, never fabricated rows (the eleven-area map laws).
 * 3. The area's own surface: P12 gives payments/connections/accounts a
 *    dedicated surface (the typed action set / the PSP setup flow + the
 *    onchain rail / the observations block — see ./areas/); every other
 *    area renders the generic anchored outcome actions
 *    (lib/outcome-area-aliases.ts): each states its honest
 *    dispatchability — when not dispatchable, the typed missing
 *    prerequisite renders verbatim with the impact line and the
 *    configure/learn route (the honesty law §5.4: zero dead buttons,
 *    zero misleading active states).
 * 4. The area's onward links (its own next action + the related public
 *    surfaces).
 *
 * The page is honest about the deployment phase throughout: the session
 * plane is not wired, so every area renders its designed-empty truth.
 */

import {
  Card,
  EmptyState,
  EnvironmentBanner,
  StatusPill,
} from "@zcode/ui/payswap";
import type { ReactNode } from "react";
import type { NavigationAreaView, OutcomeBoardView } from "../contracts/view-models.js";
import type { UniversalAreaIdPin } from "../pins/surface-pins.js";
import { areaEmptyState } from "../lib/navigation.js";
import { outcomeActionsForArea } from "../lib/outcome-area-aliases.js";
import type { PaySwapNavigation } from "../shell/navigation.js";
import { ProductLink } from "../shell/ProductLink.js";
import { PaymentsAreaSurface } from "./areas/PaymentsAreaSurface.js";
import { ConnectionsAreaSurface } from "./areas/ConnectionsAreaSurface.js";
import { AccountsAreaSurface } from "./areas/AccountsAreaSurface.js";

/** The area-specific onward links (public surfaces, real routes only). */
const AREA_ONWARD_LINKS: Readonly<Record<string, readonly { to: string; label: string }[]>> = {
  capabilities: [{ to: "/capabilities", label: "Open the full coverage explorer" }],
  security: [{ to: "/security", label: "Read the security & non-custody commitments" }],
  developers: [{ to: "/developers", label: "Open the developer surface" }],
  connections: [{ to: "/capabilities", label: "See live provider coverage" }],
};

/**
 * The P12 area-specific surfaces (C2/C3/C4): payments carries the typed
 * action set + the adjacent operational surfaces; connections carries the
 * PSP setup flow + the onchain rail. Both OWN the generic sections
 * (anchored outcome actions + onward links — they render richer versions).
 * accounts gets an ADD-ON surface (the observations block) rendered in
 * ADDITION to the generic anchored actions (Move/Convert stay). The
 * shared scaffold (pinned empty state, sparseness note) always renders.
 */
interface AreaSurfaceDecision {
  /** The surface node (null = the fully generic page). */
  readonly node: ReactNode;
  /** True when the surface replaces the generic anchored-actions +
   * onward-links sections; false = render it as an add-on before them. */
  readonly ownsSections: boolean;
}

function areaSpecificSurface(
  areaId: UniversalAreaIdPin,
  props: {
    readonly navigation: NavigationAreaView;
    readonly outcomeBoard: OutcomeBoardView;
    readonly productNavigation?: PaySwapNavigation;
  },
): AreaSurfaceDecision | null {
  switch (areaId) {
    case "payments":
      return {
        ownsSections: true,
        node: (
          <PaymentsAreaSurface
            navigation={props.navigation}
            outcomeBoard={props.outcomeBoard}
            productNavigation={props.productNavigation}
          />
        ),
      };
    case "connections":
      return {
        ownsSections: true,
        node: <ConnectionsAreaSurface productNavigation={props.productNavigation} />,
      };
    case "accounts":
      return {
        ownsSections: false,
        node: <AccountsAreaSurface productNavigation={props.productNavigation} />,
      };
    default:
      return null;
  }
}

export function AreaPage({
  areaId,
  navigation,
  outcomeBoard,
  productNavigation,
}: {
  readonly areaId: UniversalAreaIdPin;
  readonly navigation: NavigationAreaView;
  readonly outcomeBoard: OutcomeBoardView;
  readonly productNavigation?: PaySwapNavigation;
}) {
  const area = navigation.areas.find((entry) => entry.id === areaId);
  if (area === undefined) {
    // Fail-closed: the route table never resolves an unknown area, but a
    // drifted IA mirror must never render a half-invented surface.
    throw new Error(`AreaPage: unknown area id ${JSON.stringify(areaId)}`);
  }
  const emptyState = areaEmptyState(areaId);
  const anchoredActions = outcomeActionsForArea(areaId).map((alias) => ({
    alias,
    row: outcomeBoard.rows.find((row) => row.actionId === alias.actionId),
  }));
  const onwardLinks = AREA_ONWARD_LINKS[areaId] ?? [];
  const nextActionHref = emptyState.nextAction.value;
  const surface = areaSpecificSurface(areaId, {
    navigation,
    outcomeBoard,
    productNavigation,
  });

  return (
    <article className="ps-page">
      <EnvironmentBanner environment="test" />
      <header className="ps-page-header">
        <p className="ps-page-eyebrow">PaySwap product</p>
        <h1 className="ps-page-title">{area.label}</h1>
        <p className="ps-page-lede">{area.purpose}</p>
      </header>

      <section aria-labelledby="area-state-heading" className="ps-page-section">
        <h2 id="area-state-heading" className="ps-page-section-title">
          The honest state of this area
        </h2>
        <EmptyState
          title={`${area.label} is empty by design — and says why`}
          description={emptyState.reason}
          action={
            emptyState.nextAction.kind === "route" && nextActionHref.startsWith("/app/") ? (
              <ProductLink
                to={nextActionHref}
                navigation={productNavigation}
                className="ps-home-cta ps-home-cta--primary"
              >
                Go to{" "}
                {navigation.areas.find((entry) => entry.route === nextActionHref)?.label ??
                  nextActionHref}
              </ProductLink>
            ) : undefined
          }
        />
      </section>

      {surface !== null && surface.ownsSections ? (
        surface.node
      ) : (
        <>
          {surface !== null ? surface.node : null}
          {anchoredActions.length > 0 ? (
            <section aria-labelledby="area-outcomes-heading" className="ps-page-section">
              <h2 id="area-outcomes-heading" className="ps-page-section-title">
                The outcome actions that live here
              </h2>
              <p className="ps-page-section-note">
                Each action states whether it can dispatch in this deployment.
                When it cannot, the typed prerequisite renders verbatim — the
                impact of acting and the route to configure or learn more.
                Never a dead button, never a fabricated success.
              </p>
              <ul className="ps-page-grid">
                {anchoredActions.map(({ row }) =>
                  row === undefined ? null : (
                    <li key={row.actionId} className="ps-home-card">
                      <div className="ps-home-card-head">
                        <h3 className="ps-home-card-title">{row.label}</h3>
                        <StatusPill tone={row.capability.dispatchable ? "ok" : "attention"}>
                          {row.capability.dispatchable
                            ? "Dispatchable"
                            : "Not yet dispatchable — action required"}
                        </StatusPill>
                      </div>
                      <p className="ps-home-card-body">{row.outcomeLine}</p>
                      {!row.capability.dispatchable &&
                      row.capability.missingPrerequisite ? (
                        <p className="ps-home-card-note">{row.capability.missingPrerequisite}</p>
                      ) : null}
                      <p className="ps-area-learn">
                        <ProductLink to="/developers" navigation={productNavigation}>
                          Learn the contract this action dispatches through
                        </ProductLink>
                      </p>
                    </li>
                  ),
                )}
              </ul>
            </section>
          ) : null}

          {onwardLinks.length > 0 ? (
            <section aria-labelledby="area-onward-heading" className="ps-page-section">
              <h2 id="area-onward-heading" className="ps-page-section-title">
                Onward from {area.label}
              </h2>
              <nav aria-label={`Onward from ${area.label}`} className="ps-page-links">
                {onwardLinks.map((link) => (
                  <ProductLink key={link.to} to={link.to} navigation={productNavigation}>
                    {link.label}
                  </ProductLink>
                ))}
              </nav>
            </section>
          ) : null}
        </>
      )}

      <section aria-labelledby="area-law-heading" className="ps-page-section">
        <h2 id="area-law-heading" className="ps-page-section-title">
          Why this page renders so sparsely
        </h2>
        <Card className="ps-area-card">
          <p className="ps-home-card-body">
            This area renders only what the authoritative planes provide.
            In this deployment phase the session plane is not wired, so
            there are no session-scoped observations to show — the page
            you are reading is the designed-empty state, not a bug and not
            a placeholder for invented data.
          </p>
        </Card>
      </section>
    </article>
  );
}
