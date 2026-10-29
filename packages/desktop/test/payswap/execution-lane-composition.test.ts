/**
 * PaySwap Desktop (P21-A, ADR-0014 D8) — the LANE-AWARE EXECUTION
 * AUTHORITY battery: the REAL Stripe kernel composes ONLY behind an
 * ACTIVE SANDBOX Stripe connection (the lane resolver's own eligibility
 * law), over the connection's SEALED credential, through the REAL
 * host-side HTTPS transport (the injected fetch binding); otherwise the
 * UNWIRED authority's honest NO_AUTHORITY_WIRED remains the answer.
 *
 * Machine-checks the D8 laws:
 * - NO_AUTHORITY_WIRED without an eligible lane (zero connections; a
 *   sealed-but-unprobed PENDING connection; an ACTIVE SANDBOX
 *   Flutterwave connection — F3/C9: no FLW send operation exists, so no
 *   authority can wire an FLW lane).
 * - THE GOLDEN PATH: an ACTIVE SANDBOX Stripe connection (reached
 *   through the REAL caller-trust-fix probe path) dispatches through
 *   the REAL kernel — PaymentIntent create + confirm over the injected
 *   fetch, the published test payment method, the CONFIRMED envelope,
 *   the mission COMPLETED — and the dispatch path follows the existing
 *   P19/P20 attempt-state + reconciliation laws byte-identically (the
 *   runtime files untouched; this composition is the seam).
 * - THE GRANT LAW stays single-enforced INSIDE the seal: a RESTRICTED
 *   (rk_test_) key that reached ACTIVE is delegated to the kernel and
 *   refused there with the typed COMMAND_REJECTED restricted-key reason.
 * - THE COMPOSITION SEAM: registerPaySwapDesktopService with the
 *   connection plane + the probe plane composes the lane-aware
 *   authority AND the bridge gate environment — a full-channel golden
 *   path (intake → the REAL environment preview → approval → the
 *   channel dispatch → CONFIRMED), with the unwired authority the
 *   default when the plane is absent (byte-identical).
 */

import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ServiceCollection } from "@zcode/services";

import {
  IPaySwapDesktopServiceDescriptor,
  registerPaySwapDesktopService,
} from "../../src/host/payswap/index.js";
import {
  createLaneAwareExecutionAuthority,
} from "../../src/host/payswap/payments/execution-lane-composition.js";
import { createPaymentMissionRuntime } from "../../src/host/payswap/payments/payment-mission-runtime.js";
import { openPaymentMissionStore } from "../../src/host/payswap/payments/payment-mission-store.js";
import { PAYMENT_INTAKE_FIELD_IDS } from "../../src/host/payswap/payments/contracts.js";
import type { PaymentIntakeFieldId } from "../../src/host/payswap/payments/contracts.js";
import type { PaymentMissionRuntime } from "../../src/host/payswap/payments/payment-mission-runtime.js";
import type { IPaySwapDesktopService } from "../../src/host/payswap/shell/contracts.js";
import type { ConnectionSessionAuthority } from "../../src/host/payswap/connections/index.js";
import type { ProbeEvidenceStore } from "../../src/host/payswap/connections/probe-evidence.js";
import {
  DECLARED_STRIPE_TEST_CORRIDOR,
  createGateEnvironmentFromConnections,
} from "../../src/host/payswap/connections/gate-environment.js";
import {
  FAKE_FLW_KEY,
  FAKE_STRIPE_FULL_KEY,
  FLW_BALANCES_OK,
  FLW_BALANCES_URL,
  STRIPE_ACCOUNT_URL,
  STRIPE_BALANCE_URL,
  fakeWorld,
  probeWorld,
  type World,
} from "./connections-probe-plane-fixtures.js";
import type { PaymentGateEnvironment } from "../../src/host/payswap/payments/validation-gates.js";

/**
 * A clearly-labeled FAKE passing gate environment aligned to THIS
 * battery's clock (the approval-plane harness fixture pattern; the
 * quote expires an hour after NOW) — for the negative-path authority
 * tests whose worlds have no eligible corridor (the preview gate is
 * not the subject there; the authority's lane law is).
 */
function scriptedPassingEnvironmentAt(now: string): PaymentGateEnvironment {
  return {
    observedFundingSources: [
      { locationRef: "acct:test-funding", currency: "USD", observationRef: "obs:1", displayName: "Test funding" },
    ],
    observedDestinations: [
      { locationRef: "acct:test-recipient", currency: "USD", observationRef: "obs:2", displayName: "Test recipient" },
    ],
    corridorProjection: {
      projectCorridor: (query: { readonly asOf: string }) => ({
        evaluatedAsOf: query.asOf,
        routeIds: ["route:fake-lane-test"],
        eligibleRouteIds: ["route:fake-lane-test"],
        exclusions: [],
      }),
    },
    freshQuote: {
      quoteId: "quote:fake-lane-test",
      quoteVersion: "v1",
      sourceAmount: { minorUnits: "1500", currency: "USD" },
      targetAmount: { minorUnits: "1500", currency: "USD" },
      feeLines: [],
      rate: { value: "1", provenance: "fake test quote (P21-A lane battery)", asOf: now },
      expiry: { at: "2026-10-28T12:00:00Z", onExpiry: "REVALIDATE_REQUIRED" as const },
      delivery: { kind: "ESTIMATE" as const, estimateLabel: "same day (fake)" },
      conditions: { rateLocked: true, refreshAvailable: false, materialChangePolicy: "revalidate" as const },
    },
    declaredLimits: { minimum: { minorUnits: "1", currency: "USD" }, maximum: { minorUnits: "1000000", currency: "USD" } },
    connectedScopes: [
      { connectedInstanceId: "conn:fake", providerName: "fake-psp", operationClasses: ["CREATE_EXTERNAL_EFFECT"] },
    ],
    policyDecisions: [{ decision: "ALLOW" as const, reason: "fake test policy (P21-A lane battery)" }],
    now,
  };
}

const NOW = "2026-10-27T12:00:00Z";

/** A RESTRICTED fake stripe key (rk_test_ — the grant-law negative control). */
const FAKE_STRIPE_RESTRICTED_KEY = "rk" + "_test_FAKE51restrictedDoNotUse04";

/** The Stripe execution URLs the kernel drives (create + confirm). */
const STRIPE_INTENTS_URL = "https://api.stripe.com/v1/payment_intents";

/** The canonical Stripe answers the scripted fetch returns (probe + execution). */
function scriptStripeWorld(): World {
  const world = fakeWorld();
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
    body: JSON.stringify({ id: "pi_FAKE0001", status: "requires_confirmation" }),
  });
  world.fetchScript.set("https://api.stripe.com/v1/payment_intents/pi_FAKE0001/confirm", {
    status: 200,
    body: JSON.stringify({ id: "pi_FAKE0001", status: "succeeded" }),
  });
  return world;
}

/** A runtime over the in-memory store + the given execution authority. */
async function runtimeOver(
  world: World,
  authority: Parameters<typeof createPaymentMissionRuntime>[0]["executionAuthority"],
): Promise<PaymentMissionRuntime> {
  const store = await openPaymentMissionStore({
    fileSystem: world.fileSystem,
    directory: "/mem/payments",
  });
  return createPaymentMissionRuntime({
    store,
    executionAuthority: authority,
    principalRef: "principal:test-local",
    mintRandom: (() => {
      let seq = 0;
      return () => {
        seq += 1;
        return String(seq).padStart(32, "0");
      };
    })(),
    log: () => {},
  });
}

/**
 * Seed an ACTIVE stripe connection through the REAL member path (seal →
 * the REAL probe over the scripted fetch → the authority's own
 * recorder). Returns the REAL authority + the evidence ledger (the
 * bridge's inputs) + the connection id.
 */
async function seedActiveStripe(
  world: World,
  secretKey: string,
): Promise<{
  readonly authority: ConnectionSessionAuthority;
  readonly evidenceStore: ProbeEvidenceStore;
  readonly connectionId: string;
}> {
  const { ctx, evidenceStore, service } = await probeWorld(world);
  const seeded = await service.connectionSeedSetup({
    providerId: "stripe",
    useCaseRef: "own-store-test-mode",
  });
  if (seeded.kind !== "CREATED") throw new Error("seed failed");
  await service.connectionSubmitStripeRestrictedKey({
    connectionId: seeded.connectionId,
    secretKey,
  });
  const outcome = await service.connectionRunVerificationProbe("stripe");
  if (outcome.results[0]?.state !== "ACTIVE") {
    throw new Error(`the stripe connection did not reach ACTIVE: ${outcome.results[0]?.state}`);
  }
  return { authority: ctx.authority, evidenceStore, connectionId: seeded.connectionId };
}

/** The nine intake values for the lane-composition mission (the declared test corridor's facts). */
function intakeValueFor(fieldId: string, style: "corridor" | "scripted" = "corridor"): unknown {
  switch (fieldId) {
    case "amountAndCurrency":
      return { minorUnits: "1500", currency: "USD" };
    case "fundingSource":
      // corridor: the DECLARED TEST FUNDING INSTRUMENT's display name
      // (F4: a Stripe test PM is never FLW-funded — the declared
      // corridor's own instrument, matched exactly by the accounts gate).
      // scripted: the harness fixture's name (the labeled FAKE passing
      // environment the negative-path previews ride).
      return style === "corridor"
        ? "Published Stripe test payment method (pm_card_visa)"
        : "Test funding";
    case "recipient":
      // corridor: the merchant directory's display name (TEST_DATA tier).
      return style === "corridor" ? "Merchant X (Stripe-only test)" : "Test recipient";
    case "countryCorridor":
      return { sourceCountry: "US", destinationCountry: "US", destinationCurrency: "USD" };
    case "speedDeadline":
      return { deadlineAt: "2026-10-28T12:00:00Z" };
    case "feeCap":
      return { kind: "CAPPED", amount: { minorUnits: "100", currency: "USD" } };
    case "purpose":
      return "P21-A lane composition battery";
    case "privacyCompliance":
      return { kind: "CONSTRAINED", notes: "no special constraints" };
    case "partialPaymentPreference":
      return { kind: "REQUIRE_FULL" };
    default:
      throw new Error(`unexpected field ${fieldId}`);
  }
}

/** Drive the intake over the RUNTIME (the a1-script precedent); returns the mission id. */
async function completeIntakeOverRuntime(
  runtime: PaymentMissionRuntime,
  style: "corridor" | "scripted" = "corridor",
): Promise<string> {
  const seeded = await runtime.seedMission(
    { direction: "PAY", goalStatement: "pay Merchant X (P21-A lane composition battery)", origin: "COMPOSER_TEXT" },
    NOW,
  );
  for (let round = 0; round < PAYMENT_INTAKE_FIELD_IDS.length + 1; round += 1) {
    const ask = await runtime.askNextMissingField(seeded.missionId, NOW);
    if (ask === null) break;
    await runtime.captureField(seeded.missionId, ask.fieldId as PaymentIntakeFieldId, intakeValueFor(ask.fieldId, style), NOW);
  }
  return seeded.missionId;
}

/** Drive the channel intake to completion with the declared-corridor values. */
async function completeIntake(service: IPaySwapDesktopService): Promise<string> {
  const seeded = await service.paymentMissionSeed({
    direction: "PAY",
    goalStatement: "pay Merchant X (P21-A lane composition battery)",
  });
  for (let round = 0; round < PAYMENT_INTAKE_FIELD_IDS.length + 1; round += 1) {
    const ask = await service.paymentMissionAskNextField(seeded.missionId);
    if (ask === null) break;
    await service.paymentMissionCapture(seeded.missionId, ask.fieldId, intakeValueFor(ask.fieldId));
  }
  return seeded.missionId;
}

/** The host-side approval over the runtime (the a1-script precedent). */
async function approveHostSide(
  runtime: PaymentMissionRuntime,
  missionId: string,
): Promise<string> {
  const request = await runtime.requestAuthorization(missionId, NOW);
  const resolution = await runtime.resolveAuthorization(
    { requestId: request.requestId, decision: "APPROVE", origin: "PREVIEW_UI_ACT" },
    NOW,
  );
  if (resolution.outcome.kind !== "GRANTED") throw new Error("the approval did not grant");
  return resolution.outcome.artifact.artifactId;
}

/**
 * Present a dispatchable preview over the labeled FAKE passing
 * environment (the approval-plane harness fixture) — for the
 * negative-path authority tests whose worlds have no eligible corridor
 * (the preview gate is not the subject there; the authority's lane law
 * is).
 */
async function previewOverScriptedEnv(runtime: PaymentMissionRuntime, missionId: string): Promise<void> {
  const preview = await runtime.presentPreview(missionId, scriptedPassingEnvironmentAt(NOW));
  if (!preview.dispatchable) throw new Error("the scripted preview did not become dispatchable");
}

/**
 * Present a dispatchable preview over the REAL bridge environment (the
 * statuses + evidence + the declared test corridor) — the D8 golden
 * path's own preview law.
 */
async function previewOverBridgeEnv(
  runtime: PaymentMissionRuntime,
  authority: ConnectionSessionAuthority,
  evidenceStore: ProbeEvidenceStore,
  missionId: string,
): Promise<void> {
  const mission = await runtime.getMission(missionId);
  const captured = mission?.fields.amountAndCurrency;
  const missionAmount =
    captured !== undefined && captured.status === "CAPTURED" ? captured.value : undefined;
  const env = createGateEnvironmentFromConnections({
    now: NOW,
    statuses: await authority.connectionStatuses(),
    evidence: await evidenceStore.latestProbeEvidence(),
    declaredTestCorridor: DECLARED_STRIPE_TEST_CORRIDOR,
    ...(missionAmount !== undefined ? { missionAmount } : {}),
  });
  const preview = await runtime.presentPreview(missionId, env);
  if (!preview.dispatchable) {
    throw new Error(`the bridge preview did not become dispatchable: ${JSON.stringify(preview.gates.reasons)}`);
  }
}

describe("the lane-aware execution authority (ADR-0014 D8 — the kernel composes only behind an eligible lane)", () => {
  it("NO_AUTHORITY_WIRED without an eligible lane: zero connections, and no provider call is made", async () => {
    const world = fakeWorld();
    const { ctx } = await probeWorld(world);
    const authority = createLaneAwareExecutionAuthority({
      connectionAuthority: ctx.authority,
      fetchImpl: world.fetchImpl,
      nowMs: () => 1_000_000,
    });
    const runtime = await runtimeOver(world, authority);
    const missionId = await completeIntakeOverRuntime(runtime, "scripted");
    await previewOverScriptedEnv(runtime, missionId);
    const artifactId = await approveHostSide(runtime, missionId);
    const dispatched = await runtime.dispatch.dispatch(
      missionId,
      "CREATE_EXTERNAL_EFFECT",
      { authorizationArtifactId: artifactId, connectionRef: "conn:does-not-exist", executionMode: "SANDBOX" },
      NOW,
    );
    if (dispatched.kind !== "REFUSED") throw new Error("expected a refusal");
    expect(dispatched.refusal.kind).toBe("NO_AUTHORITY_WIRED");
    expect(dispatched.refusal.reason).toContain("No execution authority is wired");
    // No provider call was made (the scripted fetch answers nothing).
    expect(world.fetchScript.size).toBe(0);
  });

  it("a sealed-but-unprobed (PENDING_VERIFICATION) stripe connection stays NO_AUTHORITY_WIRED", async () => {
    const world = fakeWorld();
    const { ctx, service } = await probeWorld(world);
    const seeded = await service.connectionSeedSetup({
      providerId: "stripe",
      useCaseRef: "own-store-test-mode",
    });
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await service.connectionSubmitStripeRestrictedKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_STRIPE_FULL_KEY,
    });
    const authority = createLaneAwareExecutionAuthority({
      connectionAuthority: ctx.authority,
      fetchImpl: world.fetchImpl,
      nowMs: () => 1_000_000,
    });
    const runtime = await runtimeOver(world, authority);
    const missionId = await completeIntakeOverRuntime(runtime, "scripted");
    await previewOverScriptedEnv(runtime, missionId);
    const artifactId = await approveHostSide(runtime, missionId);
    const dispatched = await runtime.dispatch.dispatch(
      missionId,
      "CREATE_EXTERNAL_EFFECT",
      { authorizationArtifactId: artifactId, connectionRef: seeded.connectionId, executionMode: "SANDBOX" },
      NOW,
    );
    if (dispatched.kind !== "REFUSED") throw new Error("expected a refusal");
    expect(dispatched.refusal.kind).toBe("NO_AUTHORITY_WIRED");
    expect(dispatched.refusal.reason).toContain("not ACTIVE");
  });

  it("THE GOLDEN PATH: an ACTIVE SANDBOX stripe connection dispatches through the REAL kernel (create + confirm over the injected fetch), CONFIRMED, mission COMPLETED, attempt states byte-identical", async () => {
    const world = scriptStripeWorld();
    const { authority: connectionAuthority, evidenceStore, connectionId } = await seedActiveStripe(
      world,
      FAKE_STRIPE_FULL_KEY,
    );
    const authority = createLaneAwareExecutionAuthority({
      connectionAuthority,
      fetchImpl: world.fetchImpl,
      nowMs: () => 1_000_000,
    });
    const runtime = await runtimeOver(world, authority);
    const missionId = await completeIntakeOverRuntime(runtime);
    // The D8 preview law: the dispatchable preview over the REAL bridge
    // environment (the probe facts + the declared test corridor).
    await previewOverBridgeEnv(runtime, connectionAuthority, evidenceStore, missionId);
    const artifactId = await approveHostSide(runtime, missionId);

    const dispatched = await runtime.dispatch.dispatch(
      missionId,
      "CREATE_EXTERNAL_EFFECT",
      { authorizationArtifactId: artifactId, connectionRef: connectionId, executionMode: "SANDBOX" },
      NOW,
    );
    if (dispatched.kind !== "DISPATCHED") {
      throw new Error(`the dispatch did not complete: ${JSON.stringify(dispatched)}`);
    }
    expect(dispatched.envelope.outcome).toBe("CONFIRMED");
    expect(dispatched.envelope.providerReferences).toContain("pi_FAKE0001");
    expect(dispatched.envelope.providerReferences).toContain("succeeded");
    const mission = await runtime.getMission(missionId);
    expect(mission?.status).toBe("COMPLETED");
    // The P19/P20 attempt-state law, byte-identical: one attempt,
    // outcome CONFIRMED, the recorded envelope, no reconciliation.
    expect(mission?.attempts).toHaveLength(1);
    const attempt = mission?.attempts[0]!;
    expect(attempt.envelope?.outcome).toBe("CONFIRMED");
    expect(attempt.reconciliation).toBeUndefined();
  });

  it("an ACTIVE SANDBOX Flutterwave connection is NOT an executing lane: NO_AUTHORITY_WIRED (F3/C9 — no FLW send operation exists)", async () => {
    const world = fakeWorld();
    world.fetchScript.set(FLW_BALANCES_URL, FLW_BALANCES_OK);
    const { ctx, service } = await probeWorld(world);
    const seeded = await service.connectionSeedSetup({
      providerId: "flutterwave",
      useCaseRef: "own-store-test-mode",
    });
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await service.connectionSubmitFlutterwaveSecretKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_FLW_KEY,
    });
    const outcome = await service.connectionRunVerificationProbe("flutterwave");
    if (outcome.results[0]?.state !== "ACTIVE") throw new Error("the FLW connection did not reach ACTIVE");

    const authority = createLaneAwareExecutionAuthority({
      connectionAuthority: ctx.authority,
      fetchImpl: world.fetchImpl,
      nowMs: () => 1_000_000,
    });
    const runtime = await runtimeOver(world, authority);
    const missionId = await completeIntakeOverRuntime(runtime, "scripted");
    await previewOverScriptedEnv(runtime, missionId);
    const artifactId = await approveHostSide(runtime, missionId);
    const dispatched = await runtime.dispatch.dispatch(
      missionId,
      "CREATE_EXTERNAL_EFFECT",
      { authorizationArtifactId: artifactId, connectionRef: seeded.connectionId, executionMode: "SANDBOX" },
      NOW,
    );
    if (dispatched.kind !== "REFUSED") throw new Error("expected a refusal");
    expect(dispatched.refusal.kind).toBe("NO_AUTHORITY_WIRED");
    expect(dispatched.refusal.reason).toContain("Flutterwave");
  });

  it("the grant law stays single-enforced INSIDE the seal: a RESTRICTED (rk_test_) key that reached ACTIVE is refused by the kernel with the typed COMMAND_REJECTED reason", async () => {
    const world = scriptStripeWorld();
    const { authority: connectionAuthority, connectionId } = await seedActiveStripe(
      world,
      FAKE_STRIPE_RESTRICTED_KEY,
    );
    const authority = createLaneAwareExecutionAuthority({
      connectionAuthority,
      fetchImpl: world.fetchImpl,
      nowMs: () => 1_000_000,
    });
    const runtime = await runtimeOver(world, authority);
    const missionId = await completeIntakeOverRuntime(runtime, "scripted");
    await previewOverScriptedEnv(runtime, missionId);
    const artifactId = await approveHostSide(runtime, missionId);
    const dispatched = await runtime.dispatch.dispatch(
      missionId,
      "CREATE_EXTERNAL_EFFECT",
      { authorizationArtifactId: artifactId, connectionRef: connectionId, executionMode: "SANDBOX" },
      NOW,
    );
    if (dispatched.kind !== "REFUSED") throw new Error("expected a refusal");
    expect(dispatched.refusal.kind).toBe("COMMAND_REJECTED");
    expect(dispatched.refusal.reason).toContain("RESTRICTED");
    // The mission stays open for a fresh authorization (REFUSED is
    // definitively no effect — the P19 law).
    const mission = await runtime.getMission(missionId);
    expect(mission?.status).toBe("ACTIVE");
  });
});

describe("the composition seam (registerPaySwapDesktopService composes the lane-aware authority + the bridge gate environment)", () => {
  it("the full-channel golden path: connection plane + probe plane → the REAL environment preview → approval → the CHANNEL dispatch → CONFIRMED + COMPLETED", async () => {
    const world = scriptStripeWorld();
    const { ctx, service: probeService, evidenceStore } = await probeWorld(world);
    const seeded = await probeService.connectionSeedSetup({
      providerId: "stripe",
      useCaseRef: "own-store-test-mode",
    });
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await probeService.connectionSubmitStripeRestrictedKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_STRIPE_FULL_KEY,
    });
    const probeOutcome = await probeService.connectionRunVerificationProbe("stripe");
    if (probeOutcome.results[0]?.state !== "ACTIVE") throw new Error("the connection did not reach ACTIVE");

    const userData = await mkdtemp(join(tmpdir(), "payswap-p21a-compose-"));
    try {
      const services = new ServiceCollection();
      const record = await registerPaySwapDesktopService(
        services,
        {
          scope: { kind: "local" },
          log: () => {},
          storeDirectory: join(userData, "workspace"),
          paymentsStoreDirectory: join(userData, "payments"),
        },
        {
          createSessionId: () => "session-p21a-compose",
          paymentMissionClock: () => NOW,
          connectionAuthority: ctx.authority,
          connectionProbe: {
            evidenceStore,
            fetchImpl: world.fetchImpl,
            nowMs: () => 1_000_000,
          },
        },
      );
      expect(record.channelName).toBe("payswap-desktop");
      const service = services.get(IPaySwapDesktopServiceDescriptor);

      // The full journey over the CHANNEL.
      const missionId = await completeIntake(service);
      const preview = await service.paymentMissionPresentPreview(missionId);
      expect(preview).not.toBeNull();
      expect(preview?.dispatchable).toBe(true);
      // The gates ran over the REAL bridge environment (the merchant
      // destination + the declared test funding instrument matched; the
      // corridor gate names the declared test route).
      expect(preview?.gates.decision).toBe("PROCEED");
      expect(preview?.gates.decisions.every((decision) => decision.decision === "PROCEED")).toBe(true);
      const corridorGate = preview?.gates.decisions.find((decision) => decision.gate === "CORRIDOR");
      expect(corridorGate?.reason).toContain("route:declared-us-us-test");

      const request = await service.paymentMissionRequestApproval(missionId);
      const resolution = await service.paymentMissionResolveApproval(request.requestId, "APPROVE");
      expect(resolution.outcome.kind).toBe("GRANTED");

      const armed = await service.paymentMissionArmedEffect(missionId);
      expect(armed.armed).toBe(true);
      expect(
        armed.lanes.some((lane) => lane.connectionRef === seeded.connectionId && lane.ineligible === undefined),
      ).toBe(true);

      const dispatched = await service.paymentMissionDispatch(missionId, seeded.connectionId);
      expect(dispatched.kind).toBe("DISPATCHED");
      if (dispatched.kind !== "DISPATCHED") throw new Error("unreachable");
      expect(dispatched.summary).toContain("confirmed");

      const detail = await service.paymentMissionDetail(missionId);
      expect(detail?.status).toBe("COMPLETED");
      expect(detail?.attempts[0]?.outcome).toBe("CONFIRMED");
      // The wire stays lineage-free (the scanner law): no artifact id, no
      // command/correlation ids on the outcome.
      expect(JSON.stringify(dispatched)).not.toMatch(/pmt-auth-\d+/);
      expect(JSON.stringify(dispatched)).not.toMatch(/pmt-cmd:/);
    } finally {
      await rm(userData, { recursive: true, force: true });
    }
  });

  it("the unwired authority stays the default when the connection plane is absent (byte-identical honest-empty preview + the typed lane refusal)", async () => {
    const userData = await mkdtemp(join(tmpdir(), "payswap-p21a-bare-"));
    try {
      const services = new ServiceCollection();
      await registerPaySwapDesktopService(
        services,
        {
          scope: { kind: "local" },
          log: () => {},
          storeDirectory: join(userData, "workspace"),
          paymentsStoreDirectory: join(userData, "payments"),
        },
        { createSessionId: () => "session-p21a-bare", paymentMissionClock: () => NOW },
      );
      const service = services.get(IPaySwapDesktopServiceDescriptor);
      const missionId = await completeIntake(service);
      const preview = await service.paymentMissionPresentPreview(missionId);
      // The honest-empty environment: the preview BLOCKS with the typed
      // no-observation reasons (byte-identical — the P13-C live truth).
      expect(preview?.dispatchable).toBe(false);
      expect(preview?.gates.decision).toBe("BLOCK");
      await expect(service.paymentMissionDispatch(missionId, "conn:anything")).rejects.toThrow(
        /connection plane is not configured|not an executing lane on this host|not eligible for dispatch/,
      );
    } finally {
      await rm(userData, { recursive: true, force: true });
    }
  });
});
