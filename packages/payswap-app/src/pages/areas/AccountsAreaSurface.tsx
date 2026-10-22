/**
 * @payswap/app — the ACCOUNTS area surface (P12 Lane C, C3).
 *
 * Accounts is where externally-observed balances live: every number an
 * OBSERVATION of an external provider or chain — never PaySwap custody
 * (INV-7). The P12 addition is the observation vocabulary block: what an
 * asset observation IS (observer identity, freshness, provenance), the
 * honest fact that ZERO observations exist in this deployment, and the
 * cross-anchor to the onchain rail on the connections area. The generic
 * area scaffold (pinned empty state, anchored outcome actions, onward
 * links, sparseness note) stays — this surface only adds the
 * observations block.
 */

import { Card, StatusPill } from "@zcode/ui/payswap";
import type { PaySwapNavigation } from "../../shell/navigation.js";
import { ProductLink } from "../../shell/ProductLink.js";

export function AccountsAreaSurface({
  productNavigation,
}: {
  readonly productNavigation?: PaySwapNavigation;
}) {
  return (
    <section aria-labelledby="accounts-observations-heading" className="ps-page-section">
      <h2 id="accounts-observations-heading" className="ps-page-section-title">
        Balances as observations — none observed
      </h2>
      <p className="ps-page-section-note">
        Every balance on this surface is an OBSERVATION of an external
        provider or chain — with its observer identity, freshness (as-of
        time and maximum tolerated age) and provenance — never PaySwap
        custody and never a balance PaySwap holds. An observation can
        inform routing, timing and reconciliation only according to its
        provenance and freshness.
      </p>
      <Card className="ps-area-card">
        <div className="ps-cap-card-head">
          <h3 className="ps-cap-name">Asset observations</h3>
          <StatusPill tone="unknown">No observations — honest empty</StatusPill>
        </div>
        <p className="ps-cap-summary">
          Zero asset observations are recorded in this deployment: no
          provider balance and no onchain position has been observed, so
          no number renders here. Onchain positions would be observed by a
          declared observer (chain node, indexer, RPC provider, wallet
          provider, operator) — the vocabulary is pinned and real; the
          observations do not exist, and none is invented.
        </p>
        <p className="ps-area-learn">
          <ProductLink to="/app/connections" navigation={productNavigation}>
            See the onchain rail and its observation vocabulary (Connections)
          </ProductLink>
        </p>
      </Card>
    </section>
  );
}
