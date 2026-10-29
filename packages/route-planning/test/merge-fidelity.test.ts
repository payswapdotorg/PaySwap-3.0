import { describe, expect, it } from "vitest";
// THE MERGE-TIME PIN-FIDELITY PROOF (ADR-0015 D11): on the MERGED tree the
// grown @payswap/opportunities authority and the route-planning pin are
// byte-identical. This suite exists only on the merged tree (the TL's
// integration gate); the disjoint lanes pinned the ADR appendix locally.
import { PINNED_CONDITIONAL_PARTY_CHANGES } from "../src/pins/opportunities.ts";
import { CONDITIONAL_PARTY_CHANGES } from "../../opportunities/src/conditional.ts";
import { REPAIR_OPERATORS, REPAIR_OPERATOR_IDS } from "../../opportunities/src/repair-operators.ts";
import { PINNED_REPAIR_OPERATOR_IDS } from "../src/pins/repairs.ts";
import { CORRIDOR_EXCLUSION_CODES } from "../../capability/src/corridor-types.ts";
import {
  PINNED_NON_OPERATOR_EXCLUSION_CODES,
  PINNED_OPERATOR_APPLICABLE_EXCLUSION_CODES,
} from "../src/pins/repairs.ts";

describe("the P23-A/P23-C merge-time pin fidelity (ADR-0015 D11)", () => {
  it("the party-change vocabulary: the route-planning pin == the grown opportunities authority, byte-identical", () => {
    expect([...PINNED_CONDITIONAL_PARTY_CHANGES]).toEqual([...CONDITIONAL_PARTY_CHANGES]);
  });
  it("the operator catalogue ids: the route-planning pin == the opportunities REPAIR_OPERATORS ids, byte-identical", () => {
    expect([...PINNED_REPAIR_OPERATOR_IDS]).toEqual([...REPAIR_OPERATOR_IDS]);
    expect(new Set(REPAIR_OPERATORS.map((operator) => operator.operatorId))).toEqual(new Set([...REPAIR_OPERATOR_IDS]));
  });
  it("the 16/10 totality: the operator-applicable + non-operator sets == the real 26-code authority, exactly partitioned", () => {
    const operatorApplicable = new Set<string>();
    for (const operator of REPAIR_OPERATORS) {
      for (const code of operator.applicableExclusionCodes) operatorApplicable.add(code);
    }
    expect([...operatorApplicable].sort()).toEqual([...PINNED_OPERATOR_APPLICABLE_EXCLUSION_CODES].sort());
    const nonOperator = new Set<string>([...PINNED_NON_OPERATOR_EXCLUSION_CODES]);
    const all = new Set<string>([...CORRIDOR_EXCLUSION_CODES]);
    expect(all.size).toBe(26);
    expect(new Set([...operatorApplicable, ...nonOperator])).toEqual(all);
    for (const code of operatorApplicable) expect(nonOperator.has(code)).toBe(false);
  });
});
