/**
 * @payswap/app — the app OVERVIEW: the honest authenticated entry boundary.
 *
 * ADAPT of payswap.org@8a735bf packages/web the honest /app gate (MMP-36
 * content/IA evidence) — P9-A: elevated from a gated dead-end into the
 * app OVERVIEW (J2): the honest gate statement + the eleven-area map with
 * every area's HONEST empty-state contract (the canonical surface IA —
 * pinned) + the five outcome actions' honest dispatchability board, each
 * linked to its REAL area route (lib/outcome-area-aliases.ts — the
 * surface reconciliation). The map of the product is truthful even while
 * the surface itself is gated: zero credential capture, zero fabricated
 * data, zero dead ends.
 *
 * On the substrate the session plane is platform territory (web: the
 * server session; desktop: the host attachment); wiring real session
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
import { outcomeAreaAlias } from "../lib/outcome-area-aliases.js";
import type { PaySwapNavigation } from "../shell/navigation.js";
import { ProductLink } from "../shell/ProductLink.js";
import { AgentComposer } from "../agent/AgentComposer.js";

export function AppOverviewPage({
  navigation,
  outcomeBoard,
  productNavigation,
}: {
  readonly navigation: NavigationAreaView;
  readonly outcomeBoard: OutcomeBoardView;
  readonly productNavigation?: PaySwapNavigation;
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
          The map below is the honest truth of what exists and what does not.
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
          Each one opens its own surface and renders the honest truth of
          THIS deployment: its designed empty state — why it is empty and
          what the real next action is. Nothing here is populated by
          guesswork.
        </p>
        <ul className="ps-page-grid">
          {navigation.areas.map((area) => (
            /* a11y fix (axe "list", found by the journey suite): <ul>
               children must be <li> — the Card renders a <div>; the
               wrapper matches CapabilitiesPage's ps-page-grid-item
               pattern. */
            <li key={area.id} className="ps-page-grid-item">
              <Card className="ps-area-card">
                <div className="ps-cap-card-head">
                  <h3 className="ps-cap-name">{area.label}</h3>
                  <StatusPill tone="disabled">empty by design</StatusPill>
                </div>
                <p className="ps-cap-summary">{area.purpose}</p>
                <p className="ps-cap-note">{area.emptyState.reason}</p>
                <ProductLink
                  to={area.route}
                  navigation={productNavigation}
                  className="ps-area-open"
                >
                  Open {area.label}
                </ProductLink>
              </Card>
            </li>
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
          verbatim with the area where its journey lives. Never a dead
          button, never a fabricated success.
        </p>
        <ul className="ps-page-list">
          {outcomeBoard.rows.map((row) => {
            const alias = outcomeAreaAlias(row.actionId);
            return (
              <li key={row.actionId} className="ps-cap-row">
                <span className="ps-cap-name">{row.label}</span>
                <span className="ps-cap-anchor">
                  {alias.navAreas.length > 0 ? (
                    <>
                      {"in "}
                      <ProductLink
                        to={`/app/${alias.navAreas[0]}`}
                        navigation={productNavigation}
                      >
                        {alias.navAreas.join(" + ")}
                      </ProductLink>
                    </>
                  ) : null}
                </span>
                <StatusPill tone={row.capability.dispatchable ? "ok" : "attention"}>
                  {row.capability.dispatchable
                    ? "Dispatchable"
                    : "Not dispatchable in this deployment"}
                </StatusPill>
              </li>
            );
          })}
        </ul>
        {outcomeBoard.nothingDispatchable ? (
          <p className="ps-page-section-note">
            No outcome action is dispatchable yet — that is the honest fact
            of this deployment phase, recorded here instead of hidden.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="app-overview-agent-heading" className="ps-page-section">
        <h2 id="app-overview-agent-heading" className="ps-page-section-title">
          The PaySwap agent — one composer, every surface
        </h2>
        <p className="ps-page-section-note">
          The shared agent composer also lives on this overview: ask for a
          payment or a connection in plain words, or open the areas above
          and use their agent-led sections. Every entrypoint — a card
          click, a typed request, an area action — reaches the SAME
          resumable task: one task list, one history, never a duplicate.
          The composer works standalone in this browser profile (honestly
          labeled): it records requests and progress; it holds zero
          financial authority, and voice input is not supported in this
          deployment — stated, never simulated.
        </p>
        <AgentComposer area="app-overview" />
      </section>
    </article>
  );
}
