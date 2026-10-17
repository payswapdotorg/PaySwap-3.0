import { describe, expect, it } from "vitest";
import {
  ProtocolCommandShapeError,
  assertNotProtocolCommand,
  makeProposal,
} from "../src/index.ts";
import type { AgentProposal } from "../src/index.ts";
import type { Equal, Expect } from "./type-utils.ts";

/**
 * Agent proposals never authorize (old INV-G03; canonical INV-9/INV-10).
 * They are advisory inputs, structurally distinct from protocol commands:
 * no idempotency key, no authority fields, no signatures — and (P3-W1) no
 * obligation/clearing/settlement/reservation/netting/finality artifact ids.
 *
 * ADAPTED from payswap.org@8a735bf packages/agents/test/proposal.test.ts:
 * fixtures gain `schemaVersion: 1` (the versioned recommendation record);
 * net-new tests cover the schema version law and the extended marker
 * vocabulary.
 */

function proposal(overrides: Partial<AgentProposal> = {}): AgentProposal {
  return {
    schemaVersion: 1,
    proposalId: "proposal-1",
    proposingInstance: "instance-payer",
    proposalType: "money_movement",
    payload: { route: "sepa", rationale: "cheapest" },
    rationale: "Cheapest available rail for this corridor",
    evidenceRefs: ["quote:q-1", "capability:sepa@2"],
    expiresAt: 9_999_999,
    ...overrides,
  };
}

describe("assertNotProtocolCommand (never-authorizes guard)", () => {
  it("accepts plain advisory payloads", () => {
    expect(() =>
      assertNotProtocolCommand({
        suggestion: "route via SEPA to cut cost by 12 bps",
        confidence: "medium",
      }),
    ).not.toThrow();
  });

  it("rejects a value carrying an idempotency key at the top level", () => {
    expect(() =>
      assertNotProtocolCommand({ action: "settle", idempotencyKey: "idem-1" }),
    ).toThrow(ProtocolCommandShapeError);
  });

  it("rejects authority-shaped values", () => {
    expect(() => assertNotProtocolCommand({ authorization: "Bearer x" })).toThrow(
      ProtocolCommandShapeError,
    );
    expect(() =>
      assertNotProtocolCommand({ mandateRef: { mandateId: "m-1", version: 1 } }),
    ).toThrow(ProtocolCommandShapeError);
    expect(() => assertNotProtocolCommand({ signature: "sig" })).toThrow(
      ProtocolCommandShapeError,
    );
  });

  it("rejects command shape nested at any depth, including arrays", () => {
    expect(() =>
      assertNotProtocolCommand({
        plan: {
          steps: [{ name: "pay", payload: { idempotencyKey: "idem-2" } }],
        },
      }),
    ).toThrow(/plan\.steps\.0\.payload/);
  });

  it("handles cycles without looping forever", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic["self"] = cyclic;
    expect(() => assertNotProtocolCommand(cyclic)).not.toThrow();
    cyclic["idempotencyKey"] = "idem-3";
    expect(() => assertNotProtocolCommand(cyclic)).toThrow(ProtocolCommandShapeError);
  });

  it("NET-NEW: rejects the financial-protocol artifact vocabulary (obligation/clearing/settlement/reservation/netting/finality ids)", () => {
    expect(() =>
      assertNotProtocolCommand({ obligationId: "obl-1" }),
    ).toThrow(ProtocolCommandShapeError);
    expect(() =>
      assertNotProtocolCommand({ plan: { clearingRecordId: "clr-1" } }),
    ).toThrow(ProtocolCommandShapeError);
    expect(() =>
      assertNotProtocolCommand({ settlementInstructionId: "si-1" }),
    ).toThrow(ProtocolCommandShapeError);
    expect(() =>
      assertNotProtocolCommand({ reservationId: "res-1" }),
    ).toThrow(ProtocolCommandShapeError);
    expect(() =>
      assertNotProtocolCommand({ nettingPositionId: "np-1" }),
    ).toThrow(ProtocolCommandShapeError);
    expect(() =>
      assertNotProtocolCommand({ finalityRecordId: "fin-1" }),
    ).toThrow(ProtocolCommandShapeError);
  });

  it("NET-NEW: advisory text that merely DISCUSSES settlement stays legal (field names govern, not prose)", () => {
    expect(() =>
      assertNotProtocolCommand({
        rationale: "recommend the settle-now strategy; settlement occurs after funding",
        suggestedWindowHours: 2,
      }),
    ).not.toThrow();
  });
});

describe("makeProposal (versioned recommendation record)", () => {
  it("accepts and returns a well-formed advisory proposal", () => {
    const made = makeProposal(proposal());
    expect(made.proposalId).toBe("proposal-1");
    expect(() => assertNotProtocolCommand(made)).not.toThrow();
  });

  it("rejects a proposal whose payload hides protocol-command shape", () => {
    expect(() =>
      makeProposal(
        proposal({
          proposalId: "proposal-2",
          payload: { commandType: "Settle", idempotencyKey: "idem-4" },
          evidenceRefs: [],
        }),
      ),
    ).toThrow(ProtocolCommandShapeError);
  });

  it("NET-NEW: rejects a wrong or missing schema version (versioned record law)", () => {
    expect(() =>
      makeProposal(proposal({ schemaVersion: 2 as unknown as AgentProposal["schemaVersion"] })),
    ).toThrow(/schemaVersion must be 1/);
    expect(() =>
      makeProposal(proposal({ proposalId: "" })),
    ).toThrow(/proposalId/);
    expect(() =>
      makeProposal(proposal({ proposingInstance: "" })),
    ).toThrow(/proposingInstance/);
  });

  it("NET-NEW: every proposal type is advisory — even money_movement carries no execution binding", () => {
    for (const proposalType of ["money_movement", "strategy", "work_action", "informational"] as const) {
      const made = makeProposal(proposal({ proposalType }));
      expect(made.proposalType).toBe(proposalType);
      // the record has no obligation/clearing/settlement call surface at all
      expect(Object.keys(made).sort()).toEqual([
        "evidenceRefs",
        "expiresAt",
        "payload",
        "proposalId",
        "proposalType",
        "proposingInstance",
        "rationale",
        "schemaVersion",
      ]);
    }
  });
});

// Type-level guarantees (enforced by `tsc --noEmit`):

// AgentProposal must NOT structurally contain idempotency/authority/signature
// fields (weak-type detection).
type _noIdempotencyKey = AgentProposal extends { idempotencyKey?: unknown } ? true : false;
type _noAuthorization = AgentProposal extends { authorization?: unknown } ? true : false;
type _noSignature = AgentProposal extends { signature?: unknown } ? true : false;
type _noAuthorityEnvelope = AgentProposal extends { authorityEnvelope?: unknown } ? true : false;
type _assert1 = Expect<Equal<_noIdempotencyKey, false>>;
type _assert2 = Expect<Equal<_noAuthorization, false>>;
type _assert3 = Expect<Equal<_noSignature, false>>;
type _assert4 = Expect<Equal<_noAuthorityEnvelope, false>>;

// NET-NEW: the versioned record pins schemaVersion to the literal 1.
type _schemaVersion = AgentProposal["schemaVersion"];
type _assert5 = Expect<Equal<_schemaVersion, 1>>;
