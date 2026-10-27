/**
 * PaySwap Desktop (P21-D, ADR-0014 D10 — the bridge battery) — the
 * JOURNEY CONVERSATION fixtures (split from ./p21-journey-bridge.test.ts
 * at the ≤400-line file law): the operator's nine conversational answers
 * (the merchant-directory facts + the FLW-wallet funding of the original
 * intent), the wait re-check's scripted world (a fresh liquidity
 * opportunity at the journey's own instant + the ConsentLedger's own
 * GRANTED consent — never a forged record), the composer's in-memory
 * task-store storage, and the compiled intent's 11-key shape.
 */

import type { AgentTaskSessionStorage } from "@payswap/app";

// The REAL opportunities machinery (test-tier relative imports — the
// wait-recheck composition battery's own pattern).
import { ConsentLedger } from "../../../opportunities/src/consent.ts";
import { MATCH_PRIVACY_AUDIT_FIELDS } from "../../../opportunities/src/matching.ts";
import { discoverOpportunity } from "../../../opportunities/src/discovery.ts";
import type { ConsentSnapshot } from "../../../opportunities/src/consent.ts";
import type { FinancialOpportunity } from "../../../opportunities/src/model.ts";
import { healthyLiquidityObservation } from "../../../opportunities/test/fixtures-catalog.ts";

import { T0 } from "./p21-journey-bridge-fixtures.js";

/** The journey's own clock domain (the pinned mission instant). */
export const JOURNEY_AT = Date.parse(T0);

/** A fresh liquidity opportunity observed at the journey's own instant (the re-check's scripted match). */
export function journeyOpportunity(): FinancialOpportunity {
  return discoverOpportunity(
    { ...healthyLiquidityObservation(), freshness: { asOfMs: JOURNEY_AT, maxAgeMs: 30_000 } },
    JOURNEY_AT,
  );
}

/** The GRANTED consent (the ConsentLedger's own grant path — never a forged record). */
export function journeyConsent(): ConsentSnapshot {
  const ledger = new ConsentLedger();
  ledger.grant(
    "principal:operator",
    { fields: [...MATCH_PRIVACY_AUDIT_FIELDS], purpose: "the P21-D bridge battery's wait re-check discloses the six audit fields only" },
    JOURNEY_AT - 60_000,
  );
  return ledger.snapshot("principal:operator");
}

/** The composer's in-memory task-store storage (with the determinism dump). */
export function journeyStorage(): { readonly storage: AgentTaskSessionStorage; readonly dump: () => string } {
  const data = new Map<string, string>();
  return {
    storage: { getItem: (k) => (data.has(k) ? data.get(k)! : null), setItem: (k, v) => void data.set(k, v) },
    dump: () => JSON.stringify([...data.entries()].sort(([a], [b]) => (a < b ? -1 : 1))),
  };
}

/** The operator's nine answers (the merchant-directory facts + the FLW-wallet funding of the original intent). */
export const REPLIES: Readonly<Record<string, string>> = {
  amountAndCurrency: "50000000 NGN",
  fundingSource: "Flutterwave NGN wallet (test)",
  recipient: "Merchant X (Stripe-only test)",
  countryCorridor: "NG US USD",
  speedDeadline: "2026-10-28T12:00:00Z",
  feeCap: "capped 100 USD",
  purpose: "supplier invoice 42",
  privacyCompliance: "none",
  partialPaymentPreference: "full",
};

/** The compiled canonical intent's exact 11-key shape (the typed-intent law). */
export const INTENT_KEYS = [
  "intentId", "principalRef", "origin", "destination", "originAmount", "arrivalCurrency",
  "constraints", "intentAuthorizationRef", "declaredAt", "expiresAt", "commerceRef",
].sort();

/** The journey's observable outcome (the determinism replay's comparison surface). */
export interface JourneyOutcome {
  readonly taskStore: string;
  readonly missionStore: string;
  readonly viewDigest: string;
}
