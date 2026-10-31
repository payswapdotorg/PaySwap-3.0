/**
 * @payswap/desktop — the Stripe prepared-action CONTRACTS (P24-0, ADR-0017 D8/D10).
 *
 * THE FROZEN SEAM (handoff §7.2 + §11 P24-0 "freeze shared contracts"):
 * Workers 1–3 code against these types. Changing them after dispatch
 * requires a TL decision; they are the two-phase action law:
 *
 *   Prepare → Validate → Preview → Human confirmation → Authorize
 *           → Execute → Verify/Reconcile
 *
 * LAWS EMBEDDED IN THE SHAPES (each is load-bearing):
 * - A prepared action is PaySwap-LOCAL data: it never contains a
 *   credential, a raw HTTP call, or a provider promise. It names the
 *   catalogue operationId — the only executable handle there is.
 * - The preview digest binds the EXACT normalized parameters; the
 *   authorization artifact binds the digest. Change one byte of the
 *   action → the artifact no longer matches → new preview required.
 * - The authorization artifact is host-MINTED, single-use, expiring, and
 *   bound to (task, user, connection, account context, environment,
 *   preparedActionId, digest). A model can reference it; it can never
 *   mint, edit, extend or supply a valid one (handoff §7.4).
 * - Execution re-resolves connection + permission state and re-derives
 *   the grant inside the sealed kernel before dispatch (ADR-0008 law).
 * - UNKNOWN is never collapsed into FAILED (INV-04); reconciliation is
 *   the only path back to a terminal state.
 */

/** The execution environments (INV-25: live is refused by the current deployment). */
export type StripeActionEnvironment = 'SANDBOX' | 'LIVE';

/** Effect/approval vocabulary — mirrors the provider-runtime overlay (single source: the overlay). */
export type StripeActionEffectClass =
  | 'READ_ONLY'
  | 'STRIPE_CONFIGURATION_WRITE'
  | 'CUSTOMER_COMMUNICATION'
  | 'FINANCIAL_CREATE'
  | 'FINANCIAL_IRREVERSIBLE_OR_REVERSAL'
  | 'PERMISSION_OR_CREDENTIAL_ADMIN';

export type StripeActionApprovalTier = 'NONE' | 'CONFIRM' | 'STRONG_CONFIRM' | 'REAUTH';

/** The Stripe connection context a prepared action is bound to (host-resolved, never model-supplied). */
export interface StripeActionAccountContext {
  /** The verified PaySwap connection id (host authority space). */
  readonly connectionId: string;
  /** The Stripe account id verified by the connection's probe evidence. */
  readonly stripeAccountId: string;
  /** own-account | delegated-oauth | connect-platform/connected | organization (ADR-0017 D5). */
  readonly accountModel:
    | 'OWN_ACCOUNT_RESTRICTED_KEY'
    | 'DELEGATED_OAUTH'
    | 'CONNECT_PLATFORM'
    | 'CONNECT_CONNECTED_ACCOUNT'
    | 'ORGANIZATION';
  readonly environment: StripeActionEnvironment;
}

/** One normalized parameter binding inside a prepared action. */
export interface StripeActionParameter {
  readonly name: string;
  /** The canonical normalized value (path params are strings; bodies are JSON values). */
  readonly value: unknown;
  /** Where the parameter lives on the wire. */
  readonly location: 'path' | 'query' | 'body';
}

/** THE PREPARED ACTION (immutable the moment it is created). */
export interface StripePreparedAction {
  /** Host-minted, unique, opaque (never derived from user/model text). */
  readonly preparedActionId: string;
  /** The catalogue operationId — the ONLY executable handle (no URLs, no raw HTTP). */
  readonly operationId: string;
  /** The pinned catalogue release the operationId resolves against. */
  readonly catalogueRelease: string;
  readonly accountContext: StripeActionAccountContext;
  /** Normalized, validated parameters (schema-validated against the catalogue entry). */
  readonly parameters: readonly StripeActionParameter[];
  /** SHA-256 hex of the canonical parameter + operation + account binding. */
  readonly digest: string;
  readonly effectClass: StripeActionEffectClass;
  readonly approvalTier: StripeActionApprovalTier;
  /** The exact user-visible confirmation inputs (handoff §4.3 overlay field). */
  readonly confirmationInputs: readonly string[];
  /** Idempotency key reference (the registrar's key id — raw key material never leaves the seal). */
  readonly idempotencyKeyRef: string;
  /** Read-back route: the catalogue operationId that verifies the effect. */
  readonly readBackOperationId: string | null;
  /** Expiry (ISO-8601); an expired prepared action is dead, never auto-executed. */
  readonly expiresAt: string;
  /** Creation provenance (audit lineage; never secrets). */
  readonly createdBy: 'model_proposal' | 'user_direct';
}

/** The single-use, expiring, action-bound authorization artifact (host-minted). */
export interface StripeActionAuthorization {
  /** Host-minted opaque id. */
  readonly authorizationId: string;
  /** Binds the EXACT prepared action. */
  readonly preparedActionId: string;
  /** Binds the EXACT digest the user approved. */
  readonly approvedDigest: string;
  /** Binds the approving principal (the authenticated human). */
  readonly approvedByPrincipalId: string;
  /** Binds the task/connection/account/environment at approval time. */
  readonly accountContext: StripeActionAccountContext;
  /** Single-use marker: consumed at dispatch; replay is refused. */
  readonly consumedAt: string | null;
  readonly expiresAt: string;
}

/** The dispatch outcome (the INV-04 law: UNKNOWN is a first-class state). */
export type StripeActionExecutionOutcome =
  | { readonly kind: 'CONFIRMED'; readonly providerRefs: readonly string[]; readonly readBackDue: boolean }
  | { readonly kind: 'UNKNOWN'; readonly reconciliationOperationId: string | null; readonly note: string }
  | { readonly kind: 'FAILED'; readonly reason: 'REFUSED_BEFORE_DISPATCH' | 'PERMISSION_MISSING' | 'VALIDATION' | 'POLICY'; readonly detail: string }
  | { readonly kind: 'PROVIDER_REJECTED'; readonly httpStatus: number; readonly providerErrorCode: string | null };

/** The audit record appended for every dispatch attempt (append-only; never secrets). */
export interface StripeActionAuditRecord {
  readonly preparedActionId: string;
  readonly authorizationId: string | null;
  readonly operationId: string;
  readonly accountContext: StripeActionAccountContext;
  readonly outcome: StripeActionExecutionOutcome;
  /** Provider request ids (safe metadata) for evidence lineage. */
  readonly providerRequestIds: readonly string[];
  readonly at: string;
}

/**
 * The host-side executor seam (implemented by the desktop composition;
 * consumed by the New Task conversation loop — Worker 3 codes against this).
 * The MODEL never receives this object; the conversation host calls it only
 * after the authorization gate.
 */
export interface StripePreparedActionExecutor {
  prepare(proposal: {
    readonly operationId: string;
    readonly parameters: readonly StripeActionParameter[];
    readonly connectionId: string;
    readonly taskId: string;
  }): Promise<
    | { readonly ok: true; readonly action: StripePreparedAction }
    | { readonly ok: false; readonly reason: string }
  >;
  authorize(input: {
    readonly preparedActionId: string;
    readonly principalId: string;
    readonly confirmedDigest: string;
  }): Promise<
    | { readonly ok: true; readonly authorization: StripeActionAuthorization }
    | { readonly ok: false; readonly reason: string }
  >;
  execute(authorizationId: string): Promise<StripeActionExecutionOutcome>;
  inspect(preparedActionId: string): Promise<StripePreparedAction | null>;
}
