/**
 * @payswap/app — the public home page.
 *
 * ADAPT of payswap.org@8a735bf packages/web/src/components/home-page.tsx
 * (276L) (MMP-36 content/IA evidence): the product positioning, the five
 * outcome actions with their HONEST dispatchability facts (the canonical
 * surface registry — replacing the old repo's five-journey narrative whose
 * authority owners do not exist in PaySwap 3.0), the honest coverage
 * summary, and the non-custody commitments.
 *
 * LAWS: every claim is true to the repository's facts (the old suite's
 * "claims that are true to the repository's facts" law, kept); the honest
 * gate expectation is set BEFORE the click; UNKNOWN appears as itself;
 * data arrives via the HomePageView prop (presentation-only — no fetch,
 * no ambient evidence import).
 */

import {
  Card,
  EmptyState,
  StatusPill,
} from "@zcode/ui/payswap";
import type { ReactNode } from "react";
import type { HomePageView } from "../contracts/view-models.js";
import { formatUtcTimestamp, providerLabel } from "../lib/coverage.js";
import { outcomeAreaAlias } from "../lib/outcome-area-aliases.js";
import type { PaySwapNavigation } from "../shell/navigation.js";
import { ProductLink } from "../shell/ProductLink.js";
import { AgentComposer } from "../agent/AgentComposer.js";

function productLink(
  href: string,
  children: ReactNode,
  variant: "primary" | "secondary" = "secondary",
  navigation?: PaySwapNavigation,
): ReactNode {
  return (
    <ProductLink
      to={href}
      navigation={navigation}
      className={
        variant === "primary"
          ? "ps-home-cta ps-home-cta--primary"
          : "ps-home-cta ps-home-cta--secondary"
      }
    >
      {children}
    </ProductLink>
  );
}

export function HomePage({
  view,
  navigation,
}: {
  readonly view: HomePageView;
  readonly navigation?: PaySwapNavigation;
}) {
  const { positioning, outcomeBoard, coverageSummary, commitments } = view;
  const connectedNames = coverageSummary.connected.map((entry) =>
    providerLabel(entry.providerName),
  );
  const blockedEntry = coverageSummary.blocked[0];

  return (
    <>
      {/* Hero */}
      <section aria-labelledby="hero-heading" className="ps-home-hero">
        <div className="ps-home-container">
          <p className="ps-home-eyebrow">PaySwap</p>
          <h1 id="hero-heading" className="ps-home-h1">
            {positioning.headline}
          </h1>
          <p className="ps-home-lede">{positioning.subheadline}</p>
          <div className="ps-home-cta-row">
            {productLink("/app", "Open the product", "primary", navigation)}
            {productLink("/capabilities", "See live coverage", "secondary", navigation)}
          </div>
          <p className="ps-home-gate-note">
            The product requires authentication and is not yet available in
            this deployment phase — you will see an honest gate, not a demo
            with fake balances or a pretend login.
          </p>
        </div>
      </section>

      {/* The five outcome actions with honest dispatchability */}
      <section aria-labelledby="outcomes-heading" className="ps-home-section">
        <div className="ps-home-container">
          <h2 id="outcomes-heading" className="ps-home-h2">
            What you do with PaySwap
          </h2>
          <p className="ps-home-section-lede">
            Five outcome actions on the providers and rails you already use —
            each one records where its journey really executes, and each one
            tells you the honest truth about whether it can dispatch in this
            deployment yet.
          </p>
          {outcomeBoard.nothingDispatchable ? (
            <EmptyState
              title="No outcome action is dispatchable in this deployment yet"
              description="That is the honest fact, not an error: the economic intake plane is not configured here. Every action below renders its typed prerequisite instead of pretending to be live."
            />
          ) : null}
          <ul className="ps-home-grid">
            {outcomeBoard.rows.map((row) => {
              const alias = outcomeAreaAlias(row.actionId);
              return (
                <li key={row.actionId} className="ps-home-card">
                  <div className="ps-home-card-head">
                    <h3 className="ps-home-card-title">{row.label}</h3>
                    <StatusPill
                      tone={row.capability.dispatchable ? "ok" : "attention"}
                    >
                      {row.capability.dispatchable ? "Dispatchable" : "Not yet dispatchable"}
                    </StatusPill>
                  </div>
                  <p className="ps-home-card-body">{row.outcomeLine}</p>
                  {!row.capability.dispatchable &&
                  row.capability.missingPrerequisite ? (
                    <p className="ps-home-card-note">
                      {row.capability.missingPrerequisite}
                    </p>
                  ) : null}
                  {alias.navAreas.length > 0 ? (
                    <p className="ps-area-learn">
                      <ProductLink
                        to={`/app/${alias.navAreas[0]}`}
                        navigation={navigation}
                      >
                        Open {alias.navAreas.join(" + ")}
                      </ProductLink>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="ps-home-unknown-note">
            When a provider answer is ambiguous, the product renders UNKNOWN
            and works the reconciliation — UNKNOWN is never silently turned
            into success or failure.
          </p>
        </div>
      </section>

      {/* Honest coverage summary */}
      <section aria-labelledby="coverage-heading" className="ps-home-section-alt">
        <div className="ps-home-container">
          <h2 id="coverage-heading" className="ps-home-h2">
            Provider coverage today
          </h2>
          {coverageSummary.noEvidenceRecorded ? (
            <EmptyState
              title="No provider evidence is recorded in this deployment"
              description="Providers appear here only from recorded probe evidence — never from a marketing list. When the canonical provider-runtime records its first connected instance, this summary renders it exactly as recorded."
            />
          ) : (
            <>
              <p className="ps-home-section-lede">
                Recorded from live provider probes on{" "}
                <time dateTime={coverageSummary.probedAt}>
                  {formatUtcTimestamp(coverageSummary.probedAt)}
                </time>
                . This is the honest picture — providers are never listed as
                connected when the recorded evidence says otherwise.
              </p>
              <dl className="ps-home-grid">
                <div className="ps-home-stat">
                  <dt className="ps-home-stat-label">
                    Verified connections (test-mode)
                  </dt>
                  <dd className="ps-home-stat-value ps-home-stat-value--ok">
                    {coverageSummary.connected.length}
                  </dd>
                  <p className="ps-home-stat-note">
                    {connectedNames.length > 0
                      ? `${connectedNames.join(", ")} — probed live, with certification evidence.`
                      : "None recorded."}
                  </p>
                </div>
                <div className="ps-home-stat">
                  <dt className="ps-home-stat-label">
                    Blocked at the provider gate
                  </dt>
                  <dd className="ps-home-stat-value ps-home-stat-value--danger">
                    {coverageSummary.blocked.length}
                  </dd>
                  <p className="ps-home-stat-note">
                    {blockedEntry
                      ? `${providerLabel(blockedEntry.providerName)} — ${blockedEntry.reason}.`
                      : "No blocked providers recorded."}
                  </p>
                </div>
                <div className="ps-home-stat">
                  <dt className="ps-home-stat-label">
                    Built, awaiting credentials
                  </dt>
                  <dd className="ps-home-stat-value ps-home-stat-value--attention">
                    {coverageSummary.awaitingCredentials.length}
                  </dd>
                  <p className="ps-home-stat-note">
                    Connectors implemented, activation waiting on
                    operator-supplied credentials — plus the local rail.
                  </p>
                </div>
              </dl>
            </>
          )}
          {productLink("/capabilities", "Full coverage explorer", "secondary", navigation)}
        </div>
      </section>

      {/* Non-custody */}
      <section aria-labelledby="custody-heading" className="ps-home-section">
        <div className="ps-home-container">
          <h2 id="custody-heading" className="ps-home-h2">
            Non-custodial by construction
          </h2>
          <p className="ps-home-section-lede">
            PaySwap is an operating system over your existing economic
            relationships — not another place your money lives.
          </p>
          <div className="ps-home-grid">
            {commitments.map((title) => (
              <Card key={title} className="ps-home-custody-card">
                <h3 className="ps-home-card-title">{title}</h3>
                <p className="ps-home-card-body">
                  {title === "We never hold your credentials"
                    ? "Provider connections run through scoped credentials kept in an operator vault outside Git. The product references them by name only."
                    : title === "We never hold your money"
                      ? "Balances you see are external observations reported by the providers you connect. Funds never move into PaySwap custody."
                      : "Each consequential financial effect records both its authorization lineage and its evidence lineage — auditable by construction."}
                </p>
              </Card>
            ))}
          </div>
          {productLink("/security", "Read the security & non-custody commitments →", "secondary", navigation)}
        </div>
      </section>

      {/* Developers */}
      <section aria-labelledby="developers-heading" className="ps-home-section-dark">
        <div className="ps-home-container">
          <h2 id="developers-heading" className="ps-home-h2-invert">
            Building on PaySwap?
          </h2>
          <p className="ps-home-section-lede-invert">
            The API is the authority. This website is just one client of it —
            the same protocol path that renders these pages serves your
            programmatic clients. Financial truth is protocol-owned; the
            interface only ever projects it.
          </p>
          <ProductLink
            to="/developers"
            navigation={navigation}
            className="ps-home-cta ps-home-cta--on-dark"
          >
            Start with the API
          </ProductLink>
        </div>
      </section>

      {/* The shared agent composer — the pre-auth entry */}
      <section aria-labelledby="home-agent-heading" className="ps-home-section">
        <div className="ps-home-container">
          <h2 id="home-agent-heading" className="ps-home-h2">
            Meet the PaySwap agent
          </h2>
          <p className="ps-home-section-lede">
            One shared composer reaches every task: ask for a payment or a
            connection in plain words here, or use the agent-led sections
            inside the product areas. Card clicks and typed requests
            converge on the SAME resumable task — one task list, one
            history, never a duplicate. The composer records requests and
            progress in this browser profile (honestly labeled); it holds
            zero financial authority, and no payment or connection ever
            happens from chat alone. Voice input is not supported in this
            deployment — stated honestly, never simulated.
          </p>
          <AgentComposer area="home" />
        </div>
      </section>
    </>
  );
}
