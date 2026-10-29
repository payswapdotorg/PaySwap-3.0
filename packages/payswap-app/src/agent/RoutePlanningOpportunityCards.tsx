/**
 * @payswap/app — the ROUTE-PLANNING OPPORTUNITY CARDS (P23-B, lane B;
 * ADR-0015 D8 — the actionable-card presentation contract).
 *
 * The THREE advisory sections between the scenarios section and the waiting
 * surface (the A.7 order): conditional opportunities, platform work and
 * multi-hop hypotheses — one ACTIONABLE CARD each, advisory-branded like
 * the scenarios section (the section-order law: available-now FIRST, the
 * advisory repairs after, visually distinct — the ROUTINE-CONTRACT stage-8
 * "distinct current routes vs conditional opportunities" finally TRUE at
 * the surface).
 *
 * HONESTY LAWS (every card):
 * - ZERO AUTHORITY: no dispatch/execute/authorize control exists on any
 *   card — the only route onward is fresh planning, preview and a NEW
 *   explicit authorization (the frozen never-executable note renders on
 *   every hypothesis card).
 * - The platform prerequisites render as a SEPARATE labeled block ("What
 *   PaySwap itself would need to build") — never conflated with the party
 *   preconditions (the ADR-0014 D9 labeling law, first-class).
 * - The verification badge is honest (A.6): PLANNER_VERIFIED renders the
 *   green-branded standing text; UNVERIFIED renders the honest remaining
 *   reason VERBATIM, never softened.
 * - The expiry renders as an ABSOLUTE instant — no countdown (the armed
 *   card's honesty style).
 * - The HONEST DEFAULTS: an engine view WITHOUT a section (the unbound /
 *   web tier — ADR-0010 D7) renders the frozen "not composed in this
 *   deployment" note — never fabricated data, never a spinner that never
 *   resolves; a composed-but-empty section renders the honest empty state.
 * - A11y: every card carries an aria-label; the sections carry their own
 *   headings (h4) and the advisory branding uses the established
 *   StatusPill tone vocabulary.
 */

import { StatusPill } from "@zcode/ui/payswap";
import type { RoutePlanningEngineView } from "./routePlanningPins.js";
import {
  ROUTE_PLANNING_CONDITIONAL_OPPORTUNITIES_EMPTY_NOTE,
  ROUTE_PLANNING_CONDITIONAL_OPPORTUNITIES_NOTE,
  ROUTE_PLANNING_CONDITIONAL_OPPORTUNITIES_UNCOMPOSED_NOTE,
  ROUTE_PLANNING_HYPOTHESES_EMPTY_NOTE,
  ROUTE_PLANNING_HYPOTHESES_NOTE,
  ROUTE_PLANNING_HYPOTHESES_UNCOMPOSED_NOTE,
  ROUTE_PLANNING_HYPOTHESIS_NEVER_EXECUTABLE_NOTE,
  ROUTE_PLANNING_MODEL_PROPOSALS_UNBOUND_NO_MODEL_NOTE,
  ROUTE_PLANNING_MODEL_PROPOSALS_UNBOUND_NO_TRANSPORT_NOTE,
  ROUTE_PLANNING_PARTY_CHANGE_LABELS,
  ROUTE_PLANNING_PARTY_LABELS,
  ROUTE_PLANNING_PLATFORM_WORK_EMPTY_NOTE,
  ROUTE_PLANNING_PLATFORM_WORK_NOTE,
  ROUTE_PLANNING_PLATFORM_WORK_UNCOMPOSED_NOTE,
  ROUTE_PLANNING_REPAIR_INTERVENTION_ID_PREFIX,
  ROUTE_PLANNING_VERIFIED_BADGE_NOTE,
  type RoutePlanningConditionalOpportunityPin,
  type RoutePlanningHypothesisPin,
  type RoutePlanningPlatformWorkPin,
} from "./routePlanningOpportunityPins.js";

/** One conditional-opportunity card: the actionable what-would-need-to-change. */
function ConditionalOpportunityCard({
  conditional,
}: {
  readonly conditional: RoutePlanningConditionalOpportunityPin;
}): React.ReactNode {
  return (
    <li
      className="ps-agent-opportunity-card"
      data-testid={`ps-agent-conditional-${conditional.conditionalId}`}
      aria-label={`Conditional opportunity: ${conditional.title}`}
    >
      <p className="ps-agent-opportunity-card-title">{conditional.title}</p>
      <p className="ps-agent-route-note">{conditional.description}</p>
      <p className="ps-agent-route-meta">
        What would need to change:{" "}
        {conditional.requiredPartyChanges
          .map((change) => `${ROUTE_PLANNING_PARTY_LABELS[change.party]} ${ROUTE_PLANNING_PARTY_CHANGE_LABELS[change.change]}`)
          .join("; ")}
      </p>
      {conditional.assumptions.length > 0 ? (
        <div className="ps-agent-opportunity-assumptions">
          <h5 className="ps-agent-route-subtitle">Assumptions (what must hold)</h5>
          <ul className="ps-agent-route-plainlist">
            {conditional.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {conditional.platformPrerequisites.length > 0 ? (
        <div className="ps-agent-opportunity-platform">
          <h5 className="ps-agent-route-subtitle">What PaySwap itself would need to build</h5>
          <ul className="ps-agent-route-plainlist">
            {conditional.platformPrerequisites.map((prerequisite) => (
              <li key={prerequisite.gapId}>
                <span className="ps-num">{prerequisite.gapId}</span>: {prerequisite.note}
              </li>
            ))}
          </ul>
          <p className="ps-agent-route-unknown">
            These platform prerequisites are distinct from the party preconditions above — a party
            change alone never makes the corridor real while a platform gap stands.
          </p>
        </div>
      ) : null}
      <p className="ps-agent-route-meta ps-num">
        conditional <span className="ps-num">{conditional.conditionalId}</span> · expires at{" "}
        {conditional.expiresAt} — the conditional never outlives this instant
      </p>
      <p
        className={
          conditional.verification === "PLANNER_VERIFIED"
            ? "ps-agent-opportunity-verified"
            : "ps-agent-opportunity-unverified"
        }
        role="status"
      >
        {conditional.verification === "PLANNER_VERIFIED"
          ? `PLANNER_VERIFIED — ${ROUTE_PLANNING_VERIFIED_BADGE_NOTE}`
          : `UNVERIFIED — ${conditional.verificationReason}`}
      </p>
    </li>
  );
}

/** One platform-work card: what PaySwap itself would need to build, with evidence. */
function PlatformWorkCard({ work }: { readonly work: RoutePlanningPlatformWorkPin }): React.ReactNode {
  return (
    <li
      className="ps-agent-opportunity-card"
      data-testid={`ps-agent-platform-work-${work.gapId}`}
      aria-label={`Platform work item: ${work.title}`}
    >
      <p className="ps-agent-opportunity-card-title">{work.title}</p>
      <p className="ps-agent-route-meta ps-num">
        work item <span className="ps-num">{work.workItemId}</span> · gap{" "}
        <span className="ps-num">{work.gapId}</span>
      </p>
      <div className="ps-agent-opportunity-evidence">
        <h5 className="ps-agent-route-subtitle">Evidence (the exclusions that prove the gap)</h5>
        <ul className="ps-agent-route-plainlist">
          {work.evidenceBasis.map((fact) => (
            <li key={`${fact.side}:${fact.routeId}:${fact.code}`}>
              <strong className="ps-num">{fact.code}</strong> · {fact.side.toLowerCase()} rail{" "}
              <span className="ps-num">{fact.routeId}</span>: {fact.message}
            </li>
          ))}
        </ul>
      </div>
      <p className="ps-agent-route-meta ps-num">
        Required by repair operator(s): {work.requiredByOperatorIds.join(", ")}
      </p>
      <p className="ps-agent-route-note">
        This is work PaySwap itself would need to build — an advisory evidence item naming a proven
        gap, never a promise, never a party prerequisite.
      </p>
    </li>
  );
}

/** One multi-hop hypothesis card: the never-executable structural what-if. */
function HypothesisCard({
  hypothesis,
  measurement,
}: {
  readonly hypothesis: RoutePlanningHypothesisPin;
  /** The stage-6 counterfactual attached to this hypothesis (advisory measurement), when one ran. */
  readonly measurement: { readonly counterfactualId: string; readonly counterfactualDigest: string } | undefined;
}): React.ReactNode {
  return (
    <li
      className="ps-agent-opportunity-card"
      data-testid={`ps-agent-hypothesis-${hypothesis.hypothesisId}`}
      aria-label={`Multi-hop hypothesis: ${hypothesis.assumptionSummary}`}
    >
      <p className="ps-agent-opportunity-card-title">{hypothesis.assumptionSummary}</p>
      <p className="ps-agent-route-meta ps-num">
        hypothesis <span className="ps-num">{hypothesis.hypothesisId}</span> · operator{" "}
        <span className="ps-num">{hypothesis.operatorId}</span>
      </p>
      <div className="ps-agent-opportunity-segments">
        <h5 className="ps-agent-route-subtitle">Segments</h5>
        <ul className="ps-agent-route-plainlist">
          {hypothesis.verifiedSegmentIds.map((segmentId) => (
            <li key={`verified:${segmentId}`}>
              <span className="ps-num">{segmentId}</span> — verified today (the real planner re-run
              over the real sub-views)
            </li>
          ))}
          {hypothesis.assumedSegmentIds.map((segmentId) => (
            <li key={`assumed:${segmentId}`}>
              <span className="ps-num">{segmentId}</span> — assumed (the one hypothetical element;
              never an observed rail)
            </li>
          ))}
        </ul>
      </div>
      <p className="ps-agent-route-meta">
        Cited shape skeleton (provenance, never a compiled plan):{" "}
        <span className="ps-num">{hypothesis.citedShapeId}</span>
      </p>
      {hypothesis.blockers.length > 0 ? (
        <div className="ps-agent-opportunity-evidence">
          <h5 className="ps-agent-route-subtitle">Blockers (the remaining real exclusions)</h5>
          <ul className="ps-agent-route-plainlist">
            {hypothesis.blockers.map((blocker) => (
              <li key={`${blocker.side}:${blocker.routeId}:${blocker.code}`}>
                <strong className="ps-num">{blocker.code}</strong> · {blocker.side.toLowerCase()} rail{" "}
                <span className="ps-num">{blocker.routeId}</span>: {blocker.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="ps-agent-route-meta">
        Would compose:{" "}
        {hypothesis.wouldCompose
          ? "yes, structurally — the verified segments and the assumed element would bridge (an honest structural assessment, never a claim)"
          : "no — the honest structural assessment over today's evidence"}
      </p>
      {measurement !== undefined ? (
        <p className="ps-agent-route-meta ps-num">
          Advisory measurement (stage-6 counterfactual): {measurement.counterfactualId} (
          {measurement.counterfactualDigest}) — simulation evidence only, never production evidence.
        </p>
      ) : null}
      <p
        className={
          hypothesis.verification === "PLANNER_VERIFIED"
            ? "ps-agent-opportunity-verified"
            : "ps-agent-opportunity-unverified"
        }
        role="status"
      >
        {hypothesis.verification === "PLANNER_VERIFIED"
          ? `PLANNER_VERIFIED — ${ROUTE_PLANNING_VERIFIED_BADGE_NOTE}`
          : `UNVERIFIED — ${hypothesis.verificationReason}`}
      </p>
      <p className="ps-agent-route-note ps-agent-opportunity-never">
        {ROUTE_PLANNING_HYPOTHESIS_NEVER_EXECUTABLE_NOTE}
      </p>
    </li>
  );
}

/** The model-proposal tier's honest composed-state line (provenance only). */
function ModelProposalStateLine({ view }: { readonly view: RoutePlanningEngineView }): React.ReactNode {
  if (view.modelProposals === undefined) {
    return null;
  }
  if (view.modelProposals.kind === "UNBOUND_NO_MODEL") {
    return <p className="ps-agent-route-unknown">{ROUTE_PLANNING_MODEL_PROPOSALS_UNBOUND_NO_MODEL_NOTE}</p>;
  }
  if (view.modelProposals.kind === "UNBOUND_NO_TRANSPORT") {
    return <p className="ps-agent-route-unknown">{ROUTE_PLANNING_MODEL_PROPOSALS_UNBOUND_NO_TRANSPORT_NOTE}</p>;
  }
  return (
    <p className="ps-agent-route-meta ps-num">
      Model corroboration (model {view.modelProposals.modelId}, source MODEL_PROPOSAL):{" "}
      {view.modelProposals.foldedOperatorIds.length} proposal(s) folded into the deterministic
      repairs above, {view.modelProposals.novelProposalIds.length} novel — corroboration only, never
      a duplicate card, never authority.
    </p>
  );
}

/**
 * The three advisory opportunity sections (the A.7 order, between the
 * scenarios section and the waiting surface). A pure projection of the
 * engine view's optional sections: absent sections render the honest
 * not-composed notes; present sections render their cards (or the honest
 * empty states).
 */
export function RoutePlanningOpportunityCards({ view }: { readonly view: RoutePlanningEngineView }): React.ReactNode {
  const measurementOf = (operatorId: string): { counterfactualId: string; counterfactualDigest: string } | undefined => {
    const outcome = view.scenarios.outcomes.find(
      (scenario) => scenario.interventionId === `${ROUTE_PLANNING_REPAIR_INTERVENTION_ID_PREFIX}${operatorId}`,
    );
    return outcome === undefined ? undefined : { counterfactualId: outcome.counterfactualId, counterfactualDigest: outcome.counterfactualDigest };
  };
  return (
    <>
      <div className="ps-agent-route-section" id="ps-agent-route-section-conditional-opportunities">
        <h4 className="ps-agent-route-section-title">Conditional opportunities</h4>
        <StatusPill tone="unknown">Advisory — what would need to change, never a route today</StatusPill>
        <p className="ps-agent-route-note">{ROUTE_PLANNING_CONDITIONAL_OPPORTUNITIES_NOTE}</p>
        {view.conditionalOpportunities === undefined ? (
          <p className="ps-agent-route-empty">{ROUTE_PLANNING_CONDITIONAL_OPPORTUNITIES_UNCOMPOSED_NOTE}</p>
        ) : view.conditionalOpportunities.length === 0 ? (
          <p className="ps-agent-route-empty">{ROUTE_PLANNING_CONDITIONAL_OPPORTUNITIES_EMPTY_NOTE}</p>
        ) : (
          <ul className="ps-agent-route-list ps-agent-opportunity-list">
            {view.conditionalOpportunities.map((conditional) => (
              <ConditionalOpportunityCard key={conditional.conditionalId} conditional={conditional} />
            ))}
          </ul>
        )}
        <ModelProposalStateLine view={view} />
      </div>

      <div className="ps-agent-route-section" id="ps-agent-route-section-platform-work">
        <h4 className="ps-agent-route-section-title">Platform work (what PaySwap itself would need to build)</h4>
        <StatusPill tone="unknown">Advisory — evidenced gaps, never a backlog promise</StatusPill>
        <p className="ps-agent-route-note">{ROUTE_PLANNING_PLATFORM_WORK_NOTE}</p>
        {view.platformWork === undefined ? (
          <p className="ps-agent-route-empty">{ROUTE_PLANNING_PLATFORM_WORK_UNCOMPOSED_NOTE}</p>
        ) : view.platformWork.length === 0 ? (
          <p className="ps-agent-route-empty">{ROUTE_PLANNING_PLATFORM_WORK_EMPTY_NOTE}</p>
        ) : (
          <ul className="ps-agent-route-list ps-agent-opportunity-list">
            {view.platformWork.map((work) => (
              <PlatformWorkCard key={work.workItemId} work={work} />
            ))}
          </ul>
        )}
      </div>

      <div className="ps-agent-route-section" id="ps-agent-route-section-hypotheses">
        <h4 className="ps-agent-route-section-title">Multi-hop hypotheses</h4>
        <StatusPill tone="unknown">Advisory — a hypothesis is never a route</StatusPill>
        <p className="ps-agent-route-note">{ROUTE_PLANNING_HYPOTHESES_NOTE}</p>
        {view.hypotheses === undefined ? (
          <p className="ps-agent-route-empty">{ROUTE_PLANNING_HYPOTHESES_UNCOMPOSED_NOTE}</p>
        ) : view.hypotheses.length === 0 ? (
          <p className="ps-agent-route-empty">{ROUTE_PLANNING_HYPOTHESES_EMPTY_NOTE}</p>
        ) : (
          <ul className="ps-agent-route-list ps-agent-opportunity-list">
            {view.hypotheses.map((hypothesis) => (
              <HypothesisCard key={hypothesis.hypothesisId} hypothesis={hypothesis} measurement={measurementOf(hypothesis.operatorId)} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
