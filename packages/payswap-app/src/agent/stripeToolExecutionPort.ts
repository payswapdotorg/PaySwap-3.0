/**
 * @payswap/app — the STRIPE TOOL EXECUTION ports (P24-3, ADR-0017
 * D9/D10).
 *
 * The host-bridged execution seams behind the conversation loop's tool
 * calls, following the taskSessionPort.ts laws. ZERO FINANCIAL
 * AUTHORITY: the app records orchestration only — every provider read,
 * every action preparation, every authorization and every dispatch
 * happens HOST-SIDE behind these ports; the app layer never sees a
 * credential, never sets a header, never chooses a host or path.
 *
 * - StripeResourceReadPort — informational tools: the host-side
 *   provider read with the verified connection and permitted read
 *   scopes (handoff §3.3 step 4).
 * - StripePreparedActionPort — STRUCTURAL PIN of the frozen executor
 *   seam (packages/desktop/src/host/payswap/stripe/
 *   prepared-action-contracts.ts StripePreparedActionExecutor — the
 *   two-phase action law; implemented by P24-2's host lane, wired at
 *   P24-D). The MODEL never receives this object; the conversation
 *   wiring calls it only after the human confirmation gate.
 * - AgentToolRuntimePort — the unified seam the LOOP consumes (the
 *   app-side registry-mediated runtime implements it).
 */

import type { AgentModelToolCallPin } from "./modelConversationPort.js";
import type {
  StripeActionAuthorizationPin,
  StripeActionExecutionOutcomePin,
  StripeActionParameterPin,
  StripePreparedActionPin,
} from "./stripePreparedActionPins.js";

/* ------------------------ the read-execution port -------------------- */

/** The typed read-execution error classification (the transport's classes). */
export interface StripeReadExecutionError {
  readonly code:
    | "UNBOUND"
    | "UNKNOWN_OPERATION"
    | "PERMISSION_MISSING"
    | "VALIDATION"
    | "PROVIDER_FAILURE"
    | "TIMEOUT_UNKNOWN";
  readonly message: string;
  /** The transport's retry classification (bounded retries only). */
  readonly retryable: boolean;
}

/** One informational tool execution request (the task's bound context). */
export interface StripeResourceReadRequest {
  /** The REGISTERED catalogue operationId (never a URL, never raw HTTP). */
  readonly operationId: string;
  /** Schema-validated, normalized arguments (path/query/body-bound). */
  readonly arguments: Readonly<Record<string, unknown>>;
  /** The task's bound connection (host re-verifies against it). */
  readonly connectionId: string;
  readonly taskId: string;
  readonly callId: string;
}

/** The host-bridged read seam (informational tools only — read scopes). */
export interface StripeResourceReadPort {
  readonly tier: "HOST_BRIDGED" | "UNBOUND";
  executeRead(
    request: StripeResourceReadRequest,
  ): Promise<
    | { readonly ok: true; readonly output: unknown }
    | { readonly ok: false; readonly error: StripeReadExecutionError }
  >;
}

/* --------------------- the prepared-action executor ------------------ */

/**
 * STRUCTURAL PIN of the frozen StripePreparedActionExecutor (the P24-0
 * frozen seam; the shapes are pinned in ./stripePreparedActionPins.ts).
 * The host mints ids/digests/authorizations; the app side validates
 * structure fail-closed and renders the EXACT preview.
 */
export interface StripePreparedActionPort {
  readonly tier: "HOST_BRIDGED" | "UNBOUND";
  prepare(proposal: {
    readonly operationId: string;
    readonly parameters: readonly StripeActionParameterPin[];
    readonly connectionId: string;
    readonly taskId: string;
  }): Promise<
    | { readonly ok: true; readonly action: StripePreparedActionPin }
    | { readonly ok: false; readonly reason: string }
  >;
  authorize(input: {
    readonly preparedActionId: string;
    readonly principalId: string;
    readonly confirmedDigest: string;
  }): Promise<
    | { readonly ok: true; readonly authorization: StripeActionAuthorizationPin }
    | { readonly ok: false; readonly reason: string }
  >;
  execute(authorizationId: string): Promise<StripeActionExecutionOutcomePin>;
  inspect(preparedActionId: string): Promise<StripePreparedActionPin | null>;
}

/* ------------------- the unified loop-side tool runtime --------------- */

/** The execution context every tool call carries (the task's binding). */
export interface AgentToolCallContext {
  readonly taskId: string;
  /** The task's bound connection id — the ONLY account context there is. */
  readonly connectionId: string;
}

/** The bounded execution outcome the loop feeds back to the model. */
export interface AgentToolExecutionResult {
  readonly status: "OK" | "ERROR" | "UNKNOWN";
  /** Bounded, sanitized, prompt-injection-treated payload (JSON-safe). */
  readonly output?: unknown;
  /** The unframed bounded JSON (the task record's sanitized summary source). */
  readonly boundedJson?: string;
  readonly truncated?: boolean;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
  /**
   * Present when this call PAUSED the loop for a human confirmation
   * (the two-phase action law): the prepared action's EXACT preview.
   * Carries NO authorization — the host mints that only after the human
   * confirms, and the model can never supply one.
   */
  readonly pendingPreparedAction?: StripePreparedActionPin;
}

/** The tool call handed to the runtime (already name-resolved by the model). */
export interface AgentToolCallInput {
  readonly call: AgentModelToolCallPin;
  readonly context: AgentToolCallContext;
}

/**
 * The loop's ONE execution seam: resolve the tool against the current
 * registry snapshot, validate the arguments against the pinned schema
 * (fail-closed; unknown fields rejected), and execute through the
 * host-bridged ports. Implemented app-side by ./stripeToolRuntime.ts.
 */
export interface AgentToolRuntimePort {
  executeCall(input: AgentToolCallInput): Promise<AgentToolExecutionResult>;
}

/* --------------------------- the honest notes ------------------------ */

/** The web tier's truth for read tools (rendered VERBATIM, never a fake read). */
export const STRIPE_READ_EXECUTION_UNBOUND_NOTE =
  "Stripe reads are not wired in this deployment — no verified connection exists here to read through, so no read tool can run and none is simulated. The platform host binds the Stripe connection authority at its composition root." as const;

/** The web tier's truth for prepared actions (never a fake preparation). */
export const STRIPE_PREPARED_ACTION_UNBOUND_NOTE =
  "Stripe action preparation is not wired in this deployment — actions are prepared, authorized and executed host-side behind the credential boundary, and no host is bound here. None is simulated: the gap is stated instead." as const;
