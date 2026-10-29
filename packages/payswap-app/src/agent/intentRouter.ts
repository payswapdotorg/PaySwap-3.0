/**
 * @payswap/app — the TYPED INTENT ROUTER (P13-A, ADR-0007 D7).
 *
 * DETERMINISTIC PHRASE CLASSIFICATION — NOT an LLM, not a model call,
 * not a guess: a pure, total, test-pinned function mapping free text to
 * ONE typed intent from the shared agent-task contract:
 *
 * - ConnectionSetupIntent — a connection verb (connect/link/set up/…)
 *   together with a DECLARED provider mention (Stripe — the ADR-0007
 *   D1/D5 first registry entries; no other provider is declared
 *   anywhere in this repository, so no other provider is ever named).
 * - PaymentMissionIntent — exactly ONE of the four mission directions
 *   (pay/receive/move/convert) recognized from pinned verb stems and
 *   idioms.
 * - UNKNOWN — everything else, answered with the honest capability
 *   reply. Unresolvable text NEVER guesses a provider or a direction.
 *
 * AUTHORITY: ZERO (ADR-0007 D7). The router only classifies text into a
 * typed intent for task seeding; it cannot dispatch, authorize or
 * settle anything, and it never fabricates provider or financial state.
 *
 * Determinism: no ambient state, no clock, no network — same text in,
 * same intent out, forever.
 */

import type { MissionIntentDirection } from "../console/contracts.js";
import { agentProviderMention, type AgentProviderSetupEntry } from "../lib/agent-provider-entries.js";
import type {
  AgentTaskConnectionFormPin,
  ConnectionSetupIntentPin,
  PaymentMissionIntentPin,
} from "../lib/agent-task-pins.js";

/** The honest reply for unresolvable text (names what the router can do). */
export const AGENT_INTENT_UNKNOWN_REPLY =
  "I can route payment and connection requests; for everything else I have no route yet. For a payment, name one direction — pay, receive, move or convert (for example: \"pay the supplier\"). For a connection, name a declared provider with a setup verb (for example: \"connect Stripe\" — the declared providers are Stripe, Paystack and the Stellar testnet rail). I never guess a provider or a direction." as const;

/** The routing result: one typed intent, or the honest UNKNOWN. */
export type RoutedAgentIntent =
  | (ConnectionSetupIntentPin & { readonly providerLabel: string })
  | PaymentMissionIntentPin
  | { readonly kind: "UNKNOWN"; readonly reply: string };

/* ------------------------- the phrase tables ------------------------ */

/** Connection verbs (word-boundary stems; "set up" is a bigram phrase). */
const CONNECTION_VERBS: ReadonlySet<string> = new Set([
  "connect",
  "connects",
  "connecting",
  "link",
  "links",
  "linking",
  "setup",
  "onboard",
  "onboarding",
  "authenticate",
  "authenticating",
  "authorize",
  "authorizing",
  "grant",
  "granting",
]);

/** Payment-direction stems (word-boundary; NO bare nouns like "payment"). */
const DIRECTION_STEMS: Readonly<Record<MissionIntentDirection, readonly string[]>> = {
  PAY: ["pay", "pays", "paying"],
  RECEIVE: ["receive", "receives", "receiving", "collect", "collects", "collecting"],
  MOVE: ["move", "moves", "moving", "transfer", "transfers", "transferring"],
  CONVERT: [
    "convert",
    "converts",
    "converting",
    "conversion",
    "exchange",
    "exchanges",
    "exchanging",
    "swap",
    "swaps",
    "swapping",
  ],
};

/** Direction idioms (adjacent token phrases, checked before stems). */
const DIRECTION_PHRASES: readonly {
  readonly phrase: readonly string[];
  readonly direction: MissionIntentDirection;
}[] = [
  { phrase: ["make", "a", "payment"], direction: "PAY" },
  { phrase: ["send", "money"], direction: "PAY" },
  { phrase: ["send", "funds"], direction: "PAY" },
  { phrase: ["money", "out"], direction: "PAY" },
  { phrase: ["get", "paid"], direction: "RECEIVE" },
  { phrase: ["request", "money"], direction: "RECEIVE" },
  { phrase: ["request", "a", "payment"], direction: "RECEIVE" },
  { phrase: ["money", "in"], direction: "RECEIVE" },
  { phrase: ["move", "funds"], direction: "MOVE" },
  { phrase: ["move", "money"], direction: "MOVE" },
];

/* --------------------------- the helpers ---------------------------- */

/** Tokenize: lowercase, split on non-alphanumerics, drop empties. */
function tokenize(text: string): readonly string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/** Does the token stream contain the adjacent phrase? */
function hasPhrase(tokens: readonly string[], phrase: readonly string[]): boolean {
  if (phrase.length === 0 || tokens.length < phrase.length) {
    return false;
  }
  for (let start = 0; start + phrase.length <= tokens.length; start += 1) {
    let matches = true;
    for (let offset = 0; offset < phrase.length; offset += 1) {
      if (tokens[start + offset] !== phrase[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return true;
    }
  }
  return false;
}

/** The set of directions a token stream names (stems + idioms). */
function matchedDirections(tokens: readonly string[]): Set<MissionIntentDirection> {
  const directions = new Set<MissionIntentDirection>();
  for (const [direction, stems] of Object.entries(DIRECTION_STEMS) as readonly [
    MissionIntentDirection,
    readonly string[],
  ][]) {
    if (tokens.some((token) => stems.includes(token))) {
      directions.add(direction);
    }
  }
  for (const idiom of DIRECTION_PHRASES) {
    if (hasPhrase(tokens, idiom.phrase)) {
      directions.add(idiom.direction);
    }
  }
  return directions;
}

/**
 * Resolve the connection form for a provider from qualifier phrases
 * (longest phrase first — the deterministic tie-break). The DEFAULT is
 * the entry's declared default form (Stripe: SCOPED_API_CREDENTIAL,
 * the ADR-0007 D1 first vertical slice).
 */
function resolveConnectionForm(
  entry: AgentProviderSetupEntry,
  tokens: readonly string[],
): { readonly form: AgentTaskConnectionFormPin; readonly useCaseRef: string } {
  let best:
    | {
        readonly phrases: readonly string[];
        readonly form: AgentTaskConnectionFormPin;
        readonly useCaseRef: string;
      }
    | undefined;
  for (const qualifier of entry.qualifiers) {
    if (qualifier.phrases.some((phrase) => hasPhrase(tokens, phrase.split(" ")))) {
      if (best === undefined || qualifier.phrases.length > best.phrases.length) {
        best = qualifier;
      }
    }
  }
  return best === undefined
    ? { form: entry.form, useCaseRef: entry.useCaseRef }
    : { form: best.form, useCaseRef: best.useCaseRef };
}

/* ---------------------------- the router ---------------------------- */

/**
 * Route free text to ONE typed intent (pure; total; deterministic).
 *
 * Classification law (pinned by test/payswap/agent-intent-router.test.ts):
 * 1. A connection verb + a declared provider mention → ConnectionSetupIntent
 *    (direction words in the same text are setup PURPOSE, not a second
 *    intent: "connect Stripe to receive payments" routes to the setup).
 * 2. Else exactly ONE matched direction → PaymentMissionIntent (the
 *    original text is the goal statement seed).
 * 3. Else UNKNOWN — zero directions, two or more directions, a provider
 *    mention without a setup verb, or a setup verb without a declared
 *    provider. The honest reply names what the router can do; it NEVER
 *    guesses a provider or a direction.
 */
export function routeAgentText(text: string): RoutedAgentIntent {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { kind: "UNKNOWN", reply: AGENT_INTENT_UNKNOWN_REPLY };
  }
  const tokens = tokenize(trimmed);

  // 1. Connection intent: a setup verb together with a declared provider.
  const hasConnectionVerb =
    tokens.some((token) => CONNECTION_VERBS.has(token)) || hasPhrase(tokens, ["set", "up"]);
  if (hasConnectionVerb) {
    for (const token of tokens) {
      const entry = agentProviderMention(token);
      if (entry !== undefined) {
        const { form, useCaseRef } = resolveConnectionForm(entry, tokens);
        return {
          kind: "CONNECTION_SETUP",
          providerId: entry.providerId,
          providerLabel: entry.label,
          form,
          useCaseRef,
        };
      }
    }
  }

  // 2. Payment intent: exactly one direction class.
  const directions = matchedDirections(tokens);
  if (directions.size === 1) {
    const direction = [...directions][0] as MissionIntentDirection;
    return {
      kind: "PAYMENT_MISSION",
      direction,
      goalStatement: trimmed.slice(0, 2000),
    };
  }

  // 3. Everything else: the honest UNKNOWN.
  return { kind: "UNKNOWN", reply: AGENT_INTENT_UNKNOWN_REPLY };
}
