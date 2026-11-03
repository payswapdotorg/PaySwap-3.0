/**
 * PaySwap Desktop (P24-2, ADR-0017 D10) — the host ACTION SEAMS: the
 * narrow ports the prepared-action executor composes over. The desktop
 * host law (no @payswap/* imports) means the REAL provider-runtime
 * implementations are injected at the composition edge; P24-0's frozen
 * contracts (./prepared-action-contracts.ts) are the only shapes this
 * plane re-exports.
 *
 * TL WIRING AT P24-D (each port is a named seam):
 * - `StripeOperationCensusPort`   ← provider-runtime census.ts (the
 *   single join point; the adapter is a ~15-line structural mapper).
 * - `StripeOperationSchemaValidator` ← Worker 1's parameter-schema
 *   validator (oneOf/anyOf/allOf/$ref preserved; unknown fields
 *   rejected) — deterministic fakes until P24-1 lands.
 * - `StripeDispatchTransport`     ← Worker 1's v1/v2 protocol
 *   transports (form vs JSON; per-operation idempotency) —
 *   deterministic fakes until P24-1 lands.
 * - `StripeActionSeal`            ← the connection session authority's
 *   withSealedCredential (the broker's escape-scan law rides inside).
 * - `StripeActionAccountContextResolver` ← connections/
 *   stripe-account-context.ts (verified-evidence resolution).
 *
 * LAWS EMBEDDED IN THE PORT SHAPES:
 * - The census view carries ONLY the fields the host consumes; the
 *   host never re-derives effect classes or permission rules.
 * - The validator returns NORMALIZED parameters (the digest binds the
 *   normalized form — the model's raw text is never the binding).
 * - The transport response classification mirrors the kernel seam
 *   (delivered / ambiguity kinds) so INV-04 maps one-to-one.
 * - Nothing in any port shape carries credential material.
 */

import type {
  StripeActionAccountContext,
  StripeActionApprovalTier,
  StripeActionEffectClass,
  StripeActionParameter,
} from "./prepared-action-contracts.js";
import type { PinnedStripeSupportState } from "./stripe-pins.js";

/** One census operation as the host action plane consumes it. */
export interface StripeCensusOperationView {
  readonly operationId: string;
  readonly apiNamespace: "v1" | "v2";
  readonly method: "GET" | "POST" | "DELETE";
  readonly path: string;
  readonly pathParams: readonly string[];
  readonly effectClass: StripeActionEffectClass;
  readonly approvalTier: StripeActionApprovalTier;
  readonly supportState: PinnedStripeSupportState;
  /** The RAK permission rule string (Stripe permission naming). */
  readonly requiredPermissionRule: string;
  /**
   * The catalogue operationId that reads the effect back (retrieval),
   * when the census has reviewed one; null when unreviewed.
   */
  readonly readBackOperationId: string | null;
  /**
   * May the dispatch bind an Idempotency-Key header? (The P24-1
   * classification: v1 state-changing POSTs only — POST searches are
   * read-like, v2 has no header replay, GET/DELETE never take one.)
   */
  readonly idempotencyKeyAllowed: boolean;
  readonly summary: string;
  /** (P24-D) The operation's resource family (the overlay's join key — e.g. "customers"). */
  readonly resourceFamily: string;
  /** (P24-D) The reviewed resource-pack id (Packs A–K — the discovery surface). */
  readonly packId: string;
  /** (P24-D) Is the operation a paginated list (the bounded-walk law's input)? */
  readonly listPaginated: boolean;
}

/** The census port (the pinned-release metadata + per-operation lookup). */
export interface StripeOperationCensusPort {
  /** The pinned catalogue release identity (e.g. "stripe-openapi/v2596@2026-09-30.endive"). */
  readonly catalogueRelease: string;
  /** Resolve one operation (undefined = unknown operationId → DENY). */
  resolve(operationId: string): StripeCensusOperationView | undefined;
  /** May the operation dispatch today? (IMPLEMENTED-class support state only.) */
  dispatchAllowed(operationId: string): boolean;
  /** Enumerate every census operation (the exposed-set computation reads this). */
  enumerate(): readonly StripeCensusOperationView[];
}

/** The typed parameter-validation refusal (fail-closed; never a thrown string). */
export type StripeSchemaValidationRefusal =
  | { readonly kind: "UNKNOWN_OPERATION"; readonly operationId: string }
  | { readonly kind: "UNKNOWN_PARAMETER"; readonly name: string }
  | { readonly kind: "MISSING_REQUIRED_PARAMETER"; readonly name: string }
  | { readonly kind: "INVALID_VALUE"; readonly name: string; readonly detail: string }
  | { readonly kind: "PARAMETERS_TOO_LARGE"; readonly detail: string };

/** The parameter-schema validator port (Worker 1's implementation). */
export interface StripeOperationSchemaValidator {
  /**
   * Validate + NORMALIZE parameters for one operation against its
   * catalogue schema. The normalized output is the digest binding —
   * a later change to the raw input that normalizes identically is
   * NOT a context change; one that normalizes differently is.
   */
  validate(
    operationId: string,
    parameters: readonly StripeActionParameter[],
  ): Promise<
    | { readonly ok: true; readonly normalized: readonly StripeActionParameter[] }
    | { readonly ok: false; readonly refusal: StripeSchemaValidationRefusal }
  >;
}

/** One dispatch call through the transport seam (mirrors the kernel call). */
export interface StripeDispatchCall {
  readonly operationId: string;
  readonly apiNamespace: "v1" | "v2";
  readonly method: "GET" | "POST" | "DELETE";
  readonly path: string;
  /** Normalized parameters (path filled, query/body per namespace encoding). */
  readonly parameters: readonly StripeActionParameter[];
  /** The idempotency key (bound ONLY when the operation's class takes one). */
  readonly idempotencyKey?: string;
  /** Authorization material EXISTS ONLY INSIDE the seal consumer. */
  readonly authorization: string;
  /** The request API version (per-connection state — ADR-0017 D2). */
  readonly apiVersion: string;
  readonly correlationId: string;
}

/** The transport response (mirrors the kernel seam — INV-04 one-to-one). */
export interface StripeDispatchResponse {
  readonly delivered: boolean;
  readonly status?: number;
  readonly body?: unknown;
  readonly providerErrorCode?: string;
  readonly providerErrorMessage?: string;
  readonly providerRequestId?: string;
  readonly failure?: {
    readonly kind:
      | "REFUSED_BEFORE_DISPATCH"
      | "TIMEOUT_AFTER_DISPATCH"
      | "CONNECTION_LOST_AFTER_DISPATCH"
      | "MALFORMED_RESPONSE";
    readonly detail?: string;
  };
}

/** The dispatch transport port (Worker 1's v1/v2 transports). */
export interface StripeDispatchTransport {
  readonly transportId: string;
  send(call: StripeDispatchCall): Promise<StripeDispatchResponse>;
}

/** The credential seal port (the ADR-0008 dispatch law — material never escapes). */
export interface StripeActionSeal {
  withSealedCredential<T>(
    connectionId: string,
    consumer: (material: unknown) => T,
    context: string,
  ): Promise<Awaited<T>>;
}

/** The verified-evidence account-context resolver (NEVER model/user text). */
export interface StripeActionAccountContextResolver {
  resolve(
    connectionId: string,
  ): Promise<
    | { readonly ok: true; readonly accountContext: StripeActionAccountContext }
    | { readonly ok: false; readonly reason: string }
  >;
}

/**
 * The RAK operation-level permission port (connections/
 * stripe-rak-permissions.ts implements it). Two distinct halves:
 * - `operationEligibility` — host-side state (the DECLARED RAK scope
 *   map + withdrawal observations + census support state). A
 *   restricted key lacking the exact permission never dispatches; a
 *   withdrawn permission removes the operation.
 * - `deriveDispatchGrant` — the INSIDE-THE-SEAL re-derivation
 *   (ADR-0008 law): the key-shape facts + INV-25 mode binding over the
 *   actual material, never a cached grant.
 */
export interface StripeActionPermissionPort {
  operationEligibility(input: {
    readonly connectionId: string;
    readonly operationId: string;
  }): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }>;
  deriveDispatchGrant(input: {
    readonly apiKey: string;
    readonly connectionId: string;
    readonly environment: "SANDBOX" | "LIVE";
    readonly operationId: string;
    readonly requiredPermissionRule: string;
  }): { readonly ok: true; readonly keyClass: string } | { readonly ok: false; readonly reason: string };
  /**
   * The dispatch-evidence loop (handoff §13.2): a provider rejection
   * naming a permission records a withdrawal observation that removes
   * the operation from the exposed set until the scopes are refreshed.
   */
  recordDispatchObservation(input: {
    readonly connectionId: string;
    readonly operationId: string;
    readonly httpStatus: number;
    readonly providerErrorCode: string | null;
  }): Promise<void>;
}

/**
 * The per-connection API-version state port (connections/
 * stripe-api-version-state.ts implements it — ADR-0017 D2 migration
 * law): the request version the dispatch carries + the catalogue-use
 * recorder. The legacy 2025-08-27.basil pin is per-connection state,
 * never a silently swapped global.
 */
export interface StripeActionApiVersionPort {
  requestApiVersionOf(connectionId: string): Promise<string>;
  recordCatalogueSurfaceUse(connectionId: string, catalogueRelease: string): Promise<void>;
}

/**
 * The re-authentication port (P26-A, ADR-0018 — reauthentication.ts
 * implements it). The REAUTH approval tier is honest ONLY through this
 * seam: `begin` is the ONE material-carrying entry (the fresh credential
 * exists only inside the call — live-probe-verified against the SAME
 * account, INV-25 at two layers); `verify`/`consume` enforce the
 * digest-scoped, single-use, 10-minute proof law. The seam is OPTIONAL
 * at the executor: an uncomposed plane refuses REAUTH-tier authorization
 * with the typed reason (the honest-unbound posture) — it never
 * degrades the tier to an ordinary confirmation.
 */
export interface StripeReauthenticationPort {
  begin(input: {
    readonly connectionId: string;
    readonly principalId: string;
    readonly actionDigests: readonly string[];
    readonly freshCredential: string;
  }): Promise<{ readonly ok: true; readonly proofId: string } | { readonly ok: false; readonly reason: string }>;
  verify(input: {
    readonly connectionId: string;
    readonly principalId: string;
    readonly digest: string;
  }): Promise<{ readonly ok: true; readonly proofId: string } | { readonly ok: false; readonly reason: string }>;
  /** The durable single-use consumption (the executor calls it BEFORE dispatch). */
  consume(proofId: string): Promise<boolean>;
}

/** The executor's injectable dependencies (all seams; no ambient anything). */
export interface StripePreparedActionExecutorDeps {
  readonly census: StripeOperationCensusPort;
  readonly schemaValidator: StripeOperationSchemaValidator;
  readonly transport: StripeDispatchTransport;
  readonly seal: StripeActionSeal;
  readonly accountContext: StripeActionAccountContextResolver;
  readonly permissions: StripeActionPermissionPort;
  readonly apiVersion: StripeActionApiVersionPort;
  /** Epoch-ms clock (tests pin it; the edge binds Date.now). */
  readonly nowMs: () => number;
  /** ISO-8601 clock for record stamps (tests pin it). */
  readonly nowIso: () => string;
  /** Opaque-id factory (tests pin it; the edge binds crypto UUIDs). */
  readonly createId: () => string;
  /** Prepared-action lifetime (ms; default 30 minutes — the expiry law). */
  readonly preparedActionTtlMs?: number;
  /** Authorization lifetime (ms; default 10 minutes — never outlives the action). */
  readonly authorizationTtlMs?: number;
  /** (P26-A, ADR-0018) The re-authentication plane — REQUIRED for REAUTH-tier
   *  authorization; absent = every REAUTH-tier action refuses honestly. */
  readonly reauthentication?: StripeReauthenticationPort;
}
