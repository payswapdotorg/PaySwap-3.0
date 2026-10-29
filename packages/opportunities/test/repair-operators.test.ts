import { describe, expect, it } from "vitest";
import {
  NON_OPERATOR_CLASSIFICATION_KINDS,
  NON_OPERATOR_CLASSIFICATIONS,
  assertCatalogueTotality,
  catalogueTotalityViolations,
} from "../src/repair-classifications.ts";
import {
  OPERATOR_APPLICABLE_EXCLUSION_CODES,
  P21_CORRIDOR_PATTERN,
  PLATFORM_GAP_IDS,
  REPAIR_OPERATOR_IDS,
  REPAIR_OPERATOR_KINDS,
  REPAIR_OPERATORS,
  lookupRepairOperators,
  matchesRepairCorridorPattern,
  operatorsForFacts,
} from "../src/repair-operators.ts";
import type {
  RepairCorridorFacts,
  RepairOperator,
} from "../src/repair-operators.ts";
import { PINNED_CORRIDOR_EXCLUSION_CODES } from "../src/pins/capability.ts";
import { RepairCatalogueError } from "../src/repair-facts.ts";
import type { RepairExclusionFact } from "../src/repair-facts.ts";

/**
 * The typed repair-operator catalogue (P23-A, ADR-0015 D2): the FROZEN
 * exclusion→repair mapping over the pinned 26-code corridor exclusion
 * vocabulary. Laws pinned here: the A.2 kind triple; the 15 A.3 operator ids
 * verbatim in canonical order with the AMENDED applicable-code sets; the
 * A.4 ten non-operator classifications; THE TOTALITY LAW (every one of the
 * 26 codes has EXACTLY ONE home — 16 operator-applicable, 10 non-operator);
 * THE SHADOWING LAW (on the P21 corridor the P21 operators shadow the
 * general funding operators; a foreign corridor never emits the P21 names);
 * deterministic fail-closed lookups; ADVISORY ONLY on every entry.
 */
describe("the typed repair-operator catalogue (ADR-0015 D2)", () => {
  const P21_FUNDING_FACT: RepairExclusionFact = {
    side: "RECIPIENT",
    routeId: "route:recipient-1",
    code: "FUNDING_METHOD_NOT_SERVED",
    message: "the funding method is not served by the receiving rail's restriction sets",
    fundingMethod: "flutterwave_wallet",
  };
  const FOREIGN_FUNDING_FACT: RepairExclusionFact = {
    side: "RECIPIENT",
    routeId: "route:recipient-2",
    code: "FUNDING_METHOD_NOT_SERVED",
    message: "the funding method is not served by the receiving rail's restriction sets",
    fundingMethod: "sepa_credit_transfer",
  };
  const P21_CORRIDOR: Readonly<RepairCorridorFacts> = P21_CORRIDOR_PATTERN;
  const FOREIGN_CORRIDOR: Readonly<RepairCorridorFacts> = {
    fundingMethod: "sepa_credit_transfer",
    receivingProvider: "wise",
  };

  it("the kinds vocabulary is the frozen A.2 triple", () => {
    expect(Object.isFrozen(REPAIR_OPERATOR_KINDS)).toBe(true);
    expect([...REPAIR_OPERATOR_KINDS]).toEqual(["PARTY_CHANGE", "PLATFORM_WORK", "MULTI_HOP"]);
  });

  it("the 15 operator ids are the frozen A.3 list, verbatim, in canonical order", () => {
    expect(Object.isFrozen(REPAIR_OPERATOR_IDS)).toBe(true);
    expect([...REPAIR_OPERATOR_IDS]).toEqual([
      "repair:recipient-enables-flw-receiving-method",
      "repair:sender-adds-stripe-compatible-instrument",
      "repair:recipient-enables-served-funding-method",
      "repair:sender-adds-served-funding-instrument",
      "repair:recipient-enables-served-payout-method",
      "repair:sender-completes-provider-permissions",
      "repair:intermediary-introduced",
      "repair:convert-through-supported-asset",
      "repair:bridge-via-intermediary-rail",
      "repair:split-below-maximum",
      "platform:connector-operation",
      "platform:provider-integration",
      "platform:permission-model",
      "platform:cross-provider-route-shape",
      "platform:flutterwave-send-operation",
    ]);
    expect(REPAIR_OPERATORS).toHaveLength(15);
    expect(REPAIR_OPERATORS.map((operator) => operator.operatorId)).toEqual([...REPAIR_OPERATOR_IDS]);
    for (const operator of REPAIR_OPERATORS) {
      expect(Object.isFrozen(operator), operator.operatorId).toBe(true);
      expect(Object.isFrozen(operator.applicableExclusionCodes), operator.operatorId).toBe(true);
    }
  });

  it("every entry is ADVISORY ONLY (the never-authorization literals, machine-checked)", () => {
    for (const operator of REPAIR_OPERATORS) {
      expect(operator.advisoryOnly, operator.operatorId).toBe(true);
      expect(operator.permitsExecution, operator.operatorId).toBe(false);
      expect(operator.evidenceLaw.length, operator.operatorId).toBeGreaterThan(0);
      expect(operator.evidenceLaw, operator.operatorId).toMatch(/grounded only in the (verbatim|honest)/);
    }
  });

  it("the frozen applicable-code sets are the AMENDED A.3 values (canonical pinned order)", () => {
    const expected: Readonly<Record<string, readonly string[]>> = {
      "repair:recipient-enables-flw-receiving-method": ["FUNDING_METHOD_NOT_SERVED"],
      "repair:sender-adds-stripe-compatible-instrument": ["FUNDING_METHOD_NOT_SERVED"],
      "repair:recipient-enables-served-funding-method": ["FUNDING_METHOD_NOT_SERVED"],
      "repair:sender-adds-served-funding-instrument": ["FUNDING_METHOD_NOT_SERVED"],
      "repair:recipient-enables-served-payout-method": ["PAYOUT_METHOD_NOT_SERVED"],
      "repair:sender-completes-provider-permissions": ["AUTHORIZATION_NOT_ACTIVE", "MISSING_PERMISSIONS"],
      "repair:intermediary-introduced": [],
      "repair:convert-through-supported-asset": ["SOURCE_CURRENCY_NOT_SUPPORTED", "DESTINATION_CURRENCY_NOT_SUPPORTED"],
      "repair:bridge-via-intermediary-rail": ["SOURCE_COUNTRY_NOT_SERVED", "DESTINATION_COUNTRY_NOT_SERVED"],
      "repair:split-below-maximum": ["AMOUNT_ABOVE_MAXIMUM"],
      "platform:connector-operation": ["INSTANCE_INELIGIBLE", "IMPLEMENTATION_SCOPE_NOT_SERVED", "NOT_EXECUTABLE_CAPABILITY"],
      "platform:provider-integration": ["INSTANCE_GEOGRAPHY_NOT_SERVED", "INSTANCE_CURRENCY_NOT_SUPPORTED", "CUSTOMER_TYPE_NOT_SERVED", "RECIPIENT_TYPE_NOT_SERVED"],
      "platform:permission-model": ["MISSING_PERMISSIONS"],
      "platform:cross-provider-route-shape": [],
      "platform:flutterwave-send-operation": [],
    };
    for (const operator of REPAIR_OPERATORS) {
      expect(operator.applicableExclusionCodes, operator.operatorId).toEqual(
        expected[operator.operatorId] ?? ["<unexpected operator>"],
      );
    }
  });

  it("the P21-specific flags, the side/corridor-pattern conditions and the shadowing data", () => {
    const byId = new Map(REPAIR_OPERATORS.map((operator) => [operator.operatorId, operator]));
    const p21Ids = REPAIR_OPERATORS.filter((operator) => operator.p21Specific).map((operator) => operator.operatorId);
    expect(p21Ids).toEqual([
      "repair:recipient-enables-flw-receiving-method",
      "repair:sender-adds-stripe-compatible-instrument",
      "repair:intermediary-introduced",
      "platform:cross-provider-route-shape",
      "platform:flutterwave-send-operation",
    ]);
    const flw = byId.get("repair:recipient-enables-flw-receiving-method");
    expect(flw?.side).toBe("RECIPIENT");
    expect(flw?.corridorPattern).toEqual({ fundingMethod: "flutterwave_wallet" });
    const stripe = byId.get("repair:sender-adds-stripe-compatible-instrument");
    expect(stripe?.side).toBe("RECIPIENT");
    expect(stripe?.corridorPattern).toEqual({ receivingProvider: "stripe" });
    // The state-conditioned P21 trio carries neither condition.
    for (const id of ["repair:intermediary-introduced", "platform:cross-provider-route-shape", "platform:flutterwave-send-operation"] as const) {
      expect(byId.get(id)?.side, id).toBeUndefined();
      expect(byId.get(id)?.corridorPattern, id).toBeUndefined();
    }
    // The shadowing data: the general funding operators name their P21 shadower.
    expect(byId.get("repair:recipient-enables-served-funding-method")?.shadowedBy).toBe(
      "repair:recipient-enables-flw-receiving-method",
    );
    expect(byId.get("repair:sender-adds-served-funding-instrument")?.shadowedBy).toBe(
      "repair:sender-adds-stripe-compatible-instrument",
    );
    // The P21 corridor pattern itself is the frozen FLW-wallet + Stripe pair.
    expect(Object.isFrozen(P21_CORRIDOR_PATTERN)).toBe(true);
    expect(P21_CORRIDOR_PATTERN).toEqual({ fundingMethod: "flutterwave_wallet", receivingProvider: "stripe" });
    expect(matchesRepairCorridorPattern(P21_CORRIDOR, P21_CORRIDOR_PATTERN)).toBe(true);
    expect(matchesRepairCorridorPattern(FOREIGN_CORRIDOR, P21_CORRIDOR_PATTERN)).toBe(false);
    expect(matchesRepairCorridorPattern({ fundingMethod: "flutterwave_wallet" }, { fundingMethod: "flutterwave_wallet" })).toBe(true);
  });

  it("the party-change members and platform gaps are the grown vocabularies (typed data)", () => {
    const byId = new Map(REPAIR_OPERATORS.map((operator) => [operator.operatorId, operator]));
    expect(byId.get("repair:recipient-enables-flw-receiving-method")?.partyChange).toBe("ENABLES_FLUTTERWAVE_RECEIVING_METHOD");
    expect(byId.get("repair:sender-adds-stripe-compatible-instrument")?.partyChange).toBe("ADDS_STRIPE_COMPATIBLE_INSTRUMENT");
    expect(byId.get("repair:recipient-enables-served-funding-method")?.partyChange).toBe("ENABLES_COMPATIBLE_RECEIVING_METHOD");
    expect(byId.get("repair:sender-adds-served-funding-instrument")?.partyChange).toBe("ADDS_COMPATIBLE_FUNDING_INSTRUMENT");
    expect(byId.get("repair:recipient-enables-served-payout-method")?.partyChange).toBe("ENABLES_COMPATIBLE_RECEIVING_METHOD");
    expect(byId.get("repair:sender-completes-provider-permissions")?.partyChange).toBe("COMPLETES_PROVIDER_PERMISSIONS");
    for (const operator of REPAIR_OPERATORS) {
      if (operator.kind !== "PARTY_CHANGE") {
        expect(operator.partyChange, operator.operatorId).toBeUndefined();
      }
      if (operator.kind === "PLATFORM_WORK") {
        expect(operator.platformGap, operator.operatorId).toBe(operator.operatorId);
      } else {
        expect(operator.platformGap, operator.operatorId).toBeUndefined();
      }
    }
  });

  it("the ten non-operator rows are the frozen A.4 classifications (each with its honest reason)", () => {
    expect([...NON_OPERATOR_CLASSIFICATION_KINDS]).toEqual(["RECHECK_TRIGGER", "WAIT_TRIGGER", "INTAKE_ASK", "REVISE_PATH"]);
    expect(NON_OPERATOR_CLASSIFICATIONS.map((row) => [row.code, row.classification])).toEqual([
      ["STALE_OBSERVATION", "RECHECK_TRIGGER"],
      ["AVAILABILITY_UNKNOWN", "RECHECK_TRIGGER"],
      ["OBSERVATION_ELIGIBILITY_UNKNOWN", "RECHECK_TRIGGER"],
      ["OBSERVATION_NOT_ELIGIBLE", "RECHECK_TRIGGER"],
      ["AVAILABILITY_UNAVAILABLE", "WAIT_TRIGGER"],
      ["QUOTA_EXHAUSTED", "WAIT_TRIGGER"],
      ["CUTOFF_PASSED", "WAIT_TRIGGER"],
      ["AMOUNT_BELOW_MINIMUM", "WAIT_TRIGGER"],
      ["MISSING_REQUIRED_FIELDS", "INTAKE_ASK"],
      ["AMOUNT_CURRENCY_MISMATCH", "REVISE_PATH"],
    ]);
    for (const row of NON_OPERATOR_CLASSIFICATIONS) {
      expect(row.reason.length, row.code).toBeGreaterThan(0);
    }
  });

  it("THE TOTALITY LAW: every one of the 26 pinned codes has EXACTLY ONE home (16 operator / 10 non-operator)", () => {
    expect(catalogueTotalityViolations()).toEqual([]);
    expect(() => assertCatalogueTotality()).not.toThrow();
    const operatorCodes = new Set<string>();
    for (const operator of REPAIR_OPERATORS) {
      for (const code of operator.applicableExclusionCodes) {
        operatorCodes.add(code);
      }
    }
    const nonOperatorCodes = NON_OPERATOR_CLASSIFICATIONS.map((row) => row.code);
    expect(operatorCodes.size).toBe(16);
    expect(nonOperatorCodes).toHaveLength(10);
    expect(new Set(nonOperatorCodes).size).toBe(10);
    expect([...OPERATOR_APPLICABLE_EXCLUSION_CODES]).toHaveLength(16);
    for (const code of PINNED_CORRIDOR_EXCLUSION_CODES) {
      const inOperators = operatorCodes.has(code);
      const inNonOperators = (nonOperatorCodes as readonly string[]).includes(code);
      expect(inOperators !== inNonOperators, code).toBe(true);
    }
    expect(operatorCodes.size + nonOperatorCodes.length).toBe(PINNED_CORRIDOR_EXCLUSION_CODES.length);
    expect(PINNED_CORRIDOR_EXCLUSION_CODES.length).toBe(26);
  });

  it("THE SHADOWING LAW: on the P21 corridor a general funding operator is NEVER emitted alongside its P21 shadower", () => {
    const emitted = operatorsForFacts([P21_FUNDING_FACT], P21_CORRIDOR).map((operator) => operator.operatorId);
    expect(emitted).toContain("repair:recipient-enables-flw-receiving-method");
    expect(emitted).toContain("repair:sender-adds-stripe-compatible-instrument");
    expect(emitted).not.toContain("repair:recipient-enables-served-funding-method");
    expect(emitted).not.toContain("repair:sender-adds-served-funding-instrument");
    for (const operator of REPAIR_OPERATORS) {
      if (operator.shadowedBy !== undefined) {
        const bothEmitted = emitted.includes(operator.operatorId) && emitted.includes(operator.shadowedBy);
        expect(bothEmitted, `${operator.operatorId} vs ${operator.shadowedBy}`).toBe(false);
      }
    }
  });

  it("a foreign corridor never emits the P21 names — the general operators serve it", () => {
    const emitted = operatorsForFacts([FOREIGN_FUNDING_FACT], FOREIGN_CORRIDOR).map((operator) => operator.operatorId);
    expect(emitted).toContain("repair:recipient-enables-served-funding-method");
    expect(emitted).toContain("repair:sender-adds-served-funding-instrument");
    for (const operator of REPAIR_OPERATORS) {
      if (operator.p21Specific) {
        expect(emitted, operator.operatorId).not.toContain(operator.operatorId);
      }
    }
  });

  it("without corridor facts the corridor-pattern operators are never emitted (fail closed, never guessed)", () => {
    const emitted = operatorsForFacts([P21_FUNDING_FACT]).map((operator) => operator.operatorId);
    expect(emitted).toContain("repair:recipient-enables-served-funding-method");
    expect(emitted).toContain("repair:sender-adds-served-funding-instrument");
    expect(emitted).not.toContain("repair:recipient-enables-flw-receiving-method");
    expect(emitted).not.toContain("repair:sender-adds-stripe-compatible-instrument");
  });

  it("the side condition: a SENDER-side funding fact never grounds the P21 receiving-side operators", () => {
    const senderFact: RepairExclusionFact = { ...P21_FUNDING_FACT, side: "SENDER" };
    const emitted = operatorsForFacts([senderFact], P21_CORRIDOR).map((operator) => operator.operatorId);
    expect(emitted).not.toContain("repair:recipient-enables-flw-receiving-method");
    expect(emitted).not.toContain("repair:sender-adds-stripe-compatible-instrument");
    // The general operators carry no side condition — they serve the fact.
    expect(emitted).toContain("repair:recipient-enables-served-funding-method");
  });

  it("the state-conditioned operators are never emitted from exclusion facts (their home is the corridor state)", () => {
    const everyCodeFact = (code: string): RepairExclusionFact => ({
      side: "RECIPIENT",
      routeId: "route:r",
      code: code as RepairExclusionFact["code"],
      message: "a verbatim exclusion message",
    });
    for (const code of PINNED_CORRIDOR_EXCLUSION_CODES) {
      const emitted = operatorsForFacts([everyCodeFact(code)], P21_CORRIDOR);
      for (const operator of emitted) {
        expect(operator.applicableExclusionCodes.length, `${operator.operatorId} over ${code}`).toBeGreaterThan(0);
      }
    }
  });

  it("lookupRepairOperators is deterministic, canonical-order, honest-empty and fail-closed", () => {
    const first = lookupRepairOperators("FUNDING_METHOD_NOT_SERVED");
    const second = lookupRepairOperators("FUNDING_METHOD_NOT_SERVED");
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.map((operator) => operator.operatorId)).toEqual([
      "repair:recipient-enables-flw-receiving-method",
      "repair:sender-adds-stripe-compatible-instrument",
      "repair:recipient-enables-served-funding-method",
      "repair:sender-adds-served-funding-instrument",
    ]);
    expect(lookupRepairOperators("MISSING_PERMISSIONS").map((operator) => operator.operatorId)).toEqual([
      "repair:sender-completes-provider-permissions",
      "platform:permission-model",
    ]);
    // The honest empty set: a known code whose home is a non-operator row.
    expect(lookupRepairOperators("STALE_OBSERVATION")).toEqual([]);
    expect(lookupRepairOperators("AMOUNT_CURRENCY_MISMATCH")).toEqual([]);
    // Fail closed: a code outside the pinned 26 is a typed error, never a guess.
    expect(() => lookupRepairOperators("NOT_A_CORRIDOR_CODE")).toThrow(RepairCatalogueError);
    expect(() => lookupRepairOperators("")).toThrow(RepairCatalogueError);
    expect(() => lookupRepairOperators(42 as never)).toThrow(RepairCatalogueError);
  });

  it("operatorsForFacts is deterministic (byte-identical, frozen) and order-stable", () => {
    const facts = [P21_FUNDING_FACT, FOREIGN_FUNDING_FACT];
    const first = operatorsForFacts(facts, P21_CORRIDOR);
    const second = operatorsForFacts(facts, P21_CORRIDOR);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(Object.isFrozen(first)).toBe(true);
    // An empty fact set is the honest empty set.
    expect(operatorsForFacts([], P21_CORRIDOR)).toEqual([]);
  });

  it("fail-closed on malformed facts and corridor records (typed, never defaults)", () => {
    const cases: readonly [string, unknown, Readonly<RepairCorridorFacts> | undefined][] = [
      ["a non-array fact set", "not-an-array", P21_CORRIDOR],
      ["an unknown side", [{ side: "MERCHANT", routeId: "r", code: "FUNDING_METHOD_NOT_SERVED", message: "m" }], P21_CORRIDOR],
      ["an empty routeId", [{ side: "SENDER", routeId: "", code: "FUNDING_METHOD_NOT_SERVED", message: "m" }], P21_CORRIDOR],
      ["an unknown code", [{ side: "SENDER", routeId: "r", code: "NOT_A_CODE", message: "m" }], P21_CORRIDOR],
      ["an empty message", [{ side: "SENDER", routeId: "r", code: "FUNDING_METHOD_NOT_SERVED", message: "" }], P21_CORRIDOR],
      ["a non-fact entry", [null], P21_CORRIDOR],
      ["a malformed corridor", [P21_FUNDING_FACT], { fundingMethod: "" }],
    ];
    for (const [label, facts, corridor] of cases) {
      expect(() => operatorsForFacts(facts as readonly RepairExclusionFact[], corridor), label).toThrow(RepairCatalogueError);
    }
  });

  it("PLATFORM_GAP_IDS are exactly the PLATFORM_WORK operator ids (the D4 gap id space law)", () => {
    expect(Object.isFrozen(PLATFORM_GAP_IDS)).toBe(true);
    expect([...PLATFORM_GAP_IDS]).toEqual([
      "platform:connector-operation",
      "platform:provider-integration",
      "platform:permission-model",
      "platform:cross-provider-route-shape",
      "platform:flutterwave-send-operation",
    ]);
    const platformOperatorIds = REPAIR_OPERATORS
      .filter((operator: RepairOperator) => operator.kind === "PLATFORM_WORK")
      .map((operator) => operator.operatorId);
    expect([...PLATFORM_GAP_IDS]).toEqual(platformOperatorIds);
  });
});
