/**
 * PaySwap Desktop (P13-C) — the execution-authority port (D7's only
 * consequential door OUT of the payment-mission runtime).
 *
 * ADR-0007 D7: the canonical dispatch path hands the authorization
 * artifact to "the execution plane (execution-graph kernel +
 * provider-runtime transport INSIDE the credential seal)". That plane is
 * NOT importable from the desktop host (the host layer law: no
 * @payswap/* imports), so it is a TYPED SEAM here — the real kernel is
 * composed behind it at TL integration (the established two-step
 * composition discipline; behavioral fidelity of the wire shapes is
 * mirror-tested against the real contracts).
 *
 * LAWS:
 * - The port is the ONLY way a mission produces an external effect. No
 *   composer, LLM, router or UI element ever sees it.
 * - The command carries the consumed-authorization lineage, the compiled
 *   intent, the idempotency/correlation references and the INV-25
 *   execution mode; the authority answers with the pinned result
 *   envelope (UNKNOWN ≠ FAILED — INV-04) or a typed refusal.
 * - The authority NEVER receives secret material from this runtime
 *   (there is none to send) and NEVER returns balances — provider
 *   references only.
 * - HONEST DEFAULT (this deployment): NO execution authority is wired.
 *   createUnwiredExecutionAuthority() fails closed with the typed
 *   reason — a mission can walk intake → gates → preview →
 *   authorization and stop honestly at the execution boundary; nothing
 *   simulates a dispatch.
 */

import {
  PaymentMissionError,
  type PaymentExecutionMode,
  type PaymentResultEnvelope,
} from "./contracts.js";
import type { CompiledPaymentIntent } from "./contracts.js";

/** The typed refusal vocabulary (the authority says "no" honestly). */
export type ExecutionAuthorityRefusalKind =
  | "NO_AUTHORITY_WIRED"
  | "CONNECTION_NOT_ACTIVE"
  | "MODE_NOT_OFFERED"
  | "AUTHORIZATION_INVALID"
  | "COMMAND_REJECTED";

/** One typed refusal (never a stringly error, never a silent noop). */
export interface ExecutionAuthorityRefusal {
  readonly kind: ExecutionAuthorityRefusalKind;
  readonly reason: string;
}

/** The dispatch command (the complete consequential payload). */
export interface PaymentDispatchCommand {
  readonly attemptId: string;
  readonly operation: "CREATE_EXTERNAL_EFFECT" | "CANCEL_OR_REVERSE_EFFECT";
  /** The compiled 11-field canonical intent (advisory demand record). */
  readonly intent: CompiledPaymentIntent;
  /** The single-use authorization artifact the dispatch consumed. */
  readonly authorizationArtifactId: string;
  /** Durable idempotency key (registrar-scoped; same command ⇒ same key). */
  readonly idempotencyKey: string;
  readonly commandId: string;
  readonly correlationId: string;
  /** The executing connected instance (opaque; the registry owns meaning). */
  readonly connectionRef: string;
  /** INV-25: the mode this dispatch runs under (SANDBOX or LIVE). */
  readonly executionMode: PaymentExecutionMode;
  /** Present for CANCEL_OR_REVERSE_EFFECT: the confirmed attempt being reversed. */
  readonly reversalOf?: {
    readonly attemptId: string;
    readonly providerReferences: readonly string[];
  };
}

/** The authority's answer: an envelope, or a typed refusal. */
export type ExecutionAuthorityAnswer =
  | { readonly kind: "ENVELOPE"; readonly envelope: PaymentResultEnvelope }
  | { readonly kind: "REFUSED"; readonly refusal: ExecutionAuthorityRefusal };

/**
 * The execution-authority port. Implementations wrap the real
 * execution-graph kernel + provider-runtime transport (TL integration);
 * tests wrap scripted fakes. Implementations MUST be idempotent under
 * the supplied key — the runtime enforces the registrar discipline
 * around every call and treats a post-dispatch crash as UNKNOWN.
 */
export interface ExecutionAuthorityPort {
  dispatch(command: PaymentDispatchCommand): Promise<ExecutionAuthorityAnswer>;
}

/** The pinned no-authority reason (this deployment's honest truth). */
export const NO_EXECUTION_AUTHORITY_REASON =
  "No execution authority is wired in this deployment — the payment-mission runtime stops honestly at the execution boundary. Dispatch requires the financial execution plane (execution-graph kernel + provider transport inside the credential seal) composed behind this port; nothing here simulates a dispatch, and a sandbox test never certifies a live corridor.";

/** The honest unwired default: every dispatch fails closed, typed. */
export function createUnwiredExecutionAuthority(): ExecutionAuthorityPort {
  return {
    async dispatch() {
      return {
        kind: "REFUSED",
        refusal: {
          kind: "NO_AUTHORITY_WIRED",
          reason: NO_EXECUTION_AUTHORITY_REASON,
        },
      };
    },
  };
}

/** Fail-closed structural validation of a dispatch command. */
export function validatePaymentDispatchCommand(
  command: PaymentDispatchCommand,
): void {
  if (typeof command.attemptId !== "string" || command.attemptId.length === 0) {
    throw new PaymentMissionError("INVALID_TRANSITION", "a dispatch command requires an attemptId");
  }
  if (
    command.operation !== "CREATE_EXTERNAL_EFFECT" &&
    command.operation !== "CANCEL_OR_REVERSE_EFFECT"
  ) {
    throw new PaymentMissionError(
      "INVALID_TRANSITION",
      "a dispatch command operation must be CREATE_EXTERNAL_EFFECT or CANCEL_OR_REVERSE_EFFECT",
    );
  }
  if (command.intent === null || typeof command.intent !== "object") {
    throw new PaymentMissionError(
      "INVALID_TRANSITION",
      "a dispatch command requires the compiled intent",
    );
  }
  for (const ref of [command.authorizationArtifactId, command.idempotencyKey, command.commandId, command.correlationId, command.connectionRef]) {
    if (typeof ref !== "string" || ref.length === 0) {
      throw new PaymentMissionError(
        "INVALID_TRANSITION",
        "a dispatch command requires non-empty authorization/idempotency/command/correlation/connection references",
      );
    }
  }
  if (command.executionMode !== "SANDBOX" && command.executionMode !== "LIVE") {
    throw new PaymentMissionError(
      "INVALID_TRANSITION",
      "a dispatch command executionMode must be SANDBOX or LIVE (INV-25 — no default, no third state)",
    );
  }
}
