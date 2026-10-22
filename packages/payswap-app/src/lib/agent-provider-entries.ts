/**
 * @payswap/app — the AGENT PROVIDER SETUP ENTRIES (app-side, P13-A).
 *
 * The typed data the Connections area's agent-led setup cards and the
 * intent router's provider mentions project from — the app-side
 * projection of the Stripe integration types ADR-0007 D1 declares and
 * D5 names as the payment-PSP registry's first entries:
 *
 * - U1 own-store payment acceptance (SCOPED_API_CREDENTIAL, test mode —
 *   the P13-B vertical slice; needs NO operator platform registration);
 * - U2 existing-account grant (DELEGATED_OAUTH — declared with the
 *   EXACT missing operator configuration);
 * - U3 marketplace onboarding (CONNECTED_ACCOUNT — ditto).
 *
 * HONESTY LAWS (ADR-0007 D1/D5 + the UX reference):
 * - An entry is a DECLARATION, never a connection, never a fabricated
 *   provider: providerCount stays 0 until the connection plane (P13-B)
 *   records real provider evidence. The cards state the typed
 *   prerequisite verbatim and never render a connected/success state.
 * - The connection-plane runtime is NOT wired in this deployment; these
 *   entries seed typed setup TASKS (demand-side orchestration records
 *   only — ADR-0007 D7: the composer/router hold ZERO authority).
 * - No other provider is declared anywhere in this repository — the
 *   mention table therefore contains Stripe alone (never a guess).
 */

import type { AgentTaskConnectionFormPin } from "./agent-task-pins.js";

/** One provider setup entry (one connect card + one router mention set). */
export interface AgentProviderSetupEntry {
  /** Registry provider id (ADR-0007 D5: "stripe" is the first entry). */
  readonly providerId: string;
  /** People-language provider label. */
  readonly label: string;
  /** Lowercase single-word tokens that name this provider in free text. */
  readonly mentionTokens: readonly string[];
  /** The form a plain "connect <provider>" resolves to (the ADR default). */
  readonly form: AgentTaskConnectionFormPin;
  /** The registry-declared use case reference for the default form. */
  readonly useCaseRef: string;
  /** The connect-card title (Connections area). */
  readonly cardTitle: string;
  /** The connect-card honest line — the typed prerequisite, verbatim. */
  readonly cardLine: string;
  /** The connect-card control label (accessible name). */
  readonly cardActionLabel: string;
  /**
   * Ordered form qualifiers: phrases that select a DIFFERENT integration
   * type for the same provider (checked longest-first by the router).
   */
  readonly qualifiers: readonly {
    readonly phrases: readonly string[];
    readonly form: AgentTaskConnectionFormPin;
    readonly useCaseRef: string;
    readonly cardTitle: string;
    readonly cardLine: string;
    readonly cardActionLabel: string;
  }[];
}

/** The ADR-0007-declared first registry entries (Stripe U1/U2/U3). */
export const AGENT_PROVIDER_SETUP_ENTRIES: readonly AgentProviderSetupEntry[] = [
  {
    providerId: "stripe",
    label: "Stripe",
    mentionTokens: ["stripe"],
    form: "SCOPED_API_CREDENTIAL",
    useCaseRef: "own-store-test-mode",
    cardTitle: "Stripe — own-store payments (test mode)",
    cardLine:
      "Accept payments on your own store through your Stripe account, observed and managed by PaySwap: a restricted API key pair (test mode) entered through the host-side credential broker — never in chat — and verified by a read-only probe. No operator platform registration is needed for this flow.",
    cardActionLabel: "Connect Stripe — own-store (test mode)",
    qualifiers: [
      {
        phrases: [
          "stripe connect",
          "marketplace",
          "connected account",
          "onboard sellers",
          "seller onboarding",
        ],
        form: "CONNECTED_ACCOUNT",
        useCaseRef: "marketplace-onboarding",
        cardTitle: "Stripe — marketplace onboarding",
        cardLine:
          "Onboard sellers as Stripe connected accounts (Express/Custom) through Account Links hosted onboarding. This integration type is declared with its exact missing operator configuration: Stripe platform credentials plus a webhook endpoint. No onboarding flow exists until that configuration is supplied.",
        cardActionLabel: "Connect Stripe — marketplace onboarding",
      },
      {
        phrases: [
          "existing account",
          "existing",
          "oauth",
          "grant access",
          "delegate",
          "authorize my stripe",
        ],
        form: "DELEGATED_OAUTH",
        useCaseRef: "existing-account-grant",
        cardTitle: "Stripe — existing account grant",
        cardLine:
          "Delegate PaySwap scoped access to your existing Stripe account through Stripe OAuth. This integration type is declared with its exact missing operator configuration: a registered Stripe platform (client_id + secret). No OAuth flow exists until that configuration is supplied.",
        cardActionLabel: "Connect Stripe — existing account grant",
      },
    ],
  },
];

/** Resolve a provider entry by id (undefined for an undeclared provider). */
export function agentProviderEntry(
  providerId: string,
): AgentProviderSetupEntry | undefined {
  return AGENT_PROVIDER_SETUP_ENTRIES.find((entry) => entry.providerId === providerId);
}

/**
 * The router's mention fold: which declared provider (if any) a token
 * names. Deterministic, first-match over the pinned entry order; a token
 * that names no declared provider names NO provider — never a guess.
 */
export function agentProviderMention(token: string): AgentProviderSetupEntry | undefined {
  return AGENT_PROVIDER_SETUP_ENTRIES.find((entry) => entry.mentionTokens.includes(token));
}

/**
 * One connect card for the Connections area (the agent-led setup entry):
 * the default integration type plus each declared qualifier, flattened
 * in the ADR-0007 D1 order (U1 own-store test-mode first, then the
 * declared-with-missing-operator-configuration types).
 */
export interface AgentProviderSetupCard {
  readonly providerId: string;
  readonly providerLabel: string;
  readonly form: AgentTaskConnectionFormPin;
  readonly useCaseRef: string;
  readonly cardTitle: string;
  readonly cardLine: string;
  readonly cardActionLabel: string;
}

/**
 * Flatten the provider entries into the connect cards the Connections
 * area renders (and the composer seeds from). The DEFAULT form of each
 * provider renders first; qualifier forms follow in their declared
 * order. Every card is a DECLARATION with its typed prerequisite —
 * never a connection, never a fabricated success state.
 */
export function agentProviderSetupCards(): readonly AgentProviderSetupCard[] {
  const cards: AgentProviderSetupCard[] = [];
  for (const entry of AGENT_PROVIDER_SETUP_ENTRIES) {
    cards.push({
      providerId: entry.providerId,
      providerLabel: entry.label,
      form: entry.form,
      useCaseRef: entry.useCaseRef,
      cardTitle: entry.cardTitle,
      cardLine: entry.cardLine,
      cardActionLabel: entry.cardActionLabel,
    });
    for (const qualifier of entry.qualifiers) {
      cards.push({
        providerId: entry.providerId,
        providerLabel: entry.label,
        form: qualifier.form,
        useCaseRef: qualifier.useCaseRef,
        cardTitle: qualifier.cardTitle,
        cardLine: qualifier.cardLine,
        cardActionLabel: qualifier.cardActionLabel,
      });
    }
  }
  return cards;
}
