import { describe, expect, it } from "vitest";
import {
  certifyEndpointIdempotency,
  recordedOutcomeFor,
} from "../src/index.ts";
import type { RecordedEndpointDispatch } from "../src/index.ts";
import { conformingDispatchLog } from "./fixtures.ts";

const CONTRACT = {
  operationId: "op:create-payout",
  keyScope: { connection: true, operation: true },
  keyDerivation: "NAMESPACED_COMMAND_ID",
  replayBehavior: "REPLAYS_ORIGINAL_RESULT",
  conflictReporting: "PROVIDER_CONFLICT_SIGNAL",
} as const;

/**
 * FIN-LAW-02 — endpoint idempotency (hard law 2): replaying a command
 * at the same endpoint with the same idempotency key yields the
 * recorded outcome, never a second external effect; distinct keys are
 * distinct intents.
 */
describe("FIN-LAW-02: endpoint idempotency", () => {
  it("the conforming dispatch log passes (first execution + faithful replay + typed conflict + distinct keys)", () => {
    const verdict = certifyEndpointIdempotency({
      subjectRef: "corridor:test",
      dispatches: conformingDispatchLog(),
      contract: CONTRACT,
      evidenceRefs: ["ev:hermetic-1"],
    });
    expect(verdict.passed).toBe(true);
    expect(verdict.violations).toEqual([]);
  });

  it("a replay that yields a SECOND external effect violates the law", () => {
    const dispatches: RecordedEndpointDispatch[] = [
      ...conformingDispatchLog(),
      {
        endpointId: "op:create-payout",
        idempotencyKey: "payswap:cmd:alpha-1",
        commandId: "cmd:alpha-1",
        commandDigest: "fnv1a64:1111111111111111",
        externalEffectId: "ext:effect-SECOND",
        outcome: "CONFIRMED",
      },
    ];
    const verdict = certifyEndpointIdempotency({
      subjectRef: "corridor:test",
      dispatches,
      evidenceRefs: ["ev:hermetic-1"],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("never creates a second external effect");
  });

  it("a replay that answers a DIFFERENT outcome violates the recorded-outcome law", () => {
    const dispatches: RecordedEndpointDispatch[] = [
      ...conformingDispatchLog(),
      {
        endpointId: "op:create-payout",
        idempotencyKey: "payswap:cmd:alpha-1",
        commandId: "cmd:alpha-1",
        commandDigest: "fnv1a64:1111111111111111",
        outcome: "FAILED",
      },
    ];
    const verdict = certifyEndpointIdempotency({
      subjectRef: "corridor:test",
      dispatches,
      evidenceRefs: ["ev:hermetic-1"],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("recorded outcome");
  });

  it("the same key with a different intent that is NOT surfaced as a typed conflict violates the law", () => {
    const dispatches: RecordedEndpointDispatch[] = [
      ...conformingDispatchLog(),
      {
        endpointId: "op:create-payout",
        idempotencyKey: "payswap:cmd:alpha-1",
        commandId: "cmd:alpha-1",
        commandDigest: "fnv1a64:2222222222222222",
        externalEffectId: "ext:effect-3",
        outcome: "CONFIRMED",
      },
    ];
    const verdict = certifyEndpointIdempotency({
      subjectRef: "corridor:test",
      dispatches,
      evidenceRefs: ["ev:hermetic-1"],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("typed conflict");
  });

  it("two DISTINCT keys collapsing into one external effect violates distinct-intents", () => {
    const dispatches: RecordedEndpointDispatch[] = [
      ...conformingDispatchLog(),
      {
        endpointId: "op:create-payout",
        idempotencyKey: "payswap:cmd:delta-3",
        commandId: "cmd:delta-3",
        commandDigest: "fnv1a64:4444444444444444",
        externalEffectId: "ext:effect-2", // owned by cmd:beta-2's key
        outcome: "CONFIRMED",
      },
    ];
    const verdict = certifyEndpointIdempotency({
      subjectRef: "corridor:test",
      dispatches,
      evidenceRefs: ["ev:hermetic-1"],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("distinct keys are distinct intents");
  });

  it("a key that does not derive per the pinned namespaced law is flagged when a contract is supplied", () => {
    const dispatches: RecordedEndpointDispatch[] = [
      ...conformingDispatchLog(),
      {
        endpointId: "op:create-payout",
        idempotencyKey: "raw-command-id-not-derived",
        commandId: "cmd:epsilon-4",
        commandDigest: "fnv1a64:5555555555555555",
        externalEffectId: "ext:effect-4",
        outcome: "CONFIRMED",
      },
    ];
    const verdict = certifyEndpointIdempotency({
      subjectRef: "corridor:test",
      dispatches,
      contract: CONTRACT,
      evidenceRefs: ["ev:hermetic-1"],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("namespaced derivation");
  });

  it("an UNKNOWN first attempt that later CONFIRMS under the SAME key is the recorded-outcome discipline", () => {
    const dispatches: RecordedEndpointDispatch[] = [
      {
        endpointId: "op:create-payout",
        idempotencyKey: "payswap:cmd:zeta-1",
        commandId: "cmd:zeta-1",
        commandDigest: "fnv1a64:6666666666666666",
        outcome: "UNKNOWN",
      },
      {
        endpointId: "op:create-payout",
        idempotencyKey: "payswap:cmd:zeta-1",
        commandId: "cmd:zeta-1",
        commandDigest: "fnv1a64:6666666666666666",
        outcome: "UNKNOWN",
      },
    ];
    const verdict = certifyEndpointIdempotency({
      subjectRef: "corridor:test",
      dispatches,
      evidenceRefs: ["ev:hermetic-1"],
    });
    expect(verdict.passed).toBe(true);
  });

  it("the recorded-outcome policy maps each (endpoint, key) to its first recording", () => {
    const policy = recordedOutcomeFor(conformingDispatchLog());
    expect(policy.get("op:create-payout::payswap:cmd:alpha-1")).toMatchObject({
      outcome: "CONFIRMED",
      externalEffectId: "ext:effect-1",
    });
    expect(policy.get("op:create-payout::payswap:cmd:beta-2")).toMatchObject({
      externalEffectId: "ext:effect-2",
    });
    expect(policy.size).toBe(2);
  });

  it("malformed dispatches fail closed", () => {
    expect(() =>
      certifyEndpointIdempotency({
        subjectRef: "corridor:test",
        dispatches: [
          {
            endpointId: "",
            idempotencyKey: "k",
            commandDigest: "d",
            outcome: "CONFIRMED",
          },
        ],
        evidenceRefs: [],
      }),
    ).toThrow(/requires an endpoint/);
  });
});
