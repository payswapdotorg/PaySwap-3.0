/**
 * Desktop console client laws (P10-B): the renderer-side re-declaration of
 * the payswap-desktop channel client CANNOT drift from the host's
 * IPaySwapDesktopService. The host contracts live under src/host (not
 * renderer-importable), so the renderer module re-declares the member set
 * — this test imports BOTH sides (the renderer mount + the host service,
 * test-only) and asserts exact method parity: a mismatch fails the build
 * rather than silently widening (or narrowing) the channel.
 *
 * Also pins: the channel identity (one kebab-case channel per service),
 * the §5 WorkspaceStorePort adapter surface (durability DESKTOP_PROFILE +
 * exactly the pinned method set), and the no-authority-verb law on the
 * client surface (no execute/settle/payout-shaped member may appear).
 */

import { describe, expect, it } from "vitest";

import {
  PAYSWAP_DESKTOP_CLIENT_MEMBERS,
  PAYSWAP_DESKTOP_SERVICE_CHANNEL_NAME,
  connectDesktopConsoleServices,
  createDesktopWorkspaceStorePort,
  type DesktopConsoleChannelServices,
} from "../../src/renderer/src/consoleWorkspaceMount.js";
import {
  PAYSWAP_DESKTOP_SERVICE_CHANNEL,
  PINNED_WORKSPACE_STORE_PORT_METHODS,
  createPaySwapDesktopService,
} from "../../src/host/payswap/index.js";
import type { IPaySwapDesktopClientService } from "../../src/renderer/src/consoleWorkspaceMount.js";
import type { MissionIntakeInput, MissionRecord } from "@payswap/app";
import type { MessagePort as NodeMessagePort } from "node:worker_threads";

/**
 * A channel service double for the port-adapter laws (recorded calls).
 * PARTIAL by design — only the §5 workspace-store members the port-adapter
 * laws exercise are implemented; the full member surface (including the
 * payment-mission + approval members) is pinned STRUCTURALLY by the
 * drift test above, so the double casts through unknown, never lying
 * about implementing members it does not carry.
 */
function fakeChannelService(): IPaySwapDesktopClientService & {
  readonly calls: readonly string[];
} {
  const calls: string[] = [];
  const record = <T>(name: string, value: T): T => {
    calls.push(name);
    return value;
  };
  // The typed PARTIAL double first (every implemented member contextually
  // typed against the REAL client interface), then the one honest widening
  // cast — the drift test above pins the FULL member set structurally.
  const partial: Partial<IPaySwapDesktopClientService> & { readonly calls: readonly string[] } = {
    deploymentFacts: () => record("deploymentFacts", Promise.resolve({
      economicIntakeConfigured: false,
      capabilityObservationsAvailable: false,
      merchantCheckoutContextBound: false,
      providerObservationsAvailable: false,
      delegationPlaneReachable: false,
    })),
    workspaceListMissions: () => record("workspaceListMissions", Promise.resolve([])),
    workspaceRecordMissionDraft: (input, now) =>
      record("workspaceRecordMissionDraft", Promise.resolve(recordedMissionRecord("mission-1", input, now))),
    workspaceRecordMissionIntent: (id, now) =>
      record("workspaceRecordMissionIntent", Promise.resolve(recordedMissionRecord(id, { goalStatement: "Pay the spring invoice", direction: "PAY" }, now))),
    workspaceMissionDetail: (_id) => record("workspaceMissionDetail", Promise.resolve(null)),
    workspaceReviseMissionDraft: (id, input, now) =>
      record("workspaceReviseMissionDraft", Promise.resolve(recordedMissionRecord(id, input, now))),
    workspaceArchiveMissionDraft: (id, now) =>
      record("workspaceArchiveMissionDraft", Promise.resolve(recordedMissionRecord(id, { goalStatement: "Pay the spring invoice", direction: "PAY" }, now))),
    workspaceStoreHealth: () =>
      record("workspaceStoreHealth", Promise.resolve({
        durability: "DESKTOP_PROFILE",
        durabilityNote: "",
        directory: "",
        snapshotFile: "",
        missionCount: 0,
        nextId: 1,
        quarantinedCount: 0,
        quarantine: [],
      })),
    calls,
  };
  return partial as unknown as IPaySwapDesktopClientService & { readonly calls: readonly string[] };
}

/**
 * A recorded-call stand-in record (the double's RESOLVED VALUES are never
 * consumed — only the recorded calls are asserted — but the members stay
 * honestly typed against the REAL app record shape).
 */
function recordedMissionRecord(
  id: string,
  intake: MissionIntakeInput,
  now: string,
): MissionRecord {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    status: "DRAFT",
    intake,
    structuralValidation: { ok: true, findings: [] },
    events: [],
  };
}

describe("the payswap-desktop channel client descriptor (drift laws, P10-B)", () => {
  it("the renderer channel identity IS the host channel identity (one channel, no forks)", () => {
    expect(PAYSWAP_DESKTOP_SERVICE_CHANNEL_NAME).toBe(PAYSWAP_DESKTOP_SERVICE_CHANNEL);
    expect(PAYSWAP_DESKTOP_SERVICE_CHANNEL).toBe("payswap-desktop");
  });

  it("the renderer member set equals the HOST service member set EXACTLY (no drift either way)", () => {
    const host = createPaySwapDesktopService({ scope: { kind: "local" }, log: () => {} });
    const hostMembers = Object.keys(host).sort();
    expect(hostMembers).toEqual([...PAYSWAP_DESKTOP_CLIENT_MEMBERS].sort());
    // The known host members, spelled out (a drift in EITHER list fails).
    expect(hostMembers).toEqual([
      "connectionConsumeProviderCallback",
      "connectionRecordVerificationOutcome",
      "connectionRegistry",
      "connectionRevoke",
      "connectionSeedSetup",
      "connectionStatuses",
      "connectionSubmitStripeRestrictedKey",
      "delegateMoneyMovement",
      "deploymentFacts",
      "journeyState",
      "missionBoard",
      // P17-A payment-mission members (read/input verbs only).
      "paymentMissionArmedEffect",
      "paymentMissionAskNextField",
      "paymentMissionBoard",
      "paymentMissionCapture",
      "paymentMissionDetail",
      "paymentMissionDispatch",
      // P20-A reconciliation members (ADR-0013 D1 — the pending read +
      // the evidence act; the runtime verb stays the only closer).
      "paymentMissionPendingReconciliation",
      "paymentMissionPresentPreview",
      "paymentMissionReconcile",
      "paymentMissionRecordPlanSelection",
      // P18-A approval members (ADR-0011 D2 — edge-pinned: the origin +
      // principal are pinned host-side; the artifact never crosses).
      "paymentMissionRequestApproval",
      "paymentMissionResolveApproval",
      "paymentMissionSeed",
      "progressTimeline",
      "quoteDisclosure",
      "securityDecision",
      "session",
      "workspaceArchiveMissionDraft",
      "workspaceListMissions",
      "workspaceMissionDetail",
      "workspaceRecordMissionDraft",
      "workspaceRecordMissionIntent",
      "workspaceReviseMissionDraft",
      "workspaceStoreHealth",
    ]);
  });

  it("no authority-verb member may appear on the channel (the no-parallel-engine law)", () => {
    for (const member of PAYSWAP_DESKTOP_CLIENT_MEMBERS) {
      expect(member).not.toMatch(/^(execute|retry|cancel|confirm|settle|payout|approve)/);
    }
    // The P17-A mission-plane names all pass the law (ADR-0010 D2).
    for (const member of [
      "paymentMissionBoard",
      "paymentMissionDetail",
      "paymentMissionSeed",
      "paymentMissionAskNextField",
      "paymentMissionCapture",
      "paymentMissionPresentPreview",
      "paymentMissionRecordPlanSelection",
    ]) {
      expect(PAYSWAP_DESKTOP_CLIENT_MEMBERS).toContain(member);
    }
    // The P18-A approval members pass the law too (ADR-0011 D2 — the
    // names carry the paymentMission prefix; the APPROVE decision is a
    // VALUE the renderer supplies to the pinned member, never a verb
    // the channel exposes).
    for (const member of ["paymentMissionRequestApproval", "paymentMissionResolveApproval"]) {
      expect(PAYSWAP_DESKTOP_CLIENT_MEMBERS).toContain(member);
      expect(member).not.toMatch(/^(execute|retry|cancel|confirm|settle|payout|approve)/);
    }
    // The P19-A dispatch members pass the law too (ADR-0012 D1 — the
    // names carry the paymentMission prefix; the dispatch act is a
    // LANE CHOICE over the host-recomputed eligible set, never a
    // grant-bearing verb).
    for (const member of ["paymentMissionArmedEffect", "paymentMissionDispatch"]) {
      expect(PAYSWAP_DESKTOP_CLIENT_MEMBERS).toContain(member);
      expect(member).not.toMatch(/^(execute|retry|cancel|confirm|settle|payout|approve)/);
    }
    // The P20-A reconciliation members pass the law too (ADR-0013 D1 —
    // the names carry the paymentMission prefix; the reconcile act is
    // an EVIDENCE SUBMISSION over the host-recomputed pending set, and
    // the runtime's reconcile verb — not this channel — closes the
    // UNKNOWN).
    for (const member of ["paymentMissionPendingReconciliation", "paymentMissionReconcile"]) {
      expect(PAYSWAP_DESKTOP_CLIENT_MEMBERS).toContain(member);
      expect(member).not.toMatch(/^(execute|retry|cancel|confirm|settle|payout|approve)/);
    }
    // The authorization/dispatch plane's raw verbs stay HOST-SIDE: none
    // of them is exposed on the channel (ADR-0012 D1 narrows the
    // ADR-0011 D3 boundary to the two lane-choice members above — the
    // raw runtime verbs, the artifact getters and the artifact-id
    // input surface never cross; ADR-0013 D1 repeats the law for the
    // runtime's reconcile verb — the channel exposes the evidence
    // submission, never the raw closer).
    for (const forbidden of [
      "requestAuthorization",
      "resolveAuthorization",
      "dispatch",
      "reconcile",
      "approveAuthorization",
      "executePayment",
      "artifact",
      "artifactsForMission",
    ]) {
      expect(PAYSWAP_DESKTOP_CLIENT_MEMBERS).not.toContain(forbidden);
    }
  });
});

describe("the DESKTOP_PROFILE store port adapter (§5 over the channel)", () => {
  it("the port carries durability DESKTOP_PROFILE and exactly the pinned §5 method set", () => {
    const services: DesktopConsoleChannelServices = {
      payswapDesktopService: fakeChannelService(),
    };
    const port = createDesktopWorkspaceStorePort(services);
    expect(port.durability).toBe("DESKTOP_PROFILE");
    expect(Object.keys(port).sort()).toEqual(["durability", ...PINNED_WORKSPACE_STORE_PORT_METHODS].sort());
  });

  it("every port method delegates to its channel member 1:1 (ids/persistence live in the host)", async () => {
    const channel = fakeChannelService();
    const port = createDesktopWorkspaceStorePort({ payswapDesktopService: channel });
    await port.listMissions();
    await port.recordMissionDraft(
      { goalStatement: "Pay the spring invoice", direction: "PAY" },
      "2026-10-21T12:00:00.000Z",
    );
    await port.recordMissionIntent("mission-1", "2026-10-21T13:00:00.000Z");
    await port.missionDetail("mission-1");
    await port.reviseMissionDraft(
      "mission-1",
      { goalStatement: "Pay the spring invoice, revised", direction: "PAY" },
      "2026-10-21T14:00:00.000Z",
    );
    await port.archiveMissionDraft("mission-1", "2026-10-21T15:00:00.000Z");
    expect(channel.calls).toEqual([
      "workspaceListMissions",
      "workspaceRecordMissionDraft",
      "workspaceRecordMissionIntent",
      "workspaceMissionDetail",
      "workspaceReviseMissionDraft",
      "workspaceArchiveMissionDraft",
    ]);
  });

  it("the channel wiring mirrors the substrate client pattern (RemoteServiceAccess + one channel proxy)", async () => {
    // connectDesktopConsoleServices builds the same stack as
    // @zcode/client's connectViaMessagePort (MessagePortProtocol →
    // ChannelClient → RemoteServiceAccess) plus the payswap-desktop
    // channel proxy. With a MessagePort pair it must produce a working
    // accessor whose console channel proxy is present.
    const { port1, port2 } = await openMessagePortPair();
    try {
      // node:worker_threads ports ARE the Electron seam's MessagePorts at
      // runtime; the DOM lib's MessagePort type differs only in listener
      // variance — cast once at this boundary, never inside the mount.
      const services = connectDesktopConsoleServices(port1 as unknown as MessagePort);
      // The base workspace-service proxies are present (the substrate
      // RemoteServiceAccess surface, untouched)...
      expect(typeof services.settingService).toBe("object");
      // ...and the console channel proxy is a function-bearing object.
      expect(typeof services.payswapDesktopService.workspaceListMissions).toBe("function");
      expect(typeof services.payswapDesktopService.deploymentFacts).toBe("function");
      void port2;
    } finally {
      port1.close();
      port2.close();
    }
  });
});

/**
 * A real MessagePort pair (node:worker_threads), like the Electron seam.
 * Typed as the NODE flavor (what MessageChannel actually mints); the one
 * DOM-flavor widening happens at the mount call site above, where the
 * substrate's MessagePortProtocol expects the DOM lib's shape — the two
 * differ only in listener variance, never at runtime.
 */
async function openMessagePortPair(): Promise<{
  readonly port1: NodeMessagePort;
  readonly port2: NodeMessagePort;
}> {
  const { MessageChannel } = await import("node:worker_threads");
  const { port1, port2 } = new MessageChannel();
  return { port1, port2 };
}
