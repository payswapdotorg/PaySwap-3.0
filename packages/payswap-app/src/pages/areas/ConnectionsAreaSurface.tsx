/**
 * @payswap/app — the CONNECTIONS area surface (P12 Lane C, C3 + C4).
 *
 * The first-class setup surface for BOTH rails:
 *
 * 1. The PSP CONNECTION SETUP FLOW (C4): the capability catalogue (the
 *    declared connection forms + credential kinds — reference, never
 *    connections), the scopes vocabulary, the setup steps with their
 *    honest states (the connect step states its typed prerequisite — the
 *    connection plane is unwired in this deployment — instead of a dead
 *    connect button), health (honest empty at providerCount 0), the
 *    structural sandbox/live distinction and the lifecycle vocabulary
 *    (reconnect/disable/disconnect as lawful transitions).
 * 2. THE ONCHAIN RAIL (C3): the declared chain catalogue (chain identity
 *    IS the environment — production/testnet/regtest classes), the
 *    capability checklist with every UNAVAILABLE row carrying its typed
 *    reason (no wallet connection surface, no live network context, no
 *    observations), the state vocabulary (BROADCAST/CONFIRMED/FAILED/
 *    OUTCOME_UNKNOWN — UNKNOWN never becomes FAILED or success), and the
 *    synthetic venue packs rendered AS synthetic model deployments.
 *
 * providerCount stays honestly 0; nothing here fabricates a connected
 * provider, wallet, balance, quote or transaction (INV-13 posture).
 */

import { Card, StatusPill } from "@zcode/ui/payswap";
import { foldConnectionsSetup } from "../../lib/connections-catalogue.js";
import { foldOnchainRail } from "../../lib/onchain-rail.js";
import { agentProviderSetupCards } from "../../lib/agent-provider-entries.js";
import type { PaySwapNavigation } from "../../shell/navigation.js";
import { ProductLink } from "../../shell/ProductLink.js";
import type { OnchainCapabilityRow } from "../../lib/onchain-rail.js";
import { sharedAgentComposerController } from "../../agent/agentComposerController.js";
import { AgentComposer } from "../../agent/AgentComposer.js";

const CAPABILITY_STATE_PILL: Readonly<
  Record<OnchainCapabilityRow["state"], { readonly tone: "disabled" | "attention" | "unknown"; readonly label: string }>
> = {
  UNAVAILABLE: { tone: "attention", label: "UNAVAILABLE — reason stated" },
  REFERENCE: { tone: "disabled", label: "Reference vocabulary" },
  NO_OBSERVATIONS: { tone: "unknown", label: "No observations — honest empty" },
};

const SETUP_STEP_PILL: Readonly<
  Record<"READY_DECLARED" | "BLOCKED_UNWIRED" | "EMPTY_HONEST", { readonly tone: "ok" | "attention" | "unknown"; readonly label: string }>
> = {
  READY_DECLARED: { tone: "ok", label: "Declared — renders as reference" },
  BLOCKED_UNWIRED: { tone: "attention", label: "Setup required — the honest gate" },
  EMPTY_HONEST: { tone: "unknown", label: "Empty — nothing to operate on" },
};

export function ConnectionsAreaSurface({
  productNavigation,
}: {
  readonly productNavigation?: PaySwapNavigation;
}) {
  const setup = foldConnectionsSetup();
  const onchain = foldOnchainRail();
  const setupCards = agentProviderSetupCards();

  const seedProviderSetup = (card: (typeof setupCards)[number]): void => {
    void sharedAgentComposerController().seedFromSurface({
      intent: {
        kind: "CONNECTION_SETUP",
        providerId: card.providerId,
        form: card.form,
        useCaseRef: card.useCaseRef,
      },
      originNote: card.cardActionLabel,
      area: "connections",
    });
  };

  return (
    <>
      <section aria-labelledby="connections-setup-heading" className="ps-page-section">
        <h2 id="connections-setup-heading" className="ps-page-section-title">
          PSP connection setup — {setup.connectedCount} connected
        </h2>
        <p className="ps-page-section-note">
          The honest setup flow for payment-service-provider connections:
          the capability catalogue, the scopes a connection can admit, and
          every step's real state in this deployment. A catalogue entry is
          never a connection — execution is scoped to actual account
          authorization, and the connected count is the recorded truth
          (zero until a real connection exists).
        </p>
        <ol className="ps-page-list p12-setup-steps">
          {setup.steps.map((step) => {
            const pill = SETUP_STEP_PILL[step.state];
            return (
              <li key={step.id} className="ps-cap-row">
                <div className="ps-cap-card-head">
                  <span className="ps-cap-name">
                    {step.title}
                  </span>
                  <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                </div>
                <p className="ps-cap-note">{step.line}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="connections-agent-heading" className="ps-page-section">
        <h2 id="connections-agent-heading" className="ps-page-section-title">
          Agent-led setup — click a card or just ask
        </h2>
        <p className="ps-page-section-note">
          The shared PaySwap agent composer lives on this surface (and on
          Pay, Receive, Move, Convert and the Agent Workspace). Clicking a
          connect card below and typing “connect Stripe” into the composer
          reach the SAME resumable setup task — one task, one history,
          never a duplicate. Seeding a task connects nothing: a connection
          exists only when the connection plane records real provider
          evidence, and every card states its typed prerequisite verbatim.
        </p>
        <ul className="ps-page-grid">
          {setupCards.map((card) => (
            <li key={`${card.providerId}:${card.form}`} className="ps-page-grid-item">
              <Card className="ps-area-card">
                <div className="ps-cap-card-head">
                  <h3 className="ps-cap-name">{card.cardTitle}</h3>
                  <StatusPill tone="disabled">Declared — never a connection</StatusPill>
                </div>
                <p className="ps-cap-summary">{card.cardLine}</p>
                <button
                  type="button"
                  className="ps-agent-entry-action"
                  onClick={() => seedProviderSetup(card)}
                >
                  {card.cardActionLabel}
                </button>
              </Card>
            </li>
          ))}
        </ul>
        <p className="ps-page-section-note">
          Stripe is the one provider declared in this deployment — no
          other provider is named anywhere, so no other provider is ever
          offered. Voice input is not supported in this deployment and is
          never simulated; the composer states it where voice would be
          offered.
        </p>
        <AgentComposer area="connections" />
      </section>

      <section aria-labelledby="connections-forms-heading" className="ps-page-section">
        <h2 id="connections-forms-heading" className="ps-page-section-title">
          The connection forms catalogue
        </h2>
        <p className="ps-page-section-note">
          The five canonical connection forms (declared reference — never
          connections): credential kinds{" "}
          {setup.credentialKinds.join(", ")}. Scopes admit{" "}
          {setup.operationClasses.join(" / ")} with effect classes{" "}
          {setup.effectClasses.join(" / ")}. The lifecycle is the lawful
          transition machine {setup.lifecycleStates.join(" → ")} (terminal
          states monotonic; every transition recorded with its cause and
          an append-only history). Execution modes are structurally{" "}
          {setup.executionModes.join(" / ")} — sandbox is never proof of
          live behavior.
        </p>
        <ul className="ps-page-grid">
          {setup.forms.map((form) => (
            <li key={form.form} className="ps-page-grid-item">
              <Card className="ps-area-card">
                <div className="ps-cap-card-head">
                  <h3 className="ps-cap-name">{form.form}</h3>
                  <StatusPill tone="disabled">Catalogue</StatusPill>
                </div>
                <p className="ps-cap-summary">{form.summary}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="onchain-rail-heading" className="ps-page-section" id="onchain">
        <h2 id="onchain-rail-heading" className="ps-page-section-title">
          The onchain rail
        </h2>
        <p className="ps-page-section-note">
          Blockchain is one settlement-rail family of the same connected
          instance model: a wallet or venue connects the same way a
          provider does — through actual account authorization, never a
          catalogue entry. This surface states exactly what exists and
          what does not in this deployment; nothing is fabricated.
        </p>

        <ul className="ps-page-list">
          {onchain.capabilities.map((capability) => {
            const pill = CAPABILITY_STATE_PILL[capability.state];
            return (
              <li key={capability.id} className="ps-cap-row">
                <div className="ps-cap-card-head">
                  <span className="ps-cap-name">{capability.label}</span>
                  <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                </div>
                <p className="ps-cap-note">{capability.line}</p>
              </li>
            );
          })}
        </ul>

        <h3 className="p12-subsection-title">The declared chain catalogue</h3>
        <p className="ps-page-section-note">
          Chain identity IS the environment (structural, fail-closed): the
          frozen registry classifies every declared chain, and a testnet
          chain can never carry a production token. This is declared
          catalogue data — the honest extent of network context today (no
          RPC/indexer transport is wired in this deployment).
        </p>
        <ul className="ps-page-grid p12-chain-grid">
          {onchain.chains.map((chain) => (
            <li key={chain.chainKey} className="ps-page-grid-item">
              <Card className="ps-area-card">
                <div className="ps-cap-card-head">
                  <h3 className="ps-cap-name p12-mono">{chain.chainKey}</h3>
                  <StatusPill
                    tone={chain.environmentClass === "PRODUCTION" ? "ok" : "attention"}
                  >
                    {chain.environmentClass}
                  </StatusPill>
                </div>
                <p className="ps-cap-summary">
                  Families: {onchain.families.join(", ")} — declared
                  environments: {onchain.environmentClasses.join(", ")}.
                </p>
              </Card>
            </li>
          ))}
        </ul>

        <h3 className="p12-subsection-title">The observation vocabulary</h3>
        <p className="ps-page-section-note">
          The full state vocabulary is pinned and machine-checked:
          outcomes {onchain.executionOutcomes.join(" / ")} (BROADCAST is
          submitted-not-finality; a CONFIRMED observation carries a
          finality CANDIDATE with reorg detection and confirmation depth —
          never finality itself); failure classes{" "}
          {onchain.failureClasses.join(", ")}; retry guidance{" "}
          {onchain.retryGuidance.join(" / ")}; custody models{" "}
          {onchain.custodyModels.join(", ")}; capability flavors{" "}
          {onchain.capabilityKinds.join(", ")}; operations{" "}
          {onchain.operationKinds.join(", ")}; simulation statuses{" "}
          {onchain.simulationStatuses.join(" / ")}; fee models{" "}
          {onchain.feeModels.join(" / ")}.
        </p>

        <h3 className="p12-subsection-title">Venue packs — synthetic model deployments</h3>
        <p className="ps-page-section-note">
          The onchain extension packs model venue families (DEX,
          aggregator, intents, bridge, off-ramp, lending, liquidity).
          Every pack is a SYNTHETIC model deployment — a venue-STYLE
          declarative shape with no claim about any specific real venue.
          They are reference declarations, never live venues; no swap,
          bridge or cross-chain execution exists in this deployment.
        </p>
        <ul className="ps-page-list">
          {onchain.venues.map((venue) => (
            <li key={venue.protocolKey} className="ps-cap-row">
              <span className="ps-cap-name p12-mono">{venue.protocolKey}</span>
              <StatusPill tone="disabled">Synthetic · {venue.family}</StatusPill>
              <span className="ps-cap-note p12-mono">{venue.chainKey}</span>
            </li>
          ))}
        </ul>

        <p className="ps-area-learn">
          <ProductLink to="/app/accounts" navigation={productNavigation}>
            See how balances would be observed (Accounts)
          </ProductLink>
          {" · "}
          <ProductLink to="/app/capabilities" navigation={productNavigation}>
            See the capability explorer
          </ProductLink>
        </p>
      </section>
    </>
  );
}
