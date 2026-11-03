/**
 * P27-C — the REAL PAYSTACK AFRICA SANDBOX JOURNEY harness (2026-11-03,
 * ADR-0020 D10/D11; the capability matrix K3/K4 obligations + the P27
 * operator run card §D). Genuine journeys against a REAL Paystack test
 * account over the REAL Paystack HTTPS transport (no fakes, no scripted
 * responses), riding the P27-C product surfaces: the read-only
 * verification probe, the recipient plane (the K3/K4 evidence gate), the
 * collection surface (transaction initialize + the verify read-back),
 * the payout reconcile read-back, and the webhook signature machinery.
 * The gate RUNNERS live in c1-harness-lib.ts (the ≤400-line file law; the
 * scripts/p21 rail-evidence-lib precedent).
 *
 * THE LAWS (the P14/P21/P22/P26 harness precedent, binding):
 * - Credential law: the secret key comes ONLY from PAYSTACK_SECRET_KEY
 *   (the station secret store — the P27 run card's per-business naming is
 *   PAYSTACK_SECRET_KEY_<BUSINESS>; this harness takes the primary
 *   PAYSTACK_SECRET_KEY and records the naming for the TL); never
 *   hardcoded, never logged, never echoed, never in the receipt. Exit 2
 *   without it — the honest pre-gate state; nothing is simulated (never
 *   a silent pass).
 * - INV-25: `sk_live_` is refused at the transport edge AND re-checked
 *   here (exit 1); the deployment stays SANDBOX-only.
 * - Writes are DOUBLE-gated: PAYSTACK_SECRET_KEY AND
 *   PAYSTACK_SANDBOX_WRITES_ENABLED=1 for the collection-initialize and
 *   evidence-pack create journeys (the P26 STRIPE_SANDBOX_WRITES_ENABLED law).
 * - THE K3/K4 LAW: the recipient-type dated-evidence registry ships EMPTY
 *   (the docs were unreachable at the station — every attempt is recorded
 *   in PAYSTACK_RECIPIENT_FACTS_STATION_RECORD). The recipient gate
 *   records the HONEST typed refusal — no unverified
 *   recipient/country/method fact ever dispatches. The one exception is
 *   the operator's full evidence pack (PAYSTACK_RECIPIENT_* env below),
 *   which supplies BOTH halves of the D10 law — the live-doc re-verified
 *   observation (source URL + retrieval date) AND the real-account probe —
 *   in which case the real create dispatches and the receipt records the
 *   account's answer as a REAL_ACCOUNT_PROBE observation the TL may land
 *   in the registry. A fixture-shaped claim is never accepted.
 * - The receipt is machine-scanned: if the JSON contains the secret key
 *   or the webhook secret in any form, the harness REFUSES to emit it.
 *
 * Env keys (recorded for the TL — none are named in the run card beyond
 * the PAYSTACK_SECRET_KEY_<BUSINESS> convention):
 *   PAYSTACK_SECRET_KEY                     the test-mode secret key (sk_test_…)
 *   PAYSTACK_SANDBOX_WRITES_ENABLED=1       the double-gate for the write journeys
 *   PAYSTACK_WEBHOOK_SECRET                 optional — the webhook self-check gate
 *   PAYSTACK_TRANSFER_REFERENCE             optional — the payout reconcile read-back gate
 *   PAYSTACK_RECIPIENT_TYPE                 optional — the evidence pack (candidate type)
 *   PAYSTACK_RECIPIENT_COUNTRY              optional — the evidence pack (market, ISO alpha-2)
 *   PAYSTACK_RECIPIENT_CURRENCY             optional — the evidence pack (currency, ISO 4217)
 *   PAYSTACK_RECIPIENT_SOURCE_URL           optional — the live doc URL the fact was re-verified against
 *   PAYSTACK_RECIPIENT_RETRIEVED_AT         optional — the ISO retrieval date
 *   PAYSTACK_RECIPIENT_NAME                 optional — the created recipient's name
 *   PAYSTACK_RECIPIENT_ACCOUNT_NUMBER       optional — the wire fields the docs require
 *   PAYSTACK_RECIPIENT_BANK_CODE            optional — the wire fields the docs require
 *   PAYSTACK_RECIPIENT_PHONE_NUMBER         optional — the wire fields the docs require
 *   P27C_RECEIPT_PATH                       optional receipt redirect
 *
 * Exit codes: 0 = all non-skipped gates GREEN · 1 = any RED (or a live
 * key refused) · 2 = credentials absent (the honest pre-gate state).
 *
 * Run: npx tsx scripts/p27/c1-paystack-africa-real-sandbox-journey.ts
 */

import { writeFileSync } from "node:fs";

import { PaystackHttpsTransport } from "../../packages/provider-runtime/src/adapters/paystack/https-transport.js";
import {
  p27cK34StationRecord,
  runP27cCollectionGate,
  runP27cInv30PurposeGateLaw,
  runP27cK34RecipientFactsGate,
  runP27cReadOnlyGates,
  runP27cTransferReconcileGate,
  runP27cWebhookSelfCheckGate,
  type P27cGate,
  type P27cRecipientEvidencePack,
} from "./c1-harness-lib.js";

const ENV_KEY = "PAYSTACK_SECRET_KEY";
const ENV_WRITES = "PAYSTACK_SANDBOX_WRITES_ENABLED";
const ENV_WEBHOOK_SECRET = "PAYSTACK_WEBHOOK_SECRET";
const ENV_TRANSFER_REFERENCE = "PAYSTACK_TRANSFER_REFERENCE";
const ENV_RECEIPT = "P27C_RECEIPT_PATH";
const ENV_RECIPIENT = {
  type: "PAYSTACK_RECIPIENT_TYPE",
  country: "PAYSTACK_RECIPIENT_COUNTRY",
  currency: "PAYSTACK_RECIPIENT_CURRENCY",
  sourceUrl: "PAYSTACK_RECIPIENT_SOURCE_URL",
  retrievedAt: "PAYSTACK_RECIPIENT_RETRIEVED_AT",
  name: "PAYSTACK_RECIPIENT_NAME",
  accountNumber: "PAYSTACK_RECIPIENT_ACCOUNT_NUMBER",
  bankCode: "PAYSTACK_RECIPIENT_BANK_CODE",
  phoneNumber: "PAYSTACK_RECIPIENT_PHONE_NUMBER",
} as const;

const secretKey = process.env[ENV_KEY];
const writesEnabled = process.env[ENV_WRITES] === "1";
const webhookSecret = process.env[ENV_WEBHOOK_SECRET];
const transferReference = process.env[ENV_TRANSFER_REFERENCE];

if (secretKey === undefined || secretKey.length === 0) {
  console.error(
    `[P27-C c1] ${ENV_KEY} is not set — the real Paystack Sandbox tier is OPERATOR_GATED and nothing is simulated. ` +
      "Supply the key through the station secret store (the run card's per-business naming is PAYSTACK_SECRET_KEY_<BUSINESS>). Exit 2.",
  );
  process.exit(2);
}
if (secretKey.startsWith("sk_live_")) {
  console.error("[P27-C c1] LIVE KEY REFUSED — this deployment is SANDBOX-only (INV-25). Exit 1.");
  process.exit(1);
}

/** The operator-supplied evidence pack (all-or-nothing: every field or none). */
const recipientEvidencePack: P27cRecipientEvidencePack | undefined = [
  process.env[ENV_RECIPIENT.type],
  process.env[ENV_RECIPIENT.country],
  process.env[ENV_RECIPIENT.currency],
  process.env[ENV_RECIPIENT.sourceUrl],
  process.env[ENV_RECIPIENT.retrievedAt],
  process.env[ENV_RECIPIENT.name],
].every((value) => value !== undefined && value.length > 0)
  ? {
      recipientType: process.env[ENV_RECIPIENT.type] as string,
      country: process.env[ENV_RECIPIENT.country] as string,
      currency: process.env[ENV_RECIPIENT.currency] as string,
      sourceUrl: process.env[ENV_RECIPIENT.sourceUrl] as string,
      retrievedAt: process.env[ENV_RECIPIENT.retrievedAt] as string,
      name: process.env[ENV_RECIPIENT.name] as string,
      accountNumber: process.env[ENV_RECIPIENT.accountNumber],
      bankCode: process.env[ENV_RECIPIENT.bankCode],
      phoneNumber: process.env[ENV_RECIPIENT.phoneNumber],
    }
  : undefined;

/** The real-fetch binding (the host composition's adapter, verbatim). */
const realFetchBinding = async (
  url: string,
  init: { method: "GET" | "POST"; headers: Record<string, string>; body?: string; signal?: AbortSignal },
): Promise<{ status: number; text(): Promise<string> }> => {
  const response = await fetch(url, init);
  return { status: response.status, text: () => response.text() };
};

const transport = new PaystackHttpsTransport({ fetchImpl: realFetchBinding });
const material = { apiKey: secretKey };

async function main(): Promise<number> {
  const gates: P27cGate[] = [];
  const startedAt = new Date().toISOString();

  await runP27cReadOnlyGates({ transport, material, gates });
  await runP27cK34RecipientFactsGate({ transport, material, gates, writesEnabled, evidencePack: recipientEvidencePack });
  await runP27cCollectionGate({ transport, material, gates, writesEnabled });
  await runP27cTransferReconcileGate({ transport, material, gates, transferReference });
  runP27cWebhookSelfCheckGate({ gates, webhookSecret });
  await runP27cInv30PurposeGateLaw({ transport, material, gates });

  const ranAt = new Date().toISOString();
  const redGates = gates.filter((g) => g.result === "RED").length;
  const receipt = {
    harness: "p27-c/c1-paystack-africa-real-sandbox-journey",
    ranAt,
    startedAt,
    tier: "REAL_SANDBOX",
    gates,
    k34StationRecord: p27cK34StationRecord,
    honestNotes: [
      `credential source: the station secret store (${ENV_KEY} env; the run card's per-business convention is PAYSTACK_SECRET_KEY_<BUSINESS>); never chat, never echoed, never in this receipt`,
      `writes were double-gated (${writesEnabled ? "ENABLED" : "NOT ENABLED"}) for the collection + evidence-pack create journeys`,
      "the recipient-type dated-evidence registry ships EMPTY (the K3/K4 station record); no unverified recipient/country/method fact dispatches",
      "a CONFIRMED collection initialize is a payment REQUEST the customer authorizes on the provider's hosted page — never money movement by itself",
      "no live-mode key was accepted (INV-25 re-checked at this harness's own edge)",
      "the webhook gate signs events locally with real secret material — live provider→station delivery is never claimed (no inbound endpoint exists)",
    ],
  };

  // THE SECRET-SCAN LAW: refuse to emit a receipt containing any secret.
  const receiptJson = JSON.stringify(receipt, null, 2);
  const secretStrings = [secretKey, ...(webhookSecret !== undefined ? [webhookSecret] : [])];
  for (const secret of secretStrings) {
    if (secret !== undefined && secret.length > 0 && receiptJson.includes(secret)) {
      console.error("[P27-C c1] SECRET LEAK in the receipt — refusing to emit.");
      process.exit(1);
    }
  }
  const outPath =
    process.env[ENV_RECEIPT] ??
    "docs/productization-evidence/p27-c-c1-paystack-africa-real-sandbox-RECEIPT.json";
  writeFileSync(outPath, receiptJson + "\n");
  console.log(
    `[P27-C c1] ${gates.filter((g) => g.result === "GREEN").length}/${gates.length} gates GREEN (${redGates} RED); receipt → ${outPath}`,
  );
  for (const gate of gates) console.log(`  ${gate.result.padEnd(7)} ${gate.gate}: ${gate.detail}`);
  return redGates === 0 ? 0 : 1;
}

process.exit(await main());
