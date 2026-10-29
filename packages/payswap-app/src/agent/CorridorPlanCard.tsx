/**
 * @payswap/app — the CORRIDOR PLAN CARD (P22-B, ADR-0016 D5/D6).
 *
 * The four-leg cross-provider corridor plan presentation: the leg lanes,
 * the custody chain, the issuer-scoped relay asset, the per-leg
 * prerequisites in people language and the disclosed leg count. This is
 * a PRESENTATION of the presented plan — never an authorization (the
 * two-act approval's scope card names the plan digest when the mission
 * proceeds; the composer/panels hold ZERO financial authority, the
 * ADR-0009 D8 law).
 *
 * The shape mirrors the surface corridor-plan contract BY VALUE (the
 * pins/corridor-pins.js structural pin — the app never imports
 * @payswap/*; the fold lives in the surface authority).
 */

import type { CorridorPlanPresentationPin } from "../pins/corridor-pins.js";

/** One leg row: the people label, the lane, the custody hand-off, the prerequisites. */
function CorridorLegRow({
  leg,
}: {
  readonly leg: CorridorPlanPresentationPin["legs"][number];
}): React.ReactNode {
  return (
    <li className="ps-agent-corridor-leg" data-testid={`ps-agent-corridor-leg-${leg.legIndex}`}>
      <p className="ps-agent-corridor-leg-head ps-num">
        Leg {leg.legIndex + 1} of 4 · {leg.legKind}
      </p>
      <p className="ps-agent-corridor-leg-label">{leg.peopleLabel}</p>
      <p className="ps-agent-corridor-leg-lane">
        Lane: {leg.lane.label} ({leg.lane.kind === "ONCHAIN_CHAIN" ? "onchain rail" : "provider"}{" "}
        {leg.lane.id})
        {leg.assetRef !== undefined ? ` · asset ${leg.assetRef}` : ""}
      </p>
      <p className="ps-agent-corridor-leg-custody">
        Custody: {leg.custody.from} → {leg.custody.to}
      </p>
      <p className="ps-agent-corridor-leg-prereqs">
        Prerequisites: {leg.prerequisites.join("; ")}
      </p>
    </li>
  );
}

/** The corridor plan presentation (rendered under a corridor-shaped route row). */
export function CorridorPlanCard({
  corridorPlan,
}: {
  readonly corridorPlan: CorridorPlanPresentationPin;
}): React.ReactNode {
  return (
    <div
      className="ps-agent-corridor-plan"
      data-testid={`ps-agent-corridor-plan-${corridorPlan.planId}`}
    >
      <p className="ps-agent-corridor-outcome">{corridorPlan.outcomeLine}</p>
      <p className="ps-agent-corridor-facts ps-num">
        {corridorPlan.legCount} legs · {corridorPlan.directionClass} · onchain relay{" "}
        {corridorPlan.relayChainKey} · funding {corridorPlan.fundingMethod} · payout{" "}
        {corridorPlan.payoutMethod}
      </p>
      <ul className="ps-agent-corridor-legs">
        {corridorPlan.legs.map((leg) => (
          <CorridorLegRow key={leg.legIndex} leg={leg} />
        ))}
      </ul>
      <p className="ps-agent-corridor-custody-chain">
        Custody chain: {corridorPlan.custodyChain.join(" → ")}
      </p>
      <p className="ps-agent-corridor-relay-asset">
        The onchain leg carries the issuer-scoped stablecoin{" "}
        {corridorPlan.relayAssetRef} — two issuers of the same code are two
        assets, and this plan names its issuer exactly.
      </p>
      <p className="ps-agent-corridor-note">
        This is the presented plan, not an authorization: proceeding records a
        plan choice; the two-act approval covers the whole plan and each leg is
        its own dispatch with its own single-use share.
      </p>
    </div>
  );
}
