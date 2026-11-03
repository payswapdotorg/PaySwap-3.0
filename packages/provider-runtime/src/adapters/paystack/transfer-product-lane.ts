/**
 * @payswap/provider-runtime — the Paystack TRANSFER PRODUCT LANE (P27-C,
 * ADR-0020 D2/D3/D4): the INV-30 typed purpose gate, the typed payout
 * lifecycle states and the initiate → OTP/finalize → verify driver that
 * rides the P22-H execution surface (transfer-execution.ts) WITHOUT
 * rewriting it (the ADR-0016 D13 extend-per-leg law: the P22-H
 * initiate/finalize/verify functions and their tests stay green
 * unmodified).
 *
 * LAWS:
 * - INV-30 (the non-laundering invariant, made mechanical at the Paystack
 *   product seam): the typed transaction-purpose class is a REQUIRED
 *   input on every consequential path; `REGULATED_REMITTANCE_P2P` always
 *   refuses (a business payout lane is not a personal wallet — the
 *   capability matrix §5 ✗ row) and so does `UNCLASSIFIED`
 *   (ADR-0020 D3: the class is derived from the intent's real facts
 *   upstream, never chosen by the model, never chosen here). The gate
 *   reads ONLY the typed class: no reason string, label, metadata value
 *   or relabeling changes the classification — decomposition,
 *   distribution and hop-chaining are all transparent to it.
 * - HONEST TYPED FINALITY: only the provider's own `success` status word
 *   is CONFIRMED_FINAL; a CONFIRMED transport answer with any other
 *   status stays INITIATED_PENDING_FINALIZE with the raw status carried
 *   verbatim (the OTP/finalize step is what completes it); an UNKNOWN
 *   stays UNKNOWN (INV-04 — reconcile, never guess); a FAILED stays
 *   FAILED with the provider's failure metadata.
 */

import { ValidationError } from '../../errors.ts';
import type { AmbiguityReason } from '../../result-envelope.ts';
import type {
  PaystackTransferExecutionDeps,
  PaystackTransferExecutionResult,
  PaystackTransferInitiateInput,
} from './transfer-execution.ts';
import { createPaystackTransferExecution } from './transfer-execution.ts';

// ---------------------------------------------------------------------------
// THE INV-30 PURPOSE GATE (ADR-0020 D2 — the non-laundering law, applied
// to the Paystack product surfaces). The typed vocabulary mirrors the
// capability matrix §5 purpose/transaction classes; the ELIGIBLE sets are
// the matrix's ✓ rows per surface; every other class is REFUSED.
// ---------------------------------------------------------------------------

/**
 * The typed transaction-purpose classes (the capability matrix §5 rows;
 * the class is derived from the intent's real facts upstream per
 * ADR-0020 D3 — never chosen by the model, never chosen here).
 */
export const PAYSTACK_TRANSACTION_PURPOSE_CLASSES = [
  'GENUINE_COMMERCE',
  'MARKETPLACE_SELLER_SETTLEMENT',
  'CONTRACTOR_OR_SUPPLIER_PAYMENT',
  'REIMBURSEMENT_OR_REFUND',
  'REGULATED_REMITTANCE_P2P',
  'UNCLASSIFIED',
] as const;
export type PaystackTransactionPurposeClass =
  (typeof PAYSTACK_TRANSACTION_PURPOSE_CLASSES)[number];

export function isPaystackTransactionPurposeClass(
  value: unknown,
): value is PaystackTransactionPurposeClass {
  return (
    typeof value === 'string' &&
    (PAYSTACK_TRANSACTION_PURPOSE_CLASSES as readonly unknown[]).includes(value)
  );
}

/**
 * The Paystack transfer surface's eligible purpose classes (the matrix
 * §5 ✓ rows: the business-payout product — marketplace seller
 * settlement, the business's own contractor/supplier payments,
 * reimbursements/refunds where supported). REGULATED_REMITTANCE_P2P is
 * NOT here: a business payout lane is not a personal wallet.
 */
export const PAYSTACK_TRANSFER_ELIGIBLE_PURPOSE_CLASSES: readonly PaystackTransactionPurposeClass[] =
  Object.freeze([
    'MARKETPLACE_SELLER_SETTLEMENT',
    'CONTRACTOR_OR_SUPPLIER_PAYMENT',
    'REIMBURSEMENT_OR_REFUND',
  ]);

/**
 * The Paystack collection surface's eligible purpose class (the matrix
 * §5: genuine commerce — goods/services with invoice/order evidence).
 */
export const PAYSTACK_COLLECTION_ELIGIBLE_PURPOSE_CLASSES: readonly PaystackTransactionPurposeClass[] =
  Object.freeze(['GENUINE_COMMERCE']);

/** The Paystack product surfaces the gate knows. */
export const PAYSTACK_PURPOSE_GATED_SURFACES = ['TRANSFER', 'COLLECTION'] as const;
export type PaystackPurposeGatedSurface = (typeof PAYSTACK_PURPOSE_GATED_SURFACES)[number];

/**
 * THE INV-30 GATE: refuse a typed purpose class that the surface's
 * product does not carry. Fail-closed on three laws at once:
 * - `REGULATED_REMITTANCE_P2P` ALWAYS refuses (a relabel is not a
 *   licence — the gate reads ONLY the typed class, so a commerce-shaped
 *   reason string, a goods-shaped label or any metadata value on a
 *   remittance-class transaction changes NOTHING);
 * - `UNCLASSIFIED` always refuses (ADR-0020 D3: the class is derived
 *   from real facts upstream; this surface never accepts an intent that
 *   carries no classification — the model may ask for the missing
 *   facts, it may not pick a class);
 * - any class not in the surface's eligible set refuses (commerce is a
 *   COLLECTION class, not a transfer class — the matrix's ✗/— rows are
 *   honest refusals, never silently bucketed).
 */
export function refuseIneligiblePaystackPurpose(
  surface: PaystackPurposeGatedSurface,
  purposeClass: unknown,
): void {
  if (!isPaystackTransactionPurposeClass(purposeClass)) {
    throw new ValidationError(
      'a Paystack product-surface operation requires a typed transaction-purpose class from the canonical vocabulary (the classification is derived from the intent\u2019s real facts upstream — never guessed here)',
      { surface, purposeClass },
    );
  }
  if (purposeClass === 'REGULATED_REMITTANCE_P2P') {
    throw new ValidationError(
      'INV-30: a regulated remittance / P2P purpose is not eligible on this Paystack surface (a business payout lane is not a personal wallet; relabeling, decomposition, distribution or hop-chaining never changes the classification)',
      { surface, purposeClass },
    );
  }
  if (purposeClass === 'UNCLASSIFIED') {
    throw new ValidationError(
      'INV-30/D3: the transaction carries no purpose classification — an unclassified transaction is never dispatched on a Paystack product surface (the classification is derived from the intent\u2019s real facts upstream and is reviewable; a class change is a new intent)',
      { surface, purposeClass },
    );
  }
  const eligible =
    surface === 'TRANSFER'
      ? PAYSTACK_TRANSFER_ELIGIBLE_PURPOSE_CLASSES
      : PAYSTACK_COLLECTION_ELIGIBLE_PURPOSE_CLASSES;
  if (!eligible.includes(purposeClass)) {
    throw new ValidationError(
      `the typed purpose class '${purposeClass}' is not an eligible class for the Paystack ${surface} surface (the capability matrix §5 rows — honest refusal, never silently bucketed)`,
      { surface, purposeClass },
    );
  }
}

// ---------------------------------------------------------------------------
// THE TYPED PRODUCT LANE (P27-C — initiate → OTP/finalize → verify with
// proper typed states). The classifier reads ONLY the provider's own
// status word: a raw 'success' is the single final-confirmed state;
// every other provider status stays PENDING (the raw status carried —
// never a guessed finality, never an invented vocabulary).
// ---------------------------------------------------------------------------

/** The typed lifecycle states of one Paystack payout (fail-closed). */
export type PaystackTransferLifecycleState =
  | {
      /** The provider answered a non-final status — the OTP/finalize step applies. */
      readonly kind: 'INITIATED_PENDING_FINALIZE';
      readonly transferCode: string | null;
      readonly transferReference: string | null;
      /** The provider's raw status word, carried verbatim (never interpreted beyond pending). */
      readonly rawStatus: string;
    }
  | {
      /** The provider's own status word says success — final, paid out. */
      readonly kind: 'CONFIRMED_FINAL';
      readonly transferCode: string | null;
      readonly transferReference: string | null;
      readonly rawStatus: 'success';
    }
  | {
      readonly kind: 'UNKNOWN';
      readonly transferCode: string | null;
      readonly transferReference: string | null;
      readonly ambiguityReason: AmbiguityReason;
    }
  | {
      readonly kind: 'FAILED';
      readonly transferCode: string | null;
      readonly transferReference: string | null;
      readonly failure: { readonly code: string; readonly message: string; readonly retryable: boolean };
    };

/**
 * Map an execution result into the typed lifecycle state. HONEST FINALITY
 * LAW: only the provider's own `success` status is CONFIRMED_FINAL; a
 * CONFIRMED transport answer with any other status (the audited P22-H
 * fixtures answer `pending`) is INITIATED_PENDING_FINALIZE with the raw
 * status carried verbatim — the finalize step (the operator's OTP) is
 * what completes a pending transfer, and a FAILED transport answer is
 * FAILED. An UNKNOWN stays UNKNOWN (INV-04 — reconcile, never guess).
 */
export function paystackTransferLifecycleStateOf(
  result: PaystackTransferExecutionResult,
): PaystackTransferLifecycleState {
  if (result.outcome === 'UNKNOWN') {
    if (result.ambiguityReason === undefined) {
      throw new ValidationError('an UNKNOWN transfer result requires a canonical ambiguity reason');
    }
    return Object.freeze({
      kind: 'UNKNOWN',
      transferCode: result.transferCode,
      transferReference: result.transferReference,
      ambiguityReason: result.ambiguityReason,
    });
  }
  if (result.outcome === 'FAILED') {
    if (result.failure === undefined) {
      throw new ValidationError('a FAILED transfer result requires provider failure metadata');
    }
    return Object.freeze({
      kind: 'FAILED',
      transferCode: result.transferCode,
      transferReference: result.transferReference,
      failure: Object.freeze({ ...result.failure }),
    });
  }
  const rawStatus = result.transferStatus ?? '';
  if (rawStatus === 'success') {
    return Object.freeze({
      kind: 'CONFIRMED_FINAL',
      transferCode: result.transferCode,
      transferReference: result.transferReference,
      rawStatus: 'success' as const,
    });
  }
  if (rawStatus.length === 0) {
    throw new ValidationError(
      'a CONFIRMED transfer result without a provider status word cannot be classified (never a guessed state)',
    );
  }
  return Object.freeze({
    kind: 'INITIATED_PENDING_FINALIZE',
    transferCode: result.transferCode,
    transferReference: result.transferReference,
    rawStatus,
  });
}

/**
 * The product-lane input: the payout facts PLUS the typed purpose class.
 * The purpose gate runs on EVERY consequential path (initiate and the
 * OTP completion) — the classification travels with the transaction,
 * exactly as it travels with the route (INV-30: the most restrictive
 * applicable classification governs the whole route).
 */
export interface PaystackTransferProductLaneInput extends PaystackTransferInitiateInput {
  readonly purposeClass: PaystackTransactionPurposeClass;
}

/**
 * Create the TRANSFER PRODUCT LANE driver: the P22-H execution surface
 * driven through the typed lifecycle states with the INV-30 purpose
 * gate on every consequential path. `runPayout` initiates (the pending
 * state carries the transfer code the OTP step needs); `completeWithOtp`
 * finalizes (the operator's OTP — re-gated); `reconcile` is the verify
 * read-back (a read; no purpose gate — it reports the provider's truth).
 */
export function createPaystackTransferProductLane(deps: PaystackTransferExecutionDeps): {
  readonly runPayout: (
    material: unknown,
    input: PaystackTransferProductLaneInput,
  ) => Promise<PaystackTransferLifecycleState>;
  readonly completeWithOtp: (
    material: unknown,
    input: {
      readonly purposeClass: PaystackTransactionPurposeClass;
      readonly transferCode: string;
      readonly otp: string;
    },
  ) => Promise<PaystackTransferLifecycleState>;
  readonly reconcile: (
    material: unknown,
    referenceOrCode: string,
  ) => Promise<PaystackTransferLifecycleState>;
} {
  const execution = createPaystackTransferExecution(deps);
  return {
    async runPayout(material, input) {
      // INV-30 BEFORE anything else: the gate reads only the typed class;
      // an ineligible or unclassified purpose never reaches the seal.
      refuseIneligiblePaystackPurpose('TRANSFER', input.purposeClass);
      const { purposeClass: _gated, ...initiateInput } = input;
      const result = await execution.initiate(material, initiateInput);
      return paystackTransferLifecycleStateOf(result);
    },
    async completeWithOtp(material, input) {
      // The OTP completion is the SAME consequential payout transaction:
      // the classification travels with it (INV-30 — relabeling the
      // completion never launders the initiate).
      refuseIneligiblePaystackPurpose('TRANSFER', input.purposeClass);
      const result = await execution.finalize(material, input.transferCode, input.otp);
      return paystackTransferLifecycleStateOf(result);
    },
    async reconcile(material, referenceOrCode) {
      const result = await execution.verify(material, referenceOrCode);
      return paystackTransferLifecycleStateOf(result);
    },
  };
}
