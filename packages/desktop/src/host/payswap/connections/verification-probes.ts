/**
 * PaySwap Desktop (P21-A, ADR-0014 D5) — the host-side REAL verification
 * probes (structural mirrors of the canonical provider-runtime probes:
 * adapters/stripe|flutterwave|paystack/verification-probe.ts).
 *
 * The shared classification/result machinery + the credential key-class
 * laws live in ./probe-classification.ts (the ≤400-line file-law split);
 * this module carries the per-provider probe flows + the dispatch table.
 *
 * THE ADDITIVE BRIDGE FACTS: beside the canonical fields (outcome,
 * provider references, failure/ambiguity), each host probe result carries
 * the credential CLASS (a structural prefix fact — the grant derivation
 * input; never secret material) and, for Stripe, the balance currencies
 * read from /v1/balance (real provider observation — the funding-source
 * denominations). The mirror battery asserts the CLASSIFICATION +
 * REFERENCE-EXTRACTION fidelity against the REAL canonical probes over
 * identical fake responses.
 */

import type { PaySwapProbeProviderId } from "./probe-contracts.js";
import type { HostTransport } from "./host-https-transports.js";
import {
  HOST_PROBE_KEY_REJECTION_CODES,
  apiKeyOf,
  buildResult,
  classify,
  flutterwaveKeyClassOf,
  paystackKeyClassOf,
  stripeKeyClassOf,
  type HostProbeResult,
  type HostVerificationProbeDeps,
} from "./probe-classification.js";

export type {
  HostProbeOutcomeKind,
  HostProbeAmbiguityReason,
  HostProbeFailure,
  HostProbeResult,
  HostVerificationProbeDeps,
} from "./probe-classification.js";

/**
 * The Stripe probe: GET /v1/balance + GET /v1/account — the balance +
 * account read. The account reference and the provider-reported livemode
 * flag are the evidence (mirrors createStripeVerificationProbe;
 * ADDITIVELY extracts the balance currencies for the bridge).
 */
export function createHostStripeVerificationProbe(
  deps: HostVerificationProbeDeps,
): (material: unknown) => Promise<HostProbeResult> {
  return async (material: unknown): Promise<HostProbeResult> => {
    const dispatchedAt = deps.nowMs();
    const apiKey = apiKeyOf(material);
    const keyClass = stripeKeyClassOf(apiKey, deps.executionMode);
    const headers = { Authorization: `Bearer ${apiKey}` };

    const balance = await deps.transport.send({
      operationId: "stripe.balance.read",
      idempotencyKey: `probe:balance:${String(dispatchedAt)}`,
      params: {},
      headers,
      correlationId: `stripe-probe-balance:${String(dispatchedAt)}`,
    });
    const balanceClass = classify(balance, HOST_PROBE_KEY_REJECTION_CODES.stripe);
    if (balanceClass.outcome !== "CONFIRMED") {
      return buildResult(
        {
          outcome: balanceClass.outcome,
          keyClass,
          failure: balanceClass.failure,
          ambiguityReason: balanceClass.ambiguityReason,
        },
        deps,
        dispatchedAt,
      );
    }
    // The balance denominations (real provider observation — additive
    // over the canonical extraction; feeds the bridge's funding sources).
    const balanceBody = (balance.body ?? {}) as { available?: unknown };
    const balanceCurrencies: string[] = [];
    if (Array.isArray(balanceBody.available)) {
      for (const entry of balanceBody.available) {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
          continue;
        }
        const currency = (entry as { currency?: unknown }).currency;
        if (typeof currency === "string" && currency.length > 0) {
          const upper = currency.toUpperCase();
          if (!balanceCurrencies.includes(upper)) {
            balanceCurrencies.push(upper);
          }
        }
      }
    }

    const account = await deps.transport.send({
      operationId: "stripe.account.read",
      idempotencyKey: `probe:account:${String(dispatchedAt)}`,
      params: {},
      headers,
      correlationId: `stripe-probe-account:${String(dispatchedAt)}`,
    });
    const accountClass = classify(account, HOST_PROBE_KEY_REJECTION_CODES.stripe);
    if (accountClass.outcome !== "CONFIRMED") {
      return buildResult(
        {
          outcome: accountClass.outcome,
          keyClass,
          balanceCurrencies,
          failure: accountClass.failure,
          ambiguityReason: accountClass.ambiguityReason,
        },
        deps,
        dispatchedAt,
      );
    }

    const accountBody = (account.body ?? {}) as { id?: unknown; livemode?: unknown };
    const accountRef = typeof accountBody.id === "string" && accountBody.id.length > 0 ? accountBody.id : null;
    const providerLiveMode = typeof accountBody.livemode === "boolean" ? accountBody.livemode : null;
    if (accountRef === null) {
      // The provider answered 2xx without an account id: uninterpretable
      // evidence is UNKNOWN, never a fabricated CONFIRMED.
      return buildResult(
        { outcome: "UNKNOWN", keyClass, balanceCurrencies, ambiguityReason: "MALFORMED_RESPONSE_AFTER_DISPATCH" },
        deps,
        dispatchedAt,
      );
    }
    if (providerLiveMode !== null && providerLiveMode !== (deps.executionMode === "LIVE")) {
      return buildResult(
        {
          outcome: "FAILED",
          keyClass,
          balanceCurrencies,
          failure: {
            code: "STRIPE_LIVE_MODE_MISMATCH",
            message:
              "the provider-reported live/test mode does not match the runtime execution mode (INV-25 separation)",
            retryable: false,
            keyRejected: false,
          },
        },
        deps,
        dispatchedAt,
      );
    }
    return buildResult(
      {
        outcome: "CONFIRMED",
        keyClass,
        balanceCurrencies,
        accountRef,
        providerLiveMode,
        providerReferences: [accountRef, "balance"],
      },
      deps,
      dispatchedAt,
    );
  };
}

/**
 * The Flutterwave probe: GET /v3/balances — the read-only currency
 * wallets (mirrors createFlutterwaveVerificationProbe). F3: the probe
 * proves balance-read ONLY — the key class is READ_ONLY_TEST by
 * construction and no send operation exists for this provider.
 */
export function createHostFlutterwaveVerificationProbe(
  deps: HostVerificationProbeDeps,
): (material: unknown) => Promise<HostProbeResult> {
  return async (material: unknown): Promise<HostProbeResult> => {
    const dispatchedAt = deps.nowMs();
    const apiKey = apiKeyOf(material);
    const keyClass = flutterwaveKeyClassOf(apiKey, deps.executionMode);
    const headers = { Authorization: `Bearer ${apiKey}` };

    const balances = await deps.transport.send({
      operationId: "flutterwave.balances.read",
      idempotencyKey: `probe:balances:${String(dispatchedAt)}`,
      params: {},
      headers,
      correlationId: `flutterwave-probe-balances:${String(dispatchedAt)}`,
    });
    const classification = classify(balances, HOST_PROBE_KEY_REJECTION_CODES.flutterwave);
    if (classification.outcome !== "CONFIRMED") {
      return buildResult(
        {
          outcome: classification.outcome,
          keyClass,
          failure: classification.failure,
          ambiguityReason: classification.ambiguityReason,
        },
        deps,
        dispatchedAt,
      );
    }
    const body = (balances.body ?? {}) as { status?: unknown; data?: unknown };
    const data = body.data;
    if (body.status !== "success" || !Array.isArray(data)) {
      // Uninterpretable evidence is UNKNOWN, never a fabricated CONFIRMED.
      return buildResult(
        { outcome: "UNKNOWN", keyClass, ambiguityReason: "MALFORMED_RESPONSE_AFTER_DISPATCH" },
        deps,
        dispatchedAt,
      );
    }
    const currencies: string[] = [];
    for (const wallet of data) {
      if (wallet === null || typeof wallet !== "object" || Array.isArray(wallet)) {
        continue;
      }
      const currency = (wallet as { currency?: unknown }).currency;
      if (typeof currency === "string" && currency.length > 0 && !currencies.includes(currency)) {
        currencies.push(currency);
      }
    }
    if (currencies.length === 0) {
      return buildResult(
        { outcome: "UNKNOWN", keyClass, ambiguityReason: "MALFORMED_RESPONSE_AFTER_DISPATCH" },
        deps,
        dispatchedAt,
      );
    }
    return buildResult(
      { outcome: "CONFIRMED", keyClass, providerReferences: currencies, balanceCurrencies: currencies },
      deps,
      dispatchedAt,
    );
  };
}

/** How many Paystack transaction references the probe reports (evidence, capped). */
const MAX_REPORTED_TRANSACTIONS = 6;

/**
 * The Paystack probe: GET /transaction — the read-only transaction list
 * (mirrors createPaystackVerificationProbe; an empty history on a
 * brand-new account is still canonical evidence the read path works).
 */
export function createHostPaystackVerificationProbe(
  deps: HostVerificationProbeDeps,
): (material: unknown) => Promise<HostProbeResult> {
  return async (material: unknown): Promise<HostProbeResult> => {
    const dispatchedAt = deps.nowMs();
    const apiKey = apiKeyOf(material);
    const keyClass = paystackKeyClassOf(apiKey, deps.executionMode);
    const headers = { Authorization: `Bearer ${apiKey}` };

    const transactions = await deps.transport.send({
      operationId: "paystack.transactions.read",
      idempotencyKey: `probe:transactions:${String(dispatchedAt)}`,
      params: {},
      headers,
      correlationId: `paystack-probe-transactions:${String(dispatchedAt)}`,
    });
    const classification = classify(transactions, HOST_PROBE_KEY_REJECTION_CODES.paystack);
    if (classification.outcome !== "CONFIRMED") {
      return buildResult(
        {
          outcome: classification.outcome,
          keyClass,
          failure: classification.failure,
          ambiguityReason: classification.ambiguityReason,
        },
        deps,
        dispatchedAt,
      );
    }
    const body = (transactions.body ?? {}) as { status?: unknown; data?: unknown };
    const data = body.data;
    if (body.status !== true || !Array.isArray(data)) {
      return buildResult(
        { outcome: "UNKNOWN", keyClass, ambiguityReason: "MALFORMED_RESPONSE_AFTER_DISPATCH" },
        deps,
        dispatchedAt,
      );
    }
    const references: string[] = [];
    // (P22-H, ADR-0016 D8) The TRANSACTION-OBSERVED CURRENCIES: the
    // honest funding-fold input — the fold derives a Paystack funding
    // LOCATION per currency the transactions prove the account transacts
    // in (never a balance claim: balances are NOT part of the Paystack
    // read surface, and the fold stays honest about what it derives).
    const transactionCurrencies: string[] = [];
    for (const transaction of data) {
      if (transaction === null || typeof transaction !== "object" || Array.isArray(transaction)) {
        continue;
      }
      const id = (transaction as { id?: unknown }).id;
      if (typeof id === "number" || typeof id === "string") {
        const reference = `txn_${String(id)}`;
        if (!references.includes(reference) && references.length < MAX_REPORTED_TRANSACTIONS) {
          references.push(reference);
        }
      }
      const currency = (transaction as { currency?: unknown }).currency;
      if (
        typeof currency === "string" &&
        /^[A-Za-z]{3}$/.test(currency) &&
        !transactionCurrencies.includes(currency)
      ) {
        transactionCurrencies.push(currency);
      }
    }
    if (references.length === 0 && data.length > 0) {
      return buildResult(
        { outcome: "UNKNOWN", keyClass, ambiguityReason: "MALFORMED_RESPONSE_AFTER_DISPATCH" },
        deps,
        dispatchedAt,
      );
    }
    return buildResult(
      {
        outcome: "CONFIRMED",
        keyClass,
        providerReferences: references,
        balanceCurrencies: transactionCurrencies,
      },
      deps,
      dispatchedAt,
    );
  };
}

/** The probe driver per provider (the member's dispatch table). */
export function hostProbeOf(
  providerId: PaySwapProbeProviderId,
  deps: HostVerificationProbeDeps,
): (material: unknown) => Promise<HostProbeResult> {
  if (providerId === "stripe") {
    return createHostStripeVerificationProbe(deps);
  }
  if (providerId === "flutterwave") {
    return createHostFlutterwaveVerificationProbe(deps);
  }
  return createHostPaystackVerificationProbe(deps);
}
