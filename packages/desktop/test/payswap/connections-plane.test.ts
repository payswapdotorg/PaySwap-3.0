/**
 * PaySwap Desktop (P13-B) — the provider connection plane battery.
 *
 * Machine-checks the ADR-0007 laws against the REAL authority + broker:
 *
 * - NEVER-ACTIVE: seeding, key sealing, state minting and callback
 *   returns NEVER produce ACTIVE; only a recorded CONFIRMED probe
 *   outcome does (with evidence).
 * - LAWFUL TRANSITIONS: terminal states have no exits; unlawful
 *   transitions throw; history is append-only.
 * - D3 STATE BINDINGS: single-use, 10-minute lifetime, monotonic
 *   consumption; unknown/expired/consumed states are refused with the
 *   honest reason; user-denied returns record the reason and stay
 *   resumable.
 * - THE SEAL: material enters once, persists sealed, and only leaves
 *   inside withMaterial — a consumer result carrying the secret THROWS
 *   (fail-closed, never sanitized). Handles are opaque; deletion is
 *   real; storage keys follow the ADR law.
 * - U2/U3 HONESTY: unconfigured forms are refused with the EXACT
 *   missing operator configuration; the registry renders them typed.
 * - CONVERGENCE: re-seeding a live (providerId, useCaseRef) resumes the
 *   same connection id — never a duplicate.
 * - PERSISTENCE: records survive reload (restart-stable); malformed
 *   persisted records are quarantined per-record.
 */

import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ConnectionSessionAuthority,
  PROVIDER_STATE_BINDING_LIFETIME_MS,
  connectionCredentialStorageKey,
  DurableConnectionCredentialBroker,
  DurableCredentialBrokerError,
  desktopProviderRegistryViews,
} from "../../src/host/payswap/connections/index.js";
import type { WorkspaceStoreFileSystem } from "../../src/host/payswap/product/workspace-store-persistence.js";

/** A fake key (test material ONLY — non-contiguous construction). */
const FAKE_KEY = "rk" + "_test_FAKE51keyDoNotUse0001";
const FAKE_LIVE_KEY = "rk" + "_live_FAKE51keyDoNotUse0009";

/** The in-memory fs + credential service (deterministic, secret-free logs). */
function fakeWorld() {
  const files = new Map<string, string>();
  const fileSystem: WorkspaceStoreFileSystem = {
    readFile: async (path) => {
      const data = files.get(path);
      if (data === undefined) {
        throw new Error("ENOENT");
      }
      return data;
    },
    writeFile: async (path, data) => {
      files.set(path, data);
    },
    mkdir: async () => {},
  };
  const storedSecrets: { key: string; value: string }[] = [];
  // The substrate ICredentialService encrypts values at rest
  // (AES-256-GCM via its cipher provider). The fake models that cipher
  // boundary with a reversible stand-in so the layering assertion
  // (material never stored in the clear through the service boundary)
  // stays meaningful without pretending to be cryptography.
  const cipherBoundary = (value: string, direction: "seal" | "open") =>
    direction === "seal"
      ? Buffer.from(Buffer.from(value, "utf8").reverse()).toString("base64")
      : Buffer.from(Buffer.from(value, "base64").reverse(), "utf8").toString();
  const credentialService = {
    load: async (key: string) => {
      const raw = files.get(key);
      return raw === undefined ? null : cipherBoundary(raw, "open");
    },
    save: async (key: string, value: string) => {
      files.set(key, cipherBoundary(value, "seal"));
      storedSecrets.push({ key, value });
    },
    delete: async (key: string) => {
      files.delete(key);
    },
  };
  return { files, fileSystem, credentialService, storedSecrets };
}

function fakeAuthority(world = fakeWorld()) {
  let ms = 1_000_000;
  let iso = "2026-10-22T12:00:00Z";
  let idSeq = 0;
  let stateSeq = 0;
  const authority = new ConnectionSessionAuthority({
    fileSystem: world.fileSystem,
    directory: "/tmp/payswap-connections-test",
    broker: new DurableConnectionCredentialBroker(world.credentialService),
    nowMs: () => ms,
    nowIso: () => iso,
    createId: () => `fake-${(idSeq += 1)}`,
    createState: () => `state-${(stateSeq += 1)}`,
  });
  return {
    authority,
    world,
    advanceMs: (delta: number) => {
      ms += delta;
    },
    setIso: (value: string) => {
      iso = value;
    },
  };
}

const U1 = { providerId: "stripe", useCaseRef: "own-store-test-mode" } as const;
const U2 = { providerId: "stripe", useCaseRef: "existing-account-grant" } as const;

describe("the registry catalogue (typed data — never a connection)", () => {
  it("renders Stripe with three forms; U1 CONFIGURED, U2/U3 UNCONFIGURED with the exact missing operator configuration", () => {
    const views = desktopProviderRegistryViews();
    expect(views).toHaveLength(4);
    const stripe = views[0]!;
    expect(stripe.providerId).toBe("stripe");
    expect(stripe.forms).toHaveLength(3);
    const [u1, u2, u3] = stripe.forms;
    expect(u1?.status).toBe("CONFIGURED");
    expect(u1?.executionModes).toEqual(["SANDBOX"]);
    expect(u2?.status).toBe("UNCONFIGURED");
    expect(u2?.missingOperatorConfiguration.length).toBeGreaterThan(0);
    expect(u2?.missingOperatorConfiguration.join(" ")).toContain("client_id");
    expect(u3?.status).toBe("UNCONFIGURED");
    expect(u3?.missingOperatorConfiguration.join(" ")).toContain("webhook");
  });

  it("renders the P14-C providers: Flutterwave + Paystack CONFIGURED read-only, MTN MoMo the typed prerequisite", () => {
    const views = desktopProviderRegistryViews();
    const flutterwave = views.find((view) => view.providerId === "flutterwave");
    const paystack = views.find((view) => view.providerId === "paystack");
    const momo = views.find((view) => view.providerId === "mtn-momo");
    expect(flutterwave?.forms).toHaveLength(1);
    expect(flutterwave?.forms[0]?.status).toBe("CONFIGURED");
    expect(flutterwave?.forms[0]?.executionModes).toEqual(["SANDBOX"]);
    expect(paystack?.forms).toHaveLength(1);
    expect(paystack?.forms[0]?.status).toBe("CONFIGURED");
    expect(paystack?.forms[0]?.executionModes).toEqual(["SANDBOX"]);
    // MTN MoMo: the typed prerequisite — UNCONFIGURED with the EXACT
    // missing configuration naming the 401 fact, never a dead button.
    expect(momo?.forms).toHaveLength(1);
    expect(momo?.forms[0]?.status).toBe("UNCONFIGURED");
    const missing = momo?.forms[0]?.missingOperatorConfiguration.join(" ") ?? "";
    expect(missing).toContain("Ocp-Apim-Subscription-Key");
    expect(missing).toContain("401");
    expect(missing).toContain("API user");
  });
});

describe("the NEVER-ACTIVE law (ADR-0007 D1)", () => {
  it("seeding creates PROPOSED — nothing is connected", async () => {
    const { authority } = fakeAuthority();
    const outcome = await authority.seedConnectionSetup(U1);
    expect(outcome.kind).toBe("CREATED");
    if (outcome.kind !== "CREATED") return;
    expect(outcome.state).toBe("PROPOSED");
    const statuses = await authority.connectionStatuses();
    expect(statuses[0]!.transitionHistory[0]!.evidence).toContain("Nothing is connected yet");
  });

  it("sealing the key lands PENDING_VERIFICATION — verification is still required", async () => {
    const { authority } = fakeAuthority();
    const seeded = await authority.seedConnectionSetup(U1);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    const receipt = await authority.submitStripeRestrictedKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_KEY,
    });
    expect(receipt.sealedSecretCount).toBe(1);
    expect(receipt.nextState).toBe("PENDING_VERIFICATION");
    const statuses = await authority.connectionStatuses();
    expect(statuses[0]!.state).toBe("PENDING_VERIFICATION");
    expect(statuses[0]!.transitionHistory.at(-1)!.evidence).toContain(
      "Verification is still required",
    );
  });

  it("a LIVE key is refused (SANDBOX-only deployment, INV-25)", async () => {
    const { authority } = fakeAuthority();
    const seeded = await authority.seedConnectionSetup(U1);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await expect(
      authority.submitStripeRestrictedKey({
        connectionId: seeded.connectionId,
        secretKey: FAKE_LIVE_KEY,
      }),
    ).rejects.toThrow(/SANDBOX-only/);
  });

  it("only a CONFIRMED probe outcome reaches ACTIVE — UNKNOWN and FAILED stay PENDING_VERIFICATION", async () => {
    const { authority } = fakeAuthority();
    const seeded = await authority.seedConnectionSetup(U1);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await authority.submitStripeRestrictedKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_KEY,
    });

    const unknown = await authority.recordVerificationOutcome({
      connectionId: seeded.connectionId,
      outcome: "UNKNOWN",
      evidenceSummary: "probe timed out",
    });
    expect(unknown.state).toBe("PENDING_VERIFICATION");
    expect(unknown.transitionHistory.at(-1)!.evidence).toContain("reconciled");

    const failed = await authority.recordVerificationOutcome({
      connectionId: seeded.connectionId,
      outcome: "FAILED",
      evidenceSummary: "401 invalid_api_key",
    });
    expect(failed.state).toBe("PENDING_VERIFICATION");

    const confirmed = await authority.recordVerificationOutcome({
      connectionId: seeded.connectionId,
      outcome: "CONFIRMED",
      evidenceSummary: "acct_FAKE0001 read through the real transport",
    });
    expect(confirmed.state).toBe("ACTIVE");
    expect(confirmed.transitionHistory.at(-1)!.cause).toBe("PROBE_CONFIRMED");
  });

  it("a verification outcome without a sealed credential is refused", async () => {
    const { authority } = fakeAuthority();
    const seeded = await authority.seedConnectionSetup(U1);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await expect(
      authority.recordVerificationOutcome({
        connectionId: seeded.connectionId,
        outcome: "CONFIRMED",
        evidenceSummary: "no credential sealed",
      }),
    ).rejects.toThrow(/cannot be recorded before a credential is sealed/);
  });
});

describe("U2/U3 honesty (declared, never simulated)", () => {
  it("an UNCONFIGURED form is refused with the exact missing operator configuration", async () => {
    const { authority } = fakeAuthority();
    const outcome = await authority.seedConnectionSetup(U2);
    expect(outcome.kind).toBe("REFUSED");
    if (outcome.kind !== "REFUSED") return;
    expect(outcome.reason).toContain("Missing:");
    expect(outcome.reason).toContain("client_id");
    expect(outcome.reason).toContain("never simulated");
  });

  it("an unknown provider/use-case is refused — never guessed", async () => {
    const { authority } = fakeAuthority();
    const outcome = await authority.seedConnectionSetup({
      providerId: "paypal",
      useCaseRef: "own-store-test-mode",
    });
    expect(outcome.kind).toBe("REFUSED");
  });
});

describe("the convergence law at the connection plane", () => {
  it("re-seeding a live (providerId, useCaseRef) RESUMES the same connection id", async () => {
    const { authority } = fakeAuthority();
    const first = await authority.seedConnectionSetup(U1);
    const second = await authority.seedConnectionSetup(U1);
    expect(first.kind).toBe("CREATED");
    expect(second.kind).toBe("RESUMED");
    if (first.kind !== "CREATED" || second.kind !== "RESUMED") return;
    expect(second.connectionId).toBe(first.connectionId);
    const statuses = await authority.connectionStatuses();
    expect(statuses).toHaveLength(1);
  });
});

describe("the durable credential broker (ADR-0007 D4)", () => {
  it("material enters once, persists sealed under the ADR storage-key law", async () => {
    const world = fakeWorld();
    const { authority } = fakeAuthority(world);
    const seeded = await authority.seedConnectionSetup(U1);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    const receipt = await authority.submitStripeRestrictedKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_KEY,
    });
    // The stored value passed through the credential-service cipher
    // boundary — the raw key never lands in the clear, and the decoded
    // payload is the versioned sealed envelope.
    const stored = world.files.get(connectionCredentialStorageKey(seeded.connectionId));
    expect(stored).toBeDefined();
    expect(stored!).not.toContain(FAKE_KEY);
    const decoded = Buffer.from(Buffer.from(stored!, "base64").reverse(), "utf8").toString();
    const envelope = JSON.parse(decoded) as { version: number; materialJson: string };
    expect(envelope.version).toBe(1);
    expect(envelope.materialJson).toContain("apiKey");
    void receipt;
  });

  it("withMaterial runs inside the seal and returns the clean result", async () => {
    const { authority } = fakeAuthority();
    const seeded = await authority.seedConnectionSetup(U1);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await authority.submitStripeRestrictedKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_KEY,
    });
    const answer = await authority.withSealedCredential(
      seeded.connectionId,
      (material) => {
        const key = (material as { apiKey: string }).apiKey;
        return { probeEcho: `probed with a key of length ${key.length}` };
      },
      "test consumer",
    );
    expect(answer.probeEcho).toBe(`probed with a key of length ${FAKE_KEY.length}`);
  });

  it("a consumer result carrying the secret THROWS (fail-closed, never sanitized)", async () => {
    const { authority } = fakeAuthority();
    const seeded = await authority.seedConnectionSetup(U1);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await authority.submitStripeRestrictedKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_KEY,
    });
    await expect(
      authority.withSealedCredential(
        seeded.connectionId,
        (material) => ({ leak: (material as { apiKey: string }).apiKey }),
        "leaky consumer",
      ),
    ).rejects.toBeInstanceOf(DurableCredentialBrokerError);
  });

  it("revocation deletes the durable secret; the handle fails closed afterwards", async () => {
    const world = fakeWorld();
    const { authority } = fakeAuthority(world);
    const seeded = await authority.seedConnectionSetup(U1);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await authority.submitStripeRestrictedKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_KEY,
    });
    // From PENDING_VERIFICATION the pinned map reaches DISCONNECTED (the
    // lawful teardown); from ACTIVE it reaches REVOKED. The credential is
    // deleted on every path.
    const revoked = await authority.revokeConnection(seeded.connectionId);
    expect(revoked.state).toBe("DISCONNECTED");
    expect(revoked.transitionHistory.at(-1)!.evidence).toContain("sealed credential was deleted");
    expect(world.files.has(connectionCredentialStorageKey(seeded.connectionId))).toBe(false);
    await expect(
      authority.withSealedCredential(seeded.connectionId, () => "anything", "post-revoke"),
    ).rejects.toThrow();
    // Terminal: DISCONNECTED has no exits.
    await expect(authority.revokeConnection(seeded.connectionId)).rejects.toThrow(/not lawful/);

    // From ACTIVE, revocation reaches REVOKED (the pinned map admits it).
    const activeCtx = fakeAuthority();
    const activeSeeded = await activeCtx.authority.seedConnectionSetup(U1);
    if (activeSeeded.kind !== "CREATED") throw new Error("seed failed");
    await activeCtx.authority.submitStripeRestrictedKey({
      connectionId: activeSeeded.connectionId,
      secretKey: FAKE_KEY,
    });
    await activeCtx.authority.recordVerificationOutcome({
      connectionId: activeSeeded.connectionId,
      outcome: "CONFIRMED",
      evidenceSummary: "acct read",
    });
    const activeRevoked = await activeCtx.authority.revokeConnection(activeSeeded.connectionId);
    expect(activeRevoked.state).toBe("REVOKED");
  });
});

describe("the D3 state bindings (single-use, 10 minutes, monotonic)", () => {
  it("mints a binding with the pinned 10-minute lifetime and consumes it exactly once", async () => {
    const ctx = fakeAuthority();
    const seeded = await ctx.authority.seedConnectionSetup(U1);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    const binding = await ctx.authority.mintProviderStateBinding({
      connectionId: seeded.connectionId,
      form: "DELEGATED_OAUTH",
    });
    expect(PROVIDER_STATE_BINDING_LIFETIME_MS).toBe(600_000);
    expect(binding.expiresAtMs - 1_000_000).toBe(PROVIDER_STATE_BINDING_LIFETIME_MS);

    const first = await ctx.authority.consumeProviderCallback({ state: binding.state });
    expect(first.accepted).toBe(true);
    expect(first.connectionId).toBe(seeded.connectionId);

    const second = await ctx.authority.consumeProviderCallback({ state: binding.state });
    expect(second.accepted).toBe(false);
    expect(second.reason).toContain("already consumed");
  });

  it("an expired state is refused honestly (the task stays resumable)", async () => {
    const ctx = fakeAuthority();
    const seeded = await ctx.authority.seedConnectionSetup(U1);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    const binding = await ctx.authority.mintProviderStateBinding({
      connectionId: seeded.connectionId,
      form: "DELEGATED_OAUTH",
    });
    ctx.advanceMs(PROVIDER_STATE_BINDING_LIFETIME_MS + 1);
    const result = await ctx.authority.consumeProviderCallback({ state: binding.state });
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("expired");
    expect(result.reason).toContain("resumable");
  });

  it("an unknown state is refused; a user-denied return records the reason and stays resumable", async () => {
    const ctx = fakeAuthority();
    const seeded = await ctx.authority.seedConnectionSetup(U1);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    const unknown = await ctx.authority.consumeProviderCallback({ state: "state-never minted" });
    expect(unknown.accepted).toBe(false);
    expect(unknown.reason).toContain("unknown state");

    const binding = await ctx.authority.mintProviderStateBinding({
      connectionId: seeded.connectionId,
      form: "DELEGATED_OAUTH",
    });
    const denied = await ctx.authority.consumeProviderCallback({
      state: binding.state,
      error: "user_denied",
    });
    expect(denied.accepted).toBe(true);
    expect(denied.reason).toContain("user_denied");
    const statuses = await ctx.authority.connectionStatuses();
    expect(statuses[0]!.state).toBe("PROPOSED");
    expect(statuses[0]!.transitionHistory.at(-1)!.evidence).toContain("resumable");
  });
});

describe("persistence (restart-stable records)", () => {
  it("records survive an authority reload; malformed persisted records are quarantined per-record", async () => {
    const world = fakeWorld();
    const first = fakeAuthority(world);
    const seeded = await first.authority.seedConnectionSetup(U1);
    if (seeded.kind !== "CREATED") throw new Error("seed failed");
    await first.authority.submitStripeRestrictedKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_KEY,
    });

    // A second authority over the SAME world (a "restart").
    const second = fakeAuthority(world);
    const statuses = await second.authority.connectionStatuses();
    expect(statuses).toHaveLength(1);
    expect(statuses[0]!.connectionId).toBe(seeded.connectionId);
    expect(statuses[0]!.state).toBe("PENDING_VERIFICATION");
    expect(statuses[0]!.transitionHistory.length).toBe(2);

    // Re-seeding after the restart resumes the SAME record.
    const resumed = await second.authority.seedConnectionSetup(U1);
    expect(resumed.kind).toBe("RESUMED");

    // Corrupt the store: the authority starts empty honestly (quarantine).
    const storePath = "/tmp/payswap-connections-test/connections.json";
    world.files.set(storePath, "{ not json");
    const third = fakeAuthority(world);
    const afterCorruption = await third.authority.connectionStatuses();
    expect(afterCorruption).toHaveLength(0);
  });
});

describe("the shell seam surface (fail-closed without the authority)", () => {
  it("the service methods reject with the typed error when the authority is absent", async () => {
    const { createPaySwapDesktopService } = await import(
      "../../src/host/payswap/shell/index.js"
    );
    const service = createPaySwapDesktopService({
      scope: { kind: "local" },
      log: () => {},
    });
    await expect(service.connectionStatuses()).rejects.toThrow(
      /connection plane is not configured/,
    );
    await expect(service.connectionRegistry()).rejects.toThrow(
      /connection plane is not configured/,
    );
  });

  it("with the authority wired, the full seed → seal → verify → ACTIVE path rides the seam", async () => {
    const { createPaySwapDesktopService } = await import(
      "../../src/host/payswap/shell/index.js"
    );
    const ctx = fakeAuthority();
    const service = createPaySwapDesktopService(
      { scope: { kind: "local" }, log: () => {} },
      { connectionAuthority: ctx.authority },
    );
    const registry = await service.connectionRegistry();
    expect(registry[0]!.providerId).toBe("stripe");
    const seeded = await service.connectionSeedSetup(U1);
    expect(seeded.kind).toBe("CREATED");
    if (seeded.kind !== "CREATED") return;
    const receipt = await service.connectionSubmitStripeRestrictedKey({
      connectionId: seeded.connectionId,
      secretKey: FAKE_KEY,
    });
    expect(receipt.credentialHandleRef).toContain(seeded.connectionId);
    const active = await service.connectionRecordVerificationOutcome({
      connectionId: seeded.connectionId,
      outcome: "CONFIRMED",
      evidenceSummary: "acct read",
    });
    expect(active.state).toBe("ACTIVE");
  });
});

describe("real-directory smoke (the node composition edge, tmp only)", () => {
  it("the node composition persists under <userData>/connections", async () => {
    const { createNodeConnectionSessionAuthority } = await import(
      "../../src/host/payswap/connections/index.js"
    );
    const dir = await mkdtemp(join(tmpdir(), "payswap-conn-"));
    try {
      const secrets = new Map<string, string>();
      const authority = createNodeConnectionSessionAuthority({
        userDataDirectory: dir,
        credentialService: {
          load: async (key) => secrets.get(key) ?? null,
          save: async (key, value) => {
            secrets.set(key, value);
          },
          delete: async (key) => {
            secrets.delete(key);
          },
        },
      });
      const seeded = await authority.seedConnectionSetup(U1);
      expect(seeded.kind).toBe("CREATED");
      const statuses = await authority.connectionStatuses();
      expect(statuses).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
