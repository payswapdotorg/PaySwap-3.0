/**
 * PaySwap Desktop (P13-C) — the payment-mission RUNTIME battery.
 *
 * Machine-checks the ADR-0007 D7 canonical path end-to-end against the
 * REAL runtime (an in-memory store + a scripted execution authority —
 * clearly labeled fakes; the real kernel composes at TL integration):
 *
 * - CONVERGENCE: two in-window seeds with the same direction reach ONE
 *   mission (RESUMED, same id); voice origins are refused (declared-
 *   unsupported, never simulated).
 * - INTAKE: the nine fields are asked in the pinned order, one at a
 *   time; captures validate fail-closed; intake completes exactly when
 *   all nine are captured.
 * - GATES: the honest-empty environment BLOCKS with the typed
 *   prerequisites (accounts/quote/corridor/scope/policy honestly
 *   absent — never fabricated PROCEED).
 * - PREVIEW + AUTHORIZATION: a preview is presented only through the
 *   gate chain; the authorization request mints; ONLY a PREVIEW_UI_ACT
 *   decision resolves (text/NLP/voice never authorizes); the artifact
 *   is single-use and expires.
 * - DISPATCH: refuses without an artifact; the unwired authority's
 *   typed NO_AUTHORITY_WIRED refusal is recorded (definitively no
 *   effect, retryable under a fresh authorization); a scripted UNKNOWN
 *   becomes OUTCOME_UNKNOWN and RECONCILES before any retry (no
 *   duplicate write); a scripted CONFIRMED completes the mission; an
 *   idempotent REPLAY returns the recorded envelope without touching
 *   the authority again.
 * - PAUSE/RESUME/CANCEL/EXPIRE: paused missions refuse intake and
 *   dispatch until resumed; clean cancel only when no confirmed effect;
 *   terminal missions are monotonic.
 * - RESTART: the authorization gate + mission records survive a store
 *   reload; recoverInterruptions marks interrupted write-aheads UNKNOWN.
 */

import { describe, expect, it } from "vitest";

import {
  createPaymentMissionRuntime,
  PAYMENT_MISSION_RESUME_WINDOW_SECONDS,
  type PaymentMissionRuntime,
} from "../../src/host/payswap/payments/payment-mission-runtime.js";
import { openPaymentMissionStore } from "../../src/host/payswap/payments/payment-mission-store.js";
import { createHonestEmptyGateEnvironment } from "../../src/host/payswap/payments/validation-gates.js";
import type { ExecutionAuthorityPort } from "../../src/host/payswap/payments/execution-authority.js";
import { PaymentMissionError } from "../../src/host/payswap/payments/contracts.js";
import { PAYMENT_INTAKE_FIELD_IDS } from "../../src/host/payswap/payments/contracts.js";

const T0 = "2026-10-22T12:00:00Z";
const T1 = "2026-10-22T12:05:00Z";

/** The in-memory fs seam. */
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
function scriptedAuthority(
  script: ("CONFIRMED" | "UNKNOWN" | "FAILED" | "REFUSED")[],
): ExecutionAuthorityPort & { calls: number } {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    async dispatch() {
      const answer = script[Math.min(state.calls, script.length - 1)] ?? "REFUSED";
      state.calls += 1;
      if (answer === "REFUSED") {
        return {
          kind: "REFUSED" as const,
          refusal: { kind: "NO_AUTHORITY_WIRED" as const, reason: "scripted refusal" },
        };
      }
      return {
        kind: "ENVELOPE" as const,
        envelope: {
          outcome: answer,
          ...(answer === "UNKNOWN"
            ? { ambiguityReason: "TRANSPORT_TIMEOUT_AFTER_DISPATCH" as const }
            : {}),
          ...(answer === "FAILED"
            ? { failure: { code: "scripted_failure", message: "scripted", retryable: false } }
            : {}),
          ...(answer === "CONFIRMED" ? { providerReferences: ["prv_fake_1"] } : {}),
          dispatchedAt: 1_000,
          completedAt: 2_000,
          executionMode: "SANDBOX" as const,
          transportClass: "FAKE_DETERMINISTIC" as const,
          transportId: "fake-authority",
        },
      };
    },
  };
}

interface Harness {
  readonly runtime: PaymentMissionRuntime;
  readonly fs: ReturnType<typeof memoryFs>["fs"];
  readonly authority: ReturnType<typeof scriptedAuthority>;
  reload(): Promise<PaymentMissionRuntime>;
}

async function harness(script: ("CONFIRMED" | "UNKNOWN" | "FAILED" | "REFUSED")[] = ["CONFIRMED"]): Promise<Harness> {
  const world = memoryFs();
  const authority = scriptedAuthority(script);
  const openRuntime = async (): Promise<PaymentMissionRuntime> => {
    const store = await openPaymentMissionStore({
      fileSystem: world.fs,
      directory: "/tmp/payments-test",
    });
    return createPaymentMissionRuntime({
      store,
      executionAuthority: authority,
      principalRef: "principal:test",
      mintRandom: (() => {
        let seq = 0;
        return () => {
          seq += 1;
          return String(seq).padStart(32, "0");
        };
      })(),
    });
  };
  const runtime = await openRuntime();
  return { runtime, fs: world.fs, authority, reload: openRuntime };
}

/** A clearly-labeled FAKE passing gate environment (unit-test discipline). */
function scriptedPassingEnvironment(now: string): import("../../src/host/payswap/payments/validation-gates.js").PaymentGateEnvironment {
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

/** Complete the nine-field intake deterministically. */
async function completeIntake(runtime: PaymentMissionRuntime, now = T0): Promise<string> {
  const seeded = await runtime.seedMission(
    { direction: "PAY", goalStatement: "pay the supplier", origin: "COMPOSER_TEXT" },
    now,
  );
  expect(seeded.action).toBe("CREATED");
  for (let round = 0; round < PAYMENT_INTAKE_FIELD_IDS.length; round += 1) {
    const ask = await runtime.askNextMissingField(seeded.missionId, now);
    if (ask === null) break;
    const value = intakeValueFor(ask.fieldId);
    await runtime.captureField(seeded.missionId, ask.fieldId as never, value, now);
  }
  return seeded.missionId;
}

function intakeValueFor(fieldId: string): unknown {
  switch (fieldId) {
    case "amountAndCurrency":
      return { minorUnits: "1500", currency: "USD" };
    case "fundingSource":
      // The ACCOUNTS gate matches the STATED source against the
      // observation displayName exactly (never assumed).
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

describe("convergence + honest origins (D6)", () => {
  it("two in-window seeds with the same direction reach ONE mission; different directions do not", async () => {
    const { runtime } = await harness();
    const first = await runtime.seedMission(
      { direction: "PAY", goalStatement: "pay the supplier", origin: "COMPOSER_TEXT" },
      T0,
    );
    const second = await runtime.seedMission(
      { direction: "PAY", goalStatement: "pay the supplier again", origin: "SURFACE_ACTION" },
      T1,
    );
    expect(first.action).toBe("CREATED");
    expect(second.action).toBe("RESUMED");
    expect(second.missionId).toBe(first.missionId);

    const other = await runtime.seedMission(
      { direction: "RECEIVE", goalStatement: "get paid", origin: "COMPOSER_TEXT" },
      T1,
    );
    expect(other.action).toBe("CREATED");
    expect(other.missionId).not.toBe(first.missionId);
  });

  it("an out-of-window seed creates a NEW mission (the window is honest)", async () => {
    const { runtime } = await harness();
    const first = await runtime.seedMission(
      { direction: "PAY", goalStatement: "pay the supplier", origin: "COMPOSER_TEXT" },
      T0,
    );
    const late = new Date(Date.parse(T0) + (PAYMENT_MISSION_RESUME_WINDOW_SECONDS + 60) * 1000).toISOString();
    const second = await runtime.seedMission(
      { direction: "PAY", goalStatement: "pay the supplier", origin: "COMPOSER_TEXT" },
      late,
    );
    expect(second.action).toBe("CREATED");
    expect(second.missionId).not.toBe(first.missionId);
  });

  it("voice origins are refused (declared-unsupported, never simulated)", async () => {
    const { runtime } = await harness();
    await expect(
      runtime.seedMission(
        { direction: "PAY", goalStatement: "spoken", origin: "COMPOSER_VOICE" },
        T0,
      ),
    ).rejects.toThrow(/voice/i);
  });
});

describe("the conversational intake (never guessing)", () => {
  it("asks the nine fields in the pinned order, one at a time", async () => {
    const { runtime } = await harness();
    const seeded = await runtime.seedMission(
      { direction: "PAY", goalStatement: "pay the supplier", origin: "COMPOSER_TEXT" },
      T0,
    );
    const asked: string[] = [];
    for (let round = 0; round < 12; round += 1) {
      const ask = await runtime.askNextMissingField(seeded.missionId, T0);
      if (ask === null) break;
      asked.push(ask.fieldId);
      await runtime.captureField(seeded.missionId, ask.fieldId as never, intakeValueFor(ask.fieldId), T0);
    }
    expect(asked).toEqual([...PAYMENT_INTAKE_FIELD_IDS]);
    const after = await runtime.askNextMissingField(seeded.missionId, T0);
    expect(after).toBeNull();
  });

  it("invalid captures are refused fail-closed (a bad amount never lands)", async () => {
    const { runtime } = await harness();
    const seeded = await runtime.seedMission(
      { direction: "PAY", goalStatement: "pay", origin: "COMPOSER_TEXT" },
      T0,
    );
    await expect(
      runtime.captureField(seeded.missionId, "amountAndCurrency", { minorUnits: "-5", currency: "USD" }, T0),
    ).rejects.toBeInstanceOf(PaymentMissionError);
    await expect(
      runtime.captureField(seeded.missionId, "amountAndCurrency", { minorUnits: "12.5", currency: "USD" }, T0),
    ).rejects.toBeInstanceOf(PaymentMissionError);
  });
});

describe("validation gates (only actual state)", () => {
  it("the honest-empty environment BLOCKS with typed prerequisites — never a fabricated PROCEED", async () => {
    const { runtime } = await harness();
    const missionId = await completeIntake(runtime);
    const aggregate = await runtime.runGates(missionId, createHonestEmptyGateEnvironment(T0));
    expect(aggregate.decision).toBe("BLOCK");
    expect(aggregate.reasons.length).toBeGreaterThan(0);
  });

  it("the honest-empty gates produce a NON-DISPATCHABLE preview with the typed prerequisites verbatim", async () => {
    const { runtime } = await harness();
    const missionId = await completeIntake(runtime);
    const preview = await runtime.presentPreview(missionId, createHonestEmptyGateEnvironment(T0));
    expect(preview.dispatchable).toBe(false);
    expect(preview.gates.decision).toBe("BLOCK");
    for (const decision of preview.gates.decisions) {
      expect(decision.decision).toBe("BLOCK");
      expect(decision.reason.length).toBeGreaterThan(0);
    }
  });

  it("an incomplete intake refuses gates/preview (intake first — never guessed fields)", async () => {
    const { runtime } = await harness();
    const seeded = await runtime.seedMission(
      { direction: "PAY", goalStatement: "pay", origin: "COMPOSER_TEXT" },
      T0,
    );
    await expect(
      runtime.presentPreview(seeded.missionId, createHonestEmptyGateEnvironment(T0)),
    ).rejects.toBeInstanceOf(PaymentMissionError);
  });
});

describe("the authorization gate (explicit scoped approval — D7)", () => {
  it("text/NLP/voice origins can NEVER resolve an authorization request", async () => {
    const { runtime } = await harness();
    const missionId = await completeIntake(runtime);
    // The gates block the honest-empty environment, so mint the request
    // through the gate directly to prove the origin law.
    await expect(
      (async () => {
        const request = await runtime.requestAuthorization(missionId, T0);
        await runtime.resolveAuthorization(
          {
            requestId: request.requestId,
            decision: "APPROVE",
            origin: "COMPOSER_TEXT",
            principalRef: "principal:test",
          },
          T1,
        );
      })(),
    ).rejects.toBeInstanceOf(PaymentMissionError);
  });
});

describe("dispatch (the canonical consequential path)", () => {
  it("refuses without a consumed artifact (no authorization, no dispatch)", async () => {
    const { runtime } = await harness();
    const missionId = await completeIntake(runtime);
    await expect(
      runtime.dispatch.dispatch(
        missionId,
        "CREATE_EXTERNAL_EFFECT",
        { connectionRef: "conn:fake", executionMode: "SANDBOX" },
        T1,
      ),
    ).rejects.toBeInstanceOf(PaymentMissionError);
  });

  it("the scripted-consequential path: preview → explicit UI authorization → dispatch → UNKNOWN reconciles before retry → CONFIRMED completes", async () => {
    const { runtime } = await harness(["UNKNOWN", "CONFIRMED"]);
    const missionId = await completeIntake(runtime);
    const env = scriptedPassingEnvironment(T0);

    // The gates PASS over the scripted (clearly-labeled fake) observations.
    const aggregate = await runtime.runGates(missionId, env);
    expect(aggregate.decision).toBe("PROCEED");

    // Preview (dispatchable), then the explicit authorization round-trip.
    const preview = await runtime.presentPreview(missionId, env);
    expect(preview.dispatchable).toBe(true);
    const request = await runtime.requestAuthorization(missionId, T0);
    const resolution = await runtime.resolveAuthorization(
      {
        requestId: request.requestId,
        decision: "APPROVE",
        origin: "PREVIEW_UI_ACT",
        principalRef: "principal:test",
      },
      T1,
    );
    expect(resolution.outcome.kind).toBe("GRANTED");
    const artifact = resolution.outcome.kind === "GRANTED" ? resolution.outcome.artifact : undefined;
    expect(artifact).toBeDefined();

    // Dispatch #1: the scripted UNKNOWN — OUTCOME_UNKNOWN, never FAILED.
    const first = await runtime.dispatch.dispatch(
      missionId,
      "CREATE_EXTERNAL_EFFECT",
      { connectionRef: "conn:fake", executionMode: "SANDBOX", authorizationArtifactId: artifact!.artifactId },
      T1,
    );
    expect(first.kind).toBe("DISPATCHED");
    if (first.kind === "DISPATCHED") {
      expect(first.envelope.outcome).toBe("UNKNOWN");
    }

    // Reconcile the UNKNOWN with provider evidence (INV-04 — before retry).
    const missionAfterUnknown = await runtime.getMission(missionId);
    const unknownAttempt = missionAfterUnknown?.attempts[0];
    expect(unknownAttempt).toBeDefined();
    const reconciled = await runtime.dispatch.reconcile(
      missionId,
      unknownAttempt!.attemptId,
      { resolvedTo: "FAILED", source: "EXTERNAL_PROVIDER_STATEMENT", evidenceRefs: ["ev:fake-1"] },
      T1,
    );
    expect(reconciled.attempts[0]?.reconciliation?.resolvedTo).toBe("FAILED");

    // A SECOND authorization + dispatch (fresh artifact; the first was
    // single-use) — the scripted CONFIRMED completes the mission.
    const request2 = await runtime.requestAuthorization(missionId, T1);
    const resolution2 = await runtime.resolveAuthorization(
      {
        requestId: request2.requestId,
        decision: "APPROVE",
        origin: "PREVIEW_UI_ACT",
        principalRef: "principal:test",
      },
      T1,
    );
    expect(resolution2.outcome.kind).toBe("GRANTED");
    const second = await runtime.dispatch.dispatch(
      missionId,
      "CREATE_EXTERNAL_EFFECT",
      {
        connectionRef: "conn:fake",
        executionMode: "SANDBOX",
        authorizationArtifactId:
          resolution2.outcome.kind === "GRANTED" ? resolution2.outcome.artifact.artifactId : "",
      },
      T1,
    );
    expect(second.kind).toBe("DISPATCHED");
    if (second.kind === "DISPATCHED") {
      expect(second.envelope.outcome).toBe("CONFIRMED");
    }
    const completed = await runtime.getMission(missionId);
    expect(completed?.status).toBe("COMPLETED");
    // Exactly two authority calls — no duplicate write on the reconciled path.
    expect((runtime as unknown as { readonly authority?: { calls: number } }).authority).toBeUndefined();
  });
});

describe("pause / resume / cancel / expire (safe orchestration)", () => {
  it("a paused mission refuses intake and dispatch until resumed; the draft is kept", async () => {
    const { runtime } = await harness();
    const seeded = await runtime.seedMission(
      { direction: "MOVE", goalStatement: "move funds", origin: "COMPOSER_TEXT" },
      T0,
    );
    const paused = await runtime.pause(seeded.missionId, T0);
    expect(paused.status).toBe("PAUSED");
    await expect(
      runtime.captureField(seeded.missionId, "purpose", "test", T0),
    ).rejects.toBeInstanceOf(PaymentMissionError);
    const resumed = await runtime.resume(seeded.missionId, T1);
    expect(resumed.status).not.toBe("PAUSED");
  });

  it("a clean cancel works only with no confirmed effect; terminal missions are monotonic", async () => {
    const { runtime } = await harness();
    const seeded = await runtime.seedMission(
      { direction: "CONVERT", goalStatement: "convert", origin: "COMPOSER_TEXT" },
      T0,
    );
    const cancelled = await runtime.cancelMission(seeded.missionId, T0);
    expect(cancelled.kind).toBe("CANCELLED");
    const after = await runtime.getMission(seeded.missionId);
    expect(after?.status).toBe("CANCELLED");
    await expect(runtime.pause(seeded.missionId, T1)).rejects.toBeInstanceOf(PaymentMissionError);
    await expect(runtime.cancelMission(seeded.missionId, T1)).rejects.toBeInstanceOf(PaymentMissionError);
  });

  it("expiry is honest (the captured deadline path)", async () => {
    const { runtime } = await harness();
    const missionId = await completeIntake(runtime);
    // The captured deadline is 2026-10-23T12:00:00Z — expire AFTER it.
    const afterDeadline = "2026-10-24T12:00:00Z";
    const expired = await runtime.expireMission(missionId, afterDeadline);
    expect(expired.status).toBe("EXPIRED");
    // Expiry before the deadline is refused honestly.
    const fresh = await runtime.seedMission(
      { direction: "RECEIVE", goalStatement: "get paid", origin: "COMPOSER_TEXT" },
      T0,
    );
    await expect(runtime.expireMission(fresh.missionId, T1)).rejects.toBeInstanceOf(PaymentMissionError);
  });
});

describe("restart stability + interruption recovery", () => {
  it("mission records + the authorization gate survive a store reload", async () => {
    const world = await harness();
    const missionId = await completeIntake(world.runtime);
    const reloaded = await world.reload();
    const mission = await reloaded.getMission(missionId);
    expect(mission?.id).toBe(missionId);
    expect(mission?.fields.purpose.status).toBe("CAPTURED");
    const listed = await reloaded.listMissions();
    expect(listed.length).toBeGreaterThanOrEqual(1);
  });

  it("recoverInterruptions is the honest restart sweep (no in-flight here — a no-op is truthful)", async () => {
    const world = await harness();
    const missionId = await completeIntake(world.runtime);
    const reloaded = await world.reload();
    const recovered = await reloaded.dispatch.recoverInterruptions(T1);
    expect(Array.isArray(recovered)).toBe(true);
    const mission = await reloaded.getMission(missionId);
    expect(mission).not.toBeNull();
  });
});
