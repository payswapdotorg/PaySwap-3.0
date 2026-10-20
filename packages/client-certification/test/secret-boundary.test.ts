import { describe, expect, it } from "vitest";
import {
  isForbiddenKeyName,
  isSecretShapedValue,
  makeReferenceScrubber,
  runSecretBoundaryGate,
  scanSecretBoundary,
} from "../src/index.ts";
import type { SecretBoundaryProbes } from "../src/index.ts";
import {
  bareKeyFixture,
  cleanClientStateFixture,
  leakyClientStateFixture,
  leakyLogFixture,
  mnemonic12Fixture,
  pemBlockFixture,
  providerTokenFixture,
  rawKeyFixture,
} from "./fixtures.ts";

/**
 * Hard law 1 — the secret boundary: secrets never reach
 * client-renderable state, model-visible context, logs or artifacts;
 * the scrubber contract redacts secret-bearing payloads; violations
 * BLOCK (escalate-only).
 */
function cleanProbesFixture(): SecretBoundaryProbes {
  return {
    clientRenderableState: cleanClientStateFixture(),
    modelVisibleContext: { question: "what is the payment status?", refs: ["attempt:1"] },
    logs: [{ level: "info", message: "rendered payments view" }],
    artifacts: [{ artifactId: "screenshot:payments", strength: "BROWSER_UNAUTHENTICATED_PROVENANCE" }],
  };
}

function leakyProbesFixture(): SecretBoundaryProbes {
  return {
    clientRenderableState: leakyClientStateFixture(),
    modelVisibleContext: { context: `connect using ${providerTokenFixture()}` },
    logs: [leakyLogFixture()],
    artifacts: [{ artifactId: "trace:1", payload: pemBlockFixture() }],
  };
}

describe("hard law 1: the secret boundary + scrubber contract", () => {
  it("value-shape detectors: raw keys, mnemonics, PEM blocks, provider tokens (runtime-assembled fixtures)", () => {
    expect(isSecretShapedValue(rawKeyFixture())).toBe(true);
    expect(isSecretShapedValue(bareKeyFixture())).toBe(true);
    expect(isSecretShapedValue(mnemonic12Fixture())).toBe(true);
    expect(isSecretShapedValue(pemBlockFixture())).toBe(true);
    expect(isSecretShapedValue(providerTokenFixture())).toBe(true);
    expect(isSecretShapedValue("ordinary copy")).toBe(false);
    expect(isSecretShapedValue("0x1234")).toBe(false);
  });

  it("forbidden key-name law (pinned from onchain-security): normalized substring + exact match, fail closed", () => {
    expect(isForbiddenKeyName("apiKey")).toBe(true);
    expect(isForbiddenKeyName("client-secret")).toBe(true);
    expect(isForbiddenKeyName("SESSION_TOKEN")).toBe(true);
    expect(isForbiddenKeyName("recoveryPhrase")).toBe(true);
    expect(isForbiddenKeyName("seed")).toBe(true);
    expect(isForbiddenKeyName("seeds")).toBe(false);
    expect(isForbiddenKeyName("vaultRef")).toBe(false);
    expect(isForbiddenKeyName("credentialRef")).toBe(false);
  });

  it("a clean surface passes the boundary scan on all four probes", () => {
    const findings = scanSecretBoundary(cleanProbesFixture());
    expect(findings).toEqual([]);
    const result = runSecretBoundaryGate({
      probes: cleanProbesFixture(),
      scrubber: makeReferenceScrubber(),
      scrubberProbes: [leakyClientStateFixture()],
    });
    expect(result.passed).toBe(true);
    expect(result.law).toBe("secret-boundary");
    expect(result.severity).toBe("cannot_downgrade_block");
  });

  it("secret material at ANY of the four probes is a boundary violation that BLOCKs", () => {
    for (const probes of [
      leakyProbesFixture(),
      { ...cleanProbesFixture(), clientRenderableState: leakyClientStateFixture() },
      { ...cleanProbesFixture(), modelVisibleContext: { ctx: bareKeyFixture() } },
      { ...cleanProbesFixture(), logs: [leakyLogFixture()] },
      { ...cleanProbesFixture(), artifacts: [{ payload: pemBlockFixture() }] },
    ]) {
      const result = runSecretBoundaryGate({
        probes,
        scrubber: makeReferenceScrubber(),
        scrubberProbes: [],
      });
      expect(result.passed, JSON.stringify(result.violations)).toBe(false);
      expect(
        result.violations.some(
          (violation) =>
            violation.code === "secret_material_at_boundary" ||
            violation.code === "forbidden_key_at_boundary",
        ),
      ).toBe(true);
    }
  });

  it("the scrubber contract: the reference scrubber redacts every secret-shaped value in a leaky payload", () => {
    const scrubbed = makeReferenceScrubber().scrub(leakyClientStateFixture());
    const remaining = scanSecretBoundary({
      clientRenderableState: scrubbed,
      modelVisibleContext: {},
      logs: [],
      artifacts: [],
    }).filter((finding) => finding.kind === "secret_shaped_value");
    expect(remaining).toEqual([]);
    const asRecord = scrubbed as Record<string, unknown>;
    // Forbidden-key fields redact with the forbidden_key marker (the key
    // NAME is a surface-shape defect the surface itself must fix).
    expect(asRecord.apiKey).toBe("[REDACTED:forbidden_key]");
    expect((asRecord.recovery as string)).toBe("[REDACTED:mnemonic]");
    const nested = asRecord.nested as Record<string, unknown>;
    expect(nested.clientSecret).toBe("[REDACTED:forbidden_key]");
  });

  it("a NON-conforming scrubber fails the contract (material left in the output)", () => {
    const passthroughScrubber = { scrub: (value: unknown) => value };
    const result = runSecretBoundaryGate({
      probes: cleanProbesFixture(),
      scrubber: passthroughScrubber,
      scrubberProbes: [leakyClientStateFixture()],
    });
    expect(result.passed).toBe(false);
    expect(
      result.violations.some(
        (violation) => violation.code === "scrubber_contract_violated",
      ),
    ).toBe(true);
  });

  it("a throwing scrubber fails the contract (totality law)", () => {
    const throwingScrubber = {
      scrub: () => {
        throw new Error("not total");
      },
    };
    const result = runSecretBoundaryGate({
      probes: cleanProbesFixture(),
      scrubber: throwingScrubber,
      scrubberProbes: [leakyClientStateFixture()],
    });
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((violation) => violation.code === "scrubber_not_total"),
    ).toBe(true);
  });

  it("the gate is deterministic: identical probes produce identical digests", () => {
    const first = runSecretBoundaryGate({
      probes: leakyProbesFixture(),
      scrubber: makeReferenceScrubber(),
      scrubberProbes: [leakyClientStateFixture()],
    });
    const second = runSecretBoundaryGate({
      probes: leakyProbesFixture(),
      scrubber: makeReferenceScrubber(),
      scrubberProbes: [leakyClientStateFixture()],
    });
    expect(first.digest).toBe(second.digest);
    expect(first.violations.length).toBeGreaterThan(0);
  });
});
