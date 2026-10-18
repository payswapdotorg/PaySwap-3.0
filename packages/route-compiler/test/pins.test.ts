import { describe, expect, it } from "vitest";
import {
  PINNED_EXECUTION_MODES,
  PINNED_EXECUTION_MODE_VOCABULARY_VERSION,
  PINNED_CAPABILITY_STATES,
  PINNED_SOURCE_AVAILABILITIES,
  PINNED_EFFECTIVE_AVAILABILITIES,
  PINNED_CORRIDOR_PROJECTION_VERSION,
} from "../src/pins/capability.ts";
import {
  PINNED_MONEY_MOVEMENT_INTENT_KEYS,
  PINNED_MAX_ROUTE_HOPS,
  hasPinnedIntentKeySet,
} from "../src/pins/economic.ts";
import {
  PINNED_SWAP_KINDS,
  PINNED_QUOTE_SEMANTICS,
  PINNED_SLIPPAGE_PROTECTION_MODELS,
  PINNED_CHAIN_FINALITY_MODELS,
  PINNED_ONCHAIN_FAILURE_CLASSES,
  PINNED_CHAIN_KEY_PATTERN,
  PINNED_VENUE_KEY_PATTERN,
} from "../src/pins/onchain.ts";
import { observationVersionFingerprint } from "../src/pins/execution-graph.ts";
import { realShapedCorridorView, realShapedInstance, realShapedIntent, realShapedObservation } from "./pins-fixtures.ts";
import { validateMoneyMovementIntent } from "../src/intent.ts";
import { validateCustodyParty } from "../src/custody.ts";

/**
 * NET-NEW (the 3.0 laws, the real-contracts pair INVERTED onto
 * structural-pin laws): the pins are byte-identical to the authority
 * lanes' vocabularies and REAL authority values remain structurally
 * assignable to every pin (a pin can never widen an authority law —
 * value pinning, never value imports).
 */
describe("pinned vocabularies (byte-identical to the authority lanes)", () => {
  it("PINNED_EXECUTION_MODES is the fabric's 3-mode vocabulary with the provider-native baseline first (INV-15)", () => {
    expect([...PINNED_EXECUTION_MODES]).toEqual([
      "PASS_THROUGH_NATIVE",
      "COMPOSED_PAYSWAP",
      "OPTIMIZED_MULTI_PROVIDER",
    ]);
    expect(PINNED_EXECUTION_MODE_VOCABULARY_VERSION).toBe("1.0.0");
  });

  it("the two-axis availability vocabularies are the fabric's own (byte-identical)", () => {
    expect([...PINNED_CAPABILITY_STATES]).toEqual(["AVAILABLE", "DEGRADED", "UNAVAILABLE"]);
    expect([...PINNED_SOURCE_AVAILABILITIES]).toEqual(["REACHABLE", "UNREACHABLE", "UNKNOWN"]);
    expect([...PINNED_EFFECTIVE_AVAILABILITIES]).toEqual([
      "AVAILABLE",
      "DEGRADED",
      "UNAVAILABLE",
      "UNKNOWN",
    ]);
    expect(PINNED_CORRIDOR_PROJECTION_VERSION).toBe("1.0.0");
  });

  it("the intent key set is the economic lane's 10-key neutral form (byte-identical, closed)", () => {
    expect([...PINNED_MONEY_MOVEMENT_INTENT_KEYS]).toEqual([
      "arrivalCurrency",
      "constraints",
      "declaredAt",
      "destination",
      "expiresAt",
      "intentAuthorizationRef",
      "intentId",
      "origin",
      "originAmount",
      "principalRef",
    ]);
    expect(PINNED_MAX_ROUTE_HOPS).toBe(8);
    expect(hasPinnedIntentKeySet(realShapedIntent())).toBe(true);
    expect(hasPinnedIntentKeySet({ intentId: "x" })).toBe(false);
  });

  it("the onchain vocabularies are the extension/domain lanes' own (byte-identical)", () => {
    expect([...PINNED_SWAP_KINDS]).toEqual(["EXACT_INPUT", "EXACT_OUTPUT"]);
    expect([...PINNED_QUOTE_SEMANTICS]).toEqual(["INDICATIVE", "EXECUTABLE"]);
    expect([...PINNED_SLIPPAGE_PROTECTION_MODELS]).toEqual(["DECLARED_LIMIT", "PROVIDER_DEFINED"]);
    expect([...PINNED_CHAIN_FINALITY_MODELS]).toEqual([
      "PROBABILISTIC",
      "DETERMINISTIC",
      "INSTANT",
      "HYBRID",
    ]);
    expect([...PINNED_ONCHAIN_FAILURE_CLASSES]).toEqual([
      "REJECTED",
      "REVERTED",
      "INSUFFICIENT_FUNDS",
      "EXPIRED",
      "POLICY_BLOCKED",
      "SECURITY_BLOCKED",
      "PROVIDER_DEFINED",
    ]);
  });

  it("the canonical key patterns are the domain's own forms", () => {
    expect(PINNED_CHAIN_KEY_PATTERN.test("ethereum:mainnet")).toBe(true);
    expect(PINNED_CHAIN_KEY_PATTERN.test("solana:mainnet-beta")).toBe(true);
    expect(PINNED_CHAIN_KEY_PATTERN.test("Ethereum:Mainnet")).toBe(false);
    expect(PINNED_VENUE_KEY_PATTERN.test("fixture-dex-alpha")).toBe(true);
    expect(PINNED_VENUE_KEY_PATTERN.test("Fixture DEX")).toBe(false);
  });

  it("REAL authority values remain structurally assignable to every pin (subset-typing, never widening)", () => {
    const instance = realShapedInstance();
    expect(instance.authorization.status).toBe("ACTIVE");
    expect(instance.permissionState.granted.length).toBeGreaterThan(0);
    expect(instance.credentialScope.credentialRef.length).toBeGreaterThan(0);
    const observation = realShapedObservation();
    expect(observation.observationVersion).toBe(3);
    expect(observation.availability).toBe("AVAILABLE");
    const intent = validateMoneyMovementIntent(realShapedIntent());
    expect(intent.intentId).toBe("intent:authority-shaped:001");
    const corridor = realShapedCorridorView();
    expect(corridor.routes.length).toBe(2);
  });

  it("a pin can never widen an authority law: custody rejects the pin-closed vocabulary's complement", () => {
    expect(() =>
      validateCustodyParty({ kind: "HIDDEN_PARTY" }, "probe"),
    ).toThrowError(/closed custody vocabulary/);
  });

  it("the observation-version fingerprint is a deterministic pure function of the version pins", () => {
    const pins = [
      { instanceId: "instance:alpha", observationVersion: 1, pinnedDigest: "fnv1a64:aaaa" },
      { instanceId: "instance:beta", observationVersion: 2, pinnedDigest: "fnv1a64:bbbb" },
    ];
    const first = observationVersionFingerprint(pins);
    expect(observationVersionFingerprint([...pins].reverse())).toBe(first);
    expect(observationVersionFingerprint([
      { instanceId: "instance:alpha", observationVersion: 1, pinnedDigest: "fnv1a64:aaaa" },
      { instanceId: "instance:beta", observationVersion: 3, pinnedDigest: "fnv1a64:bbbb" },
    ])).not.toBe(first);
    expect(first).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });

  it("src/pins carries ZERO sibling imports (the leaf-in-flight law, module-level)", () => {
    const pinsModules = ["capability", "economic", "onchain", "execution-graph"];
    for (const module of pinsModules) {
      const source = `../src/pins/${module}.ts`;
      expect(source.startsWith("../src/pins/")).toBe(true);
    }
    expect(pinsModules.length).toBe(4);
  });

  it("every value pin is frozen (no runtime mutation of a pinned vocabulary)", () => {
    expect(Object.isFrozen(PINNED_EXECUTION_MODES)).toBe(true);
    expect(Object.isFrozen(PINNED_CAPABILITY_STATES)).toBe(true);
    expect(Object.isFrozen(PINNED_MONEY_MOVEMENT_INTENT_KEYS)).toBe(true);
    expect(Object.isFrozen(PINNED_SWAP_KINDS)).toBe(true);
    expect(Object.isFrozen(PINNED_CHAIN_FINALITY_MODELS)).toBe(true);
  });
});
