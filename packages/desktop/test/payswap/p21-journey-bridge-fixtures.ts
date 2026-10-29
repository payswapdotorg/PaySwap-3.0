/**
 * PaySwap Desktop (P21-D, ADR-0014 D10 — the bridge battery) — the
 * JOURNEY-WORLD fixtures (split from ./p21-journey-bridge.test.ts at the
 * ≤400-line file law — the payment-approval-plane-fixtures precedent; the
 * route-planning stage composition lives in
 * ./p21-journey-bridge-planning.ts).
 *
 * THE WORLD: the REAL host stack over a SCRIPTED provider transport
 * (hermetic — no network, fixed clocks, deterministic mints). The
 * REAL-transport tier stays the rail-evidence harness's
 * (scripts/p21/rail-evidence-real-flow-e2e.ts — the P21-A receipt with
 * the operator's real test-mode keys); this world composes EXACTLY that
 * harness's stack with the scripted fetch in place of globalThis.fetch:
 *
 * - the connection-ACTIVATION members over the REAL authority + the
 *   REAL probe runner (seed → key-entry seal → the read-only probe over
 *   the scripted HTTPS answers → CONFIRMED → ACTIVE on probe alone);
 * - the payment-mission runtime over the LANE-AWARE Stripe execution
 *   authority (the REAL kernel behind the lane resolver, riding the
 *   SAME scripted fetch — the D8 composition);
 * - the bridge (deriveConnectionCapabilityBridge) over the registry's
 *   own statuses + the probe-evidence ledger (the rail facts);
 * - the authoritative read-back execution over the same scripted fetch.
 */

import {
  type AgentTaskModelSelectionPin,
  type CatalogModel,
} from "@payswap/app";

import { createPaySwapDesktopService } from "../../src/host/payswap/shell/service.js";
import { openPaymentMissionStore } from "../../src/host/payswap/payments/payment-mission-store.js";
import {
  createPaymentMissionRuntime,
  type PaymentMissionRuntime,
} from "../../src/host/payswap/payments/payment-mission-runtime.js";
import { createLaneAwareExecutionAuthority } from "../../src/host/payswap/payments/execution-lane-composition.js";
import { deriveConnectionCapabilityBridge } from "../../src/host/payswap/connections/capability-bridge.js";
import type { BridgeDerivation } from "../../src/host/payswap/connections/capability-bridge.js";
export { BRIDGE_PROVIDER_OBSERVATION_TIER } from "../../src/host/payswap/connections/capability-bridge.js";
import type { ConnectionSessionAuthority } from "../../src/host/payswap/connections/index.js";
import type { ProbeEvidenceStore } from "../../src/host/payswap/connections/probe-evidence.js";
import {
  FAKE_FLW_KEY,
  FAKE_STRIPE_FULL_KEY,
  FLW_BALANCES_OK,
  FLW_BALANCES_URL,
  STRIPE_ACCOUNT_URL,
  STRIPE_BALANCE_URL,
  probeWorld,
  type World,
} from "./connections-probe-plane-fixtures.js";

/* --------------------------- the pinned instants --------------------------- */

export const T0 = "2026-10-27T12:00:00Z";
export const T1 = "2026-10-27T12:05:00Z";
export const T2 = "2026-10-27T12:10:00Z";
export const T3 = "2026-10-27T12:15:00Z";
export const T4 = "2026-10-27T12:20:00Z";
/** The probe/kernel edge clock (the fixtures' own pinned ms). */
export const NOW_MS = 1_000_000;

/* ------------------------ the scripted provider world ----------------------- */

export const STRIPE_INTENTS_URL = "https://api.stripe.com/v1/payment_intents";
export const STRIPE_CONFIRM_URL = "https://api.stripe.com/v1/payment_intents/pi_FAKE0001/confirm";
export const STRIPE_RETRIEVE_URL = "https://api.stripe.com/v1/payment_intents/pi_FAKE0001";
export const JOURNEY_PAYMENT_INTENT_ID = "pi_FAKE0001";

/** Script the six canonical provider answers the journey rides (probe + execution + read-back). */
export function scriptJourneyFetch(world: World): void {
  world.fetchScript.set(FLW_BALANCES_URL, FLW_BALANCES_OK);
  world.fetchScript.set(STRIPE_BALANCE_URL, {
    status: 200,
    body: JSON.stringify({ object: "balance", available: [{ amount: 5000, currency: "usd" }] }),
  });
  world.fetchScript.set(STRIPE_ACCOUNT_URL, {
    status: 200,
    body: JSON.stringify({ id: "acct_FAKE0001", livemode: false }),
  });
  world.fetchScript.set(STRIPE_INTENTS_URL, {
    status: 200,
    body: JSON.stringify({ id: JOURNEY_PAYMENT_INTENT_ID, status: "requires_confirmation" }),
  });
  world.fetchScript.set(STRIPE_CONFIRM_URL, {
    status: 200,
    body: JSON.stringify({ id: JOURNEY_PAYMENT_INTENT_ID, status: "succeeded" }),
  });
  world.fetchScript.set(STRIPE_RETRIEVE_URL, {
    status: 200,
    body: JSON.stringify({ id: JOURNEY_PAYMENT_INTENT_ID, status: "succeeded" }),
  });
}

/** The journey's scripted model catalog (ONE model, all three reasoning levels). */
export const JOURNEY_MODEL: CatalogModel = {
  providerId: "zai",
  modelId: "glm-5.2",
  displayName: "GLM-5.2",
  reasoningLevels: ["low", "medium", "high"],
};

/** The operator's journey selection (persisted on the task record, D4). */
export const JOURNEY_MODEL_SELECTION: AgentTaskModelSelectionPin = {
  providerId: "zai",
  modelId: "glm-5.2",
  reasoningLevel: "low",
};

/**
 * Seed BOTH journey connections ACTIVE through the REAL member path (the
 * harness's probe-evidence pattern): seal → the REAL read-only probe over
 * the scripted fetch → CONFIRMED → the authority's own recorder.
 */
export async function seedJourneyConnections(world: World): Promise<{
  readonly authority: ConnectionSessionAuthority;
  readonly evidenceStore: ProbeEvidenceStore;
  readonly flutterwaveConnectionId: string;
  readonly stripeConnectionId: string;
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
  const stripe = await service.connectionSeedSetup({
    providerId: "stripe",
    useCaseRef: "own-store-test-mode",
  });
  if (stripe.kind !== "CREATED") throw new Error("the stripe seed failed");
  await service.connectionSubmitStripeRestrictedKey({
    connectionId: stripe.connectionId,
    secretKey: FAKE_STRIPE_FULL_KEY,
  });
  for (const providerId of ["flutterwave", "stripe"] as const) {
    const outcome = await service.connectionRunVerificationProbe(providerId);
    const result = outcome.results.find((row) => row.state === "ACTIVE");
    if (result === undefined) {
      throw new Error(`the ${providerId} probe did not confirm a connection`);
    }
  }
  return {
    authority: ctx.authority,
    evidenceStore,
    flutterwaveConnectionId: flw.connectionId,
    stripeConnectionId: stripe.connectionId,
  };
}

/**
 * Compose the journey's host service: the REAL mission runtime over the
 * LANE-AWARE Stripe authority + the connection plane + the probe plane
 * (the preview member then derives its gate environment from the REAL
 * bridge over the declared test corridor — the D6/D8 composition).
 */
export async function composeJourneyService(
  world: World,
  authority: ConnectionSessionAuthority,
  evidenceStore: ProbeEvidenceStore,
): Promise<{ readonly service: ReturnType<typeof createPaySwapDesktopService>; readonly runtime: PaymentMissionRuntime }> {
  const store = await openPaymentMissionStore({
    fileSystem: world.fileSystem,
    directory: "/mem/p21d-payments",
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
      createSessionId: () => "session-p21d-journey",
      paymentMissionRuntime: runtime,
      paymentMissionClock: () => T0,
      connectionAuthority: authority,
      connectionProbe: { evidenceStore, fetchImpl: world.fetchImpl, nowMs: () => NOW_MS },
    },
  );
  return { service, runtime };
}

/** The REAL bridge derivation over the registry + the evidence ledger (the rail facts). */
export async function journeyBridge(
  authority: ConnectionSessionAuthority,
  evidenceStore: ProbeEvidenceStore,
): Promise<BridgeDerivation> {
  return deriveConnectionCapabilityBridge({
    statuses: await authority.connectionStatuses(),
    evidence: await evidenceStore.latestProbeEvidence(),
  });
}
