/**
 * @payswap/app — the CONNECTIONS workspace section (console surface).
 *
 * §6 + the P13 UX reference (Connections → Stripe), composed to the
 * operator's attached concept (p13-stripe-connection-concept.svg):
 *
 * - the PROVIDER CATALOGUE row: the registry-declared Stripe card
 *   (highlighted — the one connectable provider, ADR-0007 D5) whose
 *   Connect action seeds the ONE shared typed-intent orchestration,
 *   plus the concept's other provider cards (PayPal, Adyen, blockchain
 *   wallet) as DECLARED-UX-SURFACE entries: their "Explore setup"
 *   actions open the embedded agent panel with a provider mention in
 *   the draft — the deterministic router then answers HONESTLY (only
 *   Stripe is declared; it never guesses a provider);
 * - the SECURE PROVIDER SETUP panel: the concept's structure verbatim —
 *   the expected-domain badge, the Stripe-hosted-onboarding toolbar,
 *   the illustrative authorized-session card ("Continue with Stripe" +
 *   the guide line + the authenticate-directly checklist row), the
 *   "Continue securely" action (seeds the shared composer — never a
 *   fake provider login) and the not-a-real-Stripe-page note;
 * - the SETUP DRAFT rail: the concept's vertical five-step timeline
 *   (step 1 active) + the "Security boundary" box (open auth ≠
 *   connected; only verified evidence can activate);
 * - the EMBEDDED PaySwap agent panel: the SAME shared controller the
 *   floating composer drives (the convergence law — the connections
 *   seeds land here, in place, exactly like the concept), with the
 *   guided integration-type question as the standing introduction;
 * - the pinned honest contracts below: the zero-connected empty state,
 *   the substrate model-provider projection and the connection
 *   lifecycle vocabulary reference.
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
import { AgentComposerEmbed } from "../../agent/AgentComposerEmbed.js";
import { Button, Card, StatusPill } from "@zcode/ui/payswap";
import {
  ConsoleEmptyStateView,
  ModelProvidersCard,
  ReferenceCard,
  SectionScaffold,
} from "./shared.js";

/** The area id the connections seeds record (the surface they came from). */
const CONNECTIONS_SEED_AREA = "connections";

/** The embedded panel's scroll target (the concept's in-page agent panel). */
const AGENT_PANEL_ANCHOR_ID = "ps-connections-agent-panel";

/**
 * The P13 concept's other provider surfaces — DECLARED UX surfaces only.
 * ADR-0007 D5 declares Stripe alone in the registry; these entries name
 * the concept's provider-card slots with its honest catalogue lines.
 * Their "Explore setup" action opens the embedded agent panel with a
 * provider mention in the draft — the deterministic router answers
 * honestly (it never guesses an undeclared provider).
 */
const DECLARED_SURFACE_PROVIDERS: readonly {
  readonly id: string;
  readonly label: string;
  readonly mark: string;
  readonly markKind: "paypal" | "adyen" | "blockchain";
  readonly line: string;
  readonly exploreDraft: string;
}[] = [
  {
    id: "paypal",
    label: "PayPal",
    mark: "P",
    markKind: "paypal",
    line: "Shown as catalogue entry until verified.",
    exploreDraft: "connect PayPal",
  },
  {
    id: "adyen",
    label: "Adyen",
    mark: "A",
    markKind: "adyen",
    line: "Provider-specific prerequisites shown.",
    exploreDraft: "connect Adyen",
  },
  {
    id: "blockchain",
    label: "Blockchain wallet",
    mark: "⬡",
    markKind: "blockchain",
    line: "Separate wallet and signing permissions.",
    exploreDraft: "connect a blockchain wallet",
  },
];

/** The P13 journey-1 step ladder (the concept's vertical timeline). */
const SETUP_DRAFT_STEPS: readonly { readonly title: string; readonly line: string }[] = [
  {
    title: "Choose integration",
    line: "Store payments or marketplace?",
  },
  {
    title: "Authenticate",
    line: "Use official provider flow",
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
    line: "Separate explicit decision",
  },
];

/** Bring the embedded agent panel into view (the seed lands there). */
function revealAgentPanel(): void {
  if (typeof document === "undefined") {
    return;
  }
  document
    .getElementById(AGENT_PANEL_ANCHOR_ID)
    ?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
}

/** The concept's check glyph (presentation-only, hidden from AT). */
function CheckGlyph(): React.ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 8.5l3.5 3.5L13 5" />
    </svg>
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
  // The registry-declared primary setup card (Stripe U1 own-store test
  // mode — the highlighted card; the qualifier forms stay reachable
  // through the agent's guided integration-type question).
  const primaryCard = agentProviderSetupCards()[0];
  const controller = sharedAgentComposerController();

  /** Seed the shared orchestration; the embedded panel is the surface. */
  const seedStripe = (): void => {
    if (primaryCard === undefined) {
      return;
    }
    void controller.seedFromSurface({
      intent: {
        kind: "CONNECTION_SETUP",
        providerId: primaryCard.providerId,
        form: primaryCard.form,
        useCaseRef: primaryCard.useCaseRef,
      },
      originNote: primaryCard.cardActionLabel,
      area: CONNECTIONS_SEED_AREA,
      openPanel: false,
    });
    revealAgentPanel();
  };

  /**
   * The concept's "Explore setup": a provider mention in the embedded
   * panel's draft — the deterministic router answers honestly when sent
   * (only Stripe is declared; it never guesses). No fabricated setup
   * flow, no invented provider.
   */
  const exploreProvider = (draft: string): void => {
    controller.setDraft(draft);
    revealAgentPanel();
    if (typeof document !== "undefined") {
      document.getElementById("ps-connections-agent-input")?.focus?.();
    }
  };

  return (
    <SectionScaffold
      section={section}
      headerAside={
        <span className="ps-connections-env-pill">
          <span className="ps-connections-env-dot" aria-hidden="true" />
          Test environment
        </span>
      }
    >
      <div className="ps-connections-scope">
        {/* The concept's section subtitle (the pinned §2 purpose stays in
            the scaffold header above; this is the concept's own line). */}
        <p className="ps-connections-lede">
          Connect payment providers and manage verified capabilities.
        </p>
        {/* The concept's provider catalogue row. */}
        <section
          aria-labelledby="ps-connections-catalogue-heading"
          className="ps-console-block"
        >
          <h2 id="ps-connections-catalogue-heading" className="ps-sr-only">
            Provider catalogue
          </h2>
          <div className="ps-connections-grid">
            {primaryCard !== undefined ? (
              <Card className="ps-console-card ps-connections-card ps-connections-card--primary">
                <div className="ps-connections-card-head">
                  <span className="ps-connections-mark ps-connections-mark--stripe" aria-hidden="true">
                    S
                  </span>
                  <div className="ps-connections-card-titles">
                    <h3 className="ps-connections-card-title">Stripe</h3>
                    <StatusPill tone="disabled">Not connected</StatusPill>
                  </div>
                </div>
                <p className="ps-connections-card-line">
                  Create or connect an account, then verify it.
                </p>
                <p className="ps-connections-card-meta">
                  {primaryCard.cardTitle.split(" — ")[1] ?? primaryCard.useCaseRef}
                </p>
                <div className="ps-connections-card-actions">
                  <Button type="button" variant="primary" onClick={seedStripe}>
                    Connect Stripe
                  </Button>
                </div>
              </Card>
            ) : null}
            {DECLARED_SURFACE_PROVIDERS.map((provider) => (
              <Card key={provider.id} className="ps-console-card ps-connections-card">
                <div className="ps-connections-card-head">
                  <span
                    className={`ps-connections-mark ps-connections-mark--${provider.markKind}`}
                    aria-hidden="true"
                  >
                    {provider.mark}
                  </span>
                  <div className="ps-connections-card-titles">
                    <h3 className="ps-connections-card-title">{provider.label}</h3>
                    <StatusPill tone="disabled">Not connected</StatusPill>
                  </div>
                </div>
                <p className="ps-connections-card-line">{provider.line}</p>
                <div className="ps-connections-card-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => exploreProvider(provider.exploreDraft)}
                  >
                    Explore setup
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          <p className="ps-connections-registry-note">
            The provider registry declares Stripe alone (ADR-0007 D5) — the other
            providers are shown as catalogue entries until they are declared and
            verified.
          </p>
        </section>

        <div className="ps-connections-lanes">
          {/* The concept's secure provider setup panel. */}
          <section
            aria-labelledby="ps-connections-secure-heading"
            className="ps-console-block ps-connections-secure"
          >
            <header className="ps-connections-secure-bar">
              <span className="ps-connections-dot" aria-hidden="true" />
              <h2 id="ps-connections-secure-heading" className="ps-connections-secure-title">
                Secure provider setup
              </h2>
              <span className="ps-connections-domain-pill">
                <svg
                  viewBox="0 0 16 16"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M8 11V7" />
                  <path d="M8 5h.01" />
                  <circle cx="8" cy="8" r="6.2" />
                </svg>
                Expected domain: stripe.com
              </span>
            </header>
            <div className="ps-connections-secure-body">
              <div className="ps-connections-secure-toolbar">
                <h3 className="ps-connections-secure-toolbar-title">
                  Stripe-hosted onboarding
                </h3>
                <span className="ps-connections-secure-toolbar-note">
                  Illustrative authorized session area
                </span>
              </div>
              <div className="ps-connections-session-card">
                <div className="ps-connections-session-head">
                  <span className="ps-connections-session-mark" aria-hidden="true">
                    S
                  </span>
                  <div className="ps-connections-session-titles">
                    <h3 className="ps-connections-session-title">Continue with Stripe</h3>
                    <p className="ps-connections-session-line">
                      PaySwap will guide you through the provider&rsquo;s official
                      onboarding steps.
                    </p>
                  </div>
                </div>
                <div className="ps-connections-checkrow">
                  <span className="ps-connections-checkglyph" aria-hidden="true">
                    <CheckGlyph />
                  </span>
                  <div className="ps-connections-checkrow-body">
                    <p className="ps-connections-checkrow-title">
                      You will authenticate directly with the provider
                    </p>
                    <p className="ps-connections-checkrow-line">
                      Credentials and one-time codes must never be entered into
                      agent chat.
                    </p>
                  </div>
                </div>
                <div className="ps-connections-secure-actions">
                  <Button type="button" variant="primary" onClick={seedStripe}>
                    Continue securely
                  </Button>
                  <p className="ps-connections-honesty-line">
                    Not a real Stripe page or a live auth session — this action
                    opens the shared PaySwap agent task (the same orchestration
                    as typing &ldquo;connect stripe&rdquo;).
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* The concept's setup-draft rail (the resumable task ladder). */}
          <aside
            aria-labelledby="ps-connections-draft-heading"
            className="ps-console-block ps-connections-draft"
          >
            <div className="ps-console-block-head">
              <h2 id="ps-connections-draft-heading" className="ps-connections-card-title">
                Connect Stripe
              </h2>
              <span className="ps-connections-draft-pill">
                <span className="ps-connections-env-dot" aria-hidden="true" />
                Setup draft
              </span>
            </div>
            <p className="ps-console-card-note">One task, safely resumable</p>
            <ol className="ps-connections-timeline">
              {SETUP_DRAFT_STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className={
                    index === 0
                      ? "ps-connections-timeline-step ps-connections-timeline-step--active"
                      : "ps-connections-timeline-step"
                  }
                >
                  <span className="ps-connections-timeline-index" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div className="ps-connections-step-body">
                    <p className="ps-connections-step-title">{step.title}</p>
                    <p className="ps-connections-step-line">{step.line}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="ps-connections-boundary">
              <p className="ps-connections-boundary-title">Security boundary</p>
              <p className="ps-connections-boundary-line">
                Open auth ≠ connected; only verified evidence can activate.
              </p>
            </div>
          </aside>
        </div>

        {/* The concept's embedded PaySwap agent panel — the SAME shared
            orchestration the floating composer drives (in place). */}
        <AgentComposerEmbed />

        {/* The concept's disclaimer line, honest: what this surface shows
            is catalogue + task records — never live provider state. */}
        <p className="ps-connections-disclaimer">
          Catalogue view · illustrative layout only — no live connection,
          credentials, balance or provider state is represented here.
        </p>
      </div>

      {/* The pinned honest contracts (below the concept layout). */}
      <ConsoleEmptyStateView
        spec={CONNECTIONS_EMPTY_STATE}
        navigation={navigation}
        backToProduct={backToProduct}
        title={`Zero connected capabilities — the honest state (${connectedCount} connected)`}
      />
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
