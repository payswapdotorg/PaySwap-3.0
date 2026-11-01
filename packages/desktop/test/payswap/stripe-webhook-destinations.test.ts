/**
 * PaySwap Desktop (P24-2, ADR-0017 D12) — the WEBHOOK DESTINATION
 * AUTHORITY + SECRET BROKER battery:
 *
 * - REGISTRATION IS HOST-CONTROLLED WITH APPROVAL: propose → approve
 *   (single-use, digest-bound) → complete (consume + seal the whsec_).
 *   A digest mismatch, an expired approval, a replayed approval and a
 *   second registration all refuse.
 * - DELETION: the confirmed digest must equal the CURRENT binding's —
 *   any change between preview and deletion refuses; the sealed secret
 *   is REALLY deleted (a later use fails closed).
 * - THE SECRET BROKER: per-endpoint sealing under its own storage-key
 *   namespace; malformed whsec_ refused; ROTATION keeps the previous
 *   secret inside the overlap window (and only inside it); a leak
 *   through the consumer result THROWS (the escape scan); delete is
 *   real; metadata never carries the secret.
 * - providerEndpointId is null until a provider-confirmed we_ id is
 *   recorded (never claimed).
 * - The event-destination version lands in the version store (the
 *   independent fact).
 */

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { StripeWebhookSecretBroker, WebhookSecretBrokerError } from "../../src/host/payswap/stripe/webhook-secret-broker.js";
import {
  StripeWebhookDestinationAuthority,
  type EventDestinationVersionRecorder,
} from "../../src/host/payswap/stripe/webhook-destinations.js";
import { StripeApiVersionStateStore } from "../../src/host/payswap/connections/stripe-api-version-state.js";
import { fakeFs } from "./stripe-action-fixtures.js";
import { carriesStripeSecretShape } from "../../src/host/payswap/stripe/stripe-pins.js";

const CONN = "conn:fake-stripe-1";
const WHSEC_A = "whsec" + "_FAKE51whsecADoNotUse001";
const WHSEC_B = "whsec" + "_FAKE51whsecBDoNotUse002";
const NOT_A_WHSEC = "definitely-not-a-signing-secret";

/** A fake durable secret store (records writes; serves loads). */
function fakeSecretStore() {
  const stored = new Map<string, string>();
  return {
    stored,
    save: async (key: string, value: string) => {
      stored.set(key, value);
    },
    load: async (key: string) => stored.get(key) ?? null,
    delete: async (key: string) => {
      stored.delete(key);
    },
  };
}

async function world(recorder?: EventDestinationVersionRecorder) {
  const broker = new StripeWebhookSecretBroker({
    store: fakeSecretStore(),
    nowIso: () => "2026-11-01T12:00:00Z",
  });
  const authority = new StripeWebhookDestinationAuthority({
    secretBroker: broker,
    fileSystem: fakeFs(),
    directory: "/tmp/p242-destinations",
    nowIso: () => "2026-11-01T12:00:00Z",
    createId: (() => {
      let seq = 0;
      return () => `fake-${(seq += 1)}`;
    })(),
    versionRecorder: recorder,
  });
  await authority.load();
  return { broker, authority };
}

/** The full happy registration flow; returns the endpointId + digest. */
async function registeredDestination(authority: StripeWebhookDestinationAuthority, eventApiVersion = "2026-09-30.endive") {
  const proposal = await authority.proposeRegistration({
    connectionId: CONN,
    url: "https://events.payswap.test/stripe/webhook",
    description: "the P24 test destination",
    enabledEventTypes: ["customer.created", "payment_intent.succeeded"],
    eventApiVersion,
  });
  if (!proposal.ok) {
    throw new Error("fixture proposal failed");
  }
  const approval = await authority.approveRegistration({
    endpointId: proposal.proposal.endpointId,
    principalId: "principal:user-1",
    confirmedDigest: proposal.proposal.digest,
  });
  if (!approval.ok) {
    throw new Error("fixture approval failed");
  }
  const completion = await authority.completeRegistration({
    approvalId: approval.approval.approvalId,
    whsec: WHSEC_A,
    confirmedDigest: proposal.proposal.digest,
  });
  if (!completion.ok) {
    throw new Error("fixture completion failed");
  }
  return { endpointId: proposal.proposal.endpointId, digest: proposal.proposal.digest, destination: completion.destination };
}

describe("the destination registration flow (host-controlled, approval-gated)", () => {
  it("refuses malformed URLs, empty event types and malformed event types", async () => {
    const { authority } = await world();
    const badUrl = await authority.proposeRegistration({
      connectionId: CONN,
      url: "http://not-https.example",
      description: "",
      enabledEventTypes: ["customer.created"],
      eventApiVersion: "2026-09-30.endive",
    });
    expect(badUrl.ok === false && badUrl.refusal.kind).toBe("MALFORMED_URL");
    const noEvents = await authority.proposeRegistration({
      connectionId: CONN,
      url: "https://events.payswap.test/hook",
      description: "",
      enabledEventTypes: [],
      eventApiVersion: "2026-09-30.endive",
    });
    expect(noEvents.ok === false && noEvents.refusal.kind).toBe("EMPTY_EVENT_TYPES");
    const badType = await authority.proposeRegistration({
      connectionId: CONN,
      url: "https://events.payswap.test/hook",
      description: "",
      enabledEventTypes: ["Customer Created!"],
      eventApiVersion: "2026-09-30.endive",
    });
    expect(badType.ok === false && badType.refusal.kind).toBe("MALFORMED_EVENT_TYPE");
  });

  it("completes propose → approve → complete with the secret sealed and the providerEndpointId honestly null", async () => {
    const { authority } = await world();
    const { endpointId, destination } = await registeredDestination(authority);
    expect(destination.status).toBe("SEALED");
    expect(destination.providerEndpointId).toBeNull();
    expect(destination.enabledEventTypes).toEqual(["customer.created", "payment_intent.succeeded"]);
    expect(authority.destinationOf(endpointId)?.connectionId).toBe(CONN);
    expect(authority.destinationsOf(CONN).length).toBe(1);
  });

  it("a digest mismatch at approve or complete refuses (the approval binds the exact proposal)", async () => {
    const { authority } = await world();
    const proposal = await authority.proposeRegistration({
      connectionId: CONN,
      url: "https://events.payswap.test/hook",
      description: "",
      enabledEventTypes: ["customer.created"],
      eventApiVersion: "2026-09-30.endive",
    });
    if (!proposal.ok) {
      throw new Error("proposal failed");
    }
    const mismatched = await authority.approveRegistration({
      endpointId: proposal.proposal.endpointId,
      principalId: "principal:user-1",
      confirmedDigest: "0".repeat(64),
    });
    expect(mismatched.ok === false && mismatched.refusal.kind).toBe("DIGEST_MISMATCH");
    const approval = await authority.approveRegistration({
      endpointId: proposal.proposal.endpointId,
      principalId: "principal:user-1",
      confirmedDigest: proposal.proposal.digest,
    });
    if (!approval.ok) {
      throw new Error("approval failed");
    }
    const mismatchedCompletion = await authority.completeRegistration({
      approvalId: approval.approval.approvalId,
      whsec: WHSEC_A,
      confirmedDigest: "0".repeat(64),
    });
    expect(mismatchedCompletion.ok === false && mismatchedCompletion.refusal.kind).toBe("DIGEST_MISMATCH");
    // A correct completion still works after the refusals (nothing consumed).
    const completion = await authority.completeRegistration({
      approvalId: approval.approval.approvalId,
      whsec: WHSEC_A,
      confirmedDigest: proposal.proposal.digest,
    });
    expect(completion.ok).toBe(true);
  });

  it("an approval is single-use (a replayed completion refuses)", async () => {
    const { authority } = await world();
    const { endpointId, digest } = await registeredDestination(authority);
    const replayProposal = await authority.approveRegistration({
      endpointId,
      principalId: "principal:user-1",
      confirmedDigest: digest,
    });
    expect(replayProposal.ok === false && replayProposal.refusal.kind).toBe("ALREADY_REGISTERED");
  });

  it("an unknown endpoint and an expired proposal refuse", async () => {
    const { authority } = await world();
    const unknown = await authority.approveRegistration({
      endpointId: "stripe-wh:never",
      principalId: "principal:user-1",
      confirmedDigest: "0".repeat(64),
    });
    expect(unknown.ok === false && unknown.refusal.kind).toBe("UNKNOWN_ENDPOINT");
    // Build an authority whose clock is past the 10-minute approval TTL.
    let iso = "2026-11-01T12:00:00Z";
    const slow = new StripeWebhookDestinationAuthority({
      secretBroker: new StripeWebhookSecretBroker({ store: fakeSecretStore(), nowIso: () => iso }),
      fileSystem: fakeFs(),
      directory: "/tmp/p242-destinations",
      nowIso: () => iso,
      createId: () => "slow-id",
    });
    await slow.load();
    const proposal = await slow.proposeRegistration({
      connectionId: CONN,
      url: "https://events.payswap.test/hook",
      description: "",
      enabledEventTypes: ["customer.created"],
      eventApiVersion: "2026-09-30.endive",
    });
    if (!proposal.ok) {
      throw new Error("proposal failed");
    }
    iso = "2026-11-01T13:00:00Z";
    const expired = await slow.approveRegistration({
      endpointId: proposal.proposal.endpointId,
      principalId: "principal:user-1",
      confirmedDigest: proposal.proposal.digest,
    });
    expect(expired.ok === false && expired.refusal.kind).toBe("EXPIRED");
  });

  it("deletion requires the CURRENT binding's digest; the secret is REALLY deleted", async () => {
    const { broker, authority } = await world();
    const { endpointId } = await registeredDestination(authority);
    // The deletion preview: the digest of the CURRENT destination binding.
    const deletion = await authority.proposeDeletion({ endpointId });
    if (!deletion.ok) {
      throw new Error("deletion proposal failed");
    }
    // The registration digest is NOT the deletion digest (kind-bound — a
    // registration approval can never authorize a deletion).
    const wrongDigest = await authority.deleteDestination({
      endpointId,
      principalId: "principal:user-1",
      confirmedDigest: "0".repeat(64),
    });
    expect(wrongDigest.ok === false && wrongDigest.refusal.kind).toBe("DIGEST_MISMATCH");
    const deleted = await authority.deleteDestination({
      endpointId,
      principalId: "principal:user-1",
      confirmedDigest: deletion.digest,
    });
    expect(deleted.ok).toBe(true);
    expect(authority.destinationOf(endpointId)?.status).toBe("DELETED");
    // The sealed secret is gone: the broker fails closed on the next use.
    await expect(
      broker.withSecrets(endpointId, () => "result", "post-delete-use"),
    ).rejects.toThrow(WebhookSecretBrokerError);
    // Re-deleting refuses (unknown/deleted).
    const again = await authority.deleteDestination({
      endpointId,
      principalId: "principal:user-1",
      confirmedDigest: deletion.digest,
    });
    expect(again.ok === false && again.refusal.kind).toBe("UNKNOWN_ENDPOINT");
  });

  it("records the provider-confirmed endpoint id (we_…) only when it carries the shape", async () => {
    const { authority } = await world();
    const { endpointId } = await registeredDestination(authority);
    expect(await authority.recordProviderEndpoint({ endpointId, providerEndpointId: "not-a-we-id" })).toBeNull();
    const updated = await authority.recordProviderEndpoint({
      endpointId,
      providerEndpointId: "we_fake51endpoint001",
    });
    expect(updated?.providerEndpointId).toBe("we_fake51endpoint001");
  });

  it("the event-destination version lands in the version store as an INDEPENDENT fact", async () => {
    const fs = fakeFs();
    const versionStore = new StripeApiVersionStateStore({
      fileSystem: fs,
      directory: "/tmp/p242-versions",
      nowIso: () => "2026-11-01T12:00:00Z",
    });
    const { authority } = await world(versionStore);
    await registeredDestination(authority, "2024-06-20.acacia");
    const state = await versionStore.stateOf(CONN);
    expect(state.eventDestinationApiVersion).toBe("2024-06-20.acacia");
    expect(state.requestApiVersion).toBe("2025-08-27.basil");
  });
});

describe("the webhook-secret broker (per-endpoint sealing + rotation + the escape scan)", () => {
  function broker(nowIso: () => string, overlapMs?: number) {
    return new StripeWebhookSecretBroker({ store: fakeSecretStore(), nowIso, overlapMs });
  }

  it("refuses a malformed whsec_ shape (fail-closed, never echoes the value)", async () => {
    const instance = broker(() => "2026-11-01T12:00:00Z");
    await expect(instance.seal({ endpointId: "stripe-wh:1", secret: NOT_A_WHSEC })).rejects.toThrow(
      /canonical whsec_ shape/,
    );
    await expect(instance.seal({ endpointId: "stripe-wh:1", secret: "whsec_short" })).rejects.toThrow(
      WebhookSecretBrokerError,
    );
  });

  it("seals under its own storage-key namespace and serves the live secret inside the consumer", async () => {
    const instance = broker(() => "2026-11-01T12:00:00Z");
    const metadata = await instance.seal({ endpointId: "stripe-wh:ep-1", secret: WHSEC_A });
    expect(metadata.currentSealedAt).toBe("2026-11-01T12:00:00Z");
    expect(metadata.overlapUntil).toBeNull();
    // The storage key is the webhook namespace — never the connection-credential namespace.
    expect(instance.metadataOf("stripe-wh:ep-1")?.endpointId).toBe("stripe-wh:ep-1");
    const length = await instance.withSecrets("stripe-wh:ep-1", (secrets) => secrets.length, "battery");
    expect(length).toBe(1);
  });

  it("rotation keeps the PREVIOUS secret valid inside the overlap window (and only inside it)", async () => {
    let iso = "2026-11-01T12:00:00Z";
    const instance = broker(() => iso, 60 * 60 * 1000);
    await instance.seal({ endpointId: "stripe-wh:ep-1", secret: WHSEC_A });
    iso = "2026-11-01T13:00:00Z";
    const rotated = await instance.seal({ endpointId: "stripe-wh:ep-1", secret: WHSEC_B });
    expect(rotated.previousRotatedAt).toBe("2026-11-01T13:00:00Z");
    // The overlap end is a DERIVED instant (full toISOString precision).
    expect(rotated.overlapUntil).toBe("2026-11-01T14:00:00.000Z");
    // Inside the window: BOTH secrets are live.
    expect(
      await instance.withSecrets("stripe-wh:ep-1", (secrets) => secrets.length, "rotation-window"),
    ).toBe(2);
    // After the window: only the current secret.
    iso = "2026-11-01T14:00:01Z";
    expect(
      await instance.withSecrets("stripe-wh:ep-1", (secrets) => secrets.length, "post-window"),
    ).toBe(1);
  });

  it("a leak through the consumer result THROWS (the escape scan — never sanitized)", async () => {
    const instance = broker(() => "2026-11-01T12:00:00Z");
    await instance.seal({ endpointId: "stripe-wh:ep-1", secret: WHSEC_A });
    await expect(
      instance.withSecrets("stripe-wh:ep-1", (secrets) => `oops ${secrets[0]}`, "leak-attempt"),
    ).rejects.toThrow(/leaked through the consumer result/);
    await expect(
      instance.withSecrets(
        "stripe-wh:ep-1",
        (secrets) => ({ nested: { deep: createHmac("sha256", secrets[0]!).digest("hex") } }),
        "hmac-is-not-a-leak",
      ),
    ).resolves.toBeTruthy();
  });

  it("an unknown endpoint fails closed; delete removes the envelope", async () => {
    const instance = broker(() => "2026-11-01T12:00:00Z");
    await expect(
      instance.withSecrets("stripe-wh:none", () => "x", "unknown-endpoint"),
    ).rejects.toThrow(WebhookSecretBrokerError);
    await instance.seal({ endpointId: "stripe-wh:ep-1", secret: WHSEC_A });
    await instance.delete("stripe-wh:ep-1");
    expect(instance.metadataOf("stripe-wh:ep-1")).toBeNull();
    await expect(
      instance.withSecrets("stripe-wh:ep-1", () => "x", "post-delete"),
    ).rejects.toThrow(WebhookSecretBrokerError);
  });

  it("no secret shape appears in any snapshot the destination authority persists", async () => {
    const fs = fakeFs();
    const brokerInstance = new StripeWebhookSecretBroker({
      store: fakeSecretStore(),
      nowIso: () => "2026-11-01T12:00:00Z",
    });
    const authority = new StripeWebhookDestinationAuthority({
      secretBroker: brokerInstance,
      fileSystem: fs,
      directory: "/tmp/p242-destinations",
      nowIso: () => "2026-11-01T12:00:00Z",
      createId: () => "scan-id",
    });
    await authority.load();
    await registeredDestination(authority);
    const snapshotText = [...fs.files.values()].join("\n");
    expect(snapshotText).not.toContain(WHSEC_A);
    expect(carriesStripeSecretShape(snapshotText)).toBe(false);
  });
});
