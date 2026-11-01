/**
 * PaySwap Desktop (P24-2, ADR-0017 D12) — the DURABLE EVENT INBOX
 * battery (handoff §8, the ingest-order laws):
 *
 * 1. RAW-BYTES VERIFICATION BEFORE ANY PARSING: an invalid signature
 *    (or a tampered body) appends a REJECTED_SIGNATURE receipt and
 *    never parses the payload; a rotation overlap accepts the previous
 *    secret's signature.
 * 2. DEDUP TWICE: by Stripe event id AND by (object id + event type).
 * 3. OUT-OF-ORDER TOLERANCE: an older event for a known object is
 *    SUPERSEDED and REQUIRES authoritative retrieval — never blind
 *    application; a thin event requires retrieval too.
 * 4. PROVENANCE: the payload api_version AND the destination's
 *    event-destination version are recorded per receipt.
 * 5. INV-25: a livemode payload is refused.
 * 6. Fail-closed endpoints: unknown/deleted destinations refuse the
 *    delivery; the snapshot persists secret-free across a reopen.
 */

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { StripeEventInbox } from "../../src/host/payswap/stripe/event-inbox.js";
import { StripeWebhookSecretBroker } from "../../src/host/payswap/stripe/webhook-secret-broker.js";
import {
  StripeWebhookDestinationAuthority,
} from "../../src/host/payswap/stripe/webhook-destinations.js";
import { createDesktopStripeWebhookVerifierFactory } from "../../src/host/payswap/stripe/event-plane.js";
import { fakeFs } from "./stripe-action-fixtures.js";
import { carriesStripeSecretShape } from "../../src/host/payswap/stripe/stripe-pins.js";

const CONN = "conn:fake-stripe-1";
const WHSEC_A = "whsec" + "_FAKE51whsecADoNotUse001";
const WHSEC_B = "whsec" + "_FAKE51whsecBDoNotUse002";
const NOW_MS = 1_800_000_000_000;

/** Build the inbox world: broker + destinations + one registered endpoint. */
async function inboxWorld() {
  const fs = fakeFs();
  const broker = new StripeWebhookSecretBroker({
    store: {
      save: async (key: string, value: string) => {
        fs.writeFile(key, value);
      },
      load: async (key: string) => {
        try {
          return await fs.readFile(key);
        } catch {
          return null;
        }
      },
      delete: async (key: string) => {
        fs.files.delete(key);
      },
    },
    nowIso: () => new Date(NOW_MS).toISOString(),
  });
  const authority = new StripeWebhookDestinationAuthority({
    secretBroker: broker,
    fileSystem: fs,
    directory: "/tmp/p242-destinations",
    nowIso: () => new Date(NOW_MS).toISOString(),
    createId: (() => {
      let seq = 0;
      return () => `fake-${(seq += 1)}`;
    })(),
  });
  await authority.load();
  const proposal = await authority.proposeRegistration({
    connectionId: CONN,
    url: "https://events.payswap.test/hook",
    description: "the inbox battery destination",
    enabledEventTypes: ["customer.created", "payment_intent.succeeded"],
    eventApiVersion: "2026-09-30.endive",
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
  const inbox = new StripeEventInbox({
    destinations: authority,
    secretBroker: broker,
    verifierFactory: createDesktopStripeWebhookVerifierFactory(),
    fileSystem: fs,
    directory: "/tmp/p242-inbox",
    nowMs: () => NOW_MS,
    createId: (() => {
      let seq = 0;
      return () => `evt-${(seq += 1)}`;
    })(),
  });
  await inbox.load();
  return { fs, broker, authority, inbox, endpointId: proposal.proposal.endpointId };
}

/** One signed delivery (the pinned scheme: HMAC-SHA256 over "<t>.<body>"). */
function delivery(input: {
  readonly secret?: string;
  readonly eventId: string;
  readonly eventType?: string;
  readonly objectId?: string;
  readonly created?: number;
  readonly livemode?: boolean;
  readonly apiVersion?: string;
  readonly thin?: boolean;
  readonly tamper?: boolean;
}) {
  const created = input.created ?? Math.floor(NOW_MS / 1000) - 10;
  const payload = {
    id: input.eventId,
    object: "event",
    api_version: input.apiVersion ?? "2026-09-30.endive",
    created,
    type: input.eventType ?? "customer.created",
    livemode: input.livemode ?? false,
    data: input.thin
      ? { related_object: { id: input.objectId ?? "cus_fake51created" } }
      : {
          object: {
            id: input.objectId ?? "cus_fake51created",
            // A distinctive raw-payload marker: the receipt keeps only
            // identifiers, so this NEVER persists (the battery asserts it).
            email: "raw-payload-marker@example.test",
          },
        },
  };
  const body = JSON.stringify(payload);
  const t = Math.floor(NOW_MS / 1000) - 10;
  const signedBody = input.tamper ? `${body} ` : body;
  const signature = createHmac("sha256", input.secret ?? WHSEC_A)
    .update(`${t}.${signedBody}`, "utf8")
    .digest("hex");
  return { rawBody: body, signatureHeader: `t=${t},v1=${signature}` };
}

describe("the durable event inbox (the ingest-order laws)", () => {
  it("ACCEPTS a verified fresh snapshot event with full provenance", async () => {
    const { inbox, endpointId } = await inboxWorld();
    const outcome = await inbox.ingest({ endpointId, ...delivery({ eventId: "evt_fake51event0001" }) });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.verified).toBe(true);
      expect(outcome.record.outcome).toBe("ACCEPTED");
      expect(outcome.record.format).toBe("SNAPSHOT");
      expect(outcome.record.objectId).toBe("cus_fake51created");
      expect(outcome.record.payloadApiVersion).toBe("2026-09-30.endive");
      expect(outcome.record.destinationApiVersion).toBe("2026-09-30.endive");
      expect(outcome.record.reconciliation).toBeNull();
    }
  });

  it("verifies RAW BYTES before parsing: a bad signature and a tampered body never parse", async () => {
    const { inbox, endpointId } = await inboxWorld();
    const badSignature = await inbox.ingest({
      endpointId,
      rawBody: delivery({ eventId: "evt_fake51event0002" }).rawBody,
      signatureHeader: `t=${Math.floor(NOW_MS / 1000) - 10},v1=${"0".repeat(64)}`,
    });
    expect(badSignature.ok && badSignature.verified).toBe(false);
    expect(badSignature.ok && badSignature.record.outcome).toBe("REJECTED_SIGNATURE");
    const tampered = await inbox.ingest({
      endpointId,
      ...delivery({ eventId: "evt_fake51event0003", tamper: true }),
    });
    expect(tampered.ok && tampered.record.outcome).toBe("REJECTED_SIGNATURE");
    // Nothing from the unverified payloads entered the record's semantics.
    if (tampered.ok) {
      expect(tampered.record.eventId).toBe("unverified");
    }
  });

  it("a rotation overlap accepts the PREVIOUS secret's signature (and the new one)", async () => {
    const { inbox, broker, endpointId } = await inboxWorld();
    await broker.seal({ endpointId, secret: WHSEC_B });
    const oldSecret = await inbox.ingest({
      endpointId,
      ...delivery({ eventId: "evt_fake51event0010", objectId: "cus_fake51rotationA", secret: WHSEC_A }),
    });
    expect(oldSecret.ok && oldSecret.record.outcome).toBe("ACCEPTED");
    const newSecret = await inbox.ingest({
      endpointId,
      ...delivery({ eventId: "evt_fake51event0011", objectId: "cus_fake51rotationB", secret: WHSEC_B }),
    });
    expect(newSecret.ok && newSecret.record.outcome).toBe("ACCEPTED");
  });

  it("DEDUPS by event id AND by (object id + event type)", async () => {
    const { inbox, endpointId } = await inboxWorld();
    const first = await inbox.ingest({
      endpointId,
      ...delivery({ eventId: "evt_fake51event0020", objectId: "cus_fake51dedupe1" }),
    });
    expect(first.ok && first.record.outcome).toBe("ACCEPTED");
    const sameId = await inbox.ingest({
      endpointId,
      ...delivery({ eventId: "evt_fake51event0020", objectId: "cus_fake51dedupe1" }),
    });
    expect(sameId.ok && sameId.record.outcome).toBe("DUPLICATE_EVENT_ID");
    // A DISTINCT event id for the SAME (object, type) is a semantic duplicate.
    const sameSemantics = await inbox.ingest({
      endpointId,
      ...delivery({ eventId: "evt_fake51event0021", objectId: "cus_fake51dedupe1" }),
    });
    expect(sameSemantics.ok && sameSemantics.record.outcome).toBe("DUPLICATE_SEMANTIC");
    // A different object is NOT a duplicate.
    const otherObject = await inbox.ingest({
      endpointId,
      ...delivery({ eventId: "evt_fake51event0022", objectId: "cus_fake51otherobj2" }),
    });
    expect(otherObject.ok && otherObject.record.outcome).toBe("ACCEPTED");
    // A NEWER same-type event for a known object is a fresh observation
    // (not a duplicate) — it becomes the newest for the object.
    const newer = await inbox.ingest({
      endpointId,
      ...delivery({
        eventId: "evt_fake51event0023",
        objectId: "cus_fake51dedupe1",
        created: Math.floor(NOW_MS / 1000) - 5,
      }),
    });
    expect(newer.ok && newer.record.outcome).toBe("ACCEPTED");
  });

  it("OUT-OF-ORDER: an older event for a known object is SUPERSEDED and requires retrieval", async () => {
    const { inbox, endpointId } = await inboxWorld();
    const newer = await inbox.ingest({
      endpointId,
      ...delivery({ eventId: "evt_fake51event0030", objectId: "cus_fake51order001", created: 1_799_999_990 }),
    });
    expect(newer.ok && newer.record.outcome).toBe("ACCEPTED");
    const older = await inbox.ingest({
      endpointId,
      ...delivery({ eventId: "evt_fake51event0031", objectId: "cus_fake51order001", created: 1_799_999_500 }),
    });
    expect(older.ok && older.record.outcome).toBe("SUPERSEDED_BY_NEWER_OBSERVATION");
    if (older.ok) {
      expect(older.record.reconciliation?.required).toBe(true);
      expect(older.record.reconciliation?.reason).toContain("authoritative current object state");
    }
    // The worklist carries it (the reconciliation UI's read).
    expect(inbox.reconciliationWorklist().length).toBe(1);
  });

  it("a THIN event requires authoritative retrieval (no object state to apply)", async () => {
    const { inbox, endpointId } = await inboxWorld();
    const thin = await inbox.ingest({
      endpointId,
      ...delivery({ eventId: "evt_fake51event0040", thin: true, eventType: "payment_intent.succeeded" }),
    });
    expect(thin.ok && thin.record.format).toBe("THIN");
    expect(thin.ok && thin.record.outcome).toBe("ACCEPTED");
    if (thin.ok) {
      expect(thin.record.reconciliation?.required).toBe(true);
      expect(thin.record.reconciliation?.reason).toContain("retrieve the authoritative object");
    }
  });

  it("records PROVENANCE per receipt: the payload version and the destination version differ honestly", async () => {
    const { inbox, endpointId } = await inboxWorld();
    const legacy = await inbox.ingest({
      endpointId,
      ...delivery({ eventId: "evt_fake51event0050", apiVersion: "2024-06-20.acacia" }),
    });
    if (legacy.ok) {
      expect(legacy.record.payloadApiVersion).toBe("2024-06-20.acacia");
      expect(legacy.record.destinationApiVersion).toBe("2026-09-30.endive");
    }
  });

  it("INV-25: a livemode payload is refused", async () => {
    const { inbox, endpointId } = await inboxWorld();
    const live = await inbox.ingest({
      endpointId,
      ...delivery({ eventId: "evt_fake51event0060", livemode: true }),
    });
    expect(live.ok && live.record.outcome).toBe("LIVE_EVENT_REFUSED");
  });

  it("a verified but unparseable payload records REJECTED_SHAPE (never a crash)", async () => {
    const { inbox, endpointId } = await inboxWorld();
    const body = "not-json-at-all";
    const t = Math.floor(NOW_MS / 1000) - 10;
    const signature = createHmac("sha256", WHSEC_A).update(`${t}.${body}`, "utf8").digest("hex");
    const outcome = await inbox.ingest({ endpointId, rawBody: body, signatureHeader: `t=${t},v1=${signature}` });
    expect(outcome.ok && outcome.verified).toBe(true);
    expect(outcome.ok && outcome.record.outcome).toBe("REJECTED_SHAPE");
  });

  it("refuses deliveries for unknown and DELETED endpoints (fail-closed)", async () => {
    const { inbox, authority, endpointId } = await inboxWorld();
    const unknown = await inbox.ingest({
      endpointId: "stripe-wh:none",
      ...delivery({ eventId: "evt_fake51event0070" }),
    });
    expect(unknown.ok).toBe(false);
    expect(unknown.ok === false && unknown.refusal.kind).toBe("UNKNOWN_ENDPOINT");
    const digest = await authority.proposeDeletion({ endpointId });
    if (!digest.ok) {
      throw new Error("deletion proposal failed");
    }
    await authority.deleteDestination({ endpointId, principalId: "principal:user-1", confirmedDigest: digest.digest });
    const deleted = await inbox.ingest({
      endpointId,
      ...delivery({ eventId: "evt_fake51event0071" }),
    });
    expect(deleted.ok).toBe(false);
    expect(deleted.ok === false && deleted.refusal.kind).toBe("ENDPOINT_DELETED");
  });

  it("persists receipts across a reopen; the inbox/destination snapshots are secret-free and raw payloads never persist", async () => {
    const { fs, inbox, endpointId } = await inboxWorld();
    await inbox.ingest({ endpointId, ...delivery({ eventId: "evt_fake51event0080" }) });
    // The receipt keeps identifiers/versions/outcomes ONLY — the raw
    // payload's non-id fields (the marker) never persist.
    const inboxSnapshot = fs.files.get("/tmp/p242-inbox/stripe-event-inbox.json") ?? "";
    const destinationSnapshot =
      fs.files.get("/tmp/p242-destinations/stripe-webhook-destinations.json") ?? "";
    expect(inboxSnapshot).not.toContain("raw-payload-marker");
    expect(carriesStripeSecretShape(inboxSnapshot)).toBe(false);
    expect(carriesStripeSecretShape(destinationSnapshot)).toBe(false);
    const reopened = new StripeEventInbox({
      destinations: new StripeWebhookDestinationAuthority({
        secretBroker: new StripeWebhookSecretBroker({
          store: { save: async () => {}, load: async () => null, delete: async () => {} },
          nowIso: () => new Date(NOW_MS).toISOString(),
        }),
        fileSystem: fs,
        directory: "/tmp/p242-destinations",
        nowIso: () => new Date(NOW_MS).toISOString(),
        createId: () => "reopen-id",
      }),
      secretBroker: new StripeWebhookSecretBroker({
        store: {
          save: async (key: string, value: string) => {
            fs.writeFile(key, value);
          },
          load: async (key: string) => {
            try {
              return await fs.readFile(key);
            } catch {
              return null;
            }
          },
          delete: async (key: string) => {
            fs.files.delete(key);
          },
        },
        nowIso: () => new Date(NOW_MS).toISOString(),
      }),
      verifierFactory: createDesktopStripeWebhookVerifierFactory(),
      fileSystem: fs,
      directory: "/tmp/p242-inbox",
      nowMs: () => NOW_MS,
      createId: () => "reopen-evt",
    });
    await reopened.load();
    expect(reopened.records().length).toBe(1);
    expect(reopened.records()[0]?.eventId).toBe("evt_fake51event0080");
  });
});
