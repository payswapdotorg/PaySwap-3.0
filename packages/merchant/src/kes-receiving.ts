/**
 * @payswap/merchant — THE CORRIDOR KES RECEIVING CONTEXT (P22-C,
 * ADR-0016 D5 + the frozen appendix): the KES receiving entry the
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
 * imported, the ADR-0015 appendix discipline).
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
