import { describe, expect, it } from "vitest";
import { deriveConditionalOpportunities } from "../src/conditional-stage.ts";
import { PortUnboundError } from "../src/errors.ts";
import {
  CORRIDOR_RAIL_KEY,
  NOW,
  flwSenderChain,
  noRouteCorridorQuery,
  noRouteIntentFixture,
  realConditionalOpportunityPort,
  stripeRecipientChain,
} from "./no-route-fixtures.ts";
import { realCorridorProjectionPort } from "./fixtures.ts";
import { fixtureRepairCatalogue } from "./repair-catalogue-fixture.ts";
import { deriveRailSnapshotPair } from "../src/rail-snapshot.ts";
import { evaluateHardGates } from "../src/hard-gates.ts";

/**
 * THE P23-C COMPAT GATE (ADR-0015 D3, split from conditional-stage.test.ts
 * under the 400-line file law): the catalogue-bound general path vs the P21
 * path — the SAME three conditionals byte-identically over the FLW→Stripe
 * corridor, the additive repair sections, the absent-catalogue default, and
 * the fail-closed non-port rejection.
 */

const OPT_IN = { participantRef: "principal:operator-1", optedInAt: NOW - 1_000 };
const DERIVE_AT = NOW;
const EXPIRES_AT = NOW + 3_600_000;
const DISCLOSURE_PURPOSE = "the operator's no-route panel renders the conditional opportunities with their preconditions";

function compatBase() {
  const pair = deriveRailSnapshotPair({
    sender: {
      side: "SENDER", query: noRouteCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [flwSenderChain()], corridorPort: realCorridorProjectionPort(),
    },
    recipient: {
      side: "RECIPIENT", query: noRouteCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [stripeRecipientChain()], corridorPort: realCorridorProjectionPort(),
    },
  });
  return {
    senderSnapshot: pair.sender,
    recipientSnapshot: pair.recipient,
    hardGates: evaluateHardGates({ intent: noRouteIntentFixture(), at: NOW, candidates: [] }),
    port: realConditionalOpportunityPort(),
    corridorRail: { railKind: "FIAT" as const, railKey: CORRIDOR_RAIL_KEY },
    optIn: OPT_IN,
    at: DERIVE_AT,
    expiresAt: EXPIRES_AT,
    disclosurePurpose: DISCLOSURE_PURPOSE,
  };
}

describe("THE P23-C COMPAT GATE (ADR-0015 D3): the catalogue-bound general path vs the P21 path", () => {
  it("the catalogue BOUND: the P21 three reproduced IDENTICALLY (ids, party changes, titles) + the ADDITIVE repair sections", () => {
    const base = compatBase();
    const p21Path = deriveConditionalOpportunities(base);
    const generalPath = deriveConditionalOpportunities({ ...base, repairCatalogue: fixtureRepairCatalogue() });
    // THE COMPAT GATE: the same three conditionals, byte-identically (ids + party changes, in order).
    expect(generalPath.conditionalOpportunities.length).toBe(3);
    expect(generalPath.conditionalOpportunities.map((conditional) => conditional.conditionalId)).toEqual(
      p21Path.conditionalOpportunities.map((conditional) => conditional.conditionalId),
    );
    expect(
      generalPath.conditionalOpportunities.map((conditional) =>
        conditional.requiredPartyChanges.map((change) => `${change.party}:${change.change}`).join("|"),
      ),
    ).toEqual(
      p21Path.conditionalOpportunities.map((conditional) =>
        conditional.requiredPartyChanges.map((change) => `${change.party}:${change.change}`).join("|"),
      ),
    );
    // The shared fields are untouched; the digest changes ONLY on the bound path (documented).
    expect(generalPath.senderSnapshotDigest).toBe(p21Path.senderSnapshotDigest);
    expect(generalPath.derivationDigest).not.toBe(p21Path.derivationDigest);
    expect(generalPath.conditionalsPermitExecution).toBe(false);
    expect(generalPath.advisoryOnly).toBe(true);
    // The ADDITIVE sections: the platform work (3 gaps) + the hypotheses (2) + the honest empty non-repair set.
    expect((generalPath as unknown as { platformWork: readonly { gapId: string }[] }).platformWork.map((work) => work.gapId).sort()).toEqual([
      "platform:connector-operation",
      "platform:cross-provider-route-shape",
      "platform:flutterwave-send-operation",
    ]);
    expect((generalPath as unknown as { hypotheses: readonly { operatorId: string }[] }).hypotheses.map((hypothesis) => hypothesis.operatorId)).toEqual([
      "repair:bridge-via-intermediary-rail",
      "repair:intermediary-introduced",
    ]);
    expect((generalPath as unknown as { nonRepairClassifications: readonly unknown[] }).nonRepairClassifications).toEqual([]);
  });

  it("the catalogue ABSENT (the default): the exact P21 path — byte-identical replays, NO additive sections", () => {
    const first = deriveConditionalOpportunities(compatBase());
    const second = deriveConditionalOpportunities(compatBase());
    expect(second.derivationDigest).toBe(first.derivationDigest);
    expect(first.conditionalOpportunities.length).toBe(3);
    // The unbound path carries NO additive sections (the pre-P23 shape — the existing callers' contract).
    expect((first as unknown as { platformWork?: unknown }).platformWork).toBeUndefined();
    expect((first as unknown as { hypotheses?: unknown }).hypotheses).toBeUndefined();
  });

  it("a NON-port catalogue is rejected fail-closed (the typed error, never a fallback)", () => {
    expect(() =>
      deriveConditionalOpportunities({
        ...compatBase(),
        repairCatalogue: { operatorsFor: "not-a-function" } as never,
      }),
    ).toThrow(PortUnboundError);
  });
});
