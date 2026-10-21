/**
 * @payswap/app — the honest coverage explorer (public capabilities
 * page).
 *
 * ADAPT of payswap.org@8a735bf packages/web/src/components/
 * capabilities-page.tsx (469L) (MMP-36 content/IA evidence): VERIFIED /
 * BLOCKED / not-connected are visually and semantically distinct, probe
 * dates are visible, and a provider NEVER appears connected when the
 * recorded evidence says otherwise (the old suite's law, kept verbatim in
 * the ported oracle). The old page baked the old repo's evidence JSONs
 * into the module; the canonical product receives the recorded evidence
 * as an EXPLICIT input (CoverageSource) — and this repository phase has
 * NO committed provider evidence, so the default render is the honest
 * no-evidence state, never an invented provider.
 */

import { Card, EmptyState, StatusPill } from "@zcode/ui/payswap";
import type { CoverageView } from "../contracts/view-models.js";
import { formatUtcTimestamp, providerLabel } from "../lib/coverage.js";

export function CapabilitiesPage({ view }: { readonly view: CoverageView }) {
  return (
    <article className="ps-page">
      <header className="ps-page-header">
        <h1 className="ps-page-title">Capabilities &amp; coverage</h1>
        <p className="ps-page-lede">
          The honest picture of provider coverage, recorded from live probes
          and certification evidence. Providers are never listed as connected
          when the recorded evidence says otherwise — and providers with no
          recorded evidence are never listed at all.
        </p>
      </header>

      {view.noEvidenceRecorded ? (
        <EmptyState
          title="No provider evidence is recorded in this deployment"
          description="The honest state: this repository has no committed provider-probe or rollout evidence records yet. The explorer renders recorded evidence exactly as recorded — connected, blocked, or awaiting credentials — and invents nothing in the gap."
        />
      ) : (
        <>
          {view.connected.length > 0 ? (
            <section aria-labelledby="verified-heading" className="ps-page-section">
              <h2 id="verified-heading" className="ps-page-section-title">
                Verified connections
              </h2>
              <p className="ps-page-section-note">
                Probed live on{" "}
                <time dateTime={view.probedAt}>
                  {formatUtcTimestamp(view.probedAt)}
                </time>
                . Release record: {view.releaseId}.
              </p>
              <ul className="ps-page-grid">
                {view.connected.map((entry) => (
                  <li key={entry.providerName} className="ps-page-grid-item">
                    <Card raised className="ps-cap-card">
                      <div className="ps-cap-card-head">
                        <h3 className="ps-cap-name">
                          {providerLabel(entry.providerName)}
                        </h3>
                        <StatusPill tone="ok">
                          {`${entry.probeEvidence.verdict} · ${entry.authorizationMode}`}
                        </StatusPill>
                      </div>
                      <p className="ps-cap-summary">{entry.probeEvidence.summary}</p>
                      <p className="ps-cap-meta">
                        <time dateTime={entry.probeEvidence.probedAt}>
                          {formatUtcTimestamp(entry.probeEvidence.probedAt)}
                        </time>
                        {" · "}
                        {`${entry.certification.passed}/${entry.certification.executed} scenarios passed`}
                        {entry.certification.certificationId
                          ? ` · ${entry.certification.certificationId}`
                          : ""}
                      </p>
                      {entry.limitations.length > 0 ? (
                        <ul className="ps-cap-limitations">
                          {entry.limitations.map((limitation) => (
                            <li key={limitation}>{limitation}</li>
                          ))}
                        </ul>
                      ) : null}
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {view.blocked.length > 0 ? (
            <section aria-labelledby="blocked-heading" className="ps-page-section">
              <h2 id="blocked-heading" className="ps-page-section-title">
                Blocked at the provider gate
              </h2>
              <p className="ps-page-section-note">
                A blocked provider renders as BLOCKED and unavailable — never
                among the verified connections.
              </p>
              <ul className="ps-page-list">
                {view.blocked.map((entry) => (
                  <li key={entry.providerName} className="ps-cap-row">
                    <span className="ps-cap-name">
                      {providerLabel(entry.providerName)}
                    </span>
                    <StatusPill tone="failed">BLOCKED · unavailable</StatusPill>
                    <span className="ps-cap-reason">{entry.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {view.awaitingCredentials.length > 0 ? (
            <section aria-labelledby="awaiting-heading" className="ps-page-section">
              <h2 id="awaiting-heading" className="ps-page-section-title">
                Built and certified — not connected
              </h2>
              <p className="ps-page-section-note">
                Connectors implemented and certified; activation is waiting on
                operator-supplied credentials — no credential exists in the
                vault until an operator puts one there.
              </p>
              <ul className="ps-page-list">
                {view.awaitingCredentials.map((entry) => (
                  <li key={entry.providerName} className="ps-cap-row">
                    <span className="ps-cap-name">
                      {providerLabel(entry.providerName)}
                    </span>
                    <StatusPill tone="attention">
                      not connected · awaiting credentials
                    </StatusPill>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {view.localRail.length > 0 ? (
            <section aria-labelledby="localrail-heading" className="ps-page-section">
              <h2 id="localrail-heading" className="ps-page-section-title">
                The local rail
              </h2>
              <p className="ps-page-section-note">
                The local rail is not a provider connection: it runs through
                the user-authorized session path, never a stored credential.
              </p>
              <ul className="ps-page-list">
                {view.localRail.map((entry) => (
                  <li key={entry.providerName} className="ps-cap-row">
                    <span className="ps-cap-name">
                      {providerLabel(entry.providerName)}
                    </span>
                    <StatusPill tone="disabled">
                      local rail · not a provider connection
                    </StatusPill>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {view.supportingServices.length > 0 ? (
            <section aria-labelledby="supporting-heading" className="ps-page-section">
              <h2 id="supporting-heading" className="ps-page-section-title">
                Supporting platform services
              </h2>
              <p className="ps-page-section-note">
                Operational services probed for platform use — none of these
                is a payment rail.
              </p>
              <ul className="ps-page-list">
                {view.supportingServices.map((service) => (
                  <li key={service.id} className="ps-cap-row">
                    <span className="ps-cap-name">{providerLabel(service.id)}</span>
                    <StatusPill tone="disabled">{service.verdict}</StatusPill>
                    <span className="ps-cap-reason">{service.note}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <section aria-labelledby="coverage-law-heading" className="ps-page-section">
        <h2 id="coverage-law-heading" className="ps-page-section-title">
          The honesty rules this explorer follows
        </h2>
        <ul className="ps-page-bullets">
          <li>
            Coverage renders from recorded probe evidence only — the same
            records the provider runtime retains.
          </li>
          <li>
            A catalogue capability is never an executable connection: an
            eligible row without a connected instance is refused.
          </li>
          <li>
            Statuses are rendered verbatim and never upgraded — BLOCKED stays
            BLOCKED, awaiting-credentials stays awaiting.
          </li>
          <li>
            Sandbox/test modes are visibly distinct and are never represented
            as proof of live behavior.
          </li>
        </ul>
      </section>
    </article>
  );
}
