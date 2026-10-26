/**
 * @payswap/app — the ROUTE-PLANNING PANEL (P16-D part 3 UI; gap-matrix D5;
 * ROUTINE-CONTRACT stage 8 / 9a / 9b; ADR-0009 D8).
 *
 * The proceed-or-wait presentation surface: the DISTINCT sections —
 * available-now ranked routes (rank, net, transparent metrics), typed
 * exclusions, the truncation disclosure, advisory-branded conditional
 * scenarios, and the waiting surface (criteria + the never-dispatches
 * note). The honest standing notes render VERBATIM (./routePlanningPins).
 *
 * ZERO AUTHORITY (ADR-0007 D7 / ADR-0009 D8): NO dispatch, execute or
 * authorize button exists anywhere — Proceed records a REQUEST, Wait
 * declares durable criteria, and both say so in their labels. The UNBOUND
 * engine renders the honest unbound note; an ENGINE_ERROR is surfaced,
 * never masked. Rendered by ./RoutePlanningMount.tsx (the mount owns the
 * engine/session wiring); this component is a pure projection of its
 * props (INV-23).
 */

import { StatusPill } from "@zcode/ui/payswap";
import {
  PINNED_ROUTE_PLANNING_ROUTINE,
  ROUTE_PLANNING_AVAILABLE_NOW_NOTE,
  ROUTE_PLANNING_ENGINE_UNBOUND_NOTE,
  ROUTE_PLANNING_EVIDENCE_FRESHNESS_NOTE,
  ROUTE_PLANNING_TRUNCATION_NOTE,
  ROUTE_PLANNING_WAIT_NOTE,
  type RoutePlanningEngineView,
  type RoutePlanningPanelView,
  type RoutePlanningRankedRoutePin,
  type RoutePlanningWaitCriteriaPin,
  type RoutePlanningWaitingState,
} from "./routePlanningPins.js";

export interface RoutePlanningPanelProps {
  /** The pinned view model (UNBOUND_ENGINE | PRESENTED_PLAN | ENGINE_ERROR). */
  readonly view: RoutePlanningPanelView;
  /** The task's projected waiting state (null when no task is planned). */
  readonly waiting: RoutePlanningWaitingState | null;
  /** Wired only by a host that can record a proceed REQUEST (stage 9a). */
  readonly onProceed?: (planId: string) => void;
  /** Wired only by a host that can record the Wait choice (stage 9b). */
  readonly onChooseWait?: (criteria: RoutePlanningWaitCriteriaPin) => void;
  /** Wired only by a host that can cancel a recorded wait. */
  readonly onCancelWait?: () => void;
}

/** One ranked-route row: rank, plan, net + the transparent metric line. */
function RoutePlanningRouteRow({
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

/** The waiting section's criteria line (people language, no invention). */
function waitCriteriaLine(criteria: RoutePlanningWaitCriteriaPin): string {
  return `Waiting for ${criteria.families.join(", ")} opportunities (triggers: ${criteria.categories.join(", ")}) up to ${criteria.maxWaitMs}ms — fallback ${criteria.fallback.kind} on ${criteria.fallback.routeRef}${
    criteria.tradeOffs.length > 0 ? ` — trade-offs: ${criteria.tradeOffs.join(", ")}` : ""
  }`;
}

/** The five distinct sections (the pinned section ids, in the pinned order). */
function RoutePlanningSections({
  view,
  waiting,
  onProceed,
  onChooseWait,
  onCancelWait,
}: {
  readonly view: RoutePlanningEngineView;
  readonly waiting: RoutePlanningWaitingState | null;
  readonly onProceed?: (planId: string) => void;
  readonly onChooseWait?: (criteria: RoutePlanningWaitCriteriaPin) => void;
  readonly onCancelWait?: () => void;
}): React.ReactNode {
  const isWaiting = waiting?.status === "WAITING_FOR_OPPORTUNITIES";
  const criteria = waiting?.criteria ?? view.waiting.proposal;
  return (
    <>
      <div className="ps-agent-route-section" id="ps-agent-route-section-available-now">
        <h4 className="ps-agent-route-section-title">Available now</h4>
        <p className="ps-agent-route-note">{ROUTE_PLANNING_AVAILABLE_NOW_NOTE}</p>
        <p className="ps-agent-route-note">{ROUTE_PLANNING_EVIDENCE_FRESHNESS_NOTE}</p>
        <p className="ps-agent-route-meta ps-num">
          Sender rails: {view.availableNow.senderEligibleRouteIds.join(", ") || "none eligible"} · Recipient rails:{" "}
          {view.availableNow.recipientEligibleRouteIds.join(", ") || "none eligible"}
        </p>
        {view.availableNow.ranked.length === 0 ? (
          <p className="ps-agent-route-empty">
            No available-now route on the current evidence — an honest empty result, never a fabricated plan.
          </p>
        ) : (
          <ol className="ps-agent-route-list">
            {view.availableNow.ranked.map((route) => (
              <RoutePlanningRouteRow key={route.planId} route={route} onProceed={onProceed} />
            ))}
          </ol>
        )}
        {view.availableNow.notScored.length > 0 ? (
          <div className="ps-agent-route-notscored">
            <h5 className="ps-agent-route-subtitle">Retained unscored candidates</h5>
            <ul className="ps-agent-route-plainlist">
              {view.availableNow.notScored.map((candidate) => (
                <li key={candidate.planId}>
                  <span className="ps-num">{candidate.planId}</span> ({candidate.shapeId}): {candidate.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="ps-agent-route-section" id="ps-agent-route-section-exclusions">
        <h4 className="ps-agent-route-section-title">Exclusions (typed reasons)</h4>
        {view.exclusions.length === 0 ? (
          <p className="ps-agent-route-empty">No typed exclusion was recorded — nothing was dropped silently.</p>
        ) : (
          <ul className="ps-agent-route-plainlist">
            {view.exclusions.map((exclusion) => (
              <li key={`${exclusion.subject}:${exclusion.code}`}>
                <strong className="ps-num">{exclusion.code}</strong> · {exclusion.subject}: {exclusion.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ps-agent-route-section" id="ps-agent-route-section-truncation">
        <h4 className="ps-agent-route-section-title">Search coverage</h4>
        <p className="ps-agent-route-note">{ROUTE_PLANNING_TRUNCATION_NOTE}</p>
        <p className="ps-agent-route-meta ps-num">Coverage: {view.truncation.coverage}</p>
        {view.truncation.receipts.length > 0 ? (
          <ul className="ps-agent-route-plainlist">
            {view.truncation.receipts.map((receipt) => (
              <li key={receipt.dimension} className="ps-num">
                {receipt.dimension}: capped at {receipt.limit} of {receipt.actualCount} candidates ({receipt.disclosedAs})
              </li>
            ))}
          </ul>
        ) : (
          <p className="ps-agent-route-empty">No truncation receipt — the bounded search was not capped.</p>
        )}
      </div>

      <div className="ps-agent-route-section" id="ps-agent-route-section-scenarios">
        <h4 className="ps-agent-route-section-title">Conditional scenarios</h4>
        <StatusPill tone="unknown">Advisory — counterfactual, never production evidence</StatusPill>
        <p className="ps-agent-route-meta ps-num">
          Suite coverage: {view.scenarios.coverage} · {view.scenarios.outcomes.length} scenario(s)
        </p>
        {view.scenarios.outcomes.length === 0 ? (
          <p className="ps-agent-route-empty">No conditional scenario was explored in this run.</p>
        ) : (
          <ul className="ps-agent-route-plainlist">
            {view.scenarios.outcomes.map((scenario) => (
              <li key={scenario.interventionId} className="ps-num">
                {scenario.kind} · {scenario.interventionId} → {scenario.counterfactualId} ({scenario.counterfactualDigest})
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ps-agent-route-section" id="ps-agent-route-section-waiting">
        <h4 className="ps-agent-route-section-title">Wait for a better opportunity</h4>
        <p className="ps-agent-route-note">{ROUTE_PLANNING_WAIT_NOTE}</p>
        {isWaiting && waiting !== null ? (
          <>
            <p className="ps-agent-route-meta">{waitCriteriaLine(criteria)}</p>
            {waiting.criteriaRecordTruncated ? (
              <p className="ps-agent-route-unknown">
                The recorded criteria exceeded the transcript bound — the durable record lives in the task store; shown here
                in part, never repaired.
              </p>
            ) : null}
            {waiting.matchedOpportunityIds.length > 0 ? (
              <p className="ps-agent-route-meta ps-num">
                Matched opportunities (recorded; the task stays waiting): {waiting.matchedOpportunityIds.join(", ")}
              </p>
            ) : (
              <p className="ps-agent-route-empty">No opportunity has matched yet — nothing dispatches in the meantime.</p>
            )}
            {onCancelWait !== undefined ? (
              <button
                type="button"
                className="ps-agent-route-choice"
                data-ps-route-choice="CANCEL_WAIT"
                data-testid="ps-agent-route-cancel-wait"
                onClick={onCancelWait}
              >
                Cancel the wait — return to active planning
              </button>
            ) : null}
          </>
        ) : (
          <>
            <p className="ps-agent-route-meta">Engine-proposed criteria (you declare them by choosing Wait):</p>
            <p className="ps-agent-route-meta">{waitCriteriaLine(view.waiting.proposal)}</p>
            {onChooseWait !== undefined ? (
              <button
                type="button"
                className="ps-agent-route-choice"
                data-ps-route-choice="WAIT"
                data-testid="ps-agent-route-wait"
                onClick={() => onChooseWait(view.waiting.proposal)}
              >
                Wait for a better opportunity
              </button>
            ) : (
              <p className="ps-agent-route-empty">
                The Wait choice is not wired in this deployment — the criteria are shown, never silently recorded.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

export function RoutePlanningPanel({
  view,
  waiting,
  onProceed,
  onChooseWait,
  onCancelWait,
}: RoutePlanningPanelProps): React.ReactNode {
  return (
    <section className="ps-agent-route" aria-label="Route planning — proceed or wait">
      <h3 className="ps-agent-route-title">Route planning — proceed or wait</h3>
      <p className="ps-agent-route-meta ps-num">
        Routine {PINNED_ROUTE_PLANNING_ROUTINE.routineId} v{PINNED_ROUTE_PLANNING_ROUTINE.routineVersion} · skill digest{" "}
        {PINNED_ROUTE_PLANNING_ROUTINE.skillContentDigest}
      </p>
      {view.kind === "UNBOUND_ENGINE" ? (
        <p className="ps-agent-route-note">{ROUTE_PLANNING_ENGINE_UNBOUND_NOTE}</p>
      ) : view.kind === "ENGINE_ERROR" ? (
        <p className="ps-agent-route-note" role="alert">
          The route-planning engine failed: {view.message} — nothing is fabricated; the failure is surfaced, never masked.
        </p>
      ) : (
        <>
          <p className="ps-agent-route-meta ps-num">
            Intent {view.view.intentRef} · evaluated {view.view.presentedAt} · view {view.view.viewDigest}
          </p>
          <RoutePlanningSections
            view={view.view}
            waiting={waiting}
            onProceed={onProceed}
            onChooseWait={onChooseWait}
            onCancelWait={onCancelWait}
          />
        </>
      )}
    </section>
  );
}
