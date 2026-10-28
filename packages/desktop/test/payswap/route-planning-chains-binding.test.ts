/**
 * PaySwap Desktop (P21-D Gap A, ADR-0014 D6/D8/D12) — the BRIDGE CHAINS
 * COMPOSITION battery (the route-planning-binding pattern, split at the
 * ≤400-line file law): the PRODUCT engine-adapter chain injection over
 * the channel's connectionCapabilityChains member.
 *
 * The named follow-on from the 147-a bridge battery: the product path —
 * not the test tier — wires the corridor capability chains derived from
 * the REAL connection bridge into the route-planning engine's stages
 * 2/3. Proven over the REAL host service (the mission runtime + the
 * connection/probe planes over the scripted provider world — the
 * connections-probe-plane fixtures) with a SCRIPTED channel client:
 *
 * - THE COMPOSITION WIRING: the service-returned chains land in the
 *   engine's chain cache deep-equal (the FLW read-only + the Stripe
 *   FULL_TEST sandbox-executable chains — the bridge's own derivation,
 *   ids aligned by construction).
 * - THE ENGINE WIRING: the view presents over the chains — the honest
 *   no-route (zero ranked, zero eligible: every derived rail is honestly
 *   excluded — the bridge observes no geography facts), never a
 *   fabricated route.
 * - THE OLDER-HOST LAW: a channel client WITHOUT the member (an older
 *   host) keeps the honest EMPTY chain set — and because every derived
 *   rail is honestly excluded, the presented view is BYTE-IDENTICAL to
 *   the pre-wiring one (unbound callers keep today's exact behavior).
 * - THE DRIFT LAW: a drifted service chain never fabricates a rail —
 *   the engine's own stage-2/3 snapshot validators reject it typed
 *   (fail-closed, never a crash past the typed error).
 */

import { describe, expect, it } from "vitest";

import {
  createAgentComposerController,
  resetSharedRoutePlanningEngine,
  resetSharedRoutePlanningSession,
  sharedRoutePlanningEngine,
  type AgentTaskSessionStorage,
} from "@payswap/app";

import {
  composeRoutePlanningBinding,
} from "../../src/renderer/src/routePlanningComposition.js";
import { createPaySwapDesktopService } from "../../src/host/payswap/shell/service.js";
import {
  ConnectionSessionAuthority,
  DurableConnectionCredentialBroker,
} from "../../src/host/payswap/index.js";
import { openProbeEvidenceStore } from "../../src/host/payswap/connections/probe-evidence.js";
import { openPaymentMissionStore } from "../../src/host/payswap/payments/payment-mission-store.js";
import {
  createPaymentMissionRuntime,
  type PaymentMissionRuntime,
} from "../../src/host/payswap/payments/payment-mission-runtime.js";
import { createUnwiredExecutionAuthority } from "../../src/host/payswap/payments/execution-authority.js";
import { PAYMENT_INTAKE_FIELD_IDS } from "../../src/host/payswap/payments/contracts.js";
import type { DesktopConsoleChannelServices } from "../../src/renderer/src/consoleWorkspaceMount.js";
import {
  FAKE_FLW_KEY,
  FAKE_STRIPE_FULL_KEY,
  FLW_BALANCES_OK,
  FLW_BALANCES_URL,
  STRIPE_ACCOUNT_URL,
  STRIPE_BALANCE_URL,
  fakeWorld,
} from "./connections-probe-plane-fixtures.js";

const T0 = "2026-10-26T12:00:00Z";
const T1 = "2026-10-26T12:05:00Z";

function fakeStorage(): AgentTaskSessionStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => (data.has(k) ? data.get(k)! : null), setItem: (k, v) => void data.set(k, v) };
}

/** The journey-shaped intake: the FLW NGN wallet funding the Stripe-only merchant (the P21 corridor). */
function bridgeIntakeValueFor(fieldId: string): unknown {
  switch (fieldId) {
    case "amountAndCurrency":
      return { minorUnits: "50000000", currency: "NGN" };
    case "fundingSource":
      return "Flutterwave NGN wallet (test)";
    case "recipient":
      return "Merchant X (Stripe-only test)";
    case "countryCorridor":
      return { sourceCountry: "NG", destinationCountry: "US", destinationCurrency: "USD" };
    case "speedDeadline":
      return { deadlineAt: "2026-10-28T12:00:00Z" };
    case "feeCap":
      return { kind: "CAPPED", amount: { minorUnits: "100", currency: "USD" } };
    case "purpose":
      return "supplier invoice 42";
    case "privacyCompliance":
      return { kind: "CONSTRAINED", notes: "no special constraints" };
    case "partialPaymentPreference":
      return { kind: "REQUIRE_FULL" };
    default:
      throw new Error(`unexpected field ${fieldId}`);
  }
}

/** The REAL host service with BOTH planes: the mission runtime + the connection/probe planes (the chains member derives the REAL bridge). */
async function bridgeChainsService() {
  const world = fakeWorld();
  world.fetchScript.set(FLW_BALANCES_URL, FLW_BALANCES_OK);
  world.fetchScript.set(STRIPE_BALANCE_URL, {
    status: 200,
    body: JSON.stringify({ object: "balance", available: [{ amount: 5000, currency: "usd" }] }),
  });
  world.fetchScript.set(STRIPE_ACCOUNT_URL, {
    status: 200,
    body: JSON.stringify({ id: "acct_FAKE0001", livemode: false }),
  });
  const probeAt = "2026-10-26T11:30:00Z";
  let idSeq = 0;
  const authority = new ConnectionSessionAuthority({
    fileSystem: world.fileSystem,
    directory: "/mem/p21d-gap-a-connections",
    broker: new DurableConnectionCredentialBroker(world.credentialService),
    nowMs: () => Date.parse(probeAt),
    nowIso: () => probeAt,
    createId: () => `gap-a-${(idSeq += 1)}`,
  });
  const evidenceStore = await openProbeEvidenceStore({ fileSystem: world.fileSystem, directory: "/mem/p21d-gap-a-evidence" });
  const store = await openPaymentMissionStore({ fileSystem: world.fileSystem, directory: "/mem/p21d-gap-a-payments" });
  const runtime: PaymentMissionRuntime = createPaymentMissionRuntime({
    store,
    executionAuthority: createUnwiredExecutionAuthority(),
    principalRef: "principal:gap-a",
    mintRandom: (() => {
      let seq = 0;
      return () => {
        seq += 1;
        return String(seq).padStart(32, "0");
      };
    })(),
    log: () => {},
  });
  await runtime.dispatch.recoverInterruptions(T0);
  const service = createPaySwapDesktopService(
    { scope: { kind: "local" }, log: () => {} },
    {
      createSessionId: () => "session-p21d-gap-a",
      paymentMissionRuntime: runtime,
      paymentMissionClock: () => T0,
      connectionAuthority: authority,
      connectionProbe: { evidenceStore, fetchImpl: world.fetchImpl, nowMs: () => Date.parse(probeAt) },
    },
  );
  return { service };
}

/** Seed BOTH connections ACTIVE through the REAL member path (seal → the REAL scripted probe → CONFIRMED). */
async function seedActiveConnections(service: ReturnType<typeof createPaySwapDesktopService>): Promise<void> {
  const flw = await service.connectionSeedSetup({ providerId: "flutterwave", useCaseRef: "own-store-test-mode" });
  if (!("connectionId" in flw)) throw new Error("the flutterwave seed failed");
  await service.connectionSubmitFlutterwaveSecretKey({ connectionId: flw.connectionId, secretKey: FAKE_FLW_KEY });
  const stripe = await service.connectionSeedSetup({ providerId: "stripe", useCaseRef: "own-store-test-mode" });
  if (!("connectionId" in stripe)) throw new Error("the stripe seed failed");
  await service.connectionSubmitStripeRestrictedKey({ connectionId: stripe.connectionId, secretKey: FAKE_STRIPE_FULL_KEY });
  for (const providerId of ["flutterwave", "stripe"] as const) {
    const outcome = await service.connectionRunVerificationProbe(providerId);
    if (!outcome.results.some((row) => row.state === "ACTIVE")) {
      throw new Error(`the ${providerId} probe did not confirm a connection`);
    }
  }
}

/** A scripted channel client delegating to the REAL service members (the chains member optional — the older-host law). */
function channelClientOver(
  service: ReturnType<typeof createPaySwapDesktopService>,
  chainsOf?: () => Promise<unknown>,
): DesktopConsoleChannelServices {
  const client = {
    paymentMissionBoard: () => service.paymentMissionBoard(),
    paymentMissionDetail: (missionId: string) => service.paymentMissionDetail(missionId),
    paymentMissionRecordPlanSelection: (missionId: string, input: Record<string, unknown>) =>
      service.paymentMissionRecordPlanSelection(missionId, input as never),
    ...(chainsOf !== undefined ? { connectionCapabilityChains: chainsOf } : {}),
  };
  return { payswapDesktopService: client as never };
}

/** Capture the journey-shaped mission through the REAL member path → the compiled intent (the bridge environment). */
async function captureBridgeMission(service: ReturnType<typeof createPaySwapDesktopService>): Promise<string> {
  const seeded = await service.paymentMissionSeed({ direction: "PAY", goalStatement: "pay merchant X" });
  for (let round = 0; round < PAYMENT_INTAKE_FIELD_IDS.length + 1; round += 1) {
    const ask = await service.paymentMissionAskNextField(seeded.missionId);
    if (ask === null) break;
    await service.paymentMissionCapture(seeded.missionId, ask.fieldId, bridgeIntakeValueFor(ask.fieldId));
  }
  const preview = await service.paymentMissionPresentPreview(seeded.missionId);
  // The honest D7 no-route: the preview BLOCKS (the declared corridor is
  // US→US only) while the intent COMPILES over the bridge environment.
  expect(preview!.gates.decision).toBe("BLOCK");
  const detail = await service.paymentMissionDetail(seeded.missionId);
  expect(detail!.intent).toBeDefined();
  return seeded.missionId;
}

describe("the bridge chains composition (P21-D Gap A — the product engine-adapter chain injection)", () => {
  it("the composition reads the SERVICE-RETURNED chains into the engine state; the view presents the honest no-route over them; the ABSENT member keeps the byte-identical honest view", async () => {
    const { service } = await bridgeChainsService();
    await seedActiveConnections(service);
    const missionId = await captureBridgeMission(service);
    const serviceChains = await service.connectionCapabilityChains();
    expect(serviceChains).toHaveLength(2);

    // (1) THE COMPOSITION WIRING: the service-returned chains land in the
    // engine's chain cache, deep-equal (the FLW read-only + the Stripe
    // FULL_TEST sandbox-executable chains — the bridge's own derivation).
    const wired = composeRoutePlanningBinding({
      services: channelClientOver(service, () => service.connectionCapabilityChains()),
      controller: createAgentComposerController({ storage: fakeStorage(), clock: () => T1 }),
    });
    await wired.refresh();
    expect(wired.state.chains).toEqual(serviceChains);
    expect(wired.state.chains).toHaveLength(2);

    // (2) THE ENGINE WIRING: the view presents over the chains — the honest
    // no-route (zero ranked, zero eligible — every derived rail is honestly
    // excluded; the deployment truth), never a fabricated route.
    const view = sharedRoutePlanningEngine().presentableView({ taskRef: missionId });
    expect(view.availableNow.ranked).toEqual([]);
    expect(view.availableNow.senderEligibleRouteIds).toEqual([]);
    expect(view.availableNow.recipientEligibleRouteIds).toEqual([]);
    expect(view.viewDigest).toMatch(/^fnv1a64:/);

    // (3) THE OLDER-HOST LAW: a channel client WITHOUT the member keeps the
    // honest EMPTY chain set — and because every derived rail is honestly
    // excluded, the presented view is BYTE-IDENTICAL to the pre-wiring one.
    const absent = composeRoutePlanningBinding({
      services: channelClientOver(service),
      controller: createAgentComposerController({ storage: fakeStorage(), clock: () => T1 }),
    });
    await absent.refresh();
    expect(absent.state.chains).toEqual([]);
    const absentView = sharedRoutePlanningEngine().presentableView({ taskRef: missionId });
    expect(absentView.viewDigest).toBe(view.viewDigest);
    resetSharedRoutePlanningEngine();
    resetSharedRoutePlanningSession();
  });

  it("a DRIFTED service chain never fabricates a rail — the engine's own snapshot validators reject it typed (the drift law)", async () => {
    const { service } = await bridgeChainsService();
    await seedActiveConnections(service);
    const missionId = await captureBridgeMission(service);
    const real = (await service.connectionCapabilityChains())[0]!;
    const drifted = { ...real, observation: { ...real.observation, instanceId: "instance:drifted" } };
    const composition = composeRoutePlanningBinding({
      services: channelClientOver(service, async () => [drifted]),
      controller: createAgentComposerController({ storage: fakeStorage(), clock: () => T1 }),
    });
    await composition.refresh();
    expect(composition.state.chains).toHaveLength(1);
    // The chains REACH the engine's stage-2/3 snapshot derivation — the
    // REAL validators reject the drifted lineage fail-closed (never a
    // fabricated rail, never a crash past the typed error).
    expect(() => sharedRoutePlanningEngine().presentableView({ taskRef: missionId })).toThrow(
      /does not match the connected instance/,
    );
    resetSharedRoutePlanningEngine();
    resetSharedRoutePlanningSession();
  });
});
