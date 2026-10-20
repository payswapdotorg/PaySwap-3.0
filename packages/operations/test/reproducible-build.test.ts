import { describe, expect, it } from "vitest";
import {
  RELEASE_MANIFEST_SCHEMA_VERSION,
  REPRODUCIBLE_BUILD_CONTRACT,
  REPRODUCIBLE_BUILD_CONTRACT_DIGEST,
  SUBSTRATE_ARCHIVE_TOOL,
  ReproducibleBuildError,
  assertManifestStreamsIdentical,
  canonicalManifestStream,
  checkReleaseManifestShape,
  verifyTreeAgainstManifest,
  type ReleaseManifest,
  type ReleaseManifestEntry,
} from "../src/reproducible-build.js";

const SHA_A =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SHA_C =
  "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

function entry(path: string, sha256 = SHA_A, mode: "0755" | "0644" = "0644"): ReleaseManifestEntry {
  return { path, mode, sha256, bytes: 10 };
}

function manifestFixture(files: readonly ReleaseManifestEntry[]): ReleaseManifest {
  return {
    manifestVersion: 1,
    schema_version: RELEASE_MANIFEST_SCHEMA_VERSION,
    generatedBy: "scripts/release/build-release-manifest.mjs",
    identity: {
      commitSha: "b01a0a9000000000000000000000000000000000",
      environment: "test",
    },
    fileCount: files.length,
    files,
    totalDigest: SHA_C,
  };
}

describe("the reproducible-build contract (hard law 2)", () => {
  it("the contract is pinned to the substrate tool with laws R1-R7", () => {
    expect(SUBSTRATE_ARCHIVE_TOOL).toBe("scripts/deterministic-tar-archive.mjs");
    const lawIds = REPRODUCIBLE_BUILD_CONTRACT.map((law) => law.lawId);
    expect(lawIds).toEqual([
      "R1-SORTED-ENTRY-ORDER",
      "R2-MODE-NORMALIZATION",
      "R3-METADATA-NORMALIZATION",
      "R4-SYMLINKS-AS-LINKS",
      "R5-FAIL-CLOSED-WALK",
      "R6-REPO-SCALE-IGNORE-SET",
      "R7-NO-AMBIENT-FIELDS",
    ]);
    expect(REPRODUCIBLE_BUILD_CONTRACT_DIGEST).toMatch(/^fnv1a64:/);
  });

  it("shape verification accepts a well-formed manifest", () => {
    const report = checkReleaseManifestShape(
      manifestFixture([entry("a.txt"), entry("b/c.md", SHA_B), entry("z.sh", SHA_A, "0755")]),
    );
    expect(report.ok).toBe(true);
    expect(report.checkedEntries).toBe(3);
  });

  it("shape verification rejects unsorted, duplicated, non-POSIX or malformed entries", () => {
    expect(
      checkReleaseManifestShape(manifestFixture([entry("b.txt"), entry("a.txt")])).ok,
    ).toBe(false);
    expect(
      checkReleaseManifestShape(manifestFixture([entry("a.txt"), entry("a.txt")])).ok,
    ).toBe(false);
    for (const badPath of ["./a.txt", "/a.txt", "a\\b.txt"]) {
      expect(
        checkReleaseManifestShape(manifestFixture([entry(badPath)])).ok,
      ).toBe(false);
    }
    const badMode = { ...entry("a.txt"), mode: "0777" as never };
    expect(checkReleaseManifestShape(manifestFixture([badMode])).ok).toBe(false);
    const badHash = { ...entry("a.txt"), sha256: "zz" };
    expect(checkReleaseManifestShape(manifestFixture([badHash])).ok).toBe(false);
    const badCount = { ...manifestFixture([entry("a.txt")]), fileCount: 7 };
    expect(checkReleaseManifestShape(badCount).ok).toBe(false);
    const badIdentity = {
      ...manifestFixture([entry("a.txt")]),
      identity: { commitSha: "nope", environment: "" },
    };
    expect(checkReleaseManifestShape(badIdentity).ok).toBe(false);
  });

  it("the canonical entry stream is sorted + tab-delimited (the shared law)", () => {
    const stream = canonicalManifestStream([
      entry("z.txt", SHA_B),
      entry("a.txt", SHA_A),
      entry("m.md", SHA_C, "0755"),
    ]);
    expect(stream).toBe(
      `a.txt\t0644\t${SHA_A}\t10\n` +
        `m.md\t0755\t${SHA_C}\t10\n` +
        `z.txt\t0644\t${SHA_B}\t10\n`,
    );
  });

  it("two walks of the same tree produce identical streams (R7 determinism)", () => {
    const files = [
      entry("a.txt"),
      entry("b/c.md", SHA_B),
      entry("d/e/f.json", SHA_C, "0755"),
    ];
    expect(() =>
      assertManifestStreamsIdentical(files, [...files].reverse()),
    ).not.toThrow();
    expect(() =>
      assertManifestStreamsIdentical(files, [entry("a.txt", SHA_B)]),
    ).toThrow(ReproducibleBuildError);
  });

  it("tree-vs-manifest verification classifies missing, extra and modified files", () => {
    const manifest = manifestFixture([entry("a.txt"), entry("b.txt", SHA_B)]);
    const pristine = verifyTreeAgainstManifest(manifest, [
      entry("a.txt"),
      entry("b.txt", SHA_B),
    ]);
    expect(pristine.ok).toBe(true);

    const modified = verifyTreeAgainstManifest(manifest, [
      entry("a.txt", SHA_C),
      entry("b.txt", SHA_B),
    ]);
    expect(modified.ok).toBe(false);
    expect(modified.problems.join("\n")).toContain("modified: a.txt");

    const missing = verifyTreeAgainstManifest(manifest, [entry("a.txt")]);
    expect(missing.problems.join("\n")).toContain("missing from tree: b.txt");

    const extra = verifyTreeAgainstManifest(manifest, [
      entry("a.txt"),
      entry("b.txt", SHA_B),
      entry("c.txt"),
    ]);
    expect(extra.problems.join("\n")).toContain("extra in tree: c.txt");

    const modeDrift = verifyTreeAgainstManifest(manifest, [
      { ...entry("a.txt"), mode: "0755" },
      entry("b.txt", SHA_B),
    ]);
    expect(modeDrift.problems.join("\n")).toContain("mode drift: a.txt");
  });
});
