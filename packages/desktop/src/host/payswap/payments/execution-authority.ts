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

/**
 * (P22-H, ADR-0016 D6) The corridor LEG payload on a dispatch command:
 * the leg's OWN facts (its index/kind/lane, its planned amount, its
 * destination and — for the onchain leg — its issuer-scoped asset and
 * deployment plan refs). ADDITIVE and OPTIONAL: the N=1 single-leg
 * command carries NO leg payload byte-identically; only the composite
 * dispatch orchestration attaches one, and the authorization artifact's
 * plan digest covers EVERY leg the plan authorizes.
 */
export interface PaymentDispatchLegPayload {
  /** The leg's index in the presented corridor plan ([0, planLegCount)). */
  readonly legIndex: number;
  /** The leg's kind (the pinned corridor skeleton member). */
  readonly legKind:
    | "FIAT_PSP_COLLECT"
    | "PSP_STABLECOIN_ISSUANCE"
    | "ONCHAIN_TRANSFER"
    | "OFF_RAMP_PAYOUT";
  /** The leg's lane (a provider or the corridor chain — the C-lane law). */
  readonly lane: { readonly kind: "PROVIDER" | "ONCHAIN_CHAIN"; readonly id: string };
  /** The leg's planned amount (its own currency + exact minor units). */
  readonly plannedAmount: { readonly currency: string; readonly minorUnits: string };
  /** The leg's destination (opaque — the lane owns meaning). */
  readonly destinationRef: string;
  /** The onchain leg's issuer-scoped asset ref (ONCHAIN legs only). */
  readonly assetRef?: string;
  /** The deployment leg's plan refs (sourceHash + bytecodeHash — D4's evidence inputs). */
  readonly deploy?: { readonly sourceHash: string; readonly bytecodeHash: string };
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
  /** (P22-H, ADR-0016 D6) Present iff this is one leg of an authorized corridor plan. */
  readonly leg?: PaymentDispatchLegPayload;
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
  // (P22-H, ADR-0016 D6) The optional corridor leg payload: when present,
  // its OWN facts are validated fail-closed (a malformed leg never
  // dispatches). The N=1 command without a leg skips this byte-identically.
  if (command.leg !== undefined) {
    const leg = command.leg;
    if (
      typeof leg.legIndex !== "number" ||
      !Number.isSafeInteger(leg.legIndex) ||
      leg.legIndex < 0 ||
      leg.legIndex > 3
    ) {
      throw new PaymentMissionError(
        "INVALID_TRANSITION",
        "a corridor leg payload requires a safe integer legIndex in [0, 3] (the pinned skeleton is four legs)",
      );
    }
    if (
      leg.legKind !== "FIAT_PSP_COLLECT" &&
      leg.legKind !== "PSP_STABLECOIN_ISSUANCE" &&
      leg.legKind !== "ONCHAIN_TRANSFER" &&
      leg.legKind !== "OFF_RAMP_PAYOUT"
    ) {
      throw new PaymentMissionError(
        "INVALID_TRANSITION",
        "a corridor leg payload legKind must be a pinned skeleton member",
      );
    }
    if (
      (leg.lane.kind !== "PROVIDER" && leg.lane.kind !== "ONCHAIN_CHAIN") ||
      typeof leg.lane.id !== "string" ||
      leg.lane.id.length === 0
    ) {
      throw new PaymentMissionError(
        "INVALID_TRANSITION",
        "a corridor leg payload requires a lane (PROVIDER or ONCHAIN_CHAIN with a non-empty id)",
      );
    }
    if (
      typeof leg.plannedAmount.currency !== "string" ||
      !/^[A-Za-z0-9]{3,12}$/.test(leg.plannedAmount.currency) ||
      typeof leg.plannedAmount.minorUnits !== "string" ||
      !/^\d+$/.test(leg.plannedAmount.minorUnits)
    ) {
      throw new PaymentMissionError(
        "INVALID_TRANSITION",
        "a corridor leg payload requires a planned amount (a 3-letter fiat ISO code or a 3-12 char onchain asset code, and exact decimal minor units)",
      );
    }
    if (typeof leg.destinationRef !== "string" || leg.destinationRef.length === 0) {
      throw new PaymentMissionError(
        "INVALID_TRANSITION",
        "a corridor leg payload requires a non-empty destinationRef",
      );
    }
    if (
      leg.assetRef !== undefined &&
      (typeof leg.assetRef !== "string" || leg.assetRef.length === 0)
    ) {
      throw new PaymentMissionError(
        "INVALID_TRANSITION",
        "a corridor leg payload assetRef must be a non-empty string when present",
      );
    }
    if (leg.deploy !== undefined) {
      if (
        typeof leg.deploy.sourceHash !== "string" ||
        leg.deploy.sourceHash.length === 0 ||
        typeof leg.deploy.bytecodeHash !== "string" ||
        leg.deploy.bytecodeHash.length === 0
      ) {
        throw new PaymentMissionError(
          "INVALID_TRANSITION",
          "a corridor deployment payload requires non-empty sourceHash and bytecodeHash (the D4 evidence inputs)",
        );
      }
    }
  }
}
