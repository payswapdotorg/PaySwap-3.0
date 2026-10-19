import { describe, expect, it } from "vitest";
import {
  DiscoveryExecutionRejectedError,
  ValidationError,
  assertDiscoveryTier,
  discoveryPermitsExecution,
  discoverOpportunity,
  isDiscoveryTieredValue,
  rejectDiscoveryForExecution,
} from "../src/index.ts";
import * as opportunityExports from "../src/index.ts";
import {
  pinnedLooksLikeConnectedInstance,
} from "../src/index.ts";
import type { PinnedConnectedInstanceScope } from "../src/index.ts";
import {
  NOW,
  discoveryCatalog,
  healthyLiquidityObservation,
} from "./fixtures-catalog.ts";

/**
 * The agent-cannot-execute law (P6-W2; REWRITTEN from the old
 * agent-cannot-execute.test.ts 17 titled sites onto the stricter
 * zero-sibling pins law — the old proofs drove the REAL merged-kernel
 * validators via @payswap/onchain-security; under the pins law the same
 * laws are proven against the PINNED authorization surfaces and gates:
 * the pinned INV-13 instance scope, the pinned protocol-command marker
 * scan and this package's structural tier + seam gates).
 */
describe("the agent-cannot-execute law (discovery is never authorization)", () => {
  // -----------------------------------------------------------------------
  // The structural tier gate
  // -----------------------------------------------------------------------

  it("discoveryPermitsExecution() is false, always (a first-class law, not a comment)", () => {
    expect(discoveryPermitsExecution()).toBe(false);
    expect(discoveryPermitsExecution()).toBe(false);
    expect(discoveryPermitsExecution()).not.toBe(true);
  });

  it("rejectDiscoveryForExecution throws for EVERY catalog opportunity (all families)", () => {
    for (const entry of discoveryCatalog()) {
      const opportunity = discoverOpportunity(entry.input, NOW);
      expect(() => rejectDiscoveryForExecution(opportunity), entry.label).toThrow(
        DiscoveryExecutionRejectedError,
      );
      expect(() => rejectDiscoveryForExecution(opportunity), entry.label).toThrow(
        /never authorization/,
      );
    }
  });

  it("rejectDiscoveryForExecution throws even for non-tiered values and null (the gate passes nothing)", () => {
    expect(() => rejectDiscoveryForExecution({ some: "value" })).toThrow(
      DiscoveryExecutionRejectedError,
    );
    expect(() => rejectDiscoveryForExecution(null)).toThrow(
      DiscoveryExecutionRejectedError,
    );
    expect(() => rejectDiscoveryForExecution("opportunity")).toThrow(
      DiscoveryExecutionRejectedError,
    );
  });

  it("every catalog opportunity carries the discovery tier (branded + re-derivable)", () => {
    for (const entry of discoveryCatalog()) {
      const opportunity = discoverOpportunity(entry.input, NOW);
      expect(isDiscoveryTieredValue(opportunity), entry.label).toBe(true);
      expect(() => assertDiscoveryTier(opportunity), entry.label).not.toThrow();
    }
  });

  it("the tier assertion rejects forgeries (fail closed, never guessed)", () => {
    expect(() => assertDiscoveryTier(null)).toThrow(ValidationError);
    expect(() => assertDiscoveryTier({})).toThrow(ValidationError);
    expect(() => assertDiscoveryTier({ discoveryTier: "PRODUCTION_AUTHORIZATION" })).toThrow(
      ValidationError,
    );
    expect(isDiscoveryTieredValue({ discoveryTier: "PRODUCTION_AUTHORIZATION" })).toBe(false);
    expect(isDiscoveryTieredValue("not an object")).toBe(false);
  });

  // -----------------------------------------------------------------------
  // The pinned authorization surfaces reject opportunities (the pins-law
  // re-basing of the old REAL-kernel proofs)
  // -----------------------------------------------------------------------

  it("an opportunity is NOT a connected instance (the pinned INV-13 scope law)", () => {
    for (const entry of discoveryCatalog()) {
      const opportunity = discoverOpportunity(entry.input, NOW);
      expect(pinnedLooksLikeConnectedInstance(opportunity), entry.label).toBe(false);
    }
    // The contrast: a genuine instance-shaped scope IS detected.
    const instanceScope: PinnedConnectedInstanceScope = {
      instanceId: "instance:real-scope",
      capabilityId: "capability:real",
      authorization: { status: "ACTIVE" },
      eligibility: { eligible: true, reasons: [] },
    };
    expect(pinnedLooksLikeConnectedInstance(instanceScope)).toBe(true);
  });

  it("an opportunity carries NO protocol-command marker field at any depth (the pinned marker law)", () => {
    const { pinnedAssertNotProtocolCommand } = opportunityExports as unknown as {
      pinnedAssertNotProtocolCommand: (value: unknown) => void;
    };
    for (const entry of discoveryCatalog()) {
      const opportunity = discoverOpportunity(entry.input, NOW);
      expect(() => pinnedAssertNotProtocolCommand(opportunity), entry.label).not.toThrow();
      // The JSON round-trip passes too (no hidden closure authority).
      const roundTripped = JSON.parse(JSON.stringify(opportunity));
      expect(() => pinnedAssertNotProtocolCommand(roundTripped)).not.toThrow();
    }
    // The contrast: a genuine command shape IS detected (fail closed).
    expect(() =>
      pinnedAssertNotProtocolCommand({ payload: { settlementInstructionId: "instr:1" } }),
    ).toThrow(/protocol command field/);
  });

  it("an opportunity record CANNOT be assigned to the pinned authorization scope type (structural incompatibility)", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    // Type-level law, runtime echo: the record lacks every scope field.
    const record = opportunity as unknown as Record<string, unknown>;
    expect(record.instanceId).toBeUndefined();
    expect(record.authorization).toBeUndefined();
    expect(record.permissionState).toBeUndefined();
    expect(record.mandate).toBeUndefined();
    expect(record.signature).toBeUndefined();
  });

  it("the export surface owns NO execution-verb machinery (prepare/execute/sign/broadcast/authorize/submit/transfer/approve/send)", () => {
    const forbiddenPrefixes: readonly string[] = [
      "prepare",
      "execute",
      "sign",
      "broadcast",
      "authorize",
      "submit",
      "transfer",
      "approve",
      "send",
    ];
    const offenders: string[] = [];
    for (const [exportName, exportValue] of Object.entries(opportunityExports)) {
      const lowerName = exportName.toLowerCase();
      if (
        (typeof exportValue === "function" || typeof exportValue === "object") &&
        forbiddenPrefixes.some((prefix) => lowerName.startsWith(prefix))
      ) {
        offenders.push(exportName);
      }
    }
    expect(offenders).toEqual([]);
    expect(Object.keys(opportunityExports).length).toBeGreaterThan(20);
  });

  it("opportunities are PURE DATA: JSON round-trips preserve every field (no closures, no authority)", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const roundTripped = JSON.parse(JSON.stringify(opportunity)) as typeof opportunity;
    expect(roundTripped).toEqual(opportunity);
    // And the pure-data copy still carries the tier and fails the gate.
    expect(isDiscoveryTieredValue(roundTripped)).toBe(true);
    expect(() => rejectDiscoveryForExecution(roundTripped)).toThrow(
      DiscoveryExecutionRejectedError,
    );
  });

  it("opportunities carry NO authorization-shaped field anywhere (deep key scan)", () => {
    const forbiddenFieldNames: readonly RegExp[] = [
      /^authorization$/i,
      /^authority$/i,
      /^credential/i,
      /^signature$/i,
      /^signed/i,
      /^permission/i,
      /^mandate$/i,
      /^secret/i,
      /^privateKey$/i,
      /^seedPhrase$/i,
      /^password$/i,
      /^apiKey$/i,
    ];
    function scanKeys(value: unknown, path: string, offenders: string[]): void {
      if (value === null || typeof value !== "object") {
        return;
      }
      for (const key of Object.keys(value as Record<string, unknown>)) {
        if (forbiddenFieldNames.some((pattern) => pattern.test(key))) {
          offenders.push(`${path}.${key}`);
        }
        scanKeys((value as Record<string, unknown>)[key], `${path}.${key}`, offenders);
      }
    }
    for (const entry of discoveryCatalog()) {
      const opportunity = discoverOpportunity(entry.input, NOW);
      const offenders: string[] = [];
      scanKeys(opportunity, entry.label, offenders);
      expect(offenders, entry.label).toEqual([]);
    }
  });

  it("the marker-field pin list is exactly the authority's 18 protocol-command fields (byte-identical)", () => {
    expect([...opportunityExports.PINNED_PROTOCOL_COMMAND_MARKER_FIELDS]).toEqual([
      "idempotencyKey",
      "commandType",
      "commandId",
      "authorization",
      "authority",
      "authorityEnvelope",
      "mandate",
      "mandateRef",
      "permissionGrant",
      "permissionGrantRef",
      "signature",
      "approvals",
      "obligationId",
      "clearingRecordId",
      "settlementInstructionId",
      "reservationId",
      "nettingPositionId",
      "finalityRecordId",
    ]);
    expect(opportunityExports.PINNED_PROTOCOL_COMMAND_MARKER_FIELDS).toHaveLength(18);
  });

  it("agents may discover/surface but CANNOT execute (the seam restates the law)", () => {
    expect(opportunityExports.agentCanExecuteOpportunities()).toBe(false);
    expect(opportunityExports.DECISION_AUTHORITY).toBe("downstream-authorization-lanes");
    expect(opportunityExports.OPPORTUNITY_PROPOSAL_SEAM).toBe(
      "opportunity->proposal->decision",
    );
  });
});
