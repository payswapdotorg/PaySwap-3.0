/**
 * Import smoke test (P1-W1 battery item): the package index imports cleanly
 * and exports the complete economic-model surface (validators, types as
 * runtime-absent type-only declarations are verified via the value exports).
 */

import { describe, expect, it } from "vitest";
import * as economic from "../src/index.ts";

describe("@payswap/economic import smoke", () => {
  it("exports the full economic-model surface", () => {
    expect(economic.PACKAGE_NAME).toBe("@payswap/economic");
    expect(economic.COMPILER_VERSION).toBe("payswap-economic-compiler/1");
    expect(economic.CANDIDATE_SKELETON_FORMAT_VERSION).toBe(1);
    // Validators.
    expect(typeof economic.validateAmountSpec).toBe("function");
    expect(typeof economic.validatePositiveAmountSpec).toBe("function");
    expect(typeof economic.isValidAmountSpec).toBe("function");
    expect(typeof economic.validateMoneyMovementIntent).toBe("function");
    expect(typeof economic.validateServiceAccessIntent).toBe("function");
    expect(typeof economic.validatePaymentIntent).toBe("function");
    expect(typeof economic.validateEconomicGoal).toBe("function");
    expect(typeof economic.validateEconomicProgram).toBe("function");
    expect(typeof economic.validateRecurrenceRule).toBe("function");
    expect(typeof economic.expandEconomicProgram).toBe("function");
    expect(typeof economic.validateEconomicInput).toBe("function");
    expect(typeof economic.validateEconomicInputs).toBe("function");
    expect(typeof economic.validateFundsLocationRef).toBe("function");
    expect(typeof economic.validateIntentConstraints).toBe("function");
    expect(typeof economic.validateGoalTimeBounds).toBe("function");
    expect(typeof economic.validateRecourseRequirements).toBe("function");
    expect(typeof economic.validateProofRequirement).toBe("function");
    expect(typeof economic.validateProofRequirements).toBe("function");
    expect(typeof economic.validateMoneyMovementDemand).toBe("function");
    expect(typeof economic.validateServiceAccessDemand).toBe("function");
    expect(typeof economic.validateGoalOutcome).toBe("function");
    // Compiler + digest.
    expect(typeof economic.compileEconomicGoal).toBe("function");
    expect(typeof economic.compileEconomicProgram).toBe("function");
    expect(typeof economic.canonicalJsonStringify).toBe("function");
    expect(typeof economic.fnv1a64Hex).toBe("function");
    expect(typeof economic.contentDigest).toBe("function");
    expect(typeof economic.archetypeSatisfies).toBe("function");
    // Error taxonomy.
    expect(new economic.InvalidEconomicModelError("x").name).toBe("InvalidEconomicModelError");
    expect(new economic.InvalidMoneyMovementIntentError("x").name).toBe(
      "InvalidMoneyMovementIntentError",
    );
    // Closed vocabularies.
    expect(economic.INTENT_ARCHETYPES).toEqual(["MONEY_MOVEMENT", "PAYMENT", "SERVICE_ACCESS"]);
    expect(economic.ECONOMIC_INPUT_KINDS).toHaveLength(5);
    expect(economic.PROOF_KINDS).toHaveLength(4);
    expect(economic.GOAL_OUTCOME_KINDS).toHaveLength(3);
  });
});
