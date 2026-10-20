import { describe, expect, it } from "vitest";
import {
  EVIDENCE_LINEAGE_SCHEMA_VERSION,
  GENESIS_DIGEST,
  appendEvidenceRecord,
  chainsAreEquivalent,
  emptyEvidenceChain,
  replayEvidenceChain,
  verifyEvidenceChain,
} from "../src/lineage.js";
import { contentDigest } from "../src/digest.js";

function payloadDigest(seed: string): string {
  return contentDigest({ seed });
}

function chainFixture() {
  let chain = emptyEvidenceChain();
  chain = appendEvidenceRecord(chain, {
    recordId: "rec-identity",
    evidenceKind: "deployment-identity",
    payloadDigest: payloadDigest("identity"),
  });
  chain = appendEvidenceRecord(chain, {
    recordId: "rec-parity",
    evidenceKind: "parity-report",
    payloadDigest: payloadDigest("parity"),
  });
  chain = appendEvidenceRecord(chain, {
    recordId: "rec-rollout-verdict",
    evidenceKind: "rollout-stage-verdict",
    payloadDigest: payloadDigest("rollout"),
  });
  return chain;
}

describe("evidence lineage (hard law 8)", () => {
  it("records chain digests: each links to its predecessor", () => {
    const chain = chainFixture();
    expect(chain.records).toHaveLength(3);
    const [first, second, third] = chain.records;
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("three records");
    }
    expect(first.sequence).toBe(0);
    expect(first.prevRecordDigest).toBe(GENESIS_DIGEST);
    expect(second.prevRecordDigest).toBe(first.recordDigest);
    expect(third.prevRecordDigest).toBe(second.recordDigest);
    expect(first.schema_version).toBe(EVIDENCE_LINEAGE_SCHEMA_VERSION);
  });

  it("append fails closed on duplicates and evidence-less records", () => {
    const chain = chainFixture();
    expect(() =>
      appendEvidenceRecord(chain, {
        recordId: "rec-parity",
        evidenceKind: "parity-report",
        payloadDigest: payloadDigest("x"),
      }),
    ).toThrow(/append-only/);
    expect(() =>
      appendEvidenceRecord(emptyEvidenceChain(), {
        recordId: "valid-id",
        evidenceKind: "kinds",
        payloadDigest: "",
      }),
    ).toThrow(/payload digest/);
  });

  it("deterministic replay verifies the chain and derives the terminal digest", () => {
    const chain = chainFixture();
    const report = verifyEvidenceChain(chain);
    expect(report.ok).toBe(true);
    expect(report.recordCount).toBe(3);
    expect(report.terminalDigest).toBe(
      chain.records[chain.records.length - 1]?.recordDigest,
    );
    expect(replayEvidenceChain(chain)).toBe(report.terminalDigest);
  });

  it("tampering a payload fails the replay (tamper-evident)", () => {
    const chain = chainFixture();
    const tampered = {
      records: chain.records.map((record, index) =>
        index === 1
          ? { ...record, payloadDigest: payloadDigest("tampered") }
          : record,
      ),
    };
    const report = verifyEvidenceChain(tampered);
    expect(report.ok).toBe(false);
    expect(report.problems.join("\n")).toContain("recordDigest mismatch");
    expect(() => replayEvidenceChain(tampered)).toThrow(/does not verify/);
  });

  it("splicing or reordering fails the chain verification", () => {
    const chain = chainFixture();
    const first = chain.records[0];
    const second = chain.records[1];
    const third = chain.records[2];
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("three records");
    }
    const spliced: typeof chain = {
      records: [
        first,
        {
          schema_version: EVIDENCE_LINEAGE_SCHEMA_VERSION,
          sequence: 1,
          recordId: "rec-injected",
          evidenceKind: "injected",
          payloadDigest: payloadDigest("injected"),
          prevRecordDigest: "fnv1a64:deadbeefdeadbeef",
          recordDigest: "fnv1a64:0000000000000000",
        },
        third,
      ],
    };
    const report = verifyEvidenceChain(spliced);
    expect(report.ok).toBe(false);
    expect(report.problems.join("\n")).toContain("prevRecordDigest mismatch");

    const reordered: typeof chain = {
      records: [second, first, third],
    };
    expect(verifyEvidenceChain(reordered).ok).toBe(false);
  });

  it("the same record sequence always produces the same chain (byte-determinism)", () => {
    expect(chainsAreEquivalent(chainFixture(), chainFixture())).toBe(true);
    const different = appendEvidenceRecord(chainFixture(), {
      recordId: "rec-extra",
      evidenceKind: "extra",
      payloadDigest: payloadDigest("extra"),
    });
    expect(chainsAreEquivalent(chainFixture(), different)).toBe(false);
  });

  it("the empty chain verifies and replays to the genesis digest", () => {
    const empty = emptyEvidenceChain();
    const report = verifyEvidenceChain(empty);
    expect(report.ok).toBe(true);
    expect(report.terminalDigest).toBe(GENESIS_DIGEST);
    expect(GENESIS_DIGEST).toMatch(/^fnv1a64:/);
  });
});
