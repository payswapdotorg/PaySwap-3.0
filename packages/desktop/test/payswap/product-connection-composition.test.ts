/**
 * PaySwap Desktop (P21-D the reviewer gate, lane 151-a) — the PRODUCT
 * CONNECTION-PLANE COMPOSITION battery.
 *
 * The reviewer's ask #1, second half: the provider-derived rail
 * snapshots must be wired INTO THE PRODUCT COMPOSITION ROOTS — not
 * only behind engine seams the tests can inject. This battery proves
 * the composition edge that does it for the shipped app:
 *
 * - composeNodeConnectionPlane (NEW, the node bindings): the REAL
 *   ConnectionSessionAuthority over the substrate credential service
 *   (the D4 durable broker) + the probe-evidence ledger opened beside
 *   connections.json under <userData>/connections + the REAL fetch
 *   binding the verification probes and the lane-aware Stripe kernel
 *   ride — returned as the exact options fragment the registration
 *   root forwards to registerPaySwapDesktopService.
 * - THE REGISTRATION LAW: a service composed WITH the plane answers
 *   the connection channel members over the REAL plane (the honest
 *   empty registry for a fresh store — never the absent-member
 *   posture, never a fabricated record); connectionCapabilityChains
 *   derives the honest EMPTY set over the composed plane (the bridge
 *   over zero connections).
 * - THE PRESERVED DEFAULT: without the plane the members fail closed
 *   with the typed ConnectionPlaneNotConfiguredError (the workspace-
 *   store posture — unchanged).
 * - THE PLACEMENT LAW: connections.json and probe-evidence.json land
 *   beside each other under <userData>/connections (the P13-B law).
 *
 * Deterministic: a real mkdtemp directory + an in-memory credential
 * service (never a real seal target) + a stub fetch (no network in
 * this battery — the probe paths are covered by the probe-plane
 * batteries over their scripted transports).
 */

import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  composeNodeConnectionPlane,
} from "../../src/host/payswap/connections/index.js";
import { createPaySwapDesktopService } from "../../src/host/payswap/index.js";
import type { ICredentialService } from "@zcode/services";

/** The in-memory credential service (deterministic; never a real store). */
function fakeCredentialService(): ICredentialService & { readonly saved: ReadonlyMap<string, string> } {
  const saved = new Map<string, string>();
  return {
    saved,
    async load(key) {
      return saved.get(key) ?? null;
    },
    async save(key, value) {
      saved.set(key, value);
    },
    async delete(key) {
      saved.delete(key);
    },
  };
}

/** A stub fetch (the composition only BINDS it; this battery never calls it). */
const STUB_FETCH = (async () => {
  throw new Error("this battery never performs network I/O");
}) as typeof fetch;

describe("the product connection-plane composition (P21-D lane 151-a — the reviewer's composition-root ask)", () => {
  it("composeNodeConnectionPlane composes the authority + the evidence ledger over the node bindings, colocated under <userData>/connections", async () => {
    const userData = await mkdtemp(join(tmpdir(), "p21d-plane-"));
    try {
      const credentials = fakeCredentialService();
      const plane = await composeNodeConnectionPlane({
        userDataDirectory: userData,
        credentialService: credentials,
        fetchImpl: STUB_FETCH,
      });

      // The fresh plane answers the honest EMPTY status set (never a
      // fabricated record; never the absent-member posture).
      const statuses = await plane.connectionAuthority.connectionStatuses();
      expect(statuses).toEqual([]);

      // The evidence store records and persists beside connections.json
      // (the placement law) — a probe evidence append lands on disk.
      const recorded = await plane.connectionProbe.evidenceStore.recordProbeEvidence({
        connectionId: "conn:stripe:test-1",
        providerId: "stripe",
        probedOperation: "stripe.account.retrieve",
        outcome: "CONFIRMED",
        providerReferences: ["acct_test_battery"],
        accountRef: "acct_test_battery",
        providerLiveMode: false,
        keyClass: "READ_ONLY_TEST",
        balanceCurrencies: ["usd"],
        transportId: "transport:battery-1",
        executionMode: "SANDBOX",
        observedAt: "2026-10-28T00:00:00.000Z",
        evidenceTier: "PROVIDER_OBSERVATION",
      });
      expect(recorded.observationVersion).toBe(1);
      const evidenceRaw = await readFile(
        join(userData, "connections", "probe-evidence.json"),
        "utf8",
      );
      expect(JSON.parse(evidenceRaw).records).toHaveLength(1);
    } finally {
      await rm(userData, { recursive: true, force: true });
    }
  });

  it("THE REGISTRATION LAW: a service composed with the plane answers the connection members over the REAL plane (the honest empty registry + the empty chain set)", async () => {
    const userData = await mkdtemp(join(tmpdir(), "p21d-plane-"));
    try {
      const plane = await composeNodeConnectionPlane({
        userDataDirectory: userData,
        credentialService: fakeCredentialService(),
        fetchImpl: STUB_FETCH,
      });
      const service = createPaySwapDesktopService(
        { scope: { kind: "local" }, log: () => {} },
        {
          connectionAuthority: plane.connectionAuthority,
          connectionProbe: {
            evidenceStore: plane.connectionProbe.evidenceStore,
            fetchImpl: plane.connectionProbe.fetchImpl,
          },
        },
      );

      // The composed plane answers — NOT the typed not-configured error.
      const statuses = await service.connectionStatuses();
      expect(statuses).toEqual([]);

      // The registry renders the provider catalogue views (the honest
      // unconfigured-form reasons included — the U2/U3 law).
      const registry = await service.connectionRegistry();
      expect(registry.length).toBeGreaterThan(0);
      const providerIds = registry.map((view) => view.providerId).sort();
      expect(providerIds).toContain("stripe");
      expect(providerIds).toContain("flutterwave");
      expect(providerIds).toContain("paystack");

      // The chains derivation over the REAL bridge with zero
      // connections: the honest EMPTY set (evidence-derived, not the
      // absent-member posture).
      const chains = await service.connectionCapabilityChains();
      expect(chains).toEqual([]);
    } finally {
      await rm(userData, { recursive: true, force: true });
    }
  });

  it("THE PRESERVED DEFAULT: without the plane the members fail closed with the typed error (the workspace-store posture, unchanged)", async () => {
    const service = createPaySwapDesktopService({ scope: { kind: "local" }, log: () => {} });
    await expect(service.connectionStatuses()).rejects.toThrow(/connection plane is not configured/i);
    await expect(service.connectionRegistry()).rejects.toThrow(/connection plane is not configured/i);
    await expect(service.connectionRunVerificationProbe("stripe")).rejects.toThrow(
      /connection plane is not configured/i,
    );
  });

  it("THE PLANE IS RESTART-STABLE: a second composition over the same directory reloads the persisted records (the durable-record law)", async () => {
    const userData = await mkdtemp(join(tmpdir(), "p21d-plane-"));
    try {
      const first = await composeNodeConnectionPlane({
        userDataDirectory: userData,
        credentialService: fakeCredentialService(),
        fetchImpl: STUB_FETCH,
      });
      // Seed one connection record through the authority's own verb
      // (the declared registry form — record-store persistence).
      const seeded = await first.connectionAuthority.seedConnectionSetup({
        providerId: "stripe",
        useCaseRef: "own-store-test-mode",
      });
      if (seeded.kind !== "CREATED") {
        throw new Error(`seed refused: ${JSON.stringify(seeded)}`);
      }
      const statuses = await first.connectionAuthority.connectionStatuses();
      expect(statuses).toHaveLength(1);

      const second = await composeNodeConnectionPlane({
        userDataDirectory: userData,
        credentialService: fakeCredentialService(),
        fetchImpl: STUB_FETCH,
      });
      const reloaded = await second.connectionAuthority.connectionStatuses();
      expect(reloaded).toHaveLength(1);
      expect(reloaded[0]?.connectionId).toBe(statuses[0]?.connectionId);
    } finally {
      await rm(userData, { recursive: true, force: true });
    }
  });
});
