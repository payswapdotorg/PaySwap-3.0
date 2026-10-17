import { describe, expect, it } from "vitest";
import {
  MemoryBoundaryError,
  OrganizationMemoryStore,
  ProtocolCommandShapeError,
  RootCredentialInContextError,
  releaseOrganization,
} from "../src/index.ts";
import { makeOrgDraft } from "./fixtures.ts";

/**
 * NET-NEW (P3-W1): the organization memory boundary (FROZEN §7 "memory").
 * Memory is a typed, policy-bounded artifact stream — never ambient shared
 * state: writers must be participants; retention bounds lifetime (ephemeral
 * retains NOTHING, session closes, persistent appends forever); content is
 * scanned (no command shape, no root credentials); scope bounds reads.
 */

const T0 = 5_000_000;

function storeWith(
  overrides: Parameters<typeof makeOrgDraft>[0] = {},
): OrganizationMemoryStore {
  return new OrganizationMemoryStore(releaseOrganization(makeOrgDraft(overrides), 4_000_000));
}

function write(
  store: OrganizationMemoryStore,
  recordId: string,
  writerInstanceId = "instance-payer",
  writtenAt = T0,
): void {
  store.write({
    recordId,
    writerInstanceId,
    channel: "routing-notes",
    content: { note: "SEPA cheapest for this corridor" },
    writtenAt,
  });
}

describe("memory boundary — writers and records (M1, M5)", () => {
  it("accepts writes from participating instances and returns frozen records", () => {
    const store = storeWith();
    const record = store.write({
      recordId: "mem-1",
      writerInstanceId: "instance-payer",
      channel: "routing-notes",
      content: { note: "quote freshness is 30s" },
      writtenAt: T0,
    });
    expect(record.orgId).toBe("org:payops-1");
    expect(record.orgVersion).toBe(1);
    expect(record.writerInstanceId).toBe("instance-payer");
    expect(() => {
      (record as { recordId: string }).recordId = "mutated";
    }).toThrow(TypeError);
  });

  it("rejects non-participant writers, duplicate ids and empty fields", () => {
    const store = storeWith();
    write(store, "mem-1");
    expect(() => write(store, "mem-1")).toThrow(MemoryBoundaryError);
    expect(() => write(store, "mem-2", "instance-ghost")).toThrow(/not a participating instance/);
    expect(() => write(store, "")).toThrow(/recordId/);
  });
});

describe("memory boundary — retention bounds lifetime (M2)", () => {
  it("ephemeral retention retains NOTHING: every write fails closed", () => {
    const store = storeWith({ memory: { scope: "shared", retention: "ephemeral" } });
    expect(() => write(store, "mem-1")).toThrow(/retains no memory/);
    expect(store.records()).toEqual([]);
  });

  it("session retention keeps records until closeSession, then fails closed forever", () => {
    const store = storeWith({ memory: { scope: "shared", retention: "session" } });
    write(store, "mem-1");
    expect(store.records()).toHaveLength(1);
    store.closeSession(T0 + 100);
    expect(store.isSessionClosed()).toBe(true);
    expect(() => write(store, "mem-2", "instance-payer", T0 + 200)).toThrow(
      /session is closed/,
    );
    // existing records remain readable evidence
    expect(store.readableBy("instance-payer")).toHaveLength(1);
  });

  it("closeSession applies only to session retention and is monotonic", () => {
    const persistent = storeWith({ memory: { scope: "shared", retention: "persistent" } });
    expect(() => persistent.closeSession(T0)).toThrow(/only to 'session' retention/);
    const session = storeWith({ memory: { scope: "shared", retention: "session" } });
    session.closeSession(T0 + 100);
    expect(() => session.closeSession(T0 + 50)).toThrow(/monotonic/);
  });

  it("persistent retention is append-only: no close boundary exists", () => {
    const store = storeWith({ memory: { scope: "shared", retention: "persistent" } });
    write(store, "mem-1", "instance-payer", T0);
    write(store, "mem-2", "instance-reviewer", T0 + 1);
    expect(store.records().map((record) => record.recordId)).toEqual(["mem-1", "mem-2"]);
  });
});

describe("memory boundary — content boundary (M3)", () => {
  it("rejects memory content carrying protocol-command shape", () => {
    const store = storeWith();
    expect(() =>
      store.write({
        recordId: "mem-evil",
        writerInstanceId: "instance-payer",
        channel: "routing-notes",
        content: { idempotencyKey: "idem-1" },
        writtenAt: T0,
      }),
    ).toThrow(ProtocolCommandShapeError);
  });

  it("rejects memory content carrying a root credential (INV-19)", () => {
    const store = storeWith();
    expect(() =>
      store.write({
        recordId: "mem-evil",
        writerInstanceId: "instance-payer",
        channel: "routing-notes",
        content: { wallet: { credentialKind: "root_credential", keyFingerprint: "k" } },
        writtenAt: T0,
      }),
    ).toThrow(RootCredentialInContextError);
    expect(store.records()).toEqual([]);
  });
});

describe("memory boundary — scope bounds reads (M4)", () => {
  it("isolated scope: an instance reads ONLY its own records", () => {
    const store = storeWith({ memory: { scope: "isolated", retention: "persistent" } });
    write(store, "mem-payer", "instance-payer", T0);
    write(store, "mem-reviewer", "instance-reviewer", T0 + 1);
    expect(store.readableBy("instance-payer").map((r) => r.recordId)).toEqual(["mem-payer"]);
    expect(store.readableBy("instance-reviewer").map((r) => r.recordId)).toEqual(["mem-reviewer"]);
  });

  it("shared scope: every participant reads all records of the version", () => {
    const store = storeWith({ memory: { scope: "shared", retention: "persistent" } });
    write(store, "mem-payer", "instance-payer", T0);
    write(store, "mem-reviewer", "instance-reviewer", T0 + 1);
    expect(store.readableBy("instance-payer")).toHaveLength(2);
    expect(store.readableBy("instance-reviewer")).toHaveLength(2);
  });

  it("non-participants read nothing, always", () => {
    const store = storeWith({ memory: { scope: "shared", retention: "persistent" } });
    write(store, "mem-1", "instance-payer", T0);
    expect(store.readableBy("instance-ghost")).toEqual([]);
  });

  it("memory never crosses organization versions: a new version gets a fresh store", () => {
    const v1 = releaseOrganization(makeOrgDraft(), 4_000_000);
    const storeV1 = new OrganizationMemoryStore(v1);
    write(storeV1, "mem-1", "instance-payer", T0);
    const storeV2 = new OrganizationMemoryStore(
      releaseOrganization(
        { ...makeOrgDraft(), version: 2, derivedFrom: { version: 1, contentHash: v1.release.contentHash } },
        4_100_000,
      ),
    );
    expect(storeV2.records()).toEqual([]);
    expect(storeV2.readableBy("instance-payer")).toEqual([]);
  });
});
