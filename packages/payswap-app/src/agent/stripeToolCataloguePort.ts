/**
 * @payswap/app — the STRIPE TOOL CATALOGUE + ACCOUNT FACTS ports
 * (P24-3, ADR-0017 D9).
 *
 * The census-derived facts the task tool registry reads (progressive
 * discovery without flooding), pinned STRUCTURALLY against the
 * provider-runtime census reader's record
 * (packages/provider-runtime/src/adapters/stripe/catalogue/census.ts —
 * StripeOperationCensusRecord; READ-ONLY reference, never imported by
 * app src). The HOST supplies the real facts through these ports at
 * composition (P24-D); the app ships NO default catalogue — an unbound
 * port renders the honest unbound note, NEVER a fabricated catalog (the
 * web honesty tier; the taskModelPins no-default law).
 *
 * LAWS (D9 — binding):
 * - Tool names/schemas always DERIVE from the approved catalogue entry.
 * - Discovery NEVER elevates permission: the account facts carry the
 *   connection's VERIFIED granted permissions, and every registration /
 *   mid-task request checks them.
 * - Every fact carries its honest support state — the registry refuses
 *   to register tools whose state is not dispatchable, but discovery
 *   answers NAME the state and its prerequisite.
 * - No ambient state; fail-closed typed errors; facts are data, never
 *   instructions (prompt-injection treatment happens at the output
 *   boundary — ./stripeToolOutput.ts).
 */

import type {
  StripeActionApprovalTierPin,
  StripeActionEffectClassPin,
  StripeSupportStatePin,
} from "./stripePreparedActionPins.js";

/* -------------------------- typed errors ----------------------------- */

export type StripeToolCatalogueErrorCode =
  | "UNBOUND"
  | "PROBE_FAILED"
  | "INVALID_INPUT";

/** The typed, fail-closed catalogue-port error. */
export class StripeToolCatalogueError extends Error {
  readonly code: StripeToolCatalogueErrorCode;
  constructor(code: StripeToolCatalogueErrorCode, message: string) {
    super(message);
    this.name = "StripeToolCatalogueError";
    this.code = code;
  }
}

/* --------------------------- the census facts ------------------------ */

/**
 * One operation's census facts (STRUCTURAL PIN of the census reader's
 * StripeOperationCensusRecord — the fields the tool registry consumes;
 * the source record carries them all).
 */
export interface StripeOperationFactPin {
  readonly operationId: string;
  readonly apiNamespace: "v1" | "v2";
  readonly method: string;
  readonly path: string;
  readonly pathParams: readonly string[];
  readonly listPaginated: boolean;
  readonly summary: string;
  readonly resourceFamily: string;
  readonly packId: string;
  readonly effectClass: StripeActionEffectClassPin;
  readonly approvalTier: StripeActionApprovalTierPin;
  readonly supportState: StripeSupportStatePin;
  /** The RAK permission rule string (Stripe permission naming, e.g. "Products: Read"). */
  readonly requiredPermissionRule: string;
}

/** How a catalogue listing filters (all fields optional, ANDed). */
export interface StripeOperationFactFilter {
  /** Restrict to these resource families (e.g. ["products", "prices"]). */
  readonly families?: readonly string[];
  /** Restrict to these packs (e.g. ["D_PRODUCTS_PRICING_CATALOG"]). */
  readonly packIds?: readonly string[];
  /** Restrict to this effect class. */
  readonly effectClass?: StripeActionEffectClassPin;
  /** Restrict to these support states. */
  readonly supportStates?: readonly StripeSupportStatePin[];
}

/* -------------------------- the account facts ------------------------ */

/**
 * One connection's VERIFIED account/permission facts (host-resolved from
 * probe evidence; STRUCTURAL PIN of the frozen
 * StripeActionAccountContext + the connection's permission map).
 */
export interface StripeAccountFactsPin {
  /** The verified PaySwap connection id (host authority space). */
  readonly connectionId: string;
  /** The Stripe account id verified by the connection's probe evidence. */
  readonly stripeAccountId: string;
  readonly accountModel:
    | "OWN_ACCOUNT_RESTRICTED_KEY"
    | "DELEGATED_OAUTH"
    | "CONNECT_PLATFORM"
    | "CONNECT_CONNECTED_ACCOUNT"
    | "ORGANIZATION";
  readonly environment: "SANDBOX" | "LIVE";
  /** People-language label for multi-account clarity in the UI. */
  readonly displayName?: string;
  /**
   * The operation-level RAK permission rules the connection VERIFIES
   * (Stripe permission naming, e.g. "Products: Read"). The host
   * recomputes these on scope refresh/revocation.
   */
  readonly grantedPermissionRules: readonly string[];
}

/* ------------------------------- the ports --------------------------- */

/**
 * The catalogue port: the host supplies the census facts (the pinned
 * 644-operation inventory joined with the reviewed overlay). The app
 * NEVER generates or fabricates catalogue data.
 */
export interface StripeToolCataloguePort {
  /** HOST_BRIDGED | UNBOUND (the web tier's honest label). */
  readonly tier: "HOST_BRIDGED" | "UNBOUND";
  /** The pinned catalogue release identity (for evidence lineage). */
  readonly catalogueRelease: string;
  /** List operation facts under a filter (bounded by the host). */
  listOperationFacts(
    filter?: StripeOperationFactFilter,
  ): Promise<readonly StripeOperationFactPin[]>;
  /** Resolve one operation's facts by operationId (undefined = unknown → DENY). */
  operationFact(operationId: string): Promise<StripeOperationFactPin | undefined>;
}

/**
 * The account-facts port: the host supplies the verified
 * connection/account/environment facts. A task's conversation binds to
 * ONE of these (the account/environment selector); the model can never
 * forge or switch the binding — switching is an explicit
 * user-authorized scope change through the controller (the
 * taskAccountContext laws).
 */
export interface StripeAccountFactsPort {
  readonly tier: "HOST_BRIDGED" | "UNBOUND";
  /** The connections available to the task owner (multi-account clarity). */
  listAccountFacts(): Promise<readonly StripeAccountFactsPin[]>;
  /** One connection's facts (undefined = unknown connection id). */
  accountFacts(connectionId: string): Promise<StripeAccountFactsPin | undefined>;
}

/* --------------------------- the honest notes ------------------------ */

/** The web tier's truth: no Stripe host/credential authority is bound. */
export const STRIPE_TOOL_CATALOGUE_UNBOUND_NOTE =
  "No Stripe host is bound in this deployment — there is no verified connection, no account context and no capability catalogue here, so no Stripe tools can be offered honestly and none is fabricated. The platform host binds the Stripe connection authority at its composition root; until then this surface states the gap." as const;

/** The honest note when no account context is bound to the task yet. */
export const STRIPE_ACCOUNT_CONTEXT_UNBOUND_NOTE =
  "No Stripe account is bound to this task yet. Pick a connection to bind — the conversation, its tools and any prepared actions stay inside that one account and environment until you explicitly change it; a task never silently crosses account context." as const;
