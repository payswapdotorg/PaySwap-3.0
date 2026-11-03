/**
 * @payswap/provider-runtime — the Paystack recipient REQUEST BUILDER
 * (P27-C, ADR-0020 D10): the typed transfer-recipient request gate —
 * the ONLY path that turns a typed input into dispatchable wire params,
 * fail-closed against the dated-evidence registry (recipient-facts.ts).
 * No verified dated observation, no request — nothing unverified ever
 * reaches the transport (the K3/K4 law made mechanical). Split from
 * recipient-plane.ts per the <=400-line file law.
 */

import { ValidationError } from '../../errors.ts';
import {
  isPaystackRecipientTypeCandidate,
  paystackRecipientTypeEvidenceFor,
  PAYSTACK_RECIPIENT_TYPE_EVIDENCE,
} from './recipient-facts.ts';
import type {
  PaystackRecipientTypeCandidate,
  PaystackRecipientTypeEvidence,
} from './recipient-facts.ts';

// ---------------------------------------------------------------------------
// The typed request builder (the gate — nothing unverified ever dispatches).
// ---------------------------------------------------------------------------

/** The typed recipient request input (camelCase; the builder maps to the wire). */
export interface PaystackTransferRecipientRequestInput {
  readonly recipientType: PaystackRecipientTypeCandidate;
  /** The recipient's display name (the API's `name`). */
  readonly name: string;
  /** Uppercase ISO alpha-2 market the recipient is verified for. */
  readonly country: string;
  /** Uppercase ISO currency the recipient is verified for. */
  readonly currency: string;
  /** The bank/institution account number when the type uses one. */
  readonly accountNumber?: string;
  /** The bank/institution code when the type uses one. */
  readonly bankCode?: string;
  /** The mobile-money phone number when the type uses one. */
  readonly phoneNumber?: string;
  readonly description?: string;
}

/** The built, evidence-admitted wire request (the execution's input). */
export interface PaystackTransferRecipientRequest {
  readonly type: PaystackRecipientTypeCandidate;
  readonly params: Readonly<Record<string, string>>;
  /** The evidence observation that admitted the request (never fabricated). */
  readonly admittedBy: PaystackRecipientTypeEvidence;
}

/** The typed refusal reasons the builder can answer. */
export type PaystackRecipientRequestRefusal =
  | 'PAYSTACK_RECIPIENT_TYPE_UNVERIFIED'
  | 'PAYSTACK_RECIPIENT_INSTITUTION_EXCLUDED'
  | 'PAYSTACK_RECIPIENT_FIELD_REQUIRED';

/**
 * Build a transfer-recipient request from the typed input. FAIL-CLOSED:
 * the (type, country, currency) triple must carry a VERIFIED dated
 * evidence observation in the registry (D10 — no evidence, no request);
 * every field the evidence's re-verified docs require must be present;
 * an excluded institution reference is refused (the Bank-of-Ghana-class
 * exclusion, when the re-verification encodes one).
 */
export function buildPaystackTransferRecipientRequest(
  input: PaystackTransferRecipientRequestInput,
  registry: readonly PaystackRecipientTypeEvidence[] = PAYSTACK_RECIPIENT_TYPE_EVIDENCE,
): PaystackTransferRecipientRequest {
  if (input === null || typeof input !== 'object') {
    throw new ValidationError('a typed recipient request input object is required');
  }
  if (!isPaystackRecipientTypeCandidate(input.recipientType)) {
    throw new ValidationError(
      'the recipient type must be one of the registration-claimed candidates (ghipss/mobile_money/nuban/basa/kepss)',
      { recipientType: input.recipientType },
    );
  }
  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    throw new ValidationError('the recipient name is required (non-empty)');
  }
  if (typeof input.country !== 'string' || !/^[A-Z]{2}$/.test(input.country)) {
    throw new ValidationError('the recipient country must be an uppercase ISO alpha-2 code');
  }
  if (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)) {
    throw new ValidationError('the recipient currency must be an uppercase ISO currency code');
  }
  const evidence = paystackRecipientTypeEvidenceFor(
    registry,
    input.recipientType,
    input.country,
    input.currency,
  );
  if (evidence === undefined) {
    // THE K3/K4 GATE: no verified dated observation, no recipient — never
    // a silent pass, never a guessed fact (ADR-0020 D10/D11).
    throw new ValidationError(
      `the Paystack recipient type '${input.recipientType}' is UNVERIFIED for ${input.country}/${input.currency} at this station — the dated-evidence registry carries no verified observation (K3/K4 re-verification pending; see PAYSTACK_RECIPIENT_FACTS_STATION_RECORD and the P27-C lane report)`,
      {
        refusal: 'PAYSTACK_RECIPIENT_TYPE_UNVERIFIED' as PaystackRecipientRequestRefusal,
        recipientType: input.recipientType,
        country: input.country,
        currency: input.currency,
      },
    );
  }
  const params: Record<string, string> = {
    type: input.recipientType,
    name: input.name,
    currency: input.currency,
  };
  if (input.accountNumber !== undefined) {
    if (typeof input.accountNumber !== 'string' || input.accountNumber.length === 0) {
      throw new ValidationError('the recipient account number must be a non-empty string when provided');
    }
    params['account_number'] = input.accountNumber;
  }
  if (input.bankCode !== undefined) {
    if (typeof input.bankCode !== 'string' || input.bankCode.length === 0) {
      throw new ValidationError('the recipient bank code must be a non-empty string when provided');
    }
    if (
      (evidence.excludedInstitutionRefs ?? []).some(
        (ref) => ref.toLowerCase() === input.bankCode!.toLowerCase(),
      )
    ) {
      throw new ValidationError(
        `the institution '${input.bankCode}' is excluded for ${input.recipientType} recipients in ${input.country} by the verified evidence (the re-verified institution exclusion)`,
        {
          refusal: 'PAYSTACK_RECIPIENT_INSTITUTION_EXCLUDED' as PaystackRecipientRequestRefusal,
          recipientType: input.recipientType,
          country: input.country,
        },
      );
    }
    params['bank_code'] = input.bankCode;
  }
  if (input.phoneNumber !== undefined) {
    if (typeof input.phoneNumber !== 'string' || input.phoneNumber.length === 0) {
      throw new ValidationError('the recipient phone number must be a non-empty string when provided');
    }
    params['phone_number'] = input.phoneNumber;
  }
  if (input.description !== undefined) {
    if (typeof input.description !== 'string' || input.description.length === 0) {
      throw new ValidationError('the recipient description must be a non-empty string when provided');
    }
    params['description'] = input.description.slice(0, 200);
  }
  // The re-verified required-fields law: every field the evidence's live
  // docs named must be present in the built params.
  for (const required of evidence.requiredFields) {
    if (params[required] === undefined) {
      throw new ValidationError(
        `the recipient type '${input.recipientType}' requires the wire field '${required}' per the verified evidence (retrieved ${evidence.retrievedAt} from ${evidence.sourceUrl})`,
        {
          refusal: 'PAYSTACK_RECIPIENT_FIELD_REQUIRED' as PaystackRecipientRequestRefusal,
          requiredField: required,
          recipientType: input.recipientType,
        },
      );
    }
  }
  return Object.freeze({
    type: input.recipientType,
    params: Object.freeze(params),
    admittedBy: evidence,
  });
}

