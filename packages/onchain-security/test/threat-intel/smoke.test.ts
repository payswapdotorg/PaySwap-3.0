import { describe, expect, it } from "vitest";
import { prepareWrite } from "../../src/index.ts";
import {
  THREAT_INTEL_SURFACE_NAME,
  AdversarialTransactionAgent,
  evaluateThreatPolicy,
} from "../../src/threat-intel/index.ts";
import { AGENT_REF, NOW, baseThreatPolicy, baseWriteRequest, benignBundle } from "./helpers.ts";

describe("smoke", () => {
  it("the package identifies itself", () => {
    expect(THREAT_INTEL_SURFACE_NAME).toBe("@payswap/onchain-security/threat-intel");
  });

  it("a minimal end-to-end analysis run works", () => {
    const agent = new AdversarialTransactionAgent(AGENT_REF);
    const write = prepareWrite(baseWriteRequest(), NOW);
    const assessment = agent.analyze({
      write,
      policy: baseThreatPolicy(),
      bundle: benignBundle(),
      at: NOW,
    });
    const evaluation = evaluateThreatPolicy(assessment.signals, baseThreatPolicy());
    expect(evaluation.verdict).toBe("ALLOW");
    expect(assessment.agentRecommendation).toBe("ALLOW");
  });
});
