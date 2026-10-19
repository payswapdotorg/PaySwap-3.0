/**
 * @payswap/merchant — THE WALLET-PAYMENT INJECTION PORT (P5-W3, lane
 * R3-W3; NET-NEW module replacing old
 * packages/merchant-checkout/src/payment.ts pipeline composition @
 * 8a735bf with the zero-sibling DELEGATION SEAM).
 *
 * MONEY MOVEMENT IS DELEGATED. The customer wallet executes OUTSIDE
 * this package at a trusted surface the HOST injects; this package
 * constructs a typed handoff request (carrying the PINNED
 * SettlementInstructionId typed reference as its only settlement
 * handle), performs the handoff through the port's ONE method, and
 * consumes a typed evidence-bearing receipt. THE HANDOFF-ONLY EXIT:
 * the port has exactly one method (`handoff`) — there is no execute,
 * settle, confirm, broadcast or sign member anywhere, so a local
 * parallel payment engine is structurally unrepresentable.
 *
 * THE NO-SUCCESS-INFERENCE LAW: a SUBMITTED handoff receipt is NOT a
 * success — the intent settles ONLY from the attempt's own state
 * (through the evidence-mandatory outcome observations). The mapping
 * from a receipt is typed: SUBMITTED → submission evidence only;
 * OUTCOME_UNKNOWN → the ambiguity observation (evidence-mandatory);
 * REFUSED → no submission happened at all.
 */

import { ValidationError } from "./errors.ts";
import { PortShapeError } from "./errors.ts";
import type { PinnedSettlementInstructionId, PinnedTimestampMs } from "./pins/protocol.ts";
import { pinnedAssetIdentityIsShaped, pinnedChainRefIsShaped } from "./pins/onchain.ts";
import type { PinnedAssetIdentity } from "./pins/onchain.ts";
import {
  PINNED_WALLET_PAYMENT_HANDOFF_STATES,
  PINNED_WALLET_PAYMENT_PORT_METHODS,
  pinnedWalletPaymentPortIsShaped,
} from "./pins/wallet-payment.ts";
import type {
  PinnedWalletPaymentExecutionPort,
  PinnedWalletPaymentHandoffReceipt,
  PinnedWalletPaymentHandoffRequest,
  PinnedWalletPaymentHandoffState,
} from "./pins/wallet-payment.ts";
import { asSettlementInstructionId } from "./identifiers.ts";
import { assertNoSecretMaterial } from "./secrets.ts";
import { requireNonEmptyString } from "./secrets.ts";

/** The port method vocabulary, re-exported for the boundary assertions. */
export const WALLET_PAYMENT_PORT_METHODS = PINNED_WALLET_PAYMENT_PORT_METHODS;

/** The handoff submission-state vocabulary, re-exported for tests. */
export const WALLET_PAYMENT_HANDOFF_STATES = PINNED_WALLET_PAYMENT_HANDOFF_STATES;

/**
 * Fail-closed port guard: the injected port must satisfy the pinned
 * port law — a `handoff` function and NO other own function-valued
 * member (no execute/settle/confirm/broadcast/sign — the handoff-only
 * exit). A violating port throws `PortShapeError` BEFORE any handoff
 * is attempted.
 */
export function assertWalletPaymentPort(
  port: PinnedWalletPaymentExecutionPort,
): PinnedWalletPaymentExecutionPort {
  if (port === null || typeof port !== "object") {
    throw new PortShapeError(
      "the wallet-payment execution port must be an injected object (money movement is delegated — never owned here)",
    );
  }
  if (!pinnedWalletPaymentPortIsShaped(port)) {
    throw new PortShapeError(
      "the injected wallet-payment port violates the handoff-only law: exactly one method ('handoff') is allowed — no execute/settle/confirm/broadcast/sign member may exist",
      {
        foundMethods: Object.keys(port).filter(
          (key) => typeof (port as unknown as Record<string, unknown>)[key] === "function",
        ),
      },
    );
  }
  return port;
}

/**
 * Build the typed handoff request for one checkout wallet payment.
 * Every field is validated fail-closed: the settlement-instruction
 * typed reference (the DELEGATION HANDLE — protocol-owned money
 * movement, referenced), the exact bigint transfer amount (positive;
 * never a float), the kernel-shaped chain reference and asset
 * identity, the digests of what the customer approved, and the expiry
 * bound. The request is secret-scanned: no credential material can
 * cross the seam.
 */
export function buildWalletPaymentHandoffRequest(input: {
  readonly handoffId: string;
  readonly attemptId: string;
  readonly optionId: string;
  readonly quoteId: string;
  readonly settlementInstructionId: string;
  readonly transfer: {
    readonly asset: PinnedAssetIdentity;
    readonly amount: bigint;
    readonly from: string;
    readonly to: string;
  };
  readonly chainRef: string;
  readonly paymentSummaryDigest: string;
  readonly writeDigest: string;
  readonly expiresAt: PinnedTimestampMs;
}): PinnedWalletPaymentHandoffRequest {
  const handoffId = requireNonEmptyString(input.handoffId, "handoffId");
  const attemptId = requireNonEmptyString(input.attemptId, "attemptId");
  const optionId = requireNonEmptyString(input.optionId, "optionId");
  const quoteId = requireNonEmptyString(input.quoteId, "quoteId");
  // THE DELEGATION HANDLE: the pinned SettlementInstructionId typed
  // reference (validated through the pinned protocol-lane law).
  const settlementInstructionId: PinnedSettlementInstructionId = asSettlementInstructionId(
    input.settlementInstructionId,
  );
  if (!pinnedChainRefIsShaped(input.chainRef)) {
    throw new ValidationError(
      "the handoff request chainRef must have the kernel chain shape `<network>:<segment>`",
      { chainRef: input.chainRef },
    );
  }
  const transfer = input.transfer;
  if (transfer === null || typeof transfer !== "object") {
    throw new ValidationError("the handoff request requires a transfer leg");
  }
  if (!pinnedAssetIdentityIsShaped(transfer.asset)) {
    throw new ValidationError(
      "the handoff transfer asset must satisfy the kernel asset-identity shape law",
    );
  }
  if (transfer.asset.chain !== input.chainRef) {
    throw new ValidationError(
      "the handoff transfer asset must live on the bound chain",
      { assetChain: transfer.asset.chain, chainRef: input.chainRef },
    );
  }
  if (typeof transfer.amount === "number") {
    throw new ValidationError(
      "the handoff transfer amount is a JS number; exact bigint minor units are required (INV-2)",
    );
  }
  if (typeof transfer.amount !== "bigint" || transfer.amount <= 0n) {
    throw new ValidationError(
      "the handoff transfer amount must be a positive bigint of minor units",
    );
  }
  const from = requireNonEmptyString(transfer.from, "transfer.from");
  const to = requireNonEmptyString(transfer.to, "transfer.to");
  const paymentSummaryDigest = requireNonEmptyString(
    input.paymentSummaryDigest,
    "paymentSummaryDigest",
  );
  const writeDigest = requireNonEmptyString(input.writeDigest, "writeDigest");
  if (typeof input.expiresAt !== "bigint") {
    throw new ValidationError("the handoff expiry must be a bigint TimestampMs");
  }
  const request: PinnedWalletPaymentHandoffRequest = Object.freeze({
    handoffId,
    attemptId,
    optionId,
    quoteId,
    settlementInstructionId,
    transfer: Object.freeze({
      asset: Object.freeze({ ...transfer.asset }),
      amount: transfer.amount,
      from,
      to,
    }),
    chainRef: input.chainRef,
    paymentSummaryDigest,
    writeDigest,
    expiresAt: input.expiresAt,
  });
  assertNoSecretMaterial(request, "wallet payment handoff request");
  return request;
}

/**
 * Validate a handoff receipt (fail-closed): the handoff id must match
 * the request, the state must be a declared member, evidence refs must
 * be non-empty (the handoff observation itself is evidence) and the
 * external submission reference non-empty.
 */
export function validateHandoffReceipt(
  receipt: PinnedWalletPaymentHandoffReceipt,
  request: PinnedWalletPaymentHandoffRequest,
): PinnedWalletPaymentHandoffReceipt {
  if (receipt === null || typeof receipt !== "object") {
    throw new ValidationError("the port must answer with a handoff receipt");
  }
  if (receipt.handoffId !== request.handoffId) {
    throw new ValidationError(
      "the handoff receipt must reference the request's handoffId (fail-closed correlation)",
      { requestHandoffId: request.handoffId, receiptHandoffId: receipt.handoffId },
    );
  }
  if (
    !(PINNED_WALLET_PAYMENT_HANDOFF_STATES as readonly string[]).includes(receipt.handoffState)
  ) {
    throw new ValidationError(
      "the handoff receipt state must be a declared member of the pinned handoff vocabulary",
      { handoffId: receipt.handoffId, handoffState: receipt.handoffState },
    );
  }
  if (
    !Array.isArray(receipt.evidenceRefs) ||
    receipt.evidenceRefs.length === 0 ||
    !receipt.evidenceRefs.every((ref) => typeof ref === "string" && ref.length > 0)
  ) {
    throw new ValidationError(
      "a handoff receipt must carry non-empty evidence refs (the handoff observation itself is evidence)",
      { handoffId: receipt.handoffId },
    );
  }
  const externalSubmissionRef = requireNonEmptyString(
    receipt.externalSubmissionRef,
    "receipt.externalSubmissionRef",
  );
  const validated: PinnedWalletPaymentHandoffReceipt = Object.freeze({
    ...receipt,
    handoffState: receipt.handoffState,
    externalSubmissionRef,
    evidenceRefs: Object.freeze([...receipt.evidenceRefs]),
  });
  assertNoSecretMaterial(validated, "wallet payment handoff receipt");
  return validated;
}

/**
 * Perform the wallet-payment handoff: assert the port law, hand the
 * fully-prepared request to the port's ONE method, validate and freeze
 * the evidence-bearing receipt. This package never executes, never
 * signs, never broadcasts — the trusted surface does, outside.
 */
export function performWalletPaymentHandoff(
  port: PinnedWalletPaymentExecutionPort,
  request: PinnedWalletPaymentHandoffRequest,
): PinnedWalletPaymentHandoffReceipt {
  assertWalletPaymentPort(port);
  const receipt = port.handoff(request);
  return validateHandoffReceipt(receipt, request);
}

/**
 * THE NO-SUCCESS-INFERENCE LAW (typed): map a handoff receipt onto the
 * lifecycle's observation inputs. A SUBMITTED receipt yields ONLY
 * submission evidence (never a definitive outcome — the attempt stays
 * SUBMITTED until a definitive observation arrives); an
 * OUTCOME_UNKNOWN receipt yields the ambiguity observation
 * (evidence-mandatory); a REFUSED receipt yields no submission at all
 * (the attempt can be abandoned — it never began).
 */
export type HandoffReceiptObservation =
  | {
      readonly kind: "SUBMISSION_EVIDENCE";
      readonly evidenceIds: readonly string[];
      readonly externalSubmissionRef: string;
    }
  | {
      readonly kind: "OUTCOME_UNKNOWN";
      readonly evidenceIds: readonly string[];
    }
  | {
      readonly kind: "REFUSED";
      readonly evidenceIds: readonly string[];
    };

export function handoffReceiptObservation(
  receipt: PinnedWalletPaymentHandoffReceipt,
): HandoffReceiptObservation {
  const state: PinnedWalletPaymentHandoffState = receipt.handoffState;
  switch (state) {
    case "SUBMITTED":
      return Object.freeze({
        kind: "SUBMISSION_EVIDENCE" as const,
        evidenceIds: Object.freeze([...receipt.evidenceRefs]),
        externalSubmissionRef: receipt.externalSubmissionRef,
      });
    case "OUTCOME_UNKNOWN":
      return Object.freeze({
        kind: "OUTCOME_UNKNOWN" as const,
        evidenceIds: Object.freeze([...receipt.evidenceRefs]),
      });
    case "REFUSED":
      return Object.freeze({
        kind: "REFUSED" as const,
        evidenceIds: Object.freeze([...receipt.evidenceRefs]),
      });
    default:
      throw new ValidationError(
        "the handoff receipt state is not a declared member of the pinned vocabulary",
        { handoffState: state },
      );
  }
}
