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

/** A channel service double for the port-adapter laws (recorded calls). */
function fakeChannelService(): IPaySwapDesktopClientService & {
  readonly calls: readonly string[];
} {
  const calls: string[] = [];
  const record = <T>(name: string, value: T): T => {
    calls.push(name);
    return value;
  };
  return {
    deploymentFacts: () => record("deploymentFacts", Promise.resolve({
      economicIntakeConfigured: false,
      capabilityObservationsAvailable: false,
      merchantCheckoutContextBound: false,
      providerObservationsAvailable: false,
      delegationPlaneReachable: false,
    })),
    workspaceListMissions: () => record("workspaceListMissions", Promise.resolve([])),
    workspaceRecordMissionDraft: (input, now) =>
      record("workspaceRecordMissionDraft", Promise.resolve({ id: "mission-1", intake: input, now })),
    workspaceRecordMissionIntent: (id, now) =>
      record("workspaceRecordMissionIntent", Promise.resolve({ id, now })),
    workspaceMissionDetail: (_id) => record("workspaceMissionDetail", Promise.resolve(null)),
    workspaceReviseMissionDraft: (id, input, now) =>
      record("workspaceReviseMissionDraft", Promise.resolve({ id, intake: input, now })),
    workspaceArchiveMissionDraft: (id, now) =>
      record("workspaceArchiveMissionDraft", Promise.resolve({ id, now })),
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
  } as IPaySwapDesktopClientService & { readonly calls: readonly string[] };
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
      "paymentMissionAskNextField",
      "paymentMissionBoard",
      "paymentMissionCapture",
      "paymentMissionDetail",
      "paymentMissionPresentPreview",
      "paymentMissionRecordPlanSelection",
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
    // The authorization/dispatch plane stays HOST-SIDE: none of its
    // verbs is exposed on the channel (ADR-0010 D2 — the D7 chain).
    for (const forbidden of [
      "requestAuthorization",
      "resolveAuthorization",
      "dispatch",
      "approveAuthorization",
      "executePayment",
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
      const services = connectDesktopConsoleServices(port1);
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

/** A real MessagePort pair (node:worker_threads), like the Electron seam. */
async function openMessagePortPair(): Promise<{ port1: MessagePort; port2: MessagePort }> {
  const { MessageChannel } = await import("node:worker_threads");
  const { port1, port2 } = new MessageChannel();
  return { port1, port2 };
}
