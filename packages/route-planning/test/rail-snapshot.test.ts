import { describe, expect, it } from "vitest";
import {
  deriveEligibleRailSnapshot,
  deriveRailSnapshotPair,
} from "../src/rail-snapshot.ts";
import {
  CatalogueRailRejectedError,
  PortUnboundError,
  RailSnapshotError,
} from "../src/errors.ts";
import { unboundCorridorProjectionPort } from "../src/ports.ts";
import type { CorridorProjectionPort } from "../src/ports.ts";
import type { PinnedCorridorSideEvaluation } from "../src/pins/capability.ts";
import {
  catalogueEntryFixture,
  movementCorridorQuery,
  NOW,
  NOW_ISO,
  planningObservation,
  realCorridorProjectionPort,
  recipientChain,
  recipientCorridorRouteInput,
  senderChain,
  senderCorridorRouteInput,
  SENDER_INSTANCE_ID,
} from "./fixtures.ts";

/**
 * THE RAIL-SNAPSHOT LAWS (ROUTINE-CONTRACT stages 2 and 3): sender and
 * recipient rails derive INDEPENDENTLY through the REAL corridor
 * machinery; every record carries lineage + observation versions + scopes
 + limits + the FULL typed exclusion list; catalogue claims never qualify
 * a rail (INV-13); the snapshot digest is deterministic; rail discovery
 * NEVER permits execution.
 */

function senderRequest(overrides?: Partial<Parameters<typeof deriveEligibleRailSnapshot>[0]>) {
  return {
    side: "SENDER" as const,
    query: movementCorridorQuery(),
    freshnessPolicy: { maxAgeSeconds: 3600 },
    chains: [senderChain()],
    corridorPort: realCorridorProjectionPort(),
    ...overrides,
  };
}

function recipientRequest(overrides?: Partial<Parameters<typeof deriveEligibleRailSnapshot>[0]>) {
  return {
    side: "RECIPIENT" as const,
    query: movementCorridorQuery(),
    freshnessPolicy: { maxAgeSeconds: 3600 },
    chains: [recipientChain()],
    corridorPort: realCorridorProjectionPort(),
    ...overrides,
  };
}

describe("deriveEligibleRailSnapshot — the REAL projection through the port", () => {
  it("derives a versioned snapshot with lineage, scopes, limits and the digest", () => {
    const snapshot = deriveEligibleRailSnapshot(senderRequest());
    expect(snapshot.side).toBe("SENDER");
    expect(snapshot.evaluatedAsOf).toBe(NOW_ISO);
    expect(snapshot.rails).toHaveLength(1);
    const rail = snapshot.rails[0];
    expect(rail?.routeId).toBe(SENDER_INSTANCE_ID);
    expect(rail?.eligible).toBe(true);
    expect(rail?.observationVersion).toBe(1);
    expect(rail?.observedAt).toBe(NOW_ISO);
    expect(rail?.stale).toBe(false);
    expect(rail?.lineage.connectedInstanceId).toBe(SENDER_INSTANCE_ID);
    expect(rail?.lineage.observationVersion).toBe(1);
    expect(rail?.scopes.instanceId).toBe(SENDER_INSTANCE_ID);
    expect(rail?.scopes.authorizationStatus).toBe("ACTIVE");
    expect(rail?.scopes.permissionState.missing).toEqual([]);
    expect(rail?.scopes.geography).toContain("DE");
    expect(rail?.scopes.currencies).toContain("EUR");
    expect(rail?.exclusions).toEqual([]);
    expect(rail?.effectiveAvailability).toBe("AVAILABLE");
    expect(rail?.limits.restrictionSetIds.length).toBeGreaterThan(0);
    expect(rail?.limits.cutoffs[0]?.processingDayRule).toBe("BUSINESS_DAYS");
    expect(rail?.limits.quota?.remaining).toBe(100);
    expect(snapshot.eligibleRouteIds).toEqual([SENDER_INSTANCE_ID]);
    expect(snapshot.snapshotDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });

  it("the evaluation is preserved VERBATIM on the record (routeId, modes, terms)", () => {
    const snapshot = deriveEligibleRailSnapshot(senderRequest());
    const evaluation = snapshot.rails[0]?.evaluation;
    expect(evaluation?.routeId).toBe(SENDER_INSTANCE_ID);
    expect(evaluation?.eligible).toBe(true);
    expect(evaluation?.offeredExecutionModes).toContain("PASS_THROUGH_NATIVE");
    expect(evaluation?.termsRefs[0]?.termsRef).toBe("terms:planning-psp");
  });

  it("an ineligible rail is RETAINED with the FULL typed exclusion list (never dropped)", () => {
    const snapshot = deriveEligibleRailSnapshot(senderRequest({
      chains: [senderChain({
        observation: planningObservation(SENDER_INSTANCE_ID, 3, {
          observedAt: "2020-01-01T00:00:00Z",
        }),
      })],
    }));
    expect(snapshot.rails).toHaveLength(1);
    const rail = snapshot.rails[0];
    expect(rail?.eligible).toBe(false);
    expect(rail?.stale).toBe(true);
    expect(rail?.exclusions.length).toBeGreaterThan(0);
    expect(rail?.exclusions.every((exclusion) => exclusion.code.length > 0)).toBe(true);
    expect(snapshot.eligibleRouteIds).toEqual([]);
  });

  it("the derived staleness verdict consults the REAL projection's STALE_OBSERVATION code", () => {
    const fresh = deriveEligibleRailSnapshot(senderRequest());
    expect(fresh.rails[0]?.stale).toBe(false);
    const stale = deriveEligibleRailSnapshot(senderRequest({
      chains: [senderChain({
        observation: planningObservation(SENDER_INSTANCE_ID, 4, {
          observedAt: "2020-01-01T00:00:00Z",
        }),
      })],
    }));
    expect(stale.rails[0]?.stale).toBe(true);
    expect(
      stale.rails[0]?.exclusions.some((exclusion) => exclusion.code === "STALE_OBSERVATION"),
    ).toBe(true);
  });

  it("identical inputs produce byte-identical snapshot digests (determinism)", () => {
    const first = deriveEligibleRailSnapshot(senderRequest());
    const second = deriveEligibleRailSnapshot(senderRequest());
    expect(first.snapshotDigest).toBe(second.snapshotDigest);
  });

  it("a different observation version changes the snapshot digest (tamper-evidence)", () => {
    const versionOne = deriveEligibleRailSnapshot(senderRequest());
    const versionTwo = deriveEligibleRailSnapshot(senderRequest({
      chains: [senderChain({
        observation: planningObservation(SENDER_INSTANCE_ID, 9),
      })],
    }));
    expect(versionOne.snapshotDigest).not.toBe(versionTwo.snapshotDigest);
    expect(versionTwo.rails[0]?.observationVersion).toBe(9);
  });

  it("the outputs are frozen and rail discovery NEVER permits execution", () => {
    const snapshot = deriveEligibleRailSnapshot(senderRequest());
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.rails)).toBe(true);
    expect(Object.isFrozen(snapshot.eligibleRouteIds)).toBe(true);
    expect(snapshot.railsPermitExecution).toBe(false);
    expect(snapshot.railsPermitExecution).not.toBe(true);
  });
});

describe("deriveRailSnapshotPair — the independence law", () => {
  it("derives BOTH sides independently (each side's own chains + port binding)", () => {
    const pair = deriveRailSnapshotPair({
      sender: senderRequest(),
      recipient: recipientRequest(),
    });
    expect(pair.sender.side).toBe("SENDER");
    expect(pair.recipient.side).toBe("RECIPIENT");
    expect(pair.sender.eligibleRouteIds).toEqual([SENDER_INSTANCE_ID]);
    expect(pair.recipient.eligibleRouteIds).toEqual(["inst:recipient-psp-payouts"]);
    expect(pair.sender.snapshotDigest).not.toBe(pair.recipient.snapshotDigest);
  });

  it("rejects swapped sides (the pair projection is total)", () => {
    expect(() =>
      deriveRailSnapshotPair({ sender: recipientRequest(), recipient: senderRequest() })
    ).toThrow(RailSnapshotError);
  });

  it("a per-side failure fails the pair derivation closed (no partial pair)", () => {
    expect(() =>
      deriveRailSnapshotPair({
        sender: senderRequest({ corridorPort: unboundCorridorProjectionPort() }),
        recipient: recipientRequest(),
      }),
    ).toThrow(PortUnboundError);
  });
});

describe("the INV-13 catalogue law (catalogue claims never qualify a rail)", () => {
  it("a catalogue entry as the chain itself is rejected typed", () => {
    expect(() =>
      // deliberately malformed input (the fail-closed probe): a catalogue
      // advertisement where a four-layer chain is required.
      deriveEligibleRailSnapshot(senderRequest({ chains: [catalogueEntryFixture()] as never })),
    ).toThrow(CatalogueRailRejectedError);
  });

  it("a catalogue entry as chain.instance is rejected typed", () => {
    // deliberately malformed input (the fail-closed probe).
    const chain = {
      ...senderChain(),
      instance: catalogueEntryFixture(),
    } as never;
    expect(() => deriveEligibleRailSnapshot(senderRequest({ chains: [chain] }))).toThrow(
      CatalogueRailRejectedError,
    );
  });
});

describe("fail-closed request validation", () => {
  it("the side must be SENDER or RECIPIENT", () => {
    expect(() =>
      deriveEligibleRailSnapshot({ ...senderRequest(), side: "MIDDLEMAN" as never }),
    ).toThrow(RailSnapshotError);
  });

  it("the corridor query fields are validated (countries, currencies, amount, asOf)", () => {
    const base = movementCorridorQuery();
    const bad: readonly [string, unknown][] = [
      ["sourceCountry", "D"],
      ["destinationCountry", 7],
      ["sourceCurrency", "eu"],
      ["destinationCurrency", "EURO"],
      ["customerType", "PERSON"],
    ];
    for (const [field, value] of bad) {
      const query = { ...base, [field]: value };
      expect(() => deriveEligibleRailSnapshot(senderRequest({ query }))).toThrow(
        RailSnapshotError,
      );
    }
    expect(() =>
      // deliberately malformed input (the fail-closed probe): a sendAmount
      // missing its minorUnits.
      deriveEligibleRailSnapshot(
        senderRequest({ query: { ...base, sendAmount: { currency: "ETH" } } as never }),
      ),
    ).toThrow(RailSnapshotError);
    expect(() =>
      deriveEligibleRailSnapshot(senderRequest({ query: { ...base, asOf: "2026-10-05" } })),
    ).toThrow(RailSnapshotError);
  });

  it("the freshness policy must carry a positive integer maxAgeSeconds", () => {
    expect(() =>
      deriveEligibleRailSnapshot(senderRequest({ freshnessPolicy: { maxAgeSeconds: 0 } })),
    ).toThrow(RailSnapshotError);
    expect(() =>
      deriveEligibleRailSnapshot(senderRequest({ freshnessPolicy: { maxAgeSeconds: 1.5 } })),
    ).toThrow(RailSnapshotError);
  });

  it("the chain rule: observation.instanceId must match the connected instance", () => {
    const chain = {
      ...senderChain(),
      observation: planningObservation("inst:someone-else", 5),
    };
    expect(() => deriveEligibleRailSnapshot(senderRequest({ chains: [chain] }))).toThrow(
      RailSnapshotError,
    );
  });

  it("a rail appears at most once per side (duplicate instances rejected)", () => {
    expect(() =>
      deriveEligibleRailSnapshot(senderRequest({ chains: [senderChain(), senderChain()] })),
    ).toThrow(RailSnapshotError);
  });

  it("an unbound corridor port fails CLOSED naming the exact stage", () => {
    const port: CorridorProjectionPort = unboundCorridorProjectionPort();
    let stage = "";
    try {
      deriveEligibleRailSnapshot(senderRequest({ chains: [senderCorridorRouteInput()], corridorPort: port }));
      expect.unreachable("the unbound port must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PortUnboundError);
      stage = (error as PortUnboundError & { details?: { stage: string } }).details?.stage ?? "";
    }
    expect(stage).toBe("stage-2:discover-sender-rails");
  });

  it("a malformed port result never assembles a snapshot (lineage/chain mismatch)", () => {
    const real = realCorridorProjectionPort();
    const lying: CorridorProjectionPort = {
      evaluateSide(input) {
        const evaluation: PinnedCorridorSideEvaluation = real.evaluateSide(input);
        return {
          view: {
            ...evaluation.view,
            routes: [...evaluation.view.routes, evaluation.view.routes[0] as never],
          },
          routeRestrictionSets: [...evaluation.routeRestrictionSets, []],
        };
      },
    };
    expect(() =>
      deriveEligibleRailSnapshot(senderRequest({ corridorPort: lying })),
    ).toThrow(RailSnapshotError);
  });

  it("routeRestrictionSets must be index-aligned with view.routes", () => {
    const real = realCorridorProjectionPort();
    const lying: CorridorProjectionPort = {
      evaluateSide(input) {
        const evaluation = real.evaluateSide(input);
        return { view: evaluation.view, routeRestrictionSets: [] };
      },
    };
    expect(() =>
      deriveEligibleRailSnapshot(senderRequest({ corridorPort: lying })),
    ).toThrow(RailSnapshotError);
  });

  it("the typed recipient chain composes the same snapshot shape (both fixture builders agree)", () => {
    const fromPinned = deriveEligibleRailSnapshot(senderRequest());
    const fromTyped = deriveEligibleRailSnapshot(senderRequest({
      chains: [senderCorridorRouteInput()],
    }));
    expect(fromPinned.snapshotDigest).toBe(fromTyped.snapshotDigest);
    const recipient = deriveEligibleRailSnapshot(recipientRequest({
      chains: [recipientCorridorRouteInput()],
    }));
    expect(recipient.eligibleRouteIds).toEqual(["inst:recipient-psp-payouts"]);
  });

  it("caller-supplied instants are data: NOW is the fixture constant, never a clock read", () => {
    const snapshot = deriveEligibleRailSnapshot(senderRequest());
    expect(snapshot.query.asOf).toBe(NOW_ISO);
    expect(NOW).toBe(Date.parse(NOW_ISO));
  });
});
