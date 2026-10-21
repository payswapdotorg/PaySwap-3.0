/**
 * @payswap/app — the security &amp; non-custody page.
 *
 * ADAPT of payswap.org@8a735bf packages/web/src/components/
 * security-page.tsx (202L) (MMP-36 content/IA evidence): the non-custody
 * and session-isolation explanation. Every commitment on the page must
 * match the repository's structural facts — the ported oracle pins the
 * claims so they cannot drift into marketing (the old suite's law, kept).
 * The canonical authority vocabulary (BLOCK/ALLOW/UNKNOWN, external
 * observations) is pinned from the accepted surface/provider-runtime
 * contracts; the page never claims custody.
 */

import { Card, KeyValue } from "@zcode/ui/payswap";

const COMMITMENTS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "PaySwap never holds your money",
    body: "PaySwap is not another place your money lives. Balances you see are external observations reported by the providers you connect — never PaySwap custody. Funds move provider-to-provider under your authorization.",
  },
  {
    title: "PaySwap never holds your credentials",
    body: "Provider connections run through scoped credentials kept in an operator vault outside Git, referenced by name only (PROVIDER_NAME_CREDENTIAL_REF). Secrets never enter model context, logs or ordinary artifacts.",
  },
  {
    title: "Connections are user-authorized sessions",
    body: "A provider catalogue capability is never a connection. Execution is scoped to actual account authorization through user-authorized browser sessions — not a standing key PaySwap can use whenever it likes. When a session expires, journeys that need it stop and ask you to re-authenticate; they never quietly continue with stale authority.",
  },
  {
    title: "Every financial action carries evidence",
    body: "Each consequential financial effect records both its authorization lineage and its evidence lineage — auditable by construction. Submission is not finality: a payout sent is not beneficiary credit until its own evidence-backed observation says so.",
  },
  {
    title: "UNKNOWN is never quietly resolved",
    body: "When a provider answer is ambiguous, the product renders UNKNOWN and works the reconciliation against the provider's own record. UNKNOWN is never silently turned into success or failure — it is distinct from FAILED and is reconciled rather than blindly retried.",
  },
  {
    title: "Fail-closed, everywhere",
    body: "When configuration, evidence or authorization is missing, the surface refuses to fabricate a value. Malformed inputs, guarantees without provider backing and claims without evidence are rejected — never silently degraded.",
  },
];

export function SecurityPage() {
  return (
    <article className="ps-page">
      <header className="ps-page-header">
        <h1 className="ps-page-title">Security &amp; non-custody</h1>
        <p className="ps-page-lede">
          PaySwap is not another wallet, not another bank, not another place
          your money lives. It is a non-custodial economic operating system
          over the payment providers and rails you already use — and the
          commitments below are structural facts of the repository, not
          marketing.
        </p>
      </header>

      <section aria-labelledby="commitments-heading" className="ps-page-section">
        <h2 id="commitments-heading" className="ps-page-section-title">
          The six structural commitments
        </h2>
        <div className="ps-page-grid">
          {COMMITMENTS.map((commitment) => (
            <Card key={commitment.title} className="ps-sec-card">
              <h3 className="ps-sec-title">{commitment.title}</h3>
              <p className="ps-sec-body">{commitment.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="custody-heading" className="ps-page-section">
        <h2 id="custody-heading" className="ps-page-section-title">
          What &quot;non-custodial&quot; means in practice
        </h2>
        <KeyValue
          entries={[
            {
              key: "Your balances",
              value:
                "External observations of your provider accounts — recorded with provenance, never PaySwap custody.",
            },
            {
              key: "Your credentials",
              value:
                "Operator vault references by name only — never in Git, never in the product, never in logs.",
            },
            {
              key: "Your authorization",
              value:
                "Session-scoped and re-authenticated when expired — never quietly continued with stale authority.",
            },
            {
              key: "Your evidence",
              value:
                "Authorization lineage and evidence lineage for every consequential effect — history is never rewritten.",
            },
          ]}
        />
      </section>

      <section aria-labelledby="unknown-heading" className="ps-page-section">
        <h2 id="unknown-heading" className="ps-page-section-title">
          How UNKNOWN is handled
        </h2>
        <p className="ps-page-section-note">
          The provider-verified observation vocabulary has exactly three
          outcome words: CONFIRMED, UNKNOWN and FAILED. The product renders
          UNKNOWN as UNKNOWN — with reconciliation-first wording, never as
          failure, never as success. After a potentially effective external
          command, an ambiguous result is reconciled against the provider's
          own record before any consequential retry.
        </p>
        <p className="ps-page-section-note">
          Security gates speak BLOCK / ALLOW / UNKNOWN in people language:
          BLOCK stays BLOCK and cannot be softened; UNKNOWN stays UNKNOWN;
          ALLOW never claims blanket trust.
        </p>
      </section>

      <section aria-labelledby="phase-heading" className="ps-page-section">
        <h2 id="phase-heading" className="ps-page-section-title">
          This deployment phase
        </h2>
        <p className="ps-page-section-note">
          The authenticated product surface is not yet available in this
          deployment phase. The entry renders an honest authentication gate
          — not a demo with fake balances or a pretend login. The public
          coverage explorer and these commitments are the honest surfaces of
          this phase.
        </p>
        <nav aria-label="Security page onward links" className="ps-page-links">
          <a href="/payswap/capabilities">See the honest coverage explorer</a>
          <a href="/payswap/developers">Read the developer entry</a>
        </nav>
      </section>
    </article>
  );
}
