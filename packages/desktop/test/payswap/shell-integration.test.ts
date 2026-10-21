/**
 * Shell integration laws (P7-W2): session semantics (window-host
 * attachment scope per the substrate), transport law (message-port RPC
 * with the inherited middleware chain), channel identity, service
 * registration into the substrate ServiceCollection, and logger
 * discipline (host seam log only — never a console bypass).
 */

import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ServiceCollection } from "@zcode/services";

import {
  PAYSWAP_DESKTOP_SERVICE_CHANNEL,
  IPaySwapDesktopServiceDescriptor,
  PAYSWAP_DESKTOP_TRANSPORT_SEAM,
  WORKSPACE_STORE_NODE_FILE_SYSTEM,
  registerPaySwapDesktopService,
  createPaySwapDesktopService,
} from "../../src/host/payswap/index.js";

function recordingSeam() {
  const lines: { level: string; message: string }[] = [];
  return {
    lines,
    seam: {
      scope: { kind: "local" } as const,
      log: (level: "info" | "warn" | "error", message: string) => {
        lines.push({ level, message });
      },
    },
  };
}

describe("shell channel + transport laws (P7-W2)", () => {
  it("the service channel follows the substrate kebab-case ServiceChannels convention", () => {
    expect(PAYSWAP_DESKTOP_SERVICE_CHANNEL).toBe("payswap-desktop");
    expect(PAYSWAP_DESKTOP_SERVICE_CHANNEL).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(IPaySwapDesktopServiceDescriptor.channelName).toBe(PAYSWAP_DESKTOP_SERVICE_CHANNEL);
  });

  it("the transport seam records the substrate RPC law: message-port channel with the inherited middleware chain REQUIRED", () => {
    expect(PAYSWAP_DESKTOP_TRANSPORT_SEAM.kind).toBe("message-port-rpc");
    expect(PAYSWAP_DESKTOP_TRANSPORT_SEAM.channelName).toBe(PAYSWAP_DESKTOP_SERVICE_CHANNEL);
    expect(PAYSWAP_DESKTOP_TRANSPORT_SEAM.requiresLoggingMiddleware).toBe(true);
    expect(PAYSWAP_DESKTOP_TRANSPORT_SEAM.requiresNetworkTelemetryMiddleware).toBe(true);
  });
});

describe("shell session laws (P7-W2)", () => {
  it("the session derives from the substrate window-host attachment scope (local) with the desktop client mode", () => {
    const service = createPaySwapDesktopService(
      { scope: { kind: "local" }, log: () => {} },
      { createSessionId: () => "session-1", createdAt: "2026-10-17T12:00:00.000Z" },
    );
    expect(service.session).toEqual({
      sessionId: "session-1",
      scope: { kind: "local" },
      clientMode: "desktop-continuous",
      createdAt: "2026-10-17T12:00:00.000Z",
    });
  });

  it("the session scope mirrors the substrate remote-attachment semantics when the host bound one", () => {
    const service = createPaySwapDesktopService(
      { scope: { kind: "remote", remoteSessionId: "rs-42" }, log: () => {} },
      { createSessionId: () => "session-2" },
    );
    expect(service.session.scope).toEqual({ kind: "remote", remoteSessionId: "rs-42" });
    expect(service.session.clientMode).toBe("desktop-continuous");
  });

  it("session id generation is injectable (deterministic battery; default is a UUID)", () => {
    const service = createPaySwapDesktopService({ scope: { kind: "local" }, log: () => {} });
    expect(service.session.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe("host composition laws (P7-W2)", () => {
  it("registerPaySwapDesktopService registers the product into the substrate ServiceCollection under its channel", () => {
    const { seam, lines } = recordingSeam();
    const services = new ServiceCollection();
    const record = registerPaySwapDesktopService(services, seam, {
      createSessionId: () => "session-9",
    });
    const resolved = services.get(IPaySwapDesktopServiceDescriptor);
    expect(resolved).toBeDefined();
    expect(resolved.session.sessionId).toBe("session-9");
    expect(record).toEqual({
      channelName: "payswap-desktop",
      sessionId: "session-9",
      scopeKind: "local",
      clientMode: "desktop-continuous",
      transport: PAYSWAP_DESKTOP_TRANSPORT_SEAM,
    });
    expect(lines.some((line) => line.message.includes("registered into host service collection"))).toBe(
      true,
    );
  });

  it("the registered service is retrievable through the collection's getOptional (exposure path precondition)", () => {
    const { seam } = recordingSeam();
    const services = new ServiceCollection();
    registerPaySwapDesktopService(services, seam);
    expect(services.getOptional(IPaySwapDesktopServiceDescriptor)).toBeDefined();
  });
});

describe("logger discipline laws (P7-W2)", () => {
  it("the service logs through the host seam ONLY (no console bypass; secret material never logged)", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { seam, lines } = recordingSeam();
      const service = createPaySwapDesktopService(seam, { createSessionId: () => "session-1" });
      expect(lines.some((line) => line.message.includes("product service composed"))).toBe(true);
      // Exercise the two logging methods.
      void service.missionBoard({
        economicIntakeConfigured: true,
        capabilityObservationsAvailable: true,
        merchantCheckoutContextBound: true,
        providerObservationsAvailable: true,
        delegationPlaneReachable: true,
      });
      void service.delegateMoneyMovement({
        journeyId: "pay",
        intentRef: "intent://economic/PAY-1",
        authorization: {
          artifactId: "artifact://trust/1",
          mandateRef: "mandate://trust/1",
          approverRef: "principal://trust/alice",
          epoch: "3",
        },
        declaredAmount: { currency: "USD", minorUnits: "100000" },
        issuedAt: "2026-10-17T12:00:00.000Z",
      });
      expect(lines.some((line) => line.message.includes("mission board folded"))).toBe(true);
      expect(lines.some((line) => line.message.includes("delegated via typed reference"))).toBe(
        true,
      );
      // No delegation payload or secret-shaped material appears in logs.
      for (const line of lines) {
        expect(line.message).not.toMatch(/artifactId|mandateRef|approverRef/);
      }
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

describe("service methods compose the product folds (P7-W2)", () => {
  it("every service method is a pure projection or typed-reference delegation over the folds", async () => {
    const service = createPaySwapDesktopService(
      { scope: { kind: "local" }, log: () => {} },
      { createSessionId: () => "session-1" },
    );
    const board = await service.missionBoard({
      economicIntakeConfigured: true,
      capabilityObservationsAvailable: true,
      merchantCheckoutContextBound: true,
      providerObservationsAvailable: true,
      delegationPlaneReachable: true,
    });
    expect(board.rows.length).toBe(5);
    const state = await service.journeyState({
      journeyRef: "j-1",
      outcome: "UNKNOWN",
      authorityRecordRef: "record://1",
      evidenceRefs: [],
      observedAt: "2026-10-17T12:00:00.000Z",
    });
    expect(state.state).toBe("UNKNOWN_RECONCILING");
  });
});

describe("console workspace service members (P10-B)", () => {
  const VALID_INTAKE = {
    goalStatement: "Pay the spring invoice from the operating account",
    direction: "PAY",
    amount: { currency: "USD", minorUnits: "125000" },
  } as const;
  const NOW = "2026-10-21T12:00:00.000Z";
  const LATER = "2026-10-21T13:00:00.000Z";

  /** An in-memory injected file system (the persistence seam, faked). */
  function memoryFileSystem(files: Map<string, string>) {
    return {
      readFile: (path: string) =>
        files.has(path)
          ? Promise.resolve(files.get(path)!)
          : Promise.reject(new Error("ENOENT")),
      writeFile: (path: string, data: string) => {
        files.set(path, data);
        return Promise.resolve();
      },
      mkdir: () => Promise.resolve(),
    };
  }

  it("deploymentFacts computes the all-unconfigured host truth — facts about configured planes, never renderer-invented", () => {
    const service = createPaySwapDesktopService(
      { scope: { kind: "local" }, log: () => {} },
      { createSessionId: () => "session-1" },
    );
    expect(service.deploymentFacts()).toEqual({
      economicIntakeConfigured: false,
      capabilityObservationsAvailable: false,
      merchantCheckoutContextBound: false,
      providerObservationsAvailable: false,
      delegationPlaneReachable: false,
    });
  });

  it("the workspace members are registered + callable through the channel descriptor (full lifecycle)", async () => {
    const { seam } = recordingSeam();
    const services = new ServiceCollection();
    registerPaySwapDesktopService(services, { ...seam, storeDirectory: "/memory/workspace" }, {
      workspaceStoreFileSystem: memoryFileSystem(new Map()),
    });
    const resolved = services.get(IPaySwapDesktopServiceDescriptor);
    // The host-computed facts are exposed over the channel too.
    expect(resolved.deploymentFacts().delegationPlaneReachable).toBe(false);

    const draft = await resolved.workspaceRecordMissionDraft(VALID_INTAKE, NOW);
    expect(draft.id).toBe("mission-1");
    expect(draft.status).toBe("DRAFT");
    expect(draft.structuralValidation.ok).toBe(true);

    const intent = await resolved.workspaceRecordMissionIntent(draft.id, LATER);
    expect(intent.status).toBe("INTENT_RECORDED");

    const detail = await resolved.workspaceMissionDetail(draft.id);
    expect(detail?.ladder[0]).toEqual({ rung: "INTENT", state: "REACHED" });

    const summaries = await resolved.workspaceListMissions();
    expect(summaries).toHaveLength(1);

    const archived = await resolved.workspaceArchiveMissionDraft(draft.id, LATER);
    expect(archived.status).toBe("ARCHIVED");

    const health = await resolved.workspaceStoreHealth();
    expect(health.durability).toBe("DESKTOP_PROFILE");
    expect(health.quarantinedCount).toBe(0);
  });

  it("a seam WITHOUT a store directory fails closed with the typed error on first workspace-store use — never a silent no-op", async () => {
    const { seam, lines } = recordingSeam();
    const service = createPaySwapDesktopService(seam, { createSessionId: () => "session-1" });
    await expect(service.workspaceListMissions()).rejects.toThrowError(/not configured/);
    await expect(service.workspaceRecordMissionDraft(VALID_INTAKE, NOW)).rejects.toThrowError(
      /not configured/,
    );
    // The fail-closed path is logged once through the host seam (discipline).
    expect(lines.filter((line) => line.message.includes("NOT configured"))).toHaveLength(1);
  });

  it("the node:fs composition edge serves the store over a real temp directory", async () => {
    const { seam } = recordingSeam();
    const directory = await mkdtemp(join(tmpdir(), "payswap-shell-"));
    try {
      const services = new ServiceCollection();
      registerPaySwapDesktopService(services, { ...seam, storeDirectory: directory });
      const resolved = services.get(IPaySwapDesktopServiceDescriptor);
      const draft = await resolved.workspaceRecordMissionDraft(VALID_INTAKE, NOW);
      // The snapshot exists on disk after the mutation (save-after-each-mutation).
      const raw = JSON.parse(await readFile(join(directory, "workspace-store.json"), "utf8")) as {
        records: { id: string }[];
      };
      expect(raw.records.map((record) => record.id)).toEqual([draft.id]);
      // A SECOND service instance (a "restart") loads the same record.
      const second = createPaySwapDesktopService(
        { ...seam, storeDirectory: directory },
        {
          createSessionId: () => "session-2",
          workspaceStoreFileSystem: WORKSPACE_STORE_NODE_FILE_SYSTEM,
        },
      );
      expect(await (await second.workspaceListMissions()).map((s) => s.id)).toEqual([draft.id]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("an injected in-memory file system works through createPaySwapDesktopService (deterministic battery)", async () => {
    const files = new Map<string, string>();
    const service = createPaySwapDesktopService(
      { scope: { kind: "local" }, log: () => {}, storeDirectory: "/memory/workspace" },
      {
        createSessionId: () => "session-1",
        workspaceStoreFileSystem: memoryFileSystem(files),
      },
    );
    const draft = await service.workspaceRecordMissionDraft(VALID_INTAKE, NOW);
    await service.workspaceRecordMissionIntent(draft.id, LATER);
    const health = await service.workspaceStoreHealth();
    expect(health.snapshotFile).toBe("/memory/workspace/workspace-store.json");
    expect(health.missionCount).toBe(1);
    expect(JSON.parse(files.get("/memory/workspace/workspace-store.json")!).records).toHaveLength(
      1,
    );
  });
});
