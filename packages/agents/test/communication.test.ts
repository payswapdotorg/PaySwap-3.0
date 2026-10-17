import { describe, expect, it } from "vitest";
import {
  CommunicationError,
  OrganizationCommunicationRelay,
  ProtocolCommandShapeError,
  RootCredentialInContextError,
  releaseOrganization,
} from "../src/index.ts";
import type { AgentMessage } from "../src/index.ts";
import { makeOrgDraft } from "./fixtures.ts";

/**
 * NET-NEW (P3-W1): organization communications (FROZEN §7 "communication").
 * A message travels ONLY along a DECLARED communication edge of a RELEASED
 * organization version — same version, same channel, declared sender and
 * receiver. Payloads are scanned (no command shape, no root credentials).
 * Delivery is deterministic, evidenced and immutable.
 */

const T0 = 5_000_000;

function message(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    messageId: "msg-1",
    orgId: "org:payops-1",
    orgVersion: 1,
    fromInstanceId: "instance-payer",
    toInstanceId: "instance-reviewer",
    channel: "a2a",
    artifactType: "RoutingNote",
    payload: { note: "prefer SEPA for this corridor" },
    sentAt: T0,
    ...overrides,
  };
}

describe("communication relay — declared edges only (C1, C2)", () => {
  it("delivers a message along a declared edge and freezes it", () => {
    const relay = new OrganizationCommunicationRelay(releaseOrganization(makeOrgDraft(), 4_000_000));
    const delivered = relay.deliver(message());
    expect(delivered.messageId).toBe("msg-1");
    expect(relay.delivered()).toHaveLength(1);
    expect(() => {
      (delivered as { payload: unknown }).payload = { note: "mutated" };
    }).toThrow(TypeError);
  });

  it("rejects undeclared sender/receiver/channel combinations", () => {
    const relay = new OrganizationCommunicationRelay(releaseOrganization(makeOrgDraft(), 4_000_000));
    expect(() => relay.deliver(message({ toInstanceId: "instance-ghost" }))).toThrow(
      /no communication edge/,
    );
    expect(() => relay.deliver(message({ channel: "undclared" }))).toThrow(
      /no communication edge/,
    );
    // reversed direction is NOT declared either
    expect(() =>
      relay.deliver(
        message({ fromInstanceId: "instance-reviewer", toInstanceId: "instance-payer" }),
      ),
    ).toThrow(/no communication edge/);
    expect(relay.delivered()).toEqual([]);
  });

  it("rejects foreign organization versions — communication never crosses versions", () => {
    const relay = new OrganizationCommunicationRelay(releaseOrganization(makeOrgDraft(), 4_000_000));
    expect(() => relay.deliver(message({ orgVersion: 2 }))).toThrow(/never crosses organization/);
    expect(() => relay.deliver(message({ orgId: "org:other" }))).toThrow(
      /never crosses organization/,
    );
  });

  it("rejects duplicate message ids and empty fields", () => {
    const relay = new OrganizationCommunicationRelay(releaseOrganization(makeOrgDraft(), 4_000_000));
    relay.deliver(message());
    expect(() => relay.deliver(message({ messageId: "msg-1" }))).toThrow(/duplicate message id/);
    expect(() => relay.deliver(message({ messageId: "" }))).toThrow(/messageId/);
    expect(() => relay.deliver(message({ messageId: "msg-2", artifactType: "" }))).toThrow(
      /artifactType/,
    );
  });
});

describe("communication relay — content boundary (C3)", () => {
  it("rejects payloads carrying protocol-command shape", () => {
    const relay = new OrganizationCommunicationRelay(releaseOrganization(makeOrgDraft(), 4_000_000));
    expect(() =>
      relay.deliver(message({ payload: { commandType: "Settle", idempotencyKey: "x" } })),
    ).toThrow(ProtocolCommandShapeError);
    expect(relay.delivered()).toEqual([]);
  });

  it("rejects payloads carrying root credentials (INV-19)", () => {
    const relay = new OrganizationCommunicationRelay(releaseOrganization(makeOrgDraft(), 4_000_000));
    expect(() =>
      relay.deliver(
        message({
          payload: { creds: [{ credentialKind: "root_credential", keyFingerprint: "k" }] },
        }),
      ),
    ).toThrow(RootCredentialInContextError);
  });
});

describe("communication relay — deterministic broadcast and inboxes (C4, C5)", () => {
  function fanOutOrg() {
    // payer -> reviewer + payer -> reviewer2 on channel a2a, plus an unrelated channel
    return releaseOrganization(
      makeOrgDraft({
        instances: [
          ...makeOrgDraft().instances,
          {
            id: "instance-reviewer-2",
            bodyRef: { id: "body:payer", version: 2 },
            principal: { agentKeyFingerprint: "agent-key-3", ownerRef: "user:owner-1" },
            runtimeState: { status: "IDLE" },
          },
        ],
        communicationEdges: [
          { fromInstanceId: "instance-payer", toInstanceId: "instance-reviewer", channel: "a2a" },
          { fromInstanceId: "instance-payer", toInstanceId: "instance-reviewer-2", channel: "a2a" },
          { fromInstanceId: "instance-payer", toInstanceId: "instance-reviewer", channel: "ops" },
        ],
      }),
      4_000_000,
    );
  }

  it("broadcasts along the declared edges of the channel in edge array order", () => {
    const relay = new OrganizationCommunicationRelay(fanOutOrg());
    const delivered = relay.broadcast({
      baseMessageId: "blast",
      fromInstanceId: "instance-payer",
      channel: "a2a",
      artifactType: "RoutingNote",
      payload: { note: "corridor update" },
      sentAt: T0,
    });
    expect(delivered.map((m) => m.messageId)).toEqual(["blast:1", "blast:2"]);
    expect(delivered.map((m) => m.toInstanceId)).toEqual([
      "instance-reviewer",
      "instance-reviewer-2",
    ]);
    expect(relay.delivered()).toHaveLength(2);
  });

  it("a broadcast with no declared receivers on the channel fails closed", () => {
    const relay = new OrganizationCommunicationRelay(fanOutOrg());
    expect(() =>
      relay.broadcast({
        baseMessageId: "blast",
        fromInstanceId: "instance-reviewer",
        channel: "a2a",
        artifactType: "RoutingNote",
        payload: {},
        sentAt: T0,
      }),
    ).toThrow(/no declared receivers/);
    expect(() =>
      relay.broadcast({
        baseMessageId: "",
        fromInstanceId: "instance-payer",
        channel: "a2a",
        artifactType: "RoutingNote",
        payload: {},
        sentAt: T0,
      }),
    ).toThrow(/baseMessageId/);
  });

  it("inboxOf returns the participant's messages in delivery order; others get nothing", () => {
    const relay = new OrganizationCommunicationRelay(fanOutOrg());
    relay.broadcast({
      baseMessageId: "blast",
      fromInstanceId: "instance-payer",
      channel: "a2a",
      artifactType: "RoutingNote",
      payload: { note: "corridor update" },
      sentAt: T0,
    });
    expect(relay.inboxOf("instance-reviewer").map((m) => m.messageId)).toEqual(["blast:1"]);
    expect(relay.inboxOf("instance-reviewer-2").map((m) => m.messageId)).toEqual(["blast:2"]);
    expect(relay.inboxOf("instance-ghost")).toEqual([]);
  });
});
