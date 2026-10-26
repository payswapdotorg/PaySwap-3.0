/**
 * PaySwap Desktop (P18-A) — the approval-plane battery's shared harness,
 * split from ./payment-approval-plane.test.ts for the ≤400-line file
 * law. Everything here is the P17-A battery / runtime-battery fixture
 * pattern: an in-memory fs seam, a pinned host clock, clearly-labeled
 * FAKE authorities (scripted / never-settling), the scripted PASSING
 * gate environment (fixture-only — the channel's own preview member
 * composes the HONEST EMPTY environment by law), the channel intake
 * driver, the host-side approval seeding (the artifact exists ONLY
 * host-side) and the artifact/lineage deep scanner.
 */

import { expect } from "vitest";

import { createPaySwapDesktopService } from "../../src/host/payswap/shell/service.js";
import { openPaymentMissionStore } from "../../src/host/payswap/payments/payment-mission-store.js";
import {
  createPaymentMissionRuntime,
  type PaymentMissionRuntime,
} from "../../src/host/payswap/payments/payment-mission-runtime.js";
import {
  createUnwiredExecutionAuthority,
  type ExecutionAuthorityPort,
} from "../../src/host/payswap/payments/execution-authority.js";
import type { PaymentResultEnvelope } from "../../src/host/payswap/payments/contracts.js";
import { PAYMENT_INTAKE_FIELD_IDS } from "../../src/host/payswap/payments/contracts.js";
import { compiledIntentDigest } from "../../src/host/payswap/payments/mission-execution.js";
import type { PaymentAuthorizationDecision } from "../../src/host/payswap/payments/authorization-gate.js";
import type { PaymentGateEnvironment } from "../../src/host/payswap/payments/validation-gates.js";
import type { IPaySwapDesktopService } from "../../src/host/payswap/shell/contracts.js";

export const T0 = "2026-10-22T12:00:00Z";
export const T1 = "2026-10-22T12:05:00Z";
export const UNKNOWN_MISSION = "task:PAYMENT_MISSION:ffffffffffffffffffffffffffffffff";

/** The in-memory fs seam (the p14 script + runtime-battery precedent). */
function memoryFs() {
  const files = new Map<string, string>();
  return {
    files,
    fs: {
      readFile: async (path: string) => {
        const data = files.get(path);
        if (data === undefined) throw new Error("ENOENT");
        return data;
      },
      writeFile: async (path: string, data: string) => {
        files.set(path, data);
      },
      mkdir: async () => {},
    },
  };
}

/** A scripted execution authority (FAKE — clearly labeled, deterministic). */
export function scriptedAuthority(
  script: ("CONFIRMED" | "UNKNOWN" | "FAILED")[],
): ExecutionAuthorityPort {
  let calls = 0;
  return {
    async dispatch() {
      const answer = script[Math.min(calls, script.length - 1)] ?? "FAILED";
      calls += 1;
      const envelope: PaymentResultEnvelope = {
        outcome: answer,
        // Required on the pinned envelope shape (the mirror law): always
        // present, empty unless the scripted answer confirmed the effect.
        providerReferences: answer === "CONFIRMED" ? ["prv_fake_1"] : [],
        ...(answer === "UNKNOWN"
          ? { ambiguityReason: "TRANSPORT_TIMEOUT_AFTER_DISPATCH" as const }
          : {}),
        ...(answer === "FAILED"
          ? {
              providerFailure: {
                providerErrorCode: "scripted_failure",
                providerErrorMessage: "scripted",
                retryable: false,
                ambiguity: "NONE" as const,
              },
            }
          : {}),
        dispatchedAt: 1_000,
        completedAt: 2_000,
      };
      return { kind: "ENVELOPE" as const, envelope };
    },
  };
}

/** A never-settling authority (FAKE): the write-ahead lands, the answer never does. */
export function neverSettlingAuthority(): ExecutionAuthorityPort {
  return {
    async dispatch() {
      return new Promise<never>(() => {});
    },
  };
}

/** A clearly-labeled FAKE passing gate environment (the runtime battery's own fixture). */
export function scriptedPassingEnvironment(now: string): PaymentGateEnvironment {
  return {
    observedFundingSources: [
      { locationRef: "acct:test-funding", currency: "USD", observationRef: "obs:1", displayName: "Test funding" },
    ],
    observedDestinations: [
      { locationRef: "acct:test-recipient", currency: "USD", observationRef: "obs:2", displayName: "Test recipient" },
    ],
    corridorProjection: {
      projectCorridor: (query) => ({
        evaluatedAsOf: query.asOf,
        routeIds: ["route:fake-1"],
        eligibleRouteIds: ["route:fake-1"],
        exclusions: [],
      }),
    },
    freshQuote: {
      quoteId: "quote:fake-1",
      quoteVersion: "v1",
      sourceAmount: { minorUnits: "1500", currency: "USD" },
      targetAmount: { minorUnits: "1500", currency: "USD" },
      feeLines: [],
      rate: { value: "1", provenance: "fake test quote", asOf: now },
      expiry: { at: "2026-10-23T12:00:00Z", onExpiry: "REVALIDATE_REQUIRED" },
      delivery: { kind: "ESTIMATE", estimateLabel: "same day (fake)" },
      conditions: { rateLocked: true, refreshAvailable: false, materialChangePolicy: "revalidate" },
    },
    declaredLimits: { minimum: { minorUnits: "1", currency: "USD" }, maximum: { minorUnits: "1000000", currency: "USD" } },
    connectedScopes: [
      { connectedInstanceId: "conn:fake", providerName: "fake-psp", operationClasses: ["CREATE_EXTERNAL_EFFECT"] },
    ],
    policyDecisions: [{ decision: "ALLOW", reason: "fake test policy" }],
    now,
  };
}

export interface Harness {
  readonly service: IPaySwapDesktopService;
  readonly runtime: PaymentMissionRuntime;
}

/** Compose the REAL service over the REAL runtime (in-memory fs; pinned clock). */
export async function harness(
  authority: ExecutionAuthorityPort = createUnwiredExecutionAuthority(),
): Promise<Harness> {
  const world = memoryFs();
  const store = await openPaymentMissionStore({ fileSystem: world.fs, directory: "/mem/payments" });
  const runtime = createPaymentMissionRuntime({
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
  await runtime.dispatch.recoverInterruptions(T0);
  const service = createPaySwapDesktopService(
    { scope: { kind: "local" }, log: () => {} },
    {
      createSessionId: () => "session-p18a",
      paymentMissionRuntime: runtime,
      paymentMissionClock: () => T0,
    },
  );
  return { service, runtime };
}

/** The nine intake fixture values (the runtime battery's own fixtures). */
function intakeValueFor(fieldId: string): unknown {
  switch (fieldId) {
    case "amountAndCurrency":
      return { minorUnits: "1500", currency: "USD" };
    case "fundingSource":
      return "Test funding";
    case "recipient":
      return "Test recipient";
    case "countryCorridor":
      return { sourceCountry: "US", destinationCountry: "US", destinationCurrency: "USD" };
    case "speedDeadline":
      return { deadlineAt: "2026-10-23T12:00:00Z" };
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

/** Drive the channel intake to completion; returns the mission id. */
export async function completeIntakeOverChannel(service: IPaySwapDesktopService): Promise<string> {
  const seeded = await service.paymentMissionSeed({
    direction: "PAY",
    goalStatement: "pay the supplier (P18-A approval battery)",
  });
  for (let round = 0; round < PAYMENT_INTAKE_FIELD_IDS.length + 1; round += 1) {
    const ask = await service.paymentMissionAskNextField(seeded.missionId);
    if (ask === null) break;
    await service.paymentMissionCapture(seeded.missionId, ask.fieldId, intakeValueFor(ask.fieldId));
  }
  return seeded.missionId;
}

/** Seed a DISPATCHABLE persisted preview through the runtime (the fixture-only passing environment). */
export async function seedDispatchablePreview(world: Harness): Promise<string> {
  const missionId = await completeIntakeOverChannel(world.service);
  const preview = await world.runtime.presentPreview(missionId, scriptedPassingEnvironment(T0));
  expect(preview.dispatchable).toBe(true);
  return missionId;
}

/**
 * The host-received principal action's full literal shape (the P14 E2E
 * precedent): the gate reads the ORIGIN; the acting principal rides the
 * decision record host-side — exactly what the channel member pins at
 * the edge and what these host-side fixture approvals stamp.
 */
export type HostPrincipalDecision = PaymentAuthorizationDecision & {
  readonly principalRef: string;
};

/** Approve host-side over the REAL runtime (returns the artifact id — channel-side it never exists). */
export async function approveHostSide(runtime: PaymentMissionRuntime, missionId: string): Promise<string> {
  const request = await runtime.requestAuthorization(missionId, T0);
  const decision: HostPrincipalDecision = {
    requestId: request.requestId,
    decision: "APPROVE",
    origin: "PREVIEW_UI_ACT",
    principalRef: "principal:test",
  };
  const resolution = await runtime.resolveAuthorization(decision, T0);
  if (resolution.outcome.kind !== "GRANTED") throw new Error("the host-side approval did not grant");
  return resolution.outcome.artifact.artifactId;
}

/**
 * THE ARTIFACT / LINEAGE SCANNER — deep-walks a DTO and asserts NO
 * artifact plane and NO consumed-artifact lineage exists on the wire:
 * no key named after an artifact or a lineage field, no artifact-id /
 * command-id / correlation-id token, and none of the caller's literal
 * secrets (e.g. the connection ref the dispatch seeded).
 */
export function assertNoArtifactOrLineage(dto: unknown, ...forbiddenLiterals: string[]): void {
  const strings: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      strings.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        expect(key).not.toMatch(/artifact/i);
        expect(["idempotencyKey", "commandId", "correlationId", "connectionRef"]).not.toContain(key);
        visit(child);
      }
    }
  };
  visit(dto);
  for (const text of strings) {
    expect(text).not.toMatch(/pmt-auth-\d+/); // authorization artifact ids
    expect(text).not.toMatch(/^pmt-cmd:/); // command ids
    expect(text).not.toMatch(/^pmt-corr:/); // correlation ids
    for (const literal of forbiddenLiterals) {
      expect(text).not.toContain(literal);
    }
  }
}

/** The expected authorization scope for the fixture mission (the preview verbatim). */
export async function expectedScopeFor(service: IPaySwapDesktopService, missionId: string) {
  const detail = await service.paymentMissionDetail(missionId);
  expect(detail?.intent).toBeDefined();
  return {
    missionId,
    direction: "PAY" as const,
    amount: { currency: "USD", minorUnits: "1500" },
    destinationSummary: "observed destination (Test recipient)",
    intentDigest: compiledIntentDigest(detail!.intent!),
  };
}
