import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadRoutineManifest,
  PAYMENT_ROUTE_PLANNING_MANIFEST_V1,
  PAYMENT_ROUTE_PLANNING_MANIFEST_V1_DIGEST,
  PINNED_SKILL_CONTENT_DIGEST,
  ROUTINE_ENGINE_BINDINGS,
  ROUTINE_ID,
  ROUTINE_MANIFEST_GATE_CODES,
  ROUTINE_MANIFEST_SCHEMA_VERSION,
  ROUTINE_SKILL_ID,
  ROUTINE_STAGE_HANDLER_ALLOWLIST,
  ROUTINE_VERSION,
  ROUTINE_VERSION_PIN_POLICY,
  RoutineManifestError,
  RoutineVersionPinError,
  RoutineVersionPinLedger,
} from "../src/manifest.ts";
import { contentDigest, fnv1a64 } from "../src/canonical.ts";

/**
 * The fail-closed routine manifest battery (ROUTINE-CONTRACT Appendix
 * A.2): the canonical manifest loads GREEN through its own loader, every
 * one of the seven ordered gates fails with its DISTINCT machine code on
 * a targeted tamper, the skill digest pins the REAL SKILL.md bytes, and
 * pinRoutineVersion is append-only.
 */

const SKILL_PATH = join(process.cwd(), "../../skills/payment-route-planning/SKILL.md");

/** Re-derives the value-form digest over the (tampered) manifest value. */
function redigested(changes: Record<string, unknown>): Record<string, unknown> {
  const value: Record<string, unknown> = { ...PAYMENT_ROUTE_PLANNING_MANIFEST_V1, ...changes };
  delete value["routineDigest"];
  return { ...value, routineDigest: contentDigest(value) };
}

function stagesOf(manifest: Record<string, unknown>): Record<string, unknown>[] {
  return (manifest["stages"] as Record<string, unknown>[]) ?? [];
}

/** Retargets stage records and re-derives the digest so later gates are reachable. */
function withStageTamper(mutate: (stages: Record<string, unknown>[]) => void): Record<string, unknown> {
  const stages = stagesOf({ ...PAYMENT_ROUTE_PLANNING_MANIFEST_V1 } as Record<string, unknown>).map((stage) => ({ ...stage }));
  mutate(stages);
  return redigested({ stages });
}

function gateCodeOf(load: () => unknown): string {
  let code = "";
  try {
    load();
    expect.unreachable("the tampered manifest must fail closed");
  } catch (error) {
    expect(error).toBeInstanceOf(RoutineManifestError);
    code = (error as RoutineManifestError).code;
  }
  return code;
}

describe("the canonical routine manifest loads GREEN through its own loader", () => {
  it("PAYMENT_ROUTE_PLANNING_MANIFEST_V1 passes all seven gates and is the frozen load target", () => {
    const loaded = loadRoutineManifest(PAYMENT_ROUTE_PLANNING_MANIFEST_V1);
    expect(loaded).toBe(PAYMENT_ROUTE_PLANNING_MANIFEST_V1);
    expect(loaded.routineId).toBe(ROUTINE_ID);
    expect(loaded.routineVersion).toBe(ROUTINE_VERSION);
    expect(loaded.schemaVersion).toBe(ROUTINE_MANIFEST_SCHEMA_VERSION);
    expect(loaded.skill.skillId).toBe(ROUTINE_SKILL_ID);
    expect(loaded.versionPinPolicy).toBe(ROUTINE_VERSION_PIN_POLICY);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded.stages)).toBe(true);
    expect(loaded.stages.every((stage) => Object.isFrozen(stage))).toBe(true);
  });

  it("the twelve stages match the frozen ROUTINE-CONTRACT stage table (9a the ONLY effect-bearing; 6/9b advisory alternatives)", () => {
    const { stages } = PAYMENT_ROUTE_PLANNING_MANIFEST_V1;
    expect(stages.map((stage) => stage.stageId)).toEqual([
      "0", "1", "2", "3", "4", "5", "6", "7", "8", "9a", "9b", "10",
    ]);
    expect(stages).toHaveLength(12);
    const effectBearing = stages.filter((stage) => stage.authorityClass === "EFFECT_BEARING");
    expect(effectBearing.map((stage) => stage.stageId)).toEqual(["9a"]);
    expect(effectBearing[0]?.requiresFreshScopedAuthorization).toBe(true);
    for (const stageId of ["6", "9b"]) {
      const stage = stages.find((candidate) => candidate.stageId === stageId);
      expect(stage?.branch).toBe("ALTERNATIVE");
      expect(stage?.advisory).toBe(true);
      expect(stage?.authorityClass).toBe("ADVISORY");
    }
    expect(stages.map((stage) => stage.handlerId).sort()).toEqual([...ROUTINE_STAGE_HANDLER_ALLOWLIST].sort());
    for (const binding of ROUTINE_ENGINE_BINDINGS) {
      expect(stages.some((stage) => stage.requiredEngineBinding === binding)).toBe(true);
    }
    expect(PAYMENT_ROUTE_PLANNING_MANIFEST_V1.searchPolicy.basis).toBe("COUNT_BASED_ONLY");
    expect(PAYMENT_ROUTE_PLANNING_MANIFEST_V1.triggerEventTypes).toEqual([
      "MoneyMovementIntentAccepted",
      "PaymentIntentAccepted",
    ]);
  });

  it("the digest is the VALUE-form re-derivation excluding routineDigest (never a JSON.stringify round-trip)", () => {
    const value: Record<string, unknown> = { ...PAYMENT_ROUTE_PLANNING_MANIFEST_V1 };
    delete value["routineDigest"];
    expect(contentDigest(value)).toBe(PAYMENT_ROUTE_PLANNING_MANIFEST_V1.routineDigest);
    expect(PAYMENT_ROUTE_PLANNING_MANIFEST_V1_DIGEST).toBe(PAYMENT_ROUTE_PLANNING_MANIFEST_V1.routineDigest);
    // A JSON round-trip of the parsed manifest is NOT the digested form:
    // the canonical flavor prefixes numbers (n:) and sorts keys, so the
    // plain-JSON text digest differs (proving the flavor law).
    const plainJson = JSON.stringify(PAYMENT_ROUTE_PLANNING_MANIFEST_V1);
    expect(`fnv1a64:${fnv1a64(plainJson)}`).not.toBe(PAYMENT_ROUTE_PLANNING_MANIFEST_V1.routineDigest);
  });
});

describe("the ORDERED fail-closed gates (each tamper fails its DISTINCT machine code)", () => {
  it("MANIFEST_SHAPE: a missing field, an extra field, a malformed stage or a non-object never loads", () => {
    expect(gateCodeOf(() => loadRoutineManifest(null))).toBe("MANIFEST_SHAPE");
    expect(gateCodeOf(() => loadRoutineManifest("a manifest"))).toBe("MANIFEST_SHAPE");
    const missingField = { ...PAYMENT_ROUTE_PLANNING_MANIFEST_V1 } as Record<string, unknown>;
    delete missingField["searchPolicy"];
    expect(gateCodeOf(() => loadRoutineManifest(missingField))).toBe("MANIFEST_SHAPE");
    const extraField = redigested({ sneaky: true });
    expect(gateCodeOf(() => loadRoutineManifest(extraField))).toBe("MANIFEST_SHAPE");
    const stageMissingField = withStageTamper((stages) => {
      delete stages[0]?.["authorityClass"];
    });
    expect(gateCodeOf(() => loadRoutineManifest(stageMissingField))).toBe("MANIFEST_SHAPE");
    const stageUnknownField = withStageTamper((stages) => {
      stages[0]!["shellCommand"] = "rm -rf";
    });
    expect(gateCodeOf(() => loadRoutineManifest(stageUnknownField))).toBe("MANIFEST_SHAPE");
  });

  it("MANIFEST_SCHEMA_VERSION: a wrong schemaVersion fails even when re-digested", () => {
    expect(gateCodeOf(() => loadRoutineManifest(redigested({ schemaVersion: "evil-manifest/9" })))).toBe(
      "MANIFEST_SCHEMA_VERSION",
    );
  });

  it("MANIFEST_DIGEST: a tampered value without a re-derived digest never loads", () => {
    const tampered = { ...PAYMENT_ROUTE_PLANNING_MANIFEST_V1 } as Record<string, unknown>;
    const stages = stagesOf(tampered).map((stage) => ({ ...stage }));
    stages[0]!["title"] = "Match + load + exfiltrate";
    tampered["stages"] = stages;
    expect(gateCodeOf(() => loadRoutineManifest(tampered))).toBe("MANIFEST_DIGEST");
    const wrongDigest = {
      ...PAYMENT_ROUTE_PLANNING_MANIFEST_V1,
      routineDigest: "fnv1a64:0000000000000000",
    };
    expect(gateCodeOf(() => loadRoutineManifest(wrongDigest))).toBe("MANIFEST_DIGEST");
  });

  it("MANIFEST_HANDLER_ALLOWLIST: an unknown handler id is rejected (no skill-bundled code is a handler)", () => {
    const tampered = withStageTamper((stages) => {
      stages[5]!["handlerId"] = "route-planning/llm-freestyle-router";
    });
    expect(gateCodeOf(() => loadRoutineManifest(tampered))).toBe("MANIFEST_HANDLER_ALLOWLIST");
  });

  it("MANIFEST_AUTHORITY_CLASS: an advisory stage declaring an effect class is rejected", () => {
    const tampered = withStageTamper((stages) => {
      stages[6]!["authorityClass"] = "EFFECT_BEARING";
    });
    expect(gateCodeOf(() => loadRoutineManifest(tampered))).toBe("MANIFEST_AUTHORITY_CLASS");
  });

  it("MANIFEST_AUTHORITY_CLASS: stage 9b declaring execute is rejected BEFORE the generic execute law", () => {
    const tampered = withStageTamper((stages) => {
      stages[10]!["authorityClass"] = "EFFECT_BEARING";
    });
    let message = "";
    try {
      loadRoutineManifest(tampered);
      expect.unreachable("the WAIT branch must never declare execute");
    } catch (error) {
      expect(error).toBeInstanceOf(RoutineManifestError);
      expect((error as RoutineManifestError).code).toBe("MANIFEST_AUTHORITY_CLASS");
      message = (error as RoutineManifestError).message;
    }
    expect(message).toContain("WAIT branch");
    // The generic law also fires for a non-9a effect stage with a different id.
    const tamperedTen = withStageTamper((stages) => {
      stages[11]!["authorityClass"] = "EFFECT_BEARING";
    });
    expect(gateCodeOf(() => loadRoutineManifest(tamperedTen))).toBe("MANIFEST_AUTHORITY_CLASS");
  });

  it("MANIFEST_AUTHORITY_CLASS: stage 9a without the fresh-authorization precondition is rejected", () => {
    const tampered = withStageTamper((stages) => {
      stages[9]!["requiresFreshScopedAuthorization"] = false;
    });
    expect(gateCodeOf(() => loadRoutineManifest(tampered))).toBe("MANIFEST_AUTHORITY_CLASS");
  });

  it("MANIFEST_CAPABILITY_BINDINGS: an engine stage naming a foreign binding, or a dropped engine stage, is rejected", () => {
    const foreignBinding = withStageTamper((stages) => {
      stages[3]!["requiredEngineBinding"] = "llm-freestyle:router";
    });
    expect(gateCodeOf(() => loadRoutineManifest(foreignBinding))).toBe("MANIFEST_CAPABILITY_BINDINGS");
    const droppedEngineStage = redigested({
      stages: stagesOf({ ...PAYMENT_ROUTE_PLANNING_MANIFEST_V1 } as Record<string, unknown>).filter(
        (stage) => stage["stageId"] !== "7",
      ),
    });
    expect(gateCodeOf(() => loadRoutineManifest(droppedEngineStage))).toBe("MANIFEST_CAPABILITY_BINDINGS");
  });

  it("MANIFEST_MISSION_VERSION_PIN: a loosened version pin policy is rejected", () => {
    expect(gateCodeOf(() => loadRoutineManifest(redigested({ versionPinPolicy: "MISSION_MAY_RETARGET" })))).toBe(
      "MANIFEST_MISSION_VERSION_PIN",
    );
  });

  it("the gates fire IN ORDER (the earliest violated gate wins)", () => {
    // Both the schema version and the digest are wrong: SHAPE passes,
    // SCHEMA_VERSION fires before the digest gate.
    const both = { ...PAYMENT_ROUTE_PLANNING_MANIFEST_V1, schemaVersion: "evil/9" } as Record<string, unknown>;
    const stages = stagesOf(both).map((stage) => ({ ...stage }));
    stages[0]!["title"] = "tampered";
    both["stages"] = stages;
    expect(gateCodeOf(() => loadRoutineManifest(both))).toBe("MANIFEST_SCHEMA_VERSION");
    // A shape violation dominates every later gate.
    const shapeFirst = { ...both, extra: true };
    expect(gateCodeOf(() => loadRoutineManifest(shapeFirst))).toBe("MANIFEST_SHAPE");
    expect(Object.isFrozen(ROUTINE_MANIFEST_GATE_CODES)).toBe(true);
    expect([...ROUTINE_MANIFEST_GATE_CODES]).toEqual([
      "MANIFEST_SHAPE", "MANIFEST_SCHEMA_VERSION", "MANIFEST_DIGEST", "MANIFEST_HANDLER_ALLOWLIST",
      "MANIFEST_AUTHORITY_CLASS", "MANIFEST_CAPABILITY_BINDINGS", "MANIFEST_MISSION_VERSION_PIN",
    ]);
  });
});

describe("the skill content digest pin (fail closed on drift)", () => {
  it("PINNED_SKILL_CONTENT_DIGEST re-reads the REAL skills/payment-route-planning/SKILL.md bytes and asserts", () => {
    const skillText = readFileSync(SKILL_PATH, "utf8");
    expect(PINNED_SKILL_CONTENT_DIGEST).toBe(`fnv1a64:${fnv1a64(skillText)}`);
    expect(PAYMENT_ROUTE_PLANNING_MANIFEST_V1.skill.contentDigest).toBe(PINNED_SKILL_CONTENT_DIGEST);
    // A drifted skill file changes the recomputed digest — the pin fails closed.
    expect(`fnv1a64:${fnv1a64(`${skillText} `)}`).not.toBe(PINNED_SKILL_CONTENT_DIGEST);
  });
});

describe("pinRoutineVersion (the append-only mission version pin)", () => {
  it("the first pin pins; a same-version re-pin replays; a divergent re-pin is the typed error", () => {
    const ledger = new RoutineVersionPinLedger();
    expect(ledger.versionFor("mission:planning-1")).toBe(null);
    expect(ledger.pinRoutineVersion("mission:planning-1", ROUTINE_VERSION)).toEqual({
      missionId: "mission:planning-1",
      routineVersion: ROUTINE_VERSION,
      pinned: true,
    });
    expect(ledger.versionFor("mission:planning-1")).toBe(ROUTINE_VERSION);
    expect(ledger.pinRoutineVersion("mission:planning-1", ROUTINE_VERSION).pinned).toBe(false);
    expect(() => ledger.pinRoutineVersion("mission:planning-1", "2.0.0")).toThrow(RoutineVersionPinError);
    let error: RoutineVersionPinError | undefined;
    try {
      ledger.pinRoutineVersion("mission:planning-1", "9.9.9");
    } catch (caught) {
      error = caught as RoutineVersionPinError;
    }
    expect((error as RoutineVersionPinError & { details?: unknown } | undefined)?.details).toMatchObject({
      missionId: "mission:planning-1",
      pinnedVersion: ROUTINE_VERSION,
      attemptedVersion: "9.9.9",
    });
    // The original pin stands after the rejected re-pin.
    expect(ledger.versionFor("mission:planning-1")).toBe(ROUTINE_VERSION);
    expect(() => ledger.pinRoutineVersion("", ROUTINE_VERSION)).toThrow(RoutineVersionPinError);
    expect(() => ledger.pinRoutineVersion("mission:planning-2", "1.0")).toThrow(RoutineVersionPinError);
  });
});
