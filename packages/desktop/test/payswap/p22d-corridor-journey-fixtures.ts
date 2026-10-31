/**
 * PaySwap Desktop (P22-D, ADR-0016 D10/D12 — the corridor bridge battery)
 * — the CORRIDOR-JOURNEY world fixtures (the p21-journey-bridge-fixtures
 * precedent, grown to the corridor's three-provider plane).
 *
 * THE WORLD: the REAL host stack over a SCRIPTED provider transport
 * (hermetic — no network, fixed clocks, deterministic mints):
 *
 * - the connection-ACTIVATION members over the REAL authority + the
 *   REAL probe runners — FLW (the GHS wallet observation), Paystack
 *   (the KES-observed transactions), and the stellar:testnet rail
 *   (the keypair seal + the Horizon account read with the
 *   issuer-scoped USDC position — the corridor's observed middle);
 * - the payment-mission runtime over the LANE-AWARE execution
 *   authority (the REAL per-provider kernels — Stripe, the Paystack
 *   payout lane, the Stellar onchain rail — riding the SAME scripted
 *   fetch);
 * - the nine-field corridor intake through the channel members (the
 *   funding source grounded in the OBSERVED FLW GHS wallet; the
 *   recipient grounded in the merchant directory's KES entry).
 *
 * The REAL-transport tier stays the rail-evidence harness's
 * (scripts/p21/rail-evidence-real-flow-e2e.ts — operator-gated on the
 * re-supply of secrets/payment-providers.env; nothing here claims a
 * live provider operation).
 */

import { createPaySwapDesktopService } from "../../src/host/payswap/shell/service.js";
import { openPaymentMissionStore } from "../../src/host/payswap/payments/payment-mission-store.js";
import {
  createPaymentMissionRuntime,
  type PaymentMissionRuntime,
} from "../../src/host/payswap/payments/payment-mission-runtime.js";
import { createLaneAwareExecutionAuthority } from "../../src/host/payswap/payments/execution-lane-composition.js";
import type { ConnectionSessionAuthority } from "../../src/host/payswap/connections/index.js";
import type { ProbeEvidenceStore } from "../../src/host/payswap/connections/probe-evidence.js";
import type { BridgeDerivation } from "../../src/host/payswap/connections/capability-bridge.js";
import type { PaymentGateEnvironment } from "../../src/host/payswap/payments/validation-gates.js";
import {
  FAKE_FLW_KEY,
  FAKE_PAYSTACK_KEY,
  FLW_BALANCES_URL,
  PAYSTACK_TRANSACTIONS_URL,
  probeWorld,
  type World,
} from "./connections-probe-plane-fixtures.js";
// The corridor's pinned issuer (the route-compiler fixtures own the
// corridor facts — the seeded plane observes THE SAME issuer-scoped
// asset the compile pins; never invented twice).
import { CORRIDOR_USDC_ISSUER_G } from "../../../route-compiler/test/corridor-fixtures.ts";

/* --------------------------- the pinned instants --------------------------- */

export const T0 = "2026-10-30T12:00:00Z";
export const T1 = "2026-10-30T12:05:00Z";
/** The probe/kernel edge clock (the fixtures' own pinned ms). */
export const NOW_MS = 1_000_000;

/* ------------- the fake stellar material + the canonical references ------------- */

/** A canonical fake StrKey account id (G + 55 base32 chars — test material ONLY). */
const FAKE_G_ACCOUNT = "G" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".repeat(2).slice(0, 55);
/** A canonical fake StrKey secret (S + 55 base32 chars — test material ONLY). */
const FAKE_S_SECRET = "S" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".repeat(2).slice(0, 55);
/** The observed deployed-contract id (C + 55 base32 chars — test material ONLY). */
export const FAKE_C_CONTRACT = "C" + "DEFGHIJKLMNOPQRSTUVWXYZAB234567".repeat(2).slice(0, 55);
/** The canonical Stellar transaction hash the scripted tier answers. */
export const CORRIDOR_TX_HASH = "tx_p22d_hash_0001";
/** The Paystack transfer reference/code the scripted tier answers. */
export const CORRIDOR_TRANSFER_REFERENCE = "ref_p22d_transfer";
export const CORRIDOR_TRANSFER_CODE = "TRF_p22dx";

/* --------------------------- the scripted URLs --------------------------- */

export const HORIZON_ACCOUNT_URL = `https://horizon-testnet.stellar.org/accounts/${FAKE_G_ACCOUNT}`;
export const PAYSTACK_TRANSFER_URL = "https://api.paystack.co/transfer";
export const PAYSTACK_VERIFY_URL = `https://api.paystack.co/transfer/${CORRIDOR_TRANSFER_REFERENCE}`;
export const STELLAR_TRANSACTIONS_URL = "https://horizon-testnet.stellar.org/transactions";
export const STELLAR_TX_URL = `https://horizon-testnet.stellar.org/transactions/${CORRIDOR_TX_HASH}`;
export const STELLAR_OPS_URL = `https://horizon-testnet.stellar.org/transactions/${CORRIDOR_TX_HASH}/operations`;

/** Script the canonical answers the corridor journey rides (probe + execution + read-back). */
export function scriptCorridorFetch(world: World): void {
  // FLW: the GHS wallet (the corridor's funding-source observation).
  world.fetchScript.set(FLW_BALANCES_URL, {
    status: 200,
    body: JSON.stringify({
      status: "success",
      data: [
        { currency: "GHS", available_balance: 1000, ledger_balance: 1000 },
        { currency: "NGN", available_balance: 500, ledger_balance: 500 },
      ],
    }),
  });
  // Paystack: the KES-observed transactions (the off-ramp's funding fold).
  world.fetchScript.set(PAYSTACK_TRANSACTIONS_URL, {
    status: 200,
    body: JSON.stringify({ status: true, data: [{ id: 2001, currency: "KES", status: "success" }] }),
  });
  // Stellar: the issuer-scoped USDC position (the corridor's observed middle).
  world.fetchScript.set(HORIZON_ACCOUNT_URL, {
    status: 200,
    body: JSON.stringify({
      id: FAKE_G_ACCOUNT,
      sequence: "1234567890",
      balances: [
        { balance: "1000.0000000", asset_type: "native" },
        {
          balance: "125.0000000",
          asset_type: "credit_alphanum4",
          asset_code: "USDC",
          asset_issuer: CORRIDOR_USDC_ISSUER_G,
        },
      ],
    }),
  });
  // The execution answers (the Paystack transfer initiate + the Stellar submissions).
  world.fetchScript.set(PAYSTACK_TRANSFER_URL, {
    status: 200,
    body: JSON.stringify({
      status: true,
      message: "Transfer created",
      data: { reference: CORRIDOR_TRANSFER_REFERENCE, transfer_code: CORRIDOR_TRANSFER_CODE, status: "pending" },
    }),
  });
  world.fetchScript.set(STELLAR_TRANSACTIONS_URL, {
    status: 200,
    body: JSON.stringify({ id: CORRIDOR_TX_HASH, success: true }),
  });
  // The authoritative read-back answers (the transfer verify + the tx/ops reads).
  world.fetchScript.set(PAYSTACK_VERIFY_URL, {
    status: 200,
    body: JSON.stringify({
      status: true,
      message: "Transfer retrieved",
      data: { reference: CORRIDOR_TRANSFER_REFERENCE, transfer_code: CORRIDOR_TRANSFER_CODE, status: "success" },
    }),
  });
  world.fetchScript.set(STELLAR_TX_URL, {
    status: 200,
    body: JSON.stringify({ id: CORRIDOR_TX_HASH, success: true }),
  });
  world.fetchScript.set(STELLAR_OPS_URL, {
    status: 200,
    body: JSON.stringify({
      _embedded: { records: [{ type: "invoke_host_function", address: FAKE_C_CONTRACT }] },
    }),
  });
}

/* ------------------- the corridor-shaped nine-field intake ------------------- */

/** The intake answers (the corridor dispatch battery's values, grounded in the observed world). */
export const CORRIDOR_INTAKE_ANSWERS: Readonly<Record<string, unknown>> = Object.freeze({
  amountAndCurrency: { minorUnits: "100000", currency: "GHS" },
  fundingSource: "Flutterwave GHS wallet (test)",
  recipient: "Merchant Y (Paystack KES bank-transfer test)",
  countryCorridor: { sourceCountry: "GH", destinationCountry: "KE", destinationCurrency: "KES" },
  speedDeadline: { deadlineAt: "2026-10-31T12:00:00Z" },
  feeCap: { kind: "CAPPED", amount: { minorUnits: "100", currency: "GHS" } },
  purpose: "corridor payout",
  privacyCompliance: { kind: "CONSTRAINED", notes: "no special constraints" },
  partialPaymentPreference: { kind: "REQUIRE_FULL" },
});

/** Drive the nine-field intake through the channel members (returns the asked order). */
export async function captureCorridorIntake(
  service: ReturnType<typeof createPaySwapDesktopService>,
  missionId: string,
): Promise<readonly string[]> {
  const asked: string[] = [];
  for (let round = 0; round < 12; round += 1) {
    const ask = await service.paymentMissionAskNextField(missionId);
    if (ask === null) break;
    asked.push(ask.fieldId);
    await service.paymentMissionCapture(
      missionId,
      ask.fieldId as never,
      CORRIDOR_INTAKE_ANSWERS[ask.fieldId],
    );
  }
  return asked;
}

/* ------------------------ the 3-provider seeding ------------------------ */

/**
 * Seed the corridor's THREE connections ACTIVE through the REAL member
 * paths (the probe-evidence pattern): FLW (the GHS wallet), Paystack
 * (the KES transactions), and the stellar:testnet rail (the keypair
 * seal + the Horizon account read observing the issuer-scoped USDC).
 */
export async function seedCorridorConnections(world: World): Promise<{
  readonly authority: ConnectionSessionAuthority;
  readonly evidenceStore: ProbeEvidenceStore;
  readonly flutterwaveConnectionId: string;
  readonly paystackConnectionId: string;
  readonly stellarConnectionId: string;
}> {
  const { ctx, evidenceStore, service } = await probeWorld(world);
  const flw = await service.connectionSeedSetup({
    providerId: "flutterwave",
    useCaseRef: "own-store-test-mode",
  });
  if (flw.kind !== "CREATED") throw new Error("the flutterwave seed failed");
  await service.connectionSubmitFlutterwaveSecretKey({
    connectionId: flw.connectionId,
    secretKey: FAKE_FLW_KEY,
  });
  const paystack = await service.connectionSeedSetup({
    providerId: "paystack",
    useCaseRef: "own-store-test-mode",
  });
  if (paystack.kind !== "CREATED") throw new Error("the paystack seed failed");
  await service.connectionSubmitPaystackSecretKey({
    connectionId: paystack.connectionId,
    secretKey: FAKE_PAYSTACK_KEY,
  });
  const stellar = await service.connectionSeedSetup({
    providerId: "stellar:testnet",
    useCaseRef: "testnet-keypair-wallet",
  });
  if (stellar.kind !== "CREATED") throw new Error("the stellar rail seed failed");
  await service.connectionSubmitStellarSecretKey({
    connectionId: stellar.connectionId,
    publicKey: FAKE_G_ACCOUNT,
    secretKey: FAKE_S_SECRET,
  });
  for (const providerId of ["flutterwave", "paystack"] as const) {
    const outcome = await service.connectionRunVerificationProbe(providerId);
    if (outcome.results.find((row) => row.state === "ACTIVE") === undefined) {
      throw new Error(`the ${providerId} probe did not confirm a connection`);
    }
  }
  const stellarProbe = await service.connectionRunStellarAccountReadProbe();
  if (stellarProbe.results.find((row) => row.state === "ACTIVE") === undefined) {
    throw new Error("the stellar account-read probe did not confirm the rail connection");
  }
  return {
    authority: ctx.authority,
    evidenceStore,
    flutterwaveConnectionId: flw.connectionId,
    paystackConnectionId: paystack.connectionId,
    stellarConnectionId: stellar.connectionId,
  };
}

/**
 * The PLANNING-TIER gate environment (the operator's explicit act on the
 * COMPILED corridor plan — ADR-0016 D10): every observed fact derives
 * from the REAL bridge (the funding folds, the merchant destinations,
 * the connected scopes); the corridor projection is the compiled plan's
 * own route; the quote grounds in the compiled plan's exact conversions
 * (rule:ghs-usdc + rule:usdc-kes — never an invented rate). The
 * channel's declared corridor (US→US only) BLOCKS the corridor ask —
 * asserted FIRST in the battery — this environment never rewrites that
 * truth; it is the planning tier's own composition, disclosed as such.
 */
export function corridorPlanningEnvironment(input: {
  readonly now: string;
  readonly bridge: BridgeDerivation;
  readonly planId: string;
  /** The operator's kernel-served executing connection (the payout lane's own connection). */
  readonly executingConnectionId: string;
  readonly corridor: {
    readonly sourceCountry: string;
    readonly destinationCountry: string;
    readonly destinationCurrency: string;
  };
}): PaymentGateEnvironment {
  const serves = (query: {
    readonly sourceCountry: string;
    readonly destinationCountry: string;
    readonly destinationCurrency: string;
  }) =>
    query.sourceCountry === input.corridor.sourceCountry &&
    query.destinationCountry === input.corridor.destinationCountry &&
    query.destinationCurrency === input.corridor.destinationCurrency;
  return {
    observedFundingSources: input.bridge.fundingSources,
    observedDestinations: input.bridge.destinations,
    corridorProjection: {
      projectCorridor: (query: {
        readonly sourceCountry: string;
        readonly destinationCountry: string;
        readonly sourceCurrency: string;
        readonly destinationCurrency: string;
        readonly asOf: string;
      }) => ({
        evaluatedAsOf: query.asOf,
        routeIds: serves(query) ? [input.planId] : [],
        eligibleRouteIds: serves(query) ? [input.planId] : [],
        exclusions: serves(query)
          ? []
          : [
              {
                code: "NO_ROUTE_FOR_CORRIDOR",
                message:
                  "the compiled corridor plan serves the pinned GH→KE GHS→KES corridor only (the planning tier's own route — never an invented lane)",
              },
            ],
      }),
    },
    freshQuote: {
      quoteId: `quote:${input.planId}`,
      quoteVersion: "v1",
      sourceAmount: { minorUnits: "100000", currency: "GHS" },
      targetAmount: { minorUnits: "1612500", currency: "KES" },
      feeLines: [],
      rate: {
        value: "16.125",
        provenance:
          "the compiled corridor plan's grounded conversions (rule:ghs-usdc + rule:usdc-kes — never an invented rate)",
        asOf: input.now,
      },
      expiry: { at: "2026-11-06T12:00:00Z", onExpiry: "REVALIDATE_REQUIRED" },
      delivery: { kind: "ESTIMATE", estimateLabel: "the corridor's compiled estimate" },
      conditions: { rateLocked: true, refreshAvailable: false, materialChangePolicy: "revalidate" },
    },
    declaredLimits: {
      minimum: { currency: "GHS", minorUnits: "1" },
      maximum: { currency: "GHS", minorUnits: "100000000" },
    },
    connectedScopes: [
      ...input.bridge.connectedScopes,
      // THE PAYOUT LANE'S SCOPE is the KERNEL-tier fact (ADR-0016 D8): the
      // bridge tier stays read-only-shaped for Paystack (the probe proves
      // reads); the execution grant is derived INSIDE the credential seal on
      // every dispatch — the kernel re-checks it (never a probe claim).
      {
        connectedInstanceId: input.executingConnectionId,
        providerName: "paystack",
        operationClasses: ["CREATE_EXTERNAL_EFFECT"],
      },
    ],
    policyDecisions: [
      {
        decision: "ALLOW",
        reason:
          "the operator's explicit act on the compiled corridor plan (the planning tier — the channel's declared corridor covers US→US only, disclosed)",
      },
    ],
    now: input.now,
  };
}

/**
 * Compose the corridor journey's host service: the REAL mission runtime
 * over the LANE-AWARE execution authority (the per-provider kernels)
 * + the connection plane + the probe plane (the preview member then
 * derives its gate environment from the REAL bridge — the corridor
 * ask honestly BLOCKS: the declared test corridor is US→US only).
 */
export async function composeCorridorService(
  world: World,
  authority: ConnectionSessionAuthority,
  evidenceStore: ProbeEvidenceStore,
): Promise<{
  readonly service: ReturnType<typeof createPaySwapDesktopService>;
  readonly runtime: PaymentMissionRuntime;
}> {
  const store = await openPaymentMissionStore({
    fileSystem: world.fileSystem,
    directory: "/mem/p22d-payments",
  });
  const runtime = createPaymentMissionRuntime({
    store,
    executionAuthority: createLaneAwareExecutionAuthority({
      connectionAuthority: authority,
      fetchImpl: world.fetchImpl,
      nowMs: () => NOW_MS,
    }),
    principalRef: "principal:operator",
    mintRandom: (() => {
      let seq = 0;
      return () => {
        seq += 1;
        return String(seq).padStart(32, "0");
      };
    })(),
    log: () => {},
  });
  const service = createPaySwapDesktopService(
    { scope: { kind: "local" }, log: () => {} },
    {
      createSessionId: () => "session-p22d-corridor",
      paymentMissionRuntime: runtime,
      paymentMissionClock: () => T0,
      connectionAuthority: authority,
      connectionProbe: { evidenceStore, fetchImpl: world.fetchImpl, nowMs: () => NOW_MS },
    },
  );
  return { service, runtime };
}
