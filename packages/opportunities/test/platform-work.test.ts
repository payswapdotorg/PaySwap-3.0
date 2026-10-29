import { describe, expect, it } from "vitest";
import {
  PLATFORM_GAP_IDS,
  REPAIR_OPERATORS,
} from "../src/repair-operators.ts";
import type { RepairOperator } from "../src/repair-operators.ts";
import type { RepairExclusionFact } from "../src/repair-facts.ts";
import {
  PlatformWorkError,
  constructPlatformWorkItem,
  platformWorkItemId,
  platformWorkPermitsExecution,
} from "../src/platform-work.ts";
import { contentDigest } from "../src/canonical.ts";
import { pinnedAssertNotProtocolCommand } from "../src/pins/agents.ts";

/**
 * The credential-shaped detection fixture, ASSEMBLED AT RUNTIME from
 * fragments (the GitHub-push-protection discipline — no complete secret
 * literal ever appears in this source).
 */
const CREDENTIAL_SHAPED_MESSAGE = ["sk", "abcdefghijklmnopqrstuvwxyz123456"].join("-");

/**
 * The platform work items (P23-A, ADR-0015 D4): the review's "explicit
 * platform/integration work items with evidence" — what PaySwap itself
 * would need to build, each citing the verbatim exclusions that prove the
 * gap, never a backlog fabrication, never conflated with a party
 * prerequisite. Laws pinned here: the deterministic id
 * `platform-work:<gapId>:<digest-of-evidence>`; construction is FAIL-CLOSED
 * (only a PLATFORM_WORK catalogue member; non-empty facts whose codes are
 * in the operator's applicable set); the honest state-conditioned gaps;
 * ADVISORY ONLY + never-execute literals; the marker-scan, the
 * guarantee-language scan and the secret scan on the built record.
 */
describe("the platform work items (ADR-0015 D4)", () => {
  const AT = 1_735_689_600_000;
  const connectorOperation = REPAIR_OPERATORS.find(
    (operator) => operator.operatorId === "platform:connector-operation",
  ) as RepairOperator;
  const providerIntegration = REPAIR_OPERATORS.find(
    (operator) => operator.operatorId === "platform:provider-integration",
  ) as RepairOperator;
  const crossProviderShape = REPAIR_OPERATORS.find(
    (operator) => operator.operatorId === "platform:cross-provider-route-shape",
  ) as RepairOperator;
  const partyChangeOperator = REPAIR_OPERATORS.find(
    (operator) => operator.operatorId === "repair:recipient-enables-served-funding-method",
  ) as RepairOperator;
  const multiHopOperator = REPAIR_OPERATORS.find(
    (operator) => operator.operatorId === "repair:convert-through-supported-asset",
  ) as RepairOperator;

  const connectorFacts: readonly RepairExclusionFact[] = [
    {
      side: "RECIPIENT",
      routeId: "route:recipient-1",
      code: "NOT_EXECUTABLE_CAPABILITY",
      message: "the capability is declared but no executable connector operation serves it",
    },
    {
      side: "RECIPIENT",
      routeId: "route:recipient-2",
      code: "IMPLEMENTATION_SCOPE_NOT_SERVED",
      message: "the implementation scope does not serve this corridor",
    },
  ];

  it("constructs a platform work item from a PLATFORM_WORK operator and its verbatim facts", () => {
    const item = constructPlatformWorkItem(connectorOperation, connectorFacts, AT);
    expect(item.gapId).toBe("platform:connector-operation");
    expect(item.requiredByOperatorIds).toEqual(["platform:connector-operation"]);
    expect(item.status).toBe("OPEN");
    expect(item.advisoryOnly).toBe(true);
    expect(item.permitsExecution).toBe(false);
    expect(item.createdAt).toBe(AT);
    expect(item.evidenceBasis).toEqual(connectorFacts);
    // The title names the codes, the routes and the honest distinctness.
    expect(item.title).toContain("platform:connector-operation");
    expect(item.title).toContain("NOT_EXECUTABLE_CAPABILITY");
    expect(item.title).toContain("route:recipient-1");
    expect(item.title).toContain("route:recipient-2");
    expect(Object.isFrozen(item)).toBe(true);
    expect(Object.isFrozen(item.evidenceBasis)).toBe(true);
    expect(Object.isFrozen(item.requiredByOperatorIds)).toBe(true);
  });

  it("the workItemId is the deterministic platform-work:<gapId>:<digest-of-evidence> derivation", () => {
    const item = constructPlatformWorkItem(connectorOperation, connectorFacts, AT);
    expect(item.workItemId).toBe(`platform-work:platform:connector-operation:${contentDigest(connectorFacts)}`);
    expect(item.workItemId).toBe(platformWorkItemId("platform:connector-operation", connectorFacts));
    // Different evidence -> a different id (the digest is over the evidence).
    const otherFacts = [connectorFacts[0] as RepairExclusionFact];
    const other = constructPlatformWorkItem(connectorOperation, otherFacts, AT);
    expect(other.workItemId).not.toBe(item.workItemId);
    expect(other.workItemId).toBe(`platform-work:platform:connector-operation:${contentDigest(otherFacts)}`);
  });

  it("is deterministic: identical inputs and instant yield byte-identical items", () => {
    const first = constructPlatformWorkItem(providerIntegration, [
      { side: "SENDER", routeId: "route:sender-1", code: "CUSTOMER_TYPE_NOT_SERVED", message: "the customer type is not served" },
    ], AT);
    const second = constructPlatformWorkItem(providerIntegration, [
      { side: "SENDER", routeId: "route:sender-1", code: "CUSTOMER_TYPE_NOT_SERVED", message: "the customer type is not served" },
    ], AT);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("fail-closed: only a PLATFORM_WORK CATALOGUE member constructs (never a party change, a multi-hop or a foreigner)", () => {
    expect(() => constructPlatformWorkItem(partyChangeOperator, connectorFacts, AT)).toThrow(PlatformWorkError);
    expect(() => constructPlatformWorkItem(multiHopOperator, connectorFacts, AT)).toThrow(PlatformWorkError);
    expect(() =>
      constructPlatformWorkItem(
        { ...partyChangeOperator, operatorId: "platform:not-in-the-catalogue" } as unknown as RepairOperator,
        connectorFacts,
        AT,
      ),
    ).toThrow(PlatformWorkError);
    expect(() => constructPlatformWorkItem(null as never, connectorFacts, AT)).toThrow(PlatformWorkError);
  });

  it("fail-closed: the facts must be non-empty and each carry a code in the operator's applicable set", () => {
    expect(() => constructPlatformWorkItem(connectorOperation, [], AT)).toThrow(PlatformWorkError);
    // Off-vocabulary for THIS operator: the payout code does not prove the connector gap.
    expect(() =>
      constructPlatformWorkItem(connectorOperation, [
        { side: "RECIPIENT", routeId: "route:r", code: "PAYOUT_METHOD_NOT_SERVED", message: "m" },
      ], AT),
    ).toThrow(PlatformWorkError);
    // Outside the pinned 26 entirely.
    expect(() =>
      constructPlatformWorkItem(connectorOperation, [
        { side: "RECIPIENT", routeId: "route:r", code: "NOT_A_CODE" as RepairExclusionFact["code"], message: "m" },
      ], AT),
    ).toThrow(PlatformWorkError);
    // Malformed fact shapes aggregate into the typed error.
    expect(() => constructPlatformWorkItem(connectorOperation, [null as unknown as RepairExclusionFact], AT)).toThrow(PlatformWorkError);
    expect(() =>
      constructPlatformWorkItem(connectorOperation, [
        { side: "MERCHANT", routeId: "r", code: "NOT_EXECUTABLE_CAPABILITY", message: "m" } as unknown as RepairExclusionFact,
      ], AT),
    ).toThrow(PlatformWorkError);
    expect(() =>
      constructPlatformWorkItem(connectorOperation, [
        { side: "RECIPIENT", routeId: "", code: "NOT_EXECUTABLE_CAPABILITY", message: "m" } as unknown as RepairExclusionFact,
      ], AT),
    ).toThrow(PlatformWorkError);
    expect(() => constructPlatformWorkItem(connectorOperation, connectorFacts, -1)).toThrow(RangeError);
  });

  it("the state-conditioned P21 gaps cite the corridor's operator-applicable exclusions (never a non-operator code)", () => {
    const corridorFacts: readonly RepairExclusionFact[] = [
      {
        side: "RECIPIENT",
        routeId: "route:recipient-1",
        code: "FUNDING_METHOD_NOT_SERVED",
        message: "the funding method is not served",
        fundingMethod: "flutterwave_wallet",
      },
    ];
    const item = constructPlatformWorkItem(crossProviderShape, corridorFacts, AT);
    expect(item.gapId).toBe("platform:cross-provider-route-shape");
    expect(item.workItemId).toBe(`platform-work:platform:cross-provider-route-shape:${contentDigest(corridorFacts)}`);
    // A recheck/wait/intake/revise classification NEVER proves a platform gap.
    expect(() =>
      constructPlatformWorkItem(crossProviderShape, [
        { side: "RECIPIENT", routeId: "route:r", code: "STALE_OBSERVATION", message: "m" },
      ], AT),
    ).toThrow(PlatformWorkError);
    expect(() =>
      constructPlatformWorkItem(crossProviderShape, [
        { side: "RECIPIENT", routeId: "route:r", code: "AMOUNT_CURRENCY_MISMATCH", message: "m" },
      ], AT),
    ).toThrow(PlatformWorkError);
  });

  it("every gap id in the frozen space constructs (the five platform operators)", () => {
    for (const gapId of PLATFORM_GAP_IDS) {
      const operator = REPAIR_OPERATORS.find((entry) => entry.operatorId === gapId) as RepairOperator;
      const facts: readonly RepairExclusionFact[] =
        operator.applicableExclusionCodes.length > 0
          ? [{ side: "SENDER", routeId: "route:sender-1", code: operator.applicableExclusionCodes[0] as RepairExclusionFact["code"], message: "a verbatim exclusion" }]
          : [{ side: "SENDER", routeId: "route:sender-1", code: "NOT_EXECUTABLE_CAPABILITY", message: "a verbatim exclusion" }];
      const item = constructPlatformWorkItem(operator, facts, AT);
      expect(item.gapId, gapId).toBe(gapId);
      expect(item.workItemId, gapId).toContain("platform-work:");
    }
  });

  it("the title is vocabulary-scanned (a guarantee-shaped route id fails closed)", () => {
    expect(() =>
      constructPlatformWorkItem(connectorOperation, [
        { side: "RECIPIENT", routeId: "route:risk-free-corridor", code: "NOT_EXECUTABLE_CAPABILITY", message: "m" },
      ], AT),
    ).toThrow(/no-guaranteed-returns/);
  });

  it("the built item is secret-scanned (credential-shaped material fails closed)", () => {
    expect(() =>
      constructPlatformWorkItem(connectorOperation, [
        { side: "RECIPIENT", routeId: "route:r", code: "NOT_EXECUTABLE_CAPABILITY", message: CREDENTIAL_SHAPED_MESSAGE },
      ], AT),
    ).toThrow(/secret material/i);
  });

  it("the marker-scan: the built item carries no command/authority shape at any depth", () => {
    const item = constructPlatformWorkItem(connectorOperation, connectorFacts, AT);
    expect(() => pinnedAssertNotProtocolCommand(item)).not.toThrow();
  });

  it("is ADVISORY ONLY: platformWorkPermitsExecution is the literal false", () => {
    expect(platformWorkPermitsExecution()).toBe(false);
    const item = constructPlatformWorkItem(connectorOperation, connectorFacts, AT);
    expect(item.advisoryOnly).toBe(true);
    expect(item.permitsExecution).toBe(false);
  });
});
