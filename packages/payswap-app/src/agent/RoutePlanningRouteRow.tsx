/**
 * @payswap/app — ONE RANKED-ROUTE ROW of the route-planning panel
 * (P22-B extraction, the ≤400-line file law): rank, plan, net + the
 * transparent metric line + the (P22-B) corridor plan presentation when
 * the route's shape is the cross-provider corridor — the four-leg
 * content, never an authorization.
 */

import { CorridorPlanCard } from "./CorridorPlanCard.js";
import type { RoutePlanningRankedRoutePin } from "./routePlanningPins.js";

/** One ranked-route row: rank, plan, net + the transparent metric line. */
export function RoutePlanningRouteRow({
  route,
  onProceed,
}: {
  readonly route: RoutePlanningRankedRoutePin;
  readonly onProceed?: (planId: string) => void;
}): React.ReactNode {
  const metrics = [
    `net ${route.netNumeraireMinorUnits} ${route.numeraire}`,
    `${route.hopCount} hops`,
    `${route.railCrossings} rail crossings`,
    `risk ${route.riskClass ?? "UNKNOWN"}`,
    route.estimatedSettlementMs !== undefined ? `settlement ~${route.estimatedSettlementMs}ms` : "settlement UNKNOWN",
  ].join(" · ");
  return (
    <li className="ps-agent-route-item">
      <p className="ps-agent-route-item-head ps-num">
        #{route.rank} · {route.planId} · shape {route.shapeId}
      </p>
      <p className="ps-agent-route-item-meta ps-num">{metrics}</p>
      {/* (P22-B) The corridor plan presentation when the route's shape is
          the cross-provider corridor — the four-leg content, never an
          authorization. */}
      {route.corridorPlan !== undefined ? (
        <CorridorPlanCard corridorPlan={route.corridorPlan} />
      ) : null}
      {route.unknownDimensions.length > 0 ? (
        <p className="ps-agent-route-unknown">
          Unknown dimensions (retained, never guessed): {route.unknownDimensions.join(", ")}
        </p>
      ) : null}
      <p className="ps-agent-route-pareto">
        {route.paretoNonDominated
          ? "On the trade-off front — no other candidate dominates it on the known dimensions."
          : `Dominated by ${route.dominatedBy.join(", ")} on the known dimensions — retained for transparency.`}
      </p>
      {onProceed !== undefined ? (
        <button
          type="button"
          className="ps-agent-route-choice"
          data-ps-route-choice="PROCEED"
          data-testid={`ps-agent-route-proceed-${route.planId}`}
          onClick={() => onProceed(route.planId)}
        >
          Proceed with {route.planId} — request only
        </button>
      ) : null}
    </li>
  );
}
