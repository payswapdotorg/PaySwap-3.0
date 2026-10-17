import { describe, expect, it } from "vitest";
import {
  ProtocolCommandShapeError,
  StrategyAssignmentError,
  assignStrategy,
  canStrategyExecuteAlone,
  executeOrganizationCommand,
  releaseOrganization,
} from "../src/index.ts";
import type { StrategyRecommendation } from "../src/index.ts";
import type { Equal, Expect } from "./type-utils.ts";
import { makeOrgDraft, makeReleasedOrg } from "./fixtures.ts";

/**
 * NET-NEW (P3-W1): the Strategy-vs-Organization law (FROZEN §7), explicit
 * in code and types. Strategy answers WHAT happens (advisory);
 * Organization answers WHO/WHAT executes it (released, versioned,
 * authority-resolved). There is no code path from a strategy to an effect.
 */

const T0 = 5_000_000;

const settleNow: StrategyRecommendation = {
  strategyId: "settle-now",
  rationale: "deadline is close and the corridor is cheap now",
  proposedFor: { orgId: "org:payops-1", orgVersion: 1 },
};

describe("StrategyRecommendation — the WHAT is advisory (type level)", () => {
  it("carries no executor, instance, grant or authority fields (weak-type detection)", () => {
    // Type-level guarantees enforced by `tsc --noEmit` below; the runtime
    // mirror: a recommendation is data about a strategy, nothing else.
    const keys = Object.keys(settleNow).sort();
    expect(keys).toEqual(["proposedFor", "rationale", "strategyId"]);
  });

  it("canStrategyExecuteAlone is false for every strategy — by construction", () => {
    expect(canStrategyExecuteAlone(settleNow)).toBe(false);
    expect(canStrategyExecuteAlone({ strategyId: "delay-within-window" })).toBe(false);
  });
});

// Type-level guarantees (enforced by `tsc --noEmit`):

type _noExecutors = StrategyRecommendation extends { executors?: unknown } ? true : false;
type _noInstances = StrategyRecommendation extends { instances?: unknown } ? true : false;
type _noGrants = StrategyRecommendation extends { grants?: unknown } ? true : false;
type _noAuthorization = StrategyRecommendation extends { authorization?: unknown } ? true : false;
type _noSignature = StrategyRecommendation extends { signature?: unknown } ? true : false;
type _assert1 = Expect<Equal<_noExecutors, false>>;
type _assert2 = Expect<Equal<_noInstances, false>>;
type _assert3 = Expect<Equal<_noGrants, false>>;
type _assert4 = Expect<Equal<_noAuthorization, false>>;
type _assert5 = Expect<Equal<_noSignature, false>>;

describe("assignStrategy — the pinned WHAT + WHO record", () => {
  it("pins the advisory strategy to a released organization version, content-hashed", () => {
    const org = makeReleasedOrg();
    const assignment = assignStrategy(settleNow, org, T0);
    expect(assignment.schemaVersion).toBe(1);
    expect(assignment.strategy.strategyId).toBe("settle-now");
    expect(assignment.assignedTo).toEqual({
      orgId: "org:payops-1",
      orgVersion: 1,
      orgContentHash: org.release.contentHash,
    });
    expect(assignment.contentHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    // deterministic: identical inputs -> identical assignment hash
    expect(assignStrategy(settleNow, org, T0).contentHash).toBe(assignment.contentHash);
  });

  it("rejects a strategy proposed for a DIFFERENT organization version (WHAT/WHO must agree)", () => {
    const org = makeReleasedOrg();
    expect(() =>
      assignStrategy(
        { ...settleNow, proposedFor: { orgId: "org:payops-1", orgVersion: 2 } },
        org,
        T0,
      ),
    ).toThrow(/must agree/);
    expect(() =>
      assignStrategy(
        { ...settleNow, proposedFor: { orgId: "org:other", orgVersion: 1 } },
        org,
        T0,
      ),
    ).toThrow(StrategyAssignmentError);
    expect(() => assignStrategy({ strategyId: "" }, org, T0)).toThrow(/strategyId/);
  });

  it("rejects a strategy carrying command or authority shape — the WHAT stays advisory", () => {
    const org = makeReleasedOrg();
    expect(() =>
      assignStrategy(
        { strategyId: "x", ...{ idempotencyKey: "idem-1" } } as unknown as StrategyRecommendation,
        org,
        T0,
      ),
    ).toThrow(ProtocolCommandShapeError);
  });

  it("the assignment hash changes when the ORGANIZATION version changes (the WHO is pinned)", () => {
    const v1 = makeReleasedOrg();
    const v2 = releaseOrganization(
      {
        ...makeOrgDraft(),
        version: 2,
        derivedFrom: { version: 1, contentHash: v1.release.contentHash },
      },
      4_100_000,
    );
    const a1 = assignStrategy(settleNow, v1, T0);
    const a2 = assignStrategy({ ...settleNow, proposedFor: { orgId: "org:payops-1", orgVersion: 2 } }, v2, T0);
    expect(a1.assignedTo.orgContentHash).not.toBe(a2.assignedTo.orgContentHash);
    expect(a1.contentHash).not.toBe(a2.contentHash);
  });
});

describe("the §7 law end to end — strategies never execute; organizations do", () => {
  it("execution requires a RELEASED organization; a strategy alone has no execution path", () => {
    // The only execution entry point takes a ReleasedOrganization +
    // injected authority adapter + principals. A StrategyRecommendation is
    // not (and cannot be) an input; the drafts-vs-released law still holds.
    expect(() =>
      executeOrganizationCommand({
        organization: makeOrgDraft(), // not released: nothing executes
        request: {
          initiatingInstanceId: "instance-payer",
          action: "payments.initiate",
          resource: { type: "payment_intent", resourceId: "pi-1" },
          context: {},
          requestHash: "reqhash-1",
          requestedAt: T0,
        },
        authority: {
          principalRef: () => "agent:x",
          evaluate: () => ({ decision: "DENY", reason: "no_matching_grant", policyRefs: [] }),
          attenuateGrant: () => {
            throw new Error("unreachable");
          },
        },
        grants: [],
        epochState: { ledger: { currentEpoch: () => undefined } },
        principals: new Map(),
      }),
    ).toThrow(/RELEASED/);
  });
});
