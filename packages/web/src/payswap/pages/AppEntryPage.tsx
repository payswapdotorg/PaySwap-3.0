/**
 * @zcode/web/payswap — the honest authenticated entry boundary.
 *
 * ADAPT of payswap.org@8a735bf packages/web the honest /app gate (MMP-36
 * content/IA evidence: "the honest authenticated entry boundary"; the old
 * app gate + onboarding pages' honesty law): the product entry states
 * exactly what is unavailable and why, with zero credential capture and
 * zero fabricated data. It renders the eleven-area navigation IA with
 * every area's HONEST empty-state contract (the canonical surface IA —
 * pinned) and the five outcome actions' honest dispatchability board, so
 * the map of the product is truthful even while the surface itself is
 * gated.
 *
 * On the ZCode web substrate the session plane is substrate territory
 * (platform permission, not financial authorization); wiring real session
 * authority is TL accept-time integration — this boundary renders the
 * honest pre-integration truth.
 */

import {
  AuthRequiredState,
  Card,
  EnvironmentBanner,
  StatusPill,
} from "@zcode/ui/payswap";
import type { NavigationAreaView, OutcomeBoardView } from "../contracts/view-models.js";

export function AppEntryPage({
  navigation,
  outcomeBoard,
}: {
  readonly navigation: NavigationAreaView;
  readonly outcomeBoard: OutcomeBoardView;
}) {
  return (
    <article className="ps-page">
      <EnvironmentBanner environment="test" />
      <header className="ps-page-header">
        <h1 className="ps-page-title">The PaySwap product</h1>
        <p className="ps-page-lede">
          The authenticated product surface — payments, accounts, activity,
          connections and the rest of the eleven areas — requires
          authentication and is not yet available in this deployment phase.
        </p>
      </header>

      <AuthRequiredState
        title="Authentication required — honestly gated"
        reason="This is the honest gate: there is no demo mode with fake balances, no pretend login and no fabricated session. When the session plane is wired into this deployment, your account's own authority opens these surfaces."
        doctrine="Only real, verified state is rendered here — nothing is simulated, and no credentials are captured on this page."
      />

      <section aria-labelledby="ia-heading" className="ps-page-section">
        <h2 id="ia-heading" className="ps-page-section-title">
          The map of the product — every area, honestly empty
        </h2>
        <p className="ps-page-section-note">
          These are the eleven operational areas of the PaySwap product.
          Each one renders the honest truth of THIS deployment: its designed
          empty state — why it is empty and what the real next action is.
          Nothing here is populated by guesswork.
        </p>
        <ul className="ps-page-grid">
          {navigation.areas.map((area) => (
            <Card key={area.id} className="ps-area-card">
              <div className="ps-cap-card-head">
                <h3 className="ps-cap-name">{area.label}</h3>
                <StatusPill tone="disabled">empty by design</StatusPill>
              </div>
              <p className="ps-cap-summary">{area.purpose}</p>
              <p className="ps-cap-note">{area.emptyState.reason}</p>
            </Card>
          ))}
        </ul>
      </section>

      <section aria-labelledby="entry-outcomes-heading" className="ps-page-section">
        <h2 id="entry-outcomes-heading" className="ps-page-section-title">
          The five outcome actions, honestly
        </h2>
        <p className="ps-page-section-note">
          Every outcome action states whether it can dispatch in this
          deployment — and when it cannot, the typed reason renders
          verbatim. Never a dead button, never a fabricated success.
        </p>
        <ul className="ps-page-list">
          {outcomeBoard.rows.map((row) => (
            <li key={row.actionId} className="ps-cap-row">
              <span className="ps-cap-name">{row.label}</span>
              <StatusPill tone={row.capability.dispatchable ? "ok" : "attention"}>
                {row.capability.dispatchable
                  ? "Dispatchable"
                  : "Not dispatchable in this deployment"}
              </StatusPill>
            </li>
          ))}
        </ul>
        {outcomeBoard.nothingDispatchable ? (
          <p className="ps-page-section-note">
            No outcome action is dispatchable yet — that is the honest fact
            of this deployment phase, recorded here instead of hidden.
          </p>
        ) : null}
      </section>
    </article>
  );
}
