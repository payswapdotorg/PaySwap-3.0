/**
 * @zcode/web/payswap — the developer entry page.
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

import { Card, KeyValue } from "@zcode/ui/payswap";
import type { DevelopersPageView } from "../contracts/view-models.js";

export function DevelopersPage({ view }: { readonly view: DevelopersPageView }) {
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
    </article>
  );
}
