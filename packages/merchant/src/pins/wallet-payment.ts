/**
 * @payswap/merchant — the PINNED WIRE SHAPES of the wallet-payment
 * INJECTION PORT (P5-W3, lane R3-W3; commit 1/4 — the type-level pins).
 *
 * LAYER LAW: zero sibling imports (the v1 leaf-in-flight law). This
 * module pins THE DELEGATION SEAM of the merchant wallet-payment path:
 * money movement is DELEGATED, never owned. The customer wallet
 * executes OUTSIDE this package at a trusted surface the HOST injects;
 * this package constructs a typed handoff request and consumes a typed
 * handoff receipt. THE PORT HAS EXACTLY ONE METHOD — `handoff` — and
 * therefore a HANDOFF-ONLY EXIT: there is no execute, settle, confirm,
 * broadcast or sign member anywhere on the port type, so a local
 * parallel payment engine is structurally unrepresentable.
 *
 * DELEGATION LAW (pinned as literal types):
 * - the handoff request carries the PINNED SettlementInstructionId
 *   TYPED REFERENCE as its only settlement handle — the protocol lane
 *   owns instruction semantics, the merchant lane only references them;
 * - the handoff receipt's `reportedOutcome` is EVIDENCE, NEVER
 *   AUTHORITY: the intent settles ONLY from the attempt's own state
 *   (INV-24 — never infer success from submission);
 * - secrets never cross this seam (the request/receipt shapes carry
 *   opaque references only; the INV-19 scan in src/secrets.ts guards
 *   every constructed record).
 */

import type { PinnedSettlementInstructionId } from "./protocol.ts";
import type { PinnedAssetIdentity } from "./onchain.ts";
import type { PinnedExternalOutcome } from "./protocol.ts";

// ---------------------------------------------------------------------------
// The port vocabulary (HANDOFF-ONLY exit)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — the port's complete method vocabulary: `handoff` and
 * NOTHING else. THE HANDOFF-ONLY EXIT LAW: the injection port cannot
 * execute, settle, confirm, broadcast or sign — it can only accept a
 * fully-prepared handoff request and answer with a handoff receipt.
 * A parallel engine on this seam is unrepresentable by construction.
 */
export const PINNED_WALLET_PAYMENT_PORT_METHODS = Object.freeze(["handoff"] as const);

/**
 * VALUE PIN — the handoff submission states a receipt may report
 * (byte-pinned vocabulary): `SUBMITTED` (the trusted surface accepted
 * and passed the payment onward), `REFUSED` (the trusted surface
 * refused BEFORE any external effect — no submission happened) and
 * `OUTCOME_UNKNOWN` (an ambiguous submission — the ambiguity is
 * preserved first-class, INV-04). A receipt NEVER reports success as a
 * settlement fact: `reportedOutcome` is the external-outcome evidence
 * dimension, and the intent settles ONLY from the attempt's own state.
 */
export const PINNED_WALLET_PAYMENT_HANDOFF_STATES = Object.freeze([
  "SUBMITTED",
  "REFUSED",
  "OUTCOME_UNKNOWN",
] as const);

/** STRUCTURAL PIN — one handoff submission state. */
export type PinnedWalletPaymentHandoffState = (typeof PINNED_WALLET_PAYMENT_HANDOFF_STATES)[number];

// ---------------------------------------------------------------------------
// The handoff request (the ONLY outbound seam shape)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — the typed handoff request handed to the injected
 * trusted surface. Every field is an opaque reference or exact typed
 * data; no secret material can appear (INV-19). The
 * `settlementInstructionId` is the DELEGATION HANDLE: the pinned
 * SettlementInstructionId typed reference — protocol-owned money
 * movement, referenced — never a local settlement engine.
 */
export interface PinnedWalletPaymentHandoffRequest {
  /** Correlation id of the handoff itself (host-minted, unique). */
  readonly handoffId: string;
  /** The merchant payment attempt this handoff executes for. */
  readonly attemptId: string;
  /** The checkout option (asset×chain binding) being paid. */
  readonly optionId: string;
  /** The exact quote the payment was authorized under. */
  readonly quoteId: string;
  /**
   * THE DELEGATION HANDLE: the protocol-owned settlement instruction
   * this payment's settlement leg executes under — referenced by its
   * branded id, never owned here.
   */
  readonly settlementInstructionId: PinnedSettlementInstructionId;
  /** The exact onchain transfer leg (asset identity + exact amount + parties). */
  readonly transfer: {
    readonly asset: PinnedAssetIdentity;
    /** Exact integer minor units (bigint — never a float). */
    readonly amount: bigint;
    /** The customer's wallet address (opaque to this package). */
    readonly from: string;
    /** The merchant's destination address (opaque to this package). */
    readonly to: string;
  };
  /** The bound chain reference (`<network>:<segment>`, kernel shape). */
  readonly chainRef: string;
  /** The digest of the payment summary the customer saw and approved. */
  readonly paymentSummaryDigest: string;
  /** The digest of the authorized write the customer approved. */
  readonly writeDigest: string;
  /** Expiry of the authorization (bigint ms; the payment is void after it). */
  readonly expiresAt: bigint;
}

// ---------------------------------------------------------------------------
// The handoff receipt (the ONLY inbound seam shape)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — the typed handoff receipt returned by the injected
 * trusted surface. `reportedOutcome` is EVIDENCE ONLY (the
 * external-outcome dimension): the merchant intent settles ONLY from
 * the attempt's own state — NEVER from this receipt (INV-24).
 */
export interface PinnedWalletPaymentHandoffReceipt {
  /** Matches the request's handoffId (fail-closed by the caller). */
  readonly handoffId: string;
  /** The handoff submission state (SUBMITTED / REFUSED / OUTCOME_UNKNOWN). */
  readonly handoffState: PinnedWalletPaymentHandoffState;
  /**
   * The external-outcome EVIDENCE the surface observed (never the
   * settlement authority). Present iff handoffState is OUTCOME_UNKNOWN
   * (the ambiguity dimension) or SUBMITTED with an observed outcome.
   */
  readonly reportedOutcome?: PinnedExternalOutcome;
  /** Opaque external submission reference (tx id / surface reference). */
  readonly externalSubmissionRef: string;
  /** Evidence references backing the reported state (non-empty). */
  readonly evidenceRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// The injection port (one method — the HANDOFF-ONLY exit)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — THE WALLET-PAYMENT INJECTION PORT. The HOST injects
 * the implementation (a trusted-surface wallet layer); this package
 * never implements, never signs, never broadcasts. The port has
 * EXACTLY ONE method — `handoff` (PINNED_WALLET_PAYMENT_PORT_METHODS):
 * fully-prepared request in, evidence-bearing receipt out. There is no
 * execute/settle/confirm/broadcast/sign member on this type — a
 * parallel money-movement engine over this seam is unrepresentable.
 */
export interface PinnedWalletPaymentExecutionPort {
  /**
   * THE ONLY METHOD (the handoff-only exit). Receives the typed
   * handoff request (carrying the pinned SettlementInstructionId
   * delegation handle) and answers with the typed handoff receipt
   * (evidence, never authority).
   */
  handoff(request: PinnedWalletPaymentHandoffRequest): PinnedWalletPaymentHandoffReceipt;
}

/**
 * The pinned port law (pure predicate): a candidate port object
 * exposes EXACTLY the handoff vocabulary — a `handoff` function and NO
 * other own function-valued member (no execute/settle/confirm/
 * broadcast/sign). The fail-closed port guard lives in
 * src/wallet-payment.ts.
 */
export function pinnedWalletPaymentPortIsShaped(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate["handoff"] !== "function") {
    return false;
  }
  for (const key of Object.keys(candidate)) {
    if (key !== "handoff" && typeof candidate[key] === "function") {
      return false;
    }
  }
  return true;
}
