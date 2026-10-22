/**
 * @payswap/app — the PAYMENTS area surface (P12 Lane C, C2).
 *
 * The payments landing is the typed ACTION SET: Pay, Receive, Move and
 * Checkout (the outcome actions anchored on payments by the pinned alias
 * table), each stating its honest dispatchability with the typed
 * prerequisite VERBATIM and the two real deep-links — configure
 * (connections, where the missing prerequisite is configured) and learn
 * (the developers contract surface). Plus the payments-adjacent
 * operational surfaces: recipients (UNAVAILABLE — typed reason, never an
 * invented list), approvals (the Agent Workspace gate), and
 * activity/receipts/reconciliation (the ledger with its UNKNOWN ≠ FAILED
 * law). Everything is a projection of the pinned outcome board (INV-24:
 * dispatchable is a fact about configured authority, never a UI mood).
 */

import { Card, StatusPill } from "@zcode/ui/payswap";
import type { NavigationAreaView, OutcomeBoardView } from "../../contracts/view-models.js";
import { outcomeActionsForArea } from "../../lib/outcome-area-aliases.js";
import type { PaySwapNavigation } from "../../shell/navigation.js";
import { ProductLink } from "../../shell/ProductLink.js";

/** The typed unavailable/adjacent rows (verbatim laws, never stubs). */
const PAYMENTS_ADJACENT_SURFACES: readonly {
  readonly id: string;
  readonly label: string;
  readonly tone: "disabled" | "attention";
  readonly state: string;
  readonly line: string;
  readonly link?: { readonly to: string; readonly label: string };
}[] = [
  {
    id: "recipients",
    label: "Recipients",
    tone: "disabled",
    state: "UNAVAILABLE",
    line: "No recipients surface exists in this deployment — a collect request names its payer, and no recipient registry is wired. Nothing is invented here.",
  },
  {
    id: "approvals",
    label: "Approvals",
    tone: "attention",
    state: "Reference + honest empty",
    line: "Approvals gate material terms and authority scope BEFORE execution. The approval vocabulary and the honest no-approval-plane state live in the Agent Workspace.",
    link: { to: "/console/approvals", label: "Open the Approvals section" },
  },
  {
    id: "activity",
    label: "Activity, receipts & reconciliation",
    tone: "attention",
    state: "Designed-empty ledger",
    line: "Every executed action lands in the activity ledger with its evidence links; receipts render inside activity rows when executed records exist. UNKNOWN is never FAILED — an ambiguous outcome is reconciled against provider records before any conclusion.",
    link: { to: "/app/activity", label: "Open the Activity ledger" },
  },
  {
    id: "convert",
    label: "Convert",
    tone: "attention",
    state: "Cross-anchor",
    line: "Converting lives on the Accounts area (moving value between the balances you hold), with coverage honesty from Capabilities.",
    link: { to: "/app/accounts", label: "Open the Accounts area" },
  },
];

export function PaymentsAreaSurface({
  navigation,
  outcomeBoard,
  productNavigation,
}: {
  readonly navigation: NavigationAreaView;
  readonly outcomeBoard: OutcomeBoardView;
  readonly productNavigation?: PaySwapNavigation;
}) {
  const anchoredActions = outcomeActionsForArea("payments").map((alias) => ({
    alias,
    row: outcomeBoard.rows.find((row) => row.actionId === alias.actionId),
  }));

  return (
    <>
      <section aria-labelledby="payments-actions-heading" className="ps-page-section">
        <h2 id="payments-actions-heading" className="ps-page-section-title">
          The payments action set
        </h2>
        <p className="ps-page-section-note">
          Every action states whether it can dispatch in this deployment.
          When it cannot, the typed prerequisite renders verbatim — what is
          missing, the impact of acting, and the two real routes forward:
          configure the missing piece in Connections, or learn the contract
          on the developers surface. Never a dead button, never a
          fabricated success.
        </p>
        <ul className="ps-page-grid">
          {anchoredActions.map(({ alias, row }) =>
            row === undefined ? null : (
              <li key={row.actionId} className="ps-page-grid-item">
                <Card className="ps-home-card">
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
                    <ProductLink to="/app/connections" navigation={productNavigation}>
                      Configure connections
                    </ProductLink>
                    {" · "}
                    <ProductLink to="/developers" navigation={productNavigation}>
                      Learn the contract
                    </ProductLink>
                  </p>
                  <p className="p12-area-alias-note">
                    Anchored here via the pinned alias table
                    {alias.navAreas.length > 1 ? ` (${alias.navAreas.join(" + ")})` : ""}.
                  </p>
                </Card>
              </li>
            ),
          )}
        </ul>
        {outcomeBoard.nothingDispatchable ? (
          <p className="ps-page-section-note">
            No payments action is dispatchable yet — that is the honest
            fact of this deployment phase, recorded here instead of hidden.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="payments-adjacent-heading" className="ps-page-section">
        <h2 id="payments-adjacent-heading" className="ps-page-section-title">
          The payments surfaces around the actions
        </h2>
        <p className="ps-page-section-note">
          The operational surfaces that complete the payments journeys.
          Each one is either real (and linked) or honestly unavailable with
          its typed reason — never a stub that pretends.
        </p>
        <ul className="ps-page-list">
          {PAYMENTS_ADJACENT_SURFACES.map((surface) => (
            <li key={surface.id} className="ps-cap-row">
              <span className="ps-cap-name">{surface.label}</span>
              <StatusPill tone={surface.tone}>{surface.state}</StatusPill>
              <p className="ps-cap-note">{surface.line}</p>
              {surface.link ? (
                <p className="ps-area-learn">
                  <ProductLink to={surface.link.to} navigation={productNavigation}>
                    {surface.link.label}
                  </ProductLink>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
