/**
 * @payswap/provider-runtime — the Stripe GLOBAL PAYOUTS eligibility gates
 * (P27-B, ADR-0020 D10/D2/D3 + the P27-0 capability matrix §4/§5).
 *
 * FAIL-CLOSED (the lane law): no Global-Payouts journey is eligible unless
 * the eligible origin country (GA UK/US per the 2026-11-03 re-verification;
 * private preview otherwise), the product entitlement (Treasury — V2), the
 * funding, the required licences/Stripe approvals, the recipient market and
 * the method/currency/amount gates are ALL proven. The three honest outcomes:
 * - ELIGIBLE — every gate passed on dated evidence;
 * - OPERATOR_GATED — a typed CONDITIONAL OPPORTUNITY that only the operator
 *   can unlock (private preview, entitlement, funding, licences, preview
 *   methods); never a route, never a silent pass;
 * - REFUSED — a typed exclusion (never-alias, unlisted origin, absent
 *   recipient market, currency/method/amount bounds, purpose law).
 *
 * INV-30 (ADR-0020 D2): the purpose classification is an INPUT derived from
 * the journey's real facts (D3), never something this module or a route
 * chooses; remittance indicators attached to a non-P2P classification are a
 * typed refusal (relabeling never changes eligibility), and P2P requires the
 * actual operator's licences AND Stripe's explicit written product approval
 * (V5 — a licensed-fintech product context, never a blanket approval).
 *
 * Every country/method/currency/limit fact consumed here is a DATED
 * OBSERVATION from payouts-evidence.ts (retrieved 2026-11-03); none is a
 * permanent flag, and the verdict carries the evidence stamp (the D10 law).
 * Roadmap labels ("H2 27") surface as conditional-opportunity notes — never
 * as eligibility.
 */

import {
  STRIPE_GLOBAL_PAYOUTS_EVIDENCE_STAMP,
  STRIPE_GLOBAL_PAYOUTS_GA_ORIGIN_COUNTRIES,
  STRIPE_GLOBAL_PAYOUTS_PRIVATE_PREVIEW_ORIGIN_COUNTRIES,
  STRIPE_GLOBAL_PAYOUTS_PAYOUT_METHODS,
  globalPayoutsRecipientMarketOf,
  globalPayoutsSendingLimitsOf,
  globalPayoutsMinReceivingMinorUnitsOf,
  globalPayoutsMaxReceivingMinorUnitsOf,
} from './payouts-evidence.ts';
import type { StripeGlobalPayoutsGateRecord } from './payouts-eligibility-verdict.ts';
import type { StripeGlobalPayoutsJourneyInput } from './payouts-eligibility-verdict.ts';
import { STRIPE_GLOBAL_PAYOUTS_RECIPIENT_MARKET_CONDITIONAL_NOTES } from './payouts-eligibility-verdict.ts';

/* The typed vocabulary lives in payouts-eligibility-verdict.ts (the file law);
 * this module re-exports it so the eligibility surface stays one import. */
export {
  STRIPE_GLOBAL_PAYOUTS_PURPOSE_CLASSES,
  STRIPE_GLOBAL_PAYOUTS_OPERATOR_GATES,
  STRIPE_GLOBAL_PAYOUTS_REFUSAL_REASONS,
} from './payouts-eligibility-verdict.ts';
export type {
  StripeGlobalPayoutsPurposeClass,
  StripeGlobalPayoutsOperatorGate,
  StripeGlobalPayoutsRefusalReason,
  StripeGlobalPayoutsGateRecord,
  StripeGlobalPayoutsEligibilityVerdict,
  ExtractStripeGlobalPayoutsEligibleVerdict,
  ExcludeStripeGlobalPayoutsEligibleVerdict,
  StripeGlobalPayoutsJourneyProofs,
  StripeGlobalPayoutsJourneyInput,
} from './payouts-eligibility-verdict.ts';

function verdictTrail(
  gates: StripeGlobalPayoutsGateRecord[],
): { readonly gates: readonly StripeGlobalPayoutsGateRecord[] } {
  return { gates: Object.freeze([...gates]) };
}

/**
 * THE GATE CHAIN (capability matrix §5's eligibility decision order, hard
 * gates before any optimization): purpose class → licensing → product
 * permission (origin) → entitlement → funding → country/method/currency →
 * amount. The first failing or gating step decides the verdict.
 */
export function evaluateGlobalPayoutsJourneyEligibility(
  input: StripeGlobalPayoutsJourneyInput,
): import('./payouts-eligibility-verdict.ts').StripeGlobalPayoutsEligibilityVerdict {
  const gates: StripeGlobalPayoutsGateRecord[] = [];
  const evidence = STRIPE_GLOBAL_PAYOUTS_EVIDENCE_STAMP;
  const origin = input.originCountry.toUpperCase();

  // ---- Gate 1 — the purpose classification (D3: classification before anything). ----
  if (input.purposeClass === 'Unclear') {
    gates.push({ gate: 'PURPOSE_CLASS', outcome: 'REFUSED', detail: 'the purpose class is Unclear — the model must ask for the missing facts; a class change is a new intent (D3)' });
    return {
      kind: 'REFUSED',
      reason: 'PURPOSE_CLASSIFICATION_REQUIRED',
      detail:
        'no Global-Payouts journey is evaluated without the typed purpose classification derived from the real facts',
      ...verdictTrail(gates),
      evidence,
    };
  }
  gates.push({ gate: 'PURPOSE_CLASS', outcome: 'PASSED', detail: `purpose class ${input.purposeClass} (typed, from the journey facts)` });

  // ---- Gate 2 — INV-30: relabeling never changes the classification. ----
  const remittanceIndicators = input.remittanceIndicators ?? [];
  if (remittanceIndicators.length > 0 && input.purposeClass !== 'RegulatedRemittanceP2P') {
    gates.push({
      gate: 'INV_30_RELABELING',
      outcome: 'REFUSED',
      detail: `remittance indicators present (${remittanceIndicators.join('; ')}) under class ${input.purposeClass} — decomposition/relabeling never changes the classification`,
    });
    return {
      kind: 'REFUSED',
      reason: 'PURPOSE_CLASSIFICATION_INCOHERENT',
      detail:
        'the journey carries personal-remittance indicators under a non-P2P purpose class — INV-30: relabeling or splitting the journey changes nothing',
      ...verdictTrail(gates),
      evidence,
    };
  }
  gates.push({ gate: 'INV_30_RELABELING', outcome: 'PASSED', detail: 'no remittance indicators under the declared class' });

  // ---- Gate 3 — the P2P licensing gate (capability matrix §5 row; V5). ----
  if (input.purposeClass === 'RegulatedRemittanceP2P') {
    const proofs = input.proofs.p2pLicenceAndProviderApproval;
    if (
      proofs === undefined ||
      proofs.licenceEvidenceRef.length === 0 ||
      proofs.providerWrittenApprovalRef.length === 0
    ) {
      gates.push({
        gate: 'P2P_LICENCES_AND_PROVIDER_APPROVAL',
        outcome: 'OPERATOR_GATED',
        detail: 'P2P is a licensed-fintech product context: the operator must hold the required licences AND carry Stripe\'s explicit written product approval for the disclosed model',
      });
      return {
        kind: 'OPERATOR_GATED',
        gate: 'P2P_LICENCE_AND_PROVIDER_APPROVAL',
        detail:
          'regulated remittance/P2P through Global Payouts requires the operator\'s licence evidence and Stripe\'s explicit written approval — absent either, this is a typed conditional opportunity, never a route',
        ...verdictTrail(gates),
        evidence,
      };
    }
    gates.push({ gate: 'P2P_LICENCES_AND_PROVIDER_APPROVAL', outcome: 'PASSED', detail: 'licence + written provider approval references presented' });
  }

  // ---- Gate 4 — the origin gate (V3, re-verified 2026-11-03: GA GB/US; 22 private-preview countries). ----
  if (STRIPE_GLOBAL_PAYOUTS_GA_ORIGIN_COUNTRIES.includes(origin)) {
    gates.push({ gate: 'ORIGIN_COUNTRY', outcome: 'PASSED', detail: `${origin} is a GA Global-Payouts origin country (2026-11-03)` });
  } else if (STRIPE_GLOBAL_PAYOUTS_PRIVATE_PREVIEW_ORIGIN_COUNTRIES.includes(origin)) {
    gates.push({ gate: 'ORIGIN_COUNTRY', outcome: 'OPERATOR_GATED', detail: `${origin} can only request private preview access (2026-11-03)` });
    return {
      kind: 'OPERATOR_GATED',
      gate: 'PRIVATE_PREVIEW_ORIGIN_REQUEST',
      detail:
        `origin ${origin} is on the private-preview list — a written Stripe private-preview grant is the operator's action; no route exists until then`,
      ...verdictTrail(gates),
      evidence,
    };
  } else {
    gates.push({ gate: 'ORIGIN_COUNTRY', outcome: 'REFUSED', detail: `${origin} is on neither the GA nor the private-preview origin list (2026-11-03)` });
    return {
      kind: 'REFUSED',
      reason: 'ORIGIN_COUNTRY_NOT_LISTED',
      detail: `origin country ${origin} is not listed for Global Payouts on the 2026-11-03 availability page (GA: GB, US; private preview by request: the 22 listed countries)`,
      ...verdictTrail(gates),
      evidence,
    };
  }

  // ---- Gate 5 — the Treasury entitlement gate (V2: Global Payouts requires Treasury). ----
  const treasury = input.proofs.treasuryEntitlement;
  if (treasury === undefined || !treasury.entitlementObserved) {
    gates.push({
      gate: 'TREASURY_ENTITLEMENT',
      outcome: 'OPERATOR_GATED',
      detail: 'Global Payouts requires Treasury: an entitled, probe-verified financial account must be proven (V2)',
    });
    return {
      kind: 'OPERATOR_GATED',
      gate: 'TREASURY_ENTITLEMENT',
      detail:
        'the Treasury/financial-account entitlement is not proven for this account — activating Treasury and funding the financial account is the operator\'s action (the run card §C)',
      ...verdictTrail(gates),
      evidence,
    };
  }
  gates.push({ gate: 'TREASURY_ENTITLEMENT', outcome: 'PASSED', detail: `entitled financial account ${treasury.financialAccountId} observed` });

  // ---- Gate 6 — the funding gate ("fund your financial account"). ----
  const funding = input.proofs.funding;
  if (funding === undefined || !(funding.fundedMinorUnits > 0)) {
    gates.push({ gate: 'FUNDING', outcome: 'OPERATOR_GATED', detail: 'a funded financial account must be proven before any payout' });
    return {
      kind: 'OPERATOR_GATED',
      gate: 'FUNDING_PROOF',
      detail: 'the financial account carries no proven funding — funding is the operator\'s action and is re-proven at dispatch',
      ...verdictTrail(gates),
      evidence,
    };
  }

  // ---- Gate 7 — the recipient market gate (the dated 107-row matrix). ----
  const market = globalPayoutsRecipientMarketOf(input.recipientCountryCode);
  if (market === undefined) {
    const note = STRIPE_GLOBAL_PAYOUTS_RECIPIENT_MARKET_CONDITIONAL_NOTES[input.recipientCountryCode.toUpperCase()];
    gates.push({ gate: 'RECIPIENT_MARKET', outcome: 'REFUSED', detail: `${input.recipientCountryCode} has no row on the 2026-11-03 recipient-countries table` });
    return {
      kind: 'REFUSED',
      reason: 'RECIPIENT_MARKET_NOT_AVAILABLE',
      detail: `recipient market ${input.recipientCountryCode} is absent from the dated Global-Payouts recipient-countries table (retrieved 2026-11-03)`,
      ...verdictTrail(gates),
      evidence,
      ...(note !== undefined ? { conditionalOpportunityNote: note } : {}),
    };
  }
  gates.push({ gate: 'RECIPIENT_MARKET', outcome: 'PASSED', detail: `${market.countryCode} listed (GA currencies: ${(market.currencies ?? []).join(', ') || 'none'})` });

  // ---- Gate 8 — the recipient currency gate (GA column vs private-preview column). ----
  const recipientCurrency = input.recipientCurrency.toUpperCase();
  const gaCurrencies = market.currencies ?? [];
  const previewCurrencies = market.privatePreviewCurrencies ?? [];
  if (gaCurrencies.includes(recipientCurrency)) {
    gates.push({ gate: 'RECIPIENT_CURRENCY', outcome: 'PASSED', detail: `${recipientCurrency} is a GA currency for ${market.countryCode}` });
  } else if (previewCurrencies.includes(recipientCurrency)) {
    gates.push({ gate: 'RECIPIENT_CURRENCY', outcome: 'OPERATOR_GATED', detail: `${recipientCurrency} is a private-preview currency for ${market.countryCode} ("request access")` });
    return {
      kind: 'OPERATOR_GATED',
      gate: 'PRIVATE_PREVIEW_RECIPIENT_CURRENCY',
      detail: `payout currency ${recipientCurrency} for ${market.countryCode} is API-gated behind an access request (the 2026-11-03 table's private-preview column)`,
      ...verdictTrail(gates),
      evidence,
    };
  } else {
    gates.push({ gate: 'RECIPIENT_CURRENCY', outcome: 'REFUSED', detail: `${recipientCurrency} is listed for neither GA nor private preview for ${market.countryCode}` });
    return {
      kind: 'REFUSED',
      reason: 'RECIPIENT_CURRENCY_NOT_AVAILABLE',
      detail: `currency ${recipientCurrency} is not listed for recipient market ${market.countryCode} on the dated table`,
      ...verdictTrail(gates),
      evidence,
    };
  }

  // ---- Gate 9 — the payout-method gate (the dated sender-country method rows). ----
  let crossCurrencyNote: string | undefined;
  if (input.payoutMethodId !== undefined) {
    const methodRows = STRIPE_GLOBAL_PAYOUTS_PAYOUT_METHODS.filter(
      (row) => row.senderCountry === origin && row.methodId === input.payoutMethodId,
    );
    if (methodRows.length === 0) {
      gates.push({ gate: 'PAYOUT_METHOD', outcome: 'REFUSED', detail: `method ${input.payoutMethodId} has no dated row for sender ${origin}` });
      return {
        kind: 'REFUSED',
        reason: 'PAYOUT_METHOD_NOT_AVAILABLE_FOR_SENDER',
        detail: `payout method ${input.payoutMethodId} is not offered to ${origin} senders on the 2026-11-03 method table`,
        ...verdictTrail(gates),
        evidence,
      };
    }
    const previewRow = methodRows.find((row) => row.availability !== 'GA');
    if (previewRow !== undefined) {
      gates.push({ gate: 'PAYOUT_METHOD', outcome: 'OPERATOR_GATED', detail: `${input.payoutMethodId} is ${previewRow.availability} for ${origin} senders` });
      return {
        kind: 'OPERATOR_GATED',
        gate: 'PREVIEW_PAYOUT_METHOD',
        detail: `payout method ${input.payoutMethodId} is ${previewRow.availability} (dated table) — a typed conditional opportunity requiring the operator's access grant`,
        ...verdictTrail(gates),
        evidence,
      };
    }
    gates.push({ gate: 'PAYOUT_METHOD', outcome: 'PASSED', detail: `${input.payoutMethodId} GA for ${origin} senders (${methodRows[0]!.expectedArrivalLabel})` });
  }

  // ---- Gate 10 — the amount gates (sending limits + receiving bounds, minor units). ----
  const sendingCurrency = input.sendingCurrency.toUpperCase();
  if (input.sendingLimitPayoutMethod !== undefined) {
    const limits = globalPayoutsSendingLimitsOf(origin, sendingCurrency, input.sendingLimitPayoutMethod);
    if (limits !== undefined) {
      if (input.amountMinorUnits < limits.minMinorUnits) {
        gates.push({ gate: 'SENDING_AMOUNT', outcome: 'REFUSED', detail: `${input.amountMinorUnits} below the dated minimum ${limits.minMinorUnits} (${sendingCurrency} ${limits.payoutMethod})` });
        return {
          kind: 'REFUSED',
          reason: 'AMOUNT_BELOW_MINIMUM',
          detail: `the send amount is below the dated minimum for ${origin} ${sendingCurrency} ${limits.payoutMethod}`,
          ...verdictTrail(gates),
          evidence,
        };
      }
      if (input.amountMinorUnits > limits.maxMinorUnits) {
        gates.push({ gate: 'SENDING_AMOUNT', outcome: 'REFUSED', detail: `${input.amountMinorUnits} above the dated maximum ${limits.maxMinorUnits} (${sendingCurrency} ${limits.payoutMethod})` });
        return {
          kind: 'REFUSED',
          reason: 'AMOUNT_ABOVE_MAXIMUM',
          detail: `the send amount is above the dated maximum for ${origin} ${sendingCurrency} ${limits.payoutMethod}`,
          ...verdictTrail(gates),
          evidence,
        };
      }
      gates.push({ gate: 'SENDING_AMOUNT', outcome: 'PASSED', detail: `${input.amountMinorUnits} within the dated ${origin} ${sendingCurrency} ${limits.payoutMethod} bounds` });
    } else {
      gates.push({ gate: 'SENDING_AMOUNT', outcome: 'PASSED', detail: `no dated ${origin} ${sendingCurrency} ${input.sendingLimitPayoutMethod} row — the provider answer governs at dispatch` });
    }
  }
  if (sendingCurrency === recipientCurrency) {
    const minReceiving = globalPayoutsMinReceivingMinorUnitsOf(recipientCurrency, input.recipientCountryCode);
    if (minReceiving !== undefined && input.amountMinorUnits < minReceiving) {
      gates.push({ gate: 'RECEIVING_AMOUNT', outcome: 'REFUSED', detail: `${input.amountMinorUnits} below the dated receiving minimum ${minReceiving} ${recipientCurrency}` });
      return {
        kind: 'REFUSED',
        reason: 'AMOUNT_BELOW_MINIMUM',
        detail: `the amount is below the dated receiving minimum for ${recipientCurrency} in ${input.recipientCountryCode}`,
        ...verdictTrail(gates),
        evidence,
      };
    }
    const maxReceiving = globalPayoutsMaxReceivingMinorUnitsOf(recipientCurrency, input.recipientCountryCode);
    if (maxReceiving !== undefined && input.amountMinorUnits > maxReceiving) {
      gates.push({ gate: 'RECEIVING_AMOUNT', outcome: 'REFUSED', detail: `${input.amountMinorUnits} above the dated receiving maximum ${maxReceiving} ${recipientCurrency}` });
      return {
        kind: 'REFUSED',
        reason: 'AMOUNT_ABOVE_MAXIMUM',
        detail: `the amount is above the dated receiving maximum for ${recipientCurrency} in ${input.recipientCountryCode}`,
        ...verdictTrail(gates),
        evidence,
      };
    }
    gates.push({ gate: 'RECEIVING_AMOUNT', outcome: 'PASSED', detail: 'same-currency receiving bounds checked on the dated table' });
  } else {
    crossCurrencyNote =
      'cross-currency journey: the receiving-currency bounds apply to the CONVERTED amount at the provider\'s finalized rate — ' +
      'the FX quote is provider-given at review time and re-proven at dispatch (no local FX math exists in this package)';
    gates.push({ gate: 'RECEIVING_AMOUNT', outcome: 'PASSED', detail: 'cross-currency: receiving bounds checked at quote time (provider-given FX)' });
  }

  return {
    kind: 'ELIGIBLE',
    ...verdictTrail(gates),
    evidence,
    ...(crossCurrencyNote !== undefined ? { crossCurrencyNote } : {}),
  };
}
