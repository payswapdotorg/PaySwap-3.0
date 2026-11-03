/**
 * P27-C — the c1 harness LIBRARY (2026-11-03, ADR-0020 D10/D11): the gate
 * runners of the real Paystack Africa Sandbox journey, split from
 * c1-paystack-africa-real-sandbox-journey.ts per the ≤400-line file law
 * (the scripts/p21 rail-evidence-lib precedent). The LAWS live in the
 * harness file's header; this lib holds ONLY the runners — each returns
 * typed gate records, never throws outward (a throw IS a RED gate), and
 * never handles a secret beyond the frame it receives.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import type { ProviderTransport } from "../../packages/provider-runtime/src/transport.js";
import { SystemRuntimeClock } from "../../packages/provider-runtime/src/clock.js";
import {
  createPaystackVerificationProbe,
  createPaystackCollectionExecution,
  createPaystackRecipientExecution,
  createPaystackTransferProductLane,
  createPaystackWebhookVerificationModule,
  createInMemoryPaystackWebhookConsumedStore,
  buildPaystackTransferRecipientRequest,
  validatePaystackRecipientTypeEvidence,
  PAYSTACK_RECIPIENT_FACTS_STATION_RECORD,
} from "../../packages/provider-runtime/src/index.js";
import type { PaystackWebhookCrypto } from "../../packages/provider-runtime/src/adapters/paystack/webhook-signature.js";

/** One typed gate record (the receipt's unit of evidence). */
export interface P27cGate {
  readonly gate: string;
  readonly result: "GREEN" | "RED" | "SKIPPED";
  readonly detail: string;
}

/** The operator-supplied recipient evidence pack (all-or-nothing). */
export interface P27cRecipientEvidencePack {
  readonly recipientType: string;
  readonly country: string;
  readonly currency: string;
  readonly sourceUrl: string;
  readonly retrievedAt: string;
  readonly name: string;
  readonly accountNumber?: string;
  readonly bankCode?: string;
  readonly phoneNumber?: string;
}

/** The real node:crypto binding for the webhook gate (the F-2 edge seam). */
export const p27cRealCrypto: PaystackWebhookCrypto = {
  hmacSha512Hex(key: string, message: string): string {
    return createHmac("sha512", key).update(message, "utf8").digest("hex");
  },
  timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  },
};

/** The station's K3/K4 record, carried in the receipt (the honest state). */
export const p27cK34StationRecord = {
  conclusion: PAYSTACK_RECIPIENT_FACTS_STATION_RECORD.conclusion,
  attemptedAt: PAYSTACK_RECIPIENT_FACTS_STATION_RECORD.attemptedAt,
  attempts: PAYSTACK_RECIPIENT_FACTS_STATION_RECORD.attempts.length,
  note: "the registry ships empty; the typed request gate refuses every recipient create until the live-doc re-verification + the real-account probe land dated observations",
};

/** Wrap one gate runner: a throw IS a RED gate (never an abort). */
async function guarded(gates: P27cGate[], name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    gates.push({ gate: name, result: "RED", detail: `threw: ${String(error)}` });
  }
}

/**
 * G1 — the read-only verification probe (the only path to ACTIVE) and
 * G2 — the recipient-plane LIST read-back (the real-account
 * transfer-recipient API probe — a READ).
 */
export async function runP27cReadOnlyGates(deps: {
  readonly transport: ProviderTransport;
  readonly material: unknown;
  readonly gates: P27cGate[];
}): Promise<void> {
  const clock = new SystemRuntimeClock();
  const probe = createPaystackVerificationProbe({ transport: deps.transport, clock, executionMode: "SANDBOX" });
  const recipientPlane = createPaystackRecipientExecution({
    transport: deps.transport,
    clock,
    executionMode: "SANDBOX",
  });
  await guarded(deps.gates, "G1_READ_ONLY_PROBE", async () => {
    const result = await probe(deps.material);
    deps.gates.push(
      result.outcome === "CONFIRMED"
        ? {
            gate: "G1_READ_ONLY_PROBE",
            result: "GREEN",
            detail: `GET /transaction CONFIRMED through the real transport inside the seal (${result.providerReferences.length} transaction references read; mode ${result.executionMode}/${result.transportClass})`,
          }
        : {
            gate: "G1_READ_ONLY_PROBE",
            result: "RED",
            detail:
              result.outcome === "UNKNOWN"
                ? `probe UNKNOWN (${result.ambiguityReason}) — reconcile by running the read-only probe again before anything else (INV-04)`
                : `probe FAILED [${result.failure?.code}] ${result.failure?.message}${result.failure?.keyRejected ? " (the key itself was rejected)" : ""}`,
          },
    );
  });
  await guarded(deps.gates, "G2_RECIPIENT_LIST_READBACK", async () => {
    const result = await recipientPlane.list(deps.material);
    deps.gates.push(
      result.outcome === "CONFIRMED"
        ? {
            gate: "G2_RECIPIENT_LIST_READBACK",
            result: "GREEN",
            detail: `GET /transferrecipient CONFIRMED — the account's own recipient list read back (${result.observedCount} recipients; first code ${result.recipientCode ?? "none"})`,
          }
        : {
            gate: "G2_RECIPIENT_LIST_READBACK",
            result: "RED",
            detail: `list → ${result.outcome}${result.failure !== undefined ? ` [${result.failure.code}] ${result.failure.message}` : result.ambiguityReason !== undefined ? ` (${result.ambiguityReason})` : ""}`,
          },
    );
  });
}

/**
 * G3 — THE K3/K4 RECIPIENT FACTS GATE (the load-bearing law): without the
 * operator's evidence pack the shipped (EMPTY) registry must make the
 * typed request builder REFUSE (the gate holding is GREEN — the honest
 * state); with the full pack + the writes double-gate the real create
 * dispatches and the account's answer is recorded as the
 * REAL_ACCOUNT_PROBE half of a dated observation (the TL may land it).
 */
export async function runP27cK34RecipientFactsGate(deps: {
  readonly transport: ProviderTransport;
  readonly material: unknown;
  readonly gates: P27cGate[];
  readonly writesEnabled: boolean;
  readonly evidencePack: P27cRecipientEvidencePack | undefined;
}): Promise<void> {
  await guarded(deps.gates, "G3_K34_RECIPIENT_FACTS_GATE", async () => {
    if (deps.evidencePack === undefined) {
      let refused = false;
      let refusalDetail = "";
      try {
        buildPaystackTransferRecipientRequest({
          recipientType: "kepss",
          name: "probe-refusal-only-never-dispatched",
          country: "KE",
          currency: "KES",
        });
      } catch (refusal) {
        refused = String(refusal).includes("UNVERIFIED");
        refusalDetail = String(refusal).slice(0, 240);
      }
      deps.gates.push({
        gate: "G3_K34_RECIPIENT_FACTS_GATE",
        result: refused ? "GREEN" : "RED",
        detail: refused
          ? "the typed request builder REFUSED the recipient create (PAYSTACK_RECIPIENT_TYPE_UNVERIFIED — the registry ships empty per the station record; nothing unverified dispatches). Supply the evidence pack (PAYSTACK_RECIPIENT_* env) + the writes gate to run the real create."
          : `the typed request builder did NOT refuse on the empty registry — THE GATE LEAKED: ${refusalDetail}`,
      });
      return;
    }
    if (!deps.writesEnabled) {
      deps.gates.push({
        gate: "G3_K34_RECIPIENT_FACTS_GATE",
        result: "SKIPPED",
        detail: "PAYSTACK_SANDBOX_WRITES_ENABLED=1 not set — the evidence-pack create stays operator-gated (never a silent pass)",
      });
      return;
    }
    const pack = deps.evidencePack;
    const observation = validatePaystackRecipientTypeEvidence({
      recipientType: pack.recipientType,
      country: pack.country,
      currency: pack.currency,
      status: "VERIFIED_AVAILABLE",
      sourceUrl: pack.sourceUrl,
      retrievedAt: pack.retrievedAt,
      evidenceTier: "REAL_ACCOUNT_PROBE",
      requiredFields: [
        ...new Set(
          [
            pack.accountNumber !== undefined ? "account_number" : undefined,
            pack.bankCode !== undefined ? "bank_code" : undefined,
            pack.phoneNumber !== undefined ? "phone_number" : undefined,
            "name",
          ].filter((field): field is string => field !== undefined),
        ),
      ],
    });
    const planeWithPack = createPaystackRecipientExecution({
      transport: deps.transport,
      clock: new SystemRuntimeClock(),
      executionMode: "SANDBOX",
      evidenceRegistry: [observation],
    });
    const created = await planeWithPack.create(deps.material, {
      recipientType: pack.recipientType,
      name: pack.name,
      country: pack.country,
      currency: pack.currency,
      ...(pack.accountNumber !== undefined ? { accountNumber: pack.accountNumber } : {}),
      ...(pack.bankCode !== undefined ? { bankCode: pack.bankCode } : {}),
      ...(pack.phoneNumber !== undefined ? { phoneNumber: pack.phoneNumber } : {}),
    });
    deps.gates.push({
      gate: "G3_K34_RECIPIENT_FACTS_GATE",
      result: created.outcome === "CONFIRMED" ? "GREEN" : "RED",
      detail:
        created.outcome === "CONFIRMED"
          ? `REAL_ACCOUNT_PROBE: the real create answered recipient code ${created.recipientCode} (type ${created.recipientType}) — the dated observation candidate for the registry: (${pack.recipientType}, ${pack.country}, ${pack.currency}) re-verified ${pack.retrievedAt} from ${pack.sourceUrl}`
          : `create → ${created.outcome}${created.failure !== undefined ? ` [${created.failure.code}] ${created.failure.message}` : ""}`,
    });
  });
}

/** G4 — the COLLECTION journey (writes DOUBLE-gated): initialize (a payment
 * REQUEST the customer still authorizes on the provider's hosted page —
 * never money movement) + the verify read-back. */
export async function runP27cCollectionGate(deps: {
  readonly transport: ProviderTransport;
  readonly material: unknown;
  readonly gates: P27cGate[];
  readonly writesEnabled: boolean;
}): Promise<void> {
  const clock = new SystemRuntimeClock();
  const collection = createPaystackCollectionExecution({ transport: deps.transport, clock, executionMode: "SANDBOX" });
  if (!deps.writesEnabled) {
    deps.gates.push({
      gate: "G4_COLLECTION_JOURNEY",
      result: "SKIPPED",
      detail: "PAYSTACK_SANDBOX_WRITES_ENABLED=1 not set — the collection write tier stays operator-gated (never a silent pass)",
    });
    return;
  }
  await guarded(deps.gates, "G4_COLLECTION_JOURNEY", async () => {
    const reference = `p27c-c1-collection-${Date.now()}`;
    const initialized = await collection.initializeTransaction(deps.material, {
      purposeClass: "GENUINE_COMMERCE",
      email: "p27c-harness@example.test",
      amountMinorUnits: "50000",
      currency: "kes",
      reference,
    });
    if (initialized.outcome !== "CONFIRMED" || initialized.authorizationUrl === null) {
      deps.gates.push({
        gate: "G4_COLLECTION_JOURNEY",
        result: "RED",
        detail: `initialize → ${initialized.outcome}${initialized.failure !== undefined ? ` [${initialized.failure.code}] ${initialized.failure.message}` : initialized.ambiguityReason !== undefined ? ` (${initialized.ambiguityReason})` : " (no hosted-page URL)"}`,
      });
      return;
    }
    const readBack = await collection.verifyTransaction(deps.material, reference);
    deps.gates.push({
      gate: "G4_COLLECTION_JOURNEY",
      result: readBack.outcome === "CONFIRMED" ? "GREEN" : "RED",
      detail: `initialize CONFIRMED (a payment REQUEST — confirmedPaid stays ${String(initialized.confirmedPaid)}) → the hosted page answered → verify read-back ${readBack.outcome} (status ${readBack.transactionStatus ?? "none"}; confirmedPaid ${String(readBack.confirmedPaid)} — money moves only when the customer completes the hosted authorization and the provider's evidence says so)`,
    });
  });
}

/** G5 — the payout RECONCILE read-back (INV-04's honest resolve path). */
export async function runP27cTransferReconcileGate(deps: {
  readonly transport: ProviderTransport;
  readonly material: unknown;
  readonly gates: P27cGate[];
  readonly transferReference: string | undefined;
}): Promise<void> {
  if (deps.transferReference === undefined || deps.transferReference.length === 0) {
    deps.gates.push({
      gate: "G5_TRANSFER_RECONCILE_READBACK",
      result: "SKIPPED",
      detail: "PAYSTACK_TRANSFER_REFERENCE not set — the payout reconcile read-back stays operator-gated (supply a real transfer reference to run it)",
    });
    return;
  }
  const lane = createPaystackTransferProductLane({
    transport: deps.transport,
    clock: new SystemRuntimeClock(),
    executionMode: "SANDBOX",
  });
  await guarded(deps.gates, "G5_TRANSFER_RECONCILE_READBACK", async () => {
    const state = await lane.reconcile(deps.material, deps.transferReference as string);
    const kind = state.kind;
    deps.gates.push({
      gate: "G5_TRANSFER_RECONCILE_READBACK",
      result: kind === "CONFIRMED_FINAL" || kind === "INITIATED_PENDING_FINALIZE" ? "GREEN" : "RED",
      detail:
        kind === "CONFIRMED_FINAL"
          ? `verify read-back: CONFIRMED_FINAL (the provider's own success status; code ${state.transferCode ?? "none"})`
          : kind === "INITIATED_PENDING_FINALIZE"
            ? `verify read-back: INITIATED_PENDING_FINALIZE (the provider's raw status '${state.rawStatus}' carried verbatim — the OTP/finalize step completes it; never a guessed finality)`
            : `verify read-back → ${kind}`,
    });
  });
}

/** G6 — the WEBHOOK SIGNATURE self-check (real secret material; events are
 * signed LOCALLY — the machinery is verified; live provider→station
 * delivery is never claimed: no inbound endpoint exists). */
export function runP27cWebhookSelfCheckGate(deps: {
  readonly gates: P27cGate[];
  readonly webhookSecret: string | undefined;
}): void {
  if (deps.webhookSecret === undefined || deps.webhookSecret.length === 0) {
    deps.gates.push({
      gate: "G6_WEBHOOK_SIGNATURE_SELF_CHECK",
      result: "SKIPPED",
      detail: "PAYSTACK_WEBHOOK_SECRET not set — the webhook self-check stays operator-gated (never a silent pass)",
    });
    return;
  }
  try {
    const module_ = createPaystackWebhookVerificationModule({
      webhookSecret: deps.webhookSecret,
      crypto: p27cRealCrypto,
      consumedStore: createInMemoryPaystackWebhookConsumedStore(),
    });
    const chargeBody = JSON.stringify({
      event: "charge.success",
      data: { reference: "p27c-c1-selfcheck", status: "success", amount: 50000, currency: "KES" },
    });
    const signature = p27cRealCrypto.hmacSha512Hex(deps.webhookSecret, chargeBody);
    const verified = module_({ signatureHeader: signature, body: chargeBody });
    const replay = module_({ signatureHeader: signature, body: chargeBody });
    const tampered = module_({
      signatureHeader: signature,
      body: JSON.stringify({
        event: "charge.success",
        data: { reference: "p27c-c1-selfcheck", status: "success", amount: 999999, currency: "KES" },
      }),
    });
    const ok =
      verified.kind === "VERIFIED" &&
      verified.event.eventName === "charge.success" &&
      replay.kind === "REFUSED" &&
      replay.refusal.kind === "EVENT_ALREADY_CONSUMED" &&
      tampered.kind === "REFUSED" &&
      tampered.refusal.kind === "SIGNATURE_INVALID";
    deps.gates.push({
      gate: "G6_WEBHOOK_SIGNATURE_SELF_CHECK",
      result: ok ? "GREEN" : "RED",
      detail: ok
        ? "the claimed scheme verified a locally-signed charge.success event with REAL secret material; the replay was refused EVENT_ALREADY_CONSUMED and the tampered body SIGNATURE_INVALID (the machinery; live provider→station delivery is never claimed — no inbound endpoint exists)"
        : `self-check failed: verified=${verified.kind}, replay=${replay.kind}, tampered=${tampered.kind}`,
    });
  } catch (error) {
    deps.gates.push({ gate: "G6_WEBHOOK_SIGNATURE_SELF_CHECK", result: "RED", detail: `threw: ${String(error)}` });
  }
}

/** G7 — the INV-30 PURPOSE GATE law (in-process, no wire): a
 * REGULATED_REMITTANCE_P2P purpose and an UNCLASSIFIED one both refuse
 * with typed refusals at BOTH product-lane seams, before any dispatch. */
export async function runP27cInv30PurposeGateLaw(deps: {
  readonly transport: ProviderTransport;
  readonly material: unknown;
  readonly gates: P27cGate[];
}): Promise<void> {
  const clock = new SystemRuntimeClock();
  const lane = createPaystackTransferProductLane({ transport: deps.transport, clock, executionMode: "SANDBOX" });
  const collection = createPaystackCollectionExecution({ transport: deps.transport, clock, executionMode: "SANDBOX" });
  await guarded(deps.gates, "G7_INV30_PURPOSE_GATE_LAW", async () => {
    let transferRefusal = "";
    let collectionRefusal = "";
    try {
      await lane.runPayout(deps.material, {
        purposeClass: "REGULATED_REMITTANCE_P2P",
        amountMinorUnits: "1000",
        currency: "kes",
        recipient: "RCP_never_reached",
      });
    } catch (refusal) {
      transferRefusal = String(refusal);
    }
    try {
      await collection.initializeTransaction(deps.material, {
        purposeClass: "UNCLASSIFIED",
        email: "p27c-harness@example.test",
        amountMinorUnits: "1000",
        currency: "kes",
        reference: "p27c-c1-never-dispatched",
      });
    } catch (refusal) {
      collectionRefusal = String(refusal);
    }
    const held =
      transferRefusal.includes("INV-30") &&
      transferRefusal.includes("regulated remittance") &&
      collectionRefusal.includes("INV-30");
    deps.gates.push({
      gate: "G7_INV30_PURPOSE_GATE_LAW",
      result: held ? "GREEN" : "RED",
      detail: held
        ? "the typed purpose gate refused a REGULATED_REMITTANCE_P2P payout purpose and an UNCLASSIFIED collection purpose BEFORE any dispatch (a business payout lane is not a personal wallet; relabeling never changes eligibility)"
        : `the purpose gate did not hold: transfer refusal='${transferRefusal.slice(0, 120)}' collection refusal='${collectionRefusal.slice(0, 120)}'`,
    });
  });
}
