/**
 * @payswap/merchant — THE CORRIDOR KES RECEIVING CONTEXT (P22-C,
 * ADR-0016 D5 + the frozen appendix; GROWN by P27-C, ADR-0020 D10 —
 * the Paystack recipient association): the KES receiving entry the
 * corridor's OFF-RAMP leg needs — the merchant-side typed record that a
 * merchant receives Kenyan shillings at a BANK INSTRUMENT through the
 * cross-provider corridor's external conversion settlement (the
 * GHS → USDC(Stellar) → KES corridor's arrival leg).
 *
 * THE PRECEDENT (settlement-routes.ts): a receiving context rides the
 * EXTERNAL_PAYSWAP_CONVERSION route family — the destination is an
 * EXTERNAL bank instrument with provenance, NEVER a PaySwap custodial
 * balance (INV-8-adjacent: there is no field that could hold one). The
 * structural checks here are the corridor's pinned receiving literals
 * (kind BANK_INSTRUMENT, currency KES — the ADR-0016 appendix's off-ramp
 * arrival); the deeper destination law is the route constructor's own
 * (defineExternalConversionSettlementRoute — never duplicated here).
 *
 * LAYER LAW: zero sibling imports. The corridor literals are pinned
 * locally against the ADR-0016 appendix (the C lane's route-planning
 * pins/corridor.ts pins the same literals independently — never
 * imported, the ADR-0015 appendix discipline). The P27-C growth keeps
 * that law: the Paystack recipient association (below) pins the dated-
 * evidence observation shape BY VALUE against the provider-runtime
 * authority — never imported, verified test-only.
 */

import { ValidationError } from "./errors.ts";
import {
  defineExternalConversionSettlementRoute,
  isExternalConversionRoute,
} from "./settlement-routes.ts";
import type {
  ExternalConversionSettlementRoute,
} from "./settlement-routes.ts";

/**
 * VALUE PIN — authority: ADR-0016 D5 + the frozen appendix (P22-C): the
 * corridor's KES receiving destination kind — a BANK INSTRUMENT (the
 * off-ramp payout's arrival, matching the compiled corridor plan's final
 * custody `to` party kind).
 */
export const PINNED_CORRIDOR_KES_RECEIVING_KIND = "BANK_INSTRUMENT" as const;

/**
 * VALUE PIN — authority: ADR-0016 (the corridor mandate): the corridor's
 * KES receiving currency (the GHS → USDC(Stellar) → KES arrival).
 */
export const PINNED_CORRIDOR_KES_RECEIVING_CURRENCY = "KES" as const;

/**
 * VALUE PIN — authority: ADR-0016 appendix (the C lane's naming, recorded
 * at P22-C merge): the corridor's KES off-ramp payout method — the
 * Paystack Kenya bank-transfer payout (the receiving context's method
 * association; route-planning pins/corridor.ts pins the same literal
 * independently).
 */
export const PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD =
  "paystack_kes_bank_transfer" as const;

/** The corridor KES receiving context (pure frozen data — never authority). */
export interface CorridorKesReceivingContext {
  /** The EXTERNAL conversion settlement route carrying the destination. */
  readonly route: ExternalConversionSettlementRoute;
  /** The pinned receiving kind (BANK_INSTRUMENT). */
  readonly receivingKind: typeof PINNED_CORRIDOR_KES_RECEIVING_KIND;
  /** The pinned receiving currency (KES). */
  readonly receivingCurrency: typeof PINNED_CORRIDOR_KES_RECEIVING_CURRENCY;
  /** The pinned off-ramp payout method association. */
  readonly payoutMethod: typeof PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD;
}

// ---------------------------------------------------------------------------
// (P27-C, ADR-0020 D10) THE PAYSTACK RECIPIENT ASSOCIATION — the KES
// receiving slice rides the new recipient plane where the facts permit.
// LAYER LAW: zero sibling imports. The dated-evidence observation shape
// is pinned LOCALLY BY VALUE against the provider-runtime
// `PaystackRecipientTypeEvidence` record (the same fields, the same
// laws) — the mirror is verified test-only against the authority, never
// imported. NO recipient-type availability fact ships here: the
// constructor requires the caller-supplied DATED observation, and at
// the 2026-11-03 station none exists (the K3/K4 re-verification is
// pending — the Paystack docs were unreachable; see the P27-C lane
// report). The association is therefore UNCONSTRUCTIBLE from shipped
// constants — exactly the honest state.
// ---------------------------------------------------------------------------

/**
 * The registration-claimed candidate recipient types for the KES lane
 * (the K3 claim, names only — never availability facts). The Paystack
 * recipient plane's candidate vocabulary, pinned locally BY VALUE.
 */
export const PINNED_PAYSTACK_KES_RECIPIENT_TYPE_CANDIDATES = [
  "kepss",
  "mobile_money",
] as const;
export type PinnedPaystackKesRecipientType =
  (typeof PINNED_PAYSTACK_KES_RECIPIENT_TYPE_CANDIDATES)[number];

/**
 * ONE dated evidence observation for the KES recipient lane (the local
 * structural mirror of the provider-runtime record): a recipient type's
 * verified availability for the corridor's KES arrival, stamped with
 * the retrieval date and the live source URL it was re-verified against.
 * A fixture observation is NEVER real evidence (D11).
 */
export interface PinnedPaystackKesRecipientEvidence {
  /** The candidate recipient type the observation verified. */
  readonly recipientType: PinnedPaystackKesRecipientType;
  /** The corridor market (the pinned KES arrival market). */
  readonly country: "KE";
  /** The corridor receiving currency (the pinned KES arrival). */
  readonly currency: "KES";
  readonly status: "VERIFIED_AVAILABLE";
  /** The live provider documentation page the fact was re-verified against. */
  readonly sourceUrl: string;
  /** Retrieval date (ISO 8601 date) — freshness is law (D10). */
  readonly retrievedAt: string;
}

/**
 * The typed Paystack recipient association the KES receiving context
 * can carry: the recipient code the P27-C plane created (or verified)
 * plus the dated evidence observation that admitted it. The recipient
 * STOPS being opaque at this seam: the bank arrival is the typed,
 * evidence-admitted product of the recipient plane.
 */
export interface PinnedPaystackKesRecipientAssociation {
  /** The transfer-recipient code (`RCP_…`) the recipient plane answered. */
  readonly recipientCode: string;
  readonly recipientType: PinnedPaystackKesRecipientType;
  /** The dated observation that admitted the recipient lane (never fabricated). */
  readonly evidence: PinnedPaystackKesRecipientEvidence;
}

/** The corridor KES receiving context WITH the Paystack recipient association. */
export interface CorridorKesPaystackRecipientReceivingContext
  extends CorridorKesReceivingContext {
  readonly paystackRecipient: PinnedPaystackKesRecipientAssociation;
}

/** Fail-closed validation of the dated observation (shape + datedness + the pinned triple). */
function validateKesRecipientEvidence(
  evidence: PinnedPaystackKesRecipientEvidence,
): void {
  if (evidence === null || typeof evidence !== "object") {
    throw new ValidationError(
      "a Paystack KES recipient association requires a dated evidence observation",
    );
  }
  if (
    !PINNED_PAYSTACK_KES_RECIPIENT_TYPE_CANDIDATES.includes(
      evidence.recipientType as PinnedPaystackKesRecipientType,
    )
  ) {
    throw new ValidationError(
      "the KES recipient evidence must name a claimed candidate type for the corridor's Kenya arrival (kepss/mobile_money — the registration's K3 vocabulary, re-verified before any use)",
    );
  }
  if (evidence.country !== "KE" || evidence.currency !== "KES") {
    throw new ValidationError(
      "the KES recipient evidence must carry the corridor's pinned Kenya/KES triple (the receiving context never widens to another market)",
    );
  }
  if (evidence.status !== "VERIFIED_AVAILABLE") {
    throw new ValidationError(
      "the KES recipient evidence must be a VERIFIED_AVAILABLE observation — an excluded or unverified fact never associates",
    );
  }
  if (
    typeof evidence.sourceUrl !== "string" ||
    !evidence.sourceUrl.startsWith("https://")
  ) {
    throw new ValidationError(
      "the KES recipient evidence requires the live source URL it was re-verified against",
    );
  }
  if (
    typeof evidence.retrievedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(evidence.retrievedAt)
  ) {
    throw new ValidationError(
      "the KES recipient evidence requires an ISO retrieval date (the dated-evidence law)",
    );
  }
}

/**
 * (P27-C) THE PAYSTACK-RECIPIENT KES RECEIVING CONSTRUCTOR: the KES
 * receiving entry whose bank arrival is a typed, evidence-admitted
 * Paystack Kenya transfer recipient — the receiving slice riding the
 * new recipient plane WHERE THE FACTS PERMIT. Fail-closed on the dated
 * observation: no verified (KE, KES) evidence, no association (nothing
 * unverified is ever encoded). The bank instrument reference stays
 * OPAQUE to this package (the payment plane owns its identity); the
 * association records that the recipient came through the typed plane
 * with the observation that admitted it.
 */
export function defineCorridorKesPaystackRecipientReceiving(input: {
  readonly destinationId: string;
  readonly bankInstrumentRef: string;
  readonly paystackRecipient: PinnedPaystackKesRecipientAssociation;
  readonly provenance: {
    readonly source: string;
    readonly reference: string;
    readonly recordedAt: bigint;
  };
  readonly conversionChain: readonly string[];
}): CorridorKesPaystackRecipientReceivingContext {
  if (
    input.paystackRecipient === null ||
    typeof input.paystackRecipient !== "object"
  ) {
    throw new ValidationError(
      "a Paystack-recipient KES receiving context requires the typed recipient association",
    );
  }
  if (
    typeof input.paystackRecipient.recipientCode !== "string" ||
    input.paystackRecipient.recipientCode.length === 0
  ) {
    throw new ValidationError(
      "the Paystack KES recipient association requires the recipient code the recipient plane answered",
    );
  }
  // The ASSOCIATION's own type is guarded at runtime too (the typed field
  // is only a compile-time promise — a runtime value outside the claimed
  // candidate vocabulary, or one disagreeing with the evidence that
  // admitted it, fails closed here; the types never launder a fact).
  if (
    !PINNED_PAYSTACK_KES_RECIPIENT_TYPE_CANDIDATES.includes(
      input.paystackRecipient.recipientType as PinnedPaystackKesRecipientType,
    )
  ) {
    throw new ValidationError(
      "the KES recipient association must name a claimed candidate type for the corridor's Kenya arrival (kepss/mobile_money — the registration's K3 vocabulary, re-verified before any use)",
    );
  }
  validateKesRecipientEvidence(input.paystackRecipient.evidence);
  if (input.paystackRecipient.recipientType !== input.paystackRecipient.evidence.recipientType) {
    throw new ValidationError(
      "the KES recipient association's type must agree with the dated evidence observation that admitted it (an association may never claim a type its evidence did not verify)",
    );
  }
  const base = defineCorridorKesReceivingContext({
    destinationId: input.destinationId,
    bankInstrumentRef: input.bankInstrumentRef,
    provenance: input.provenance,
    conversionChain: input.conversionChain,
  });
  return Object.freeze({
    ...base,
    paystackRecipient: Object.freeze({
      recipientCode: input.paystackRecipient.recipientCode,
      recipientType: input.paystackRecipient.evidence.recipientType,
      evidence: Object.freeze({ ...input.paystackRecipient.evidence }),
    }),
  });
}

/**
 * THE CORRIDOR KES RECEIVING CONSTRUCTOR (deterministic, fail-closed):
 * builds the merchant-side KES receiving entry — an EXTERNAL bank
 * destination with provenance riding the external conversion settlement
 * route. The bank instrument reference is OPAQUE (the payment plane owns
 * its identity); the provenance records where the bank details were
 * entered (never invented here); the conversion chain is the corridor's
 * own capability chain (USDC holding → KES payout), supplied by the
 * caller, validated non-empty and non-repeating by the route
 * constructor's own law.
 */
export function defineCorridorKesReceivingContext(input: {
  readonly destinationId: string;
  readonly bankInstrumentRef: string;
  readonly provenance: {
    readonly source: string;
    readonly reference: string;
    readonly recordedAt: bigint;
  };
  readonly conversionChain: readonly string[];
}): CorridorKesReceivingContext {
  if (
    typeof input.destinationId !== "string" ||
    input.destinationId.length === 0
  ) {
    throw new ValidationError(
      "a corridor KES receiving context requires a non-empty destination id",
    );
  }
  if (
    typeof input.bankInstrumentRef !== "string" ||
    input.bankInstrumentRef.length === 0
  ) {
    throw new ValidationError(
      "a corridor KES receiving context requires a non-empty bank instrument reference (the opaque bank arrival — never invented here)",
    );
  }
  if (
    input.provenance === null ||
    typeof input.provenance !== "object" ||
    typeof input.provenance.source !== "string" ||
    input.provenance.source.length === 0 ||
    typeof input.provenance.reference !== "string" ||
    input.provenance.reference.length === 0 ||
    typeof input.provenance.recordedAt !== "bigint"
  ) {
    throw new ValidationError(
      "a corridor KES receiving context requires provenance { source, reference, recordedAt } — where the bank details were recorded (never assumed)",
    );
  }
  const route = defineExternalConversionSettlementRoute({
    destination: {
      id: input.destinationId,
      kind: PINNED_CORRIDOR_KES_RECEIVING_KIND,
      currency: PINNED_CORRIDOR_KES_RECEIVING_CURRENCY,
      externalRef: input.bankInstrumentRef,
      provenance: input.provenance,
    },
    conversionChain: input.conversionChain,
  });
  if (!isExternalConversionRoute(route)) {
    // Unreachable by construction (the constructor's own family law) —
    // the guard keeps the corridor receiving context's type honest.
    throw new ValidationError(
      "the corridor KES receiving context rides the EXTERNAL_PAYSWAP_CONVERSION family (never a custodial route)",
    );
  }
  return Object.freeze({
    route,
    receivingKind: PINNED_CORRIDOR_KES_RECEIVING_KIND,
    receivingCurrency: PINNED_CORRIDOR_KES_RECEIVING_CURRENCY,
    payoutMethod: PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD,
  });
}
