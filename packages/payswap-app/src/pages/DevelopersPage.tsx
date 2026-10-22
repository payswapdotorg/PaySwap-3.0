/**
 * @payswap/app — the developer entry page.
 *
 * ADAPT of payswap.org@8a735bf packages/web/src/components/
 * developers-page.tsx (231L) (MMP-36 content/IA evidence): the API is the
 * authority and the site is one client of it. The honest API runtime
 * configuration renders as "not configured — and shown as such" (with the
 * env var named, never a fabricated URL) when the base URL is absent, and
 * the live base URL when it is present. The canonical consumable
 * contracts of this program are the framework-independent surface
 * contracts (pinned structurally in this product); the certified command
 * surface lands with P7-W3 — this page refuses to invent certified
 * commands before they exist.
 */

import { Card, KeyValue, StatusPill } from "@zcode/ui/payswap";
import {
  ADVANCED_TOOLING_CATALOGUE,
  type DevelopersPageView,
} from "../contracts/view-models.js";
import type { PaySwapNavigation } from "../shell/navigation.js";
import { ProductLink } from "../shell/ProductLink.js";

export function DevelopersPage({
  view,
  productNavigation,
}: {
  readonly view: DevelopersPageView;
  readonly productNavigation?: PaySwapNavigation;
}) {
  const { apiRuntime, consumableContracts } = view;
  return (
    <article className="ps-page">
      <header className="ps-page-header">
        <h1 className="ps-page-title">Developers</h1>
        <p className="ps-page-lede">
          The API is the authority. This website is just one client of it —
          the same protocol path that renders these pages serves your
          programmatic clients, and financial truth is protocol-owned — the
          interface only ever projects it.
        </p>
      </header>

      <section aria-labelledby="runtime-heading" className="ps-page-section">
        <h2 id="runtime-heading" className="ps-page-section-title">
          API runtime state
        </h2>
        {apiRuntime.configured ? (
          <KeyValue
            entries={[
              { key: "State", value: "Configured" },
              { key: "Base URL", value: apiRuntime.baseUrl, mono: true },
            ]}
          />
        ) : (
          <KeyValue
            entries={[
              { key: "State", value: "Not configured — and shown as such" },
              {
                key: "Missing",
                value: `${apiRuntime.envVar} is not set — there is no API base URL to point you at`,
                mono: true,
              },
            ]}
          />
        )}
        <p className="ps-page-section-note">
          The product surface (this website) never replaces or shadows the
          API runtime host: the canonical API host is integration-time
          work owned by the Tech Lead, and this page refuses to fabricate a
          URL when none is configured.
        </p>
      </section>

      <section aria-labelledby="contracts-heading" className="ps-page-section">
        <h2 id="contracts-heading" className="ps-page-section-title">
          The contracts you build against today
        </h2>
        <p className="ps-page-section-note">
          The framework-independent PaySwap Surface contracts are the
          consumable developer surface of this program: the five outcome
          actions with honest dispatchability facts, the quote/terms
          disclosure projection, the one-truthful-lifecycle progress
          states, the BLOCK/ALLOW/UNKNOWN security vocabulary, and exact
          integer minor-unit money display. This product pins them
          structurally and renders them; your clients consume them directly.
        </p>
        <ul className="ps-page-bullets">
          {consumableContracts.map((contract) => (
            <li key={contract}>{contract}</li>
          ))}
        </ul>
        <Card className="ps-dev-card">
          <h3 className="ps-sec-title">What is deliberately NOT here yet</h3>
          <p className="ps-sec-body">
            The certified universal command surface (command grammar,
            external-agent APIs, webhooks) lands with Work Order P7-W3 —
            until then there are no certified command endpoints to document,
            and this page will not invent them.
          </p>
        </Card>
      </section>

      <section aria-labelledby="advanced-tooling-heading" className="ps-page-section">
        <h2 id="advanced-tooling-heading" className="ps-page-section-title">
          Advanced developer tooling
        </h2>
        <p className="ps-page-section-note">
          The advanced developer workspace of the PaySwap Agent Console
          carries the full development toolchain — the same upstream
          open-source platform this product is built on (see the
          attribution in this page&apos;s footer). These capabilities are
          real THERE; they are catalogued here as pointers, and this
          product never duplicates their services. The Agent Workspace
          remains the primary PaySwap work surface.
        </p>
        <ul className="ps-page-bullets">
          {ADVANCED_TOOLING_CATALOGUE.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Card className="ps-dev-card">
          <div className="ps-cap-card-head">
            <h3 className="ps-sec-title">Open the advanced developer workspace</h3>
            <StatusPill tone="disabled">Advanced surface</StatusPill>
          </div>
          <p className="ps-sec-body">
            An advanced technical interface for development work — distinct
            from the PaySwap product surfaces. It requires the console
            backend; without it, the workspace reports its honest
            no-backend state rather than a fabricated one.
          </p>
          <p className="ps-area-learn">
            <ProductLink to="/console/advanced" navigation={productNavigation}>
              Advanced developer workspace
            </ProductLink>
          </p>
        </Card>
      </section>
    </article>
  );
}
