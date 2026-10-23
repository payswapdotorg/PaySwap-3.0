/**
 * @payswap/app — the CONNECTIONS workspace section (console surface).
 *
 * §6 + the P13 UX reference ( Connections → Stripe ): the honest
 * no-provider state — zero connected capabilities, the real truth of
 * this deployment (the recorded NO_EVIDENCE_COVERAGE fact: no connected
 * instances, no recorded provider evidence) — now composed with the
 * P13 connections concept, honestly:
 *
 * - the PROVIDER CATALOGUE: the registry-declared Stripe setup cards
 *   (ADR-0007 D5 — Stripe U1/U2/U3 alone) whose Connect actions seed
 *   the ONE shared typed-intent orchestration (the same controller the
 *   composer text path and the workspace entry rail drive — the P13
 *   convergence law), plus the DECLARED-UX-SURFACE cards for the
 *   reference's other providers (PayPal, Adyen, blockchain wallet):
 *   they are NOT registry providers and their controls say so — no
 *   fabricated provider, no invented setup flow;
 * - the SECURE PROVIDER SETUP panel: the expected-domain +
 *   provider-hosted-authentication framing with the P13 security copy
 *   verbatim (authenticate directly with the provider; credentials and
 *   one-time codes never enter agent chat; not a real provider page);
 *   its single Continue action seeds the shared composer — it never
 *   fakes a provider login;
 * - the SETUP DRAFT rail: the resumable five-step connection task
 *   ladder (P13 required journey 1) with the security boundary line —
 *   open auth ≠ connected;
 * - the connection lifecycle vocabulary as clearly-labeled reference;
 *   the substrate model-provider connections when the mount supplies
 *   them.
 *
 * Honesty laws (ADR-0007 D1/D5/D7 + the UX reference): a card is a
 * DECLARATION, never a connection; no synthetic balances, connected
 * badges, transactions, provider dashboards or success banners; the
 * composer/router hold ZERO authority.
 */

import type { ConsoleSectionRecord, ModelProviderStatus } from "../contracts.js";
import { NO_EVIDENCE_COVERAGE } from "../../contracts/harness.js";
import {
  CONNECTIONS_EMPTY_STATE,
  CONNECTION_LIFECYCLE_VOCABULARY,
  REFERENCE_SECTION_ANCHORS,
} from "../section-vocabulary.js";
import type { PaySwapNavigation } from "../../shell/navigation.js";
import { agentProviderSetupCards } from "../../lib/agent-provider-entries.js";
import { sharedAgentComposerController } from "../../agent/agentComposerController.js";
import type { AgentProviderSetupCard } from "../../lib/agent-provider-entries.js";
import {
  Badge,
  Button,
  Card,
  StatusPill,
} from "@zcode/ui/payswap";
import {
  ConsoleEmptyStateView,
  ModelProvidersCard,
  ReferenceCard,
  SectionScaffold,
} from "./shared.js";

/** The area id the connections seeds record (the surface they came from). */
const CONNECTIONS_SEED_AREA = "connections";

/**
 * The P13 concept's other provider surfaces — DECLARED UX surfaces only.
 * ADR-0007 D5 declares Stripe alone in the registry; these entries name
 * the reference's provider-card slots and carry their honest
 * not-in-the-registry line. They never render a connectable control.
 */
const DECLARED_SURFACE_PROVIDERS: readonly {
  readonly id: string;
  readonly label: string;
  readonly mark: string;
  readonly line: string;
}[] = [
  {
    id: "paypal",
    label: "PayPal",
    mark: "P",
    line: "Shown as a catalogue entry until verified — not declared in the provider registry.",
  },
  {
    id: "adyen",
    label: "Adyen",
    mark: "A",
    line: "Provider-specific prerequisites would be shown — not declared in the provider registry.",
  },
  {
    id: "blockchain",
    label: "Blockchain wallet",
    mark: "⬡",
    line: "Wallet connection and signing permissions are separate — not declared in the provider registry.",
  },
];

/** The P13 journey-1 step ladder (the resumable connection task). */
const SETUP_DRAFT_STEPS: readonly { readonly title: string; readonly line: string }[] = [
  {
    title: "Choose integration",
    line: "Store payments or marketplace?",
  },
  {
    title: "Authenticate",
    line: "Use the official provider flow",
  },
  {
    title: "Verify permissions",
    line: "Persist verified scopes",
  },
  {
    title: "Test in sandbox",
    line: "No live effects yet",
  },
  {
    title: "Review live enablement",
    line: "A separate explicit decision",
  },
];

/** Seed the shared typed-intent orchestration from a provider card. */
function seedConnectionTask(card: AgentProviderSetupCard): void {
  void sharedAgentComposerController().seedFromSurface({
    intent: {
      kind: "CONNECTION_SETUP",
      providerId: card.providerId,
      form: card.form,
      useCaseRef: card.useCaseRef,
    },
    originNote: card.cardActionLabel,
    area: CONNECTIONS_SEED_AREA,
  });
}

/** One registry-declared provider card (the honest setup declaration). */
function ProviderSetupCard({ card }: { readonly card: AgentProviderSetupCard }) {
  return (
    <Card className="ps-console-card ps-connections-card">
      <div className="ps-connections-card-head">
        <span className="ps-connections-mark" aria-hidden="true">
          S
        </span>
        <div className="ps-connections-card-titles">
          <h3 className="ps-connections-card-title">{card.cardTitle}</h3>
          <StatusPill tone="disabled">Not connected</StatusPill>
        </div>
      </div>
      <p className="ps-connections-card-line">{card.cardLine}</p>
      <div className="ps-connections-card-actions">
        <Button
          type="button"
          variant="primary"
          onClick={() => seedConnectionTask(card)}
        >
          {card.cardActionLabel.split(" — ")[0]}
        </Button>
      </div>
    </Card>
  );
}

/** One declared-UX-surface card (honest: not a registry provider). */
function DeclaredSurfaceCard({
  provider,
}: {
  readonly provider: (typeof DECLARED_SURFACE_PROVIDERS)[number];
}) {
  return (
    <Card className="ps-console-card ps-connections-card">
      <div className="ps-connections-card-head">
        <span className="ps-connections-mark" aria-hidden="true">
          {provider.mark}
        </span>
        <div className="ps-connections-card-titles">
          <h3 className="ps-connections-card-title">{provider.label}</h3>
          <StatusPill tone="disabled">Not connected</StatusPill>
        </div>
      </div>
      <p className="ps-connections-card-line">{provider.line}</p>
      <div className="ps-connections-card-actions">
        <Button type="button" variant="secondary" disabled>
          Setup not declared
        </Button>
      </div>
    </Card>
  );
}

export function ConnectionsSection({
  section,
  navigation,
  backToProduct,
  modelProviders,
}: {
  readonly section: ConsoleSectionRecord;
  readonly navigation: PaySwapNavigation;
  readonly backToProduct: { readonly label: string; readonly onActivate: () => void };
  readonly modelProviders?: readonly ModelProviderStatus[];
}) {
  // The real coverage fact of this repository phase (the recorded
  // harness constant — never a live probe from the views).
  const connectedCount = NO_EVIDENCE_COVERAGE.connected.length;
  // The registry-declared setup cards (Stripe U1 + its qualifiers).
  const setupCards = agentProviderSetupCards();
  const primaryCard = setupCards[0];
  return (
    <SectionScaffold section={section}>
      <ConsoleEmptyStateView
        spec={CONNECTIONS_EMPTY_STATE}
        navigation={navigation}
        backToProduct={backToProduct}
        title={`Zero connected capabilities — the honest state (${connectedCount} connected)`}
      />

      {/* The P13 provider catalogue: the reference's provider-card row. */}
      <section aria-labelledby="ps-connections-catalogue-heading" className="ps-console-block">
        <div className="ps-console-block-head">
          <h2 id="ps-connections-catalogue-heading" className="ps-console-card-title">
            Provider catalogue
          </h2>
          <Badge>Test environment</Badge>
        </div>
        <p className="ps-console-card-note">
          Connect payment providers and manage verified capabilities. The registry
          declares Stripe alone (ADR-0007 D5); every other provider below is a
          declared UX surface, not a connectable integration.
        </p>
        <div className="ps-connections-grid">
          {setupCards.map((card) => (
            <ProviderSetupCard key={`${card.providerId}:${card.form}`} card={card} />
          ))}
          {DECLARED_SURFACE_PROVIDERS.map((provider) => (
            <DeclaredSurfaceCard key={provider.id} provider={provider} />
          ))}
        </div>
      </section>

      <div className="ps-connections-lanes">
        {/* The P13 secure provider setup panel + the setup-draft rail. */}
        <section aria-labelledby="ps-connections-secure-heading" className="ps-console-block">
          <div className="ps-console-block-head">
            <h2 id="ps-connections-secure-heading" className="ps-console-card-title">
              Secure provider setup
            </h2>
            <Badge>Expected domain: stripe.com</Badge>
          </div>
          <p className="ps-console-card-note">
            Stripe-hosted onboarding — a provider session may open in an isolated
            integrated browser when supported, otherwise the system browser with
            validated return/resume handling.
          </p>
          <div className="ps-connections-session" role="img" aria-label="Illustrative authorized session area — not a real Stripe page or a live auth session">
            <p className="ps-connections-session-mark">S</p>
            <p className="ps-connections-session-title">Continue with Stripe</p>
            <p className="ps-connections-session-line">
              Illustrative authorized session area — the provider&rsquo;s own
              onboarding opens here, identified by origin and authorization
              context.
            </p>
          </div>
          <ul className="ps-connections-security-list">
            <li>
              PaySwap will guide you through the provider&rsquo;s official
              onboarding steps.
            </li>
            <li>You will authenticate directly with the provider.</li>
            <li>
              Credentials and one-time codes must never be entered into agent
              chat.
            </li>
          </ul>
          {primaryCard ? (
            <div className="ps-connections-card-actions">
              <Button
                type="button"
                variant="primary"
                onClick={() => seedConnectionTask(primaryCard)}
              >
                Continue securely
              </Button>
              <p className="ps-connections-honesty-line">
                Not a real Stripe page or a live auth session — this action opens
                the shared PaySwap agent task (the same orchestration as typing
                &ldquo;connect stripe&rdquo;).
              </p>
            </div>
          ) : null}
        </section>

        <aside
          aria-labelledby="ps-connections-draft-heading"
          className="ps-console-block ps-connections-draft"
        >
          <div className="ps-console-block-head">
            <h2 id="ps-connections-draft-heading" className="ps-console-card-title">
              Connect Stripe
            </h2>
            <StatusPill tone="disabled">Setup draft</StatusPill>
          </div>
          <p className="ps-console-card-note">
            One task, safely resumable — the setup draft persists while you
            switch windows or restart, and resumes from the same step.
          </p>
          <ol className="ps-connections-steps">
            {SETUP_DRAFT_STEPS.map((step, index) => (
              <li key={step.title} className="ps-connections-step">
                <span className="ps-connections-step-index" aria-hidden="true">
                  {index + 1}
                </span>
                <div className="ps-connections-step-body">
                  <p className="ps-connections-step-title">{step.title}</p>
                  <p className="ps-connections-step-line">{step.line}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="ps-connections-boundary">
            Security boundary — open auth ≠ connected; only verified evidence
            can activate.
          </p>
        </aside>
      </div>

      <ModelProvidersCard
        modelProviders={modelProviders}
        id="connections-model-providers"
      />
      <ReferenceCard
        id={REFERENCE_SECTION_ANCHORS.connections}
        title="The connection lifecycle vocabulary"
        note="Reference only — the connected-instance model. A catalogue capability is never a connection; execution is scoped to actual account authorization."
        terms={CONNECTION_LIFECYCLE_VOCABULARY}
      />
    </SectionScaffold>
  );
}
