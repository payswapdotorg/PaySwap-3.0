/**
 * @payswap/operations — the reproducible-build contract (P8-W3, hard law 2).
 *
 * THE CONTRACT IS PINNED TO THE SUBSTRATE TOOL; THIS PACKAGE OWNS THE
 * CONTRACT + VERIFICATION, NOT THE TOOL. The substrate is
 * scripts/deterministic-tar-archive.mjs (read at this package's base
 * commit — the TL owns the file under the single-writer law): it packs a
 * source tree into a byte-deterministic tar+gzip archive by
 *
 *   R1 ENTRY ORDERING — depth-first walk, directory children visited in
 *      `localeCompare(child, "en")` sorted order, directories emitted
 *      with a trailing `/` before their children;
 *   R2 MODE NORMALIZATION — regular files carry 0o755 when any execute
 *      bit is set, else 0o644; directories 0o755; symlinks 0o777;
 *   R3 METADATA NORMALIZATION — uid/gid 0, owner root/root, mtime 0,
 *      fixed gzip settings (Z_BEST_COMPRESSION, mtime 0, empty filename,
 *      OS byte forced to 255);
 *   R4 SYMLINKS AS LINK ENTRIES — recorded with their target, never
 *      followed;
 *   R5 FAIL-CLOSED WALK — any entry that is not a regular file,
 *      directory or symlink THROWS (no silent skip, no ambient filter).
 *
 * Because the substrate is always invoked on STAGED CLEAN SOURCE TREES,
 * it needs no exclusion list; a repo-scale release manifest must supply
 * the equivalent cleanliness itself — the release tool
 * (scripts/release/build-release-manifest.mjs) therefore walks the repo
 * with the SAME R1/R2/R4/R5 laws plus the minimal repo-scale ignore set
 * (VCS metadata `.git/` and installed dependencies `node_modules/`) that
 * a staged source tree would never contain. This module declares that
 * combined law as data and verifies manifests against it.
 *
 * Deterministic only: this module computes nothing cryptographic —
 * sha256 digests ENTER as validated 64-hex strings produced by the
 * tooling; the checkers here are pure functions over declared data.
 */

import { contentDigest } from "./digest.js";
import { SHA256_HEX_PATTERN } from "./deployment-identity.js";

/** The release-manifest schema version this contract speaks. */
export const RELEASE_MANIFEST_SCHEMA_VERSION = "1.0" as const;

/** The substrate tool this contract is pinned to (path @ base commit). */
export const SUBSTRATE_ARCHIVE_TOOL =
  "scripts/deterministic-tar-archive.mjs" as const;

// ---------------------------------------------------------------------------
// The contract, as data
// ---------------------------------------------------------------------------

/** One law of the deterministic archive/manifest substrate contract. */
export interface DeterminismLaw {
  readonly lawId: string;
  readonly description: string;
}

/**
 * The reproducible-build contract laws (R1–R5 above + the repo-scale
 * ignore law), as checkable data. Consumers (CI, the release tool's
 * selftest, the evidence records) cite these ids.
 */
export const REPRODUCIBLE_BUILD_CONTRACT: readonly DeterminismLaw[] =
  Object.freeze([
    {
      lawId: "R1-SORTED-ENTRY-ORDER",
      description:
        "Depth-first walk with children visited in localeCompare(child, \"en\") sorted order; directories emitted with a trailing slash before their children; POSIX relative paths.",
    },
    {
      lawId: "R2-MODE-NORMALIZATION",
      description:
        "Regular files carry 0755 when any execute bit is set, else 0644; directories 0755; symlinks 0777. Producer umask can never change the output.",
    },
    {
      lawId: "R3-METADATA-NORMALIZATION",
      description:
        "uid/gid 0, owner root/root, mtime 0, fixed gzip settings (Z_BEST_COMPRESSION, mtime 0, empty filename, OS byte 255). Producer identity and clock can never change the output.",
    },
    {
      lawId: "R4-SYMLINKS-AS-LINKS",
      description:
        "Symlinks are recorded as link entries with their target, never followed, never hashed as content.",
    },
    {
      lawId: "R5-FAIL-CLOSED-WALK",
      description:
        "Any entry that is not a regular file, directory or symlink throws — no silent skip, no ambient filter.",
    },
    {
      lawId: "R6-REPO-SCALE-IGNORE-SET",
      description:
        "The repo-scale walk ignores exactly VCS metadata (.git) and installed dependencies (node_modules) — the cleanliness a staged source tree always has. Nothing else is ignored.",
    },
    {
      lawId: "R7-NO-AMBIENT-FIELDS",
      description:
        "The manifest carries no timestamps, no hostnames, no usernames, no absolute paths — only the tree's relative content and the caller-supplied identity fields.",
    },
  ]);

/** The canonical contract digest (pins the law set; drift fails). */
export const REPRODUCIBLE_BUILD_CONTRACT_DIGEST: string = contentDigest(
  REPRODUCIBLE_BUILD_CONTRACT,
);

// ---------------------------------------------------------------------------
// Manifest shapes (what the release tool produces)
// ---------------------------------------------------------------------------

/** One file entry of a release manifest. */
export interface ReleaseManifestEntry {
  /** POSIX relative path, `/`-separated, no leading `./`. */
  readonly path: string;
  /** Normalized mode per R2: "0755" | "0644". */
  readonly mode: "0755" | "0644";
  /** sha256 of the file bytes (64-hex). */
  readonly sha256: string;
  /** Byte length. */
  readonly bytes: number;
}

/** The identity block the release tool stamps into the manifest. */
export interface ReleaseManifestIdentity {
  /** Commit SHA from `git rev-parse HEAD` (40-hex). */
  readonly commitSha: string;
  /** Environment label from argv/env flags (never ambient). */
  readonly environment: string;
}

/** A release manifest as produced by scripts/release/build-release-manifest.mjs. */
export interface ReleaseManifest {
  readonly manifestVersion: number;
  readonly schema_version: typeof RELEASE_MANIFEST_SCHEMA_VERSION;
  readonly generatedBy: string;
  readonly identity: ReleaseManifestIdentity;
  readonly fileCount: number;
  readonly files: readonly ReleaseManifestEntry[];
  /** Total sha256 over the canonical entry stream (64-hex). */
  readonly totalDigest: string;
}

// ---------------------------------------------------------------------------
// Verification (pure — digests arrive as inputs)
// ---------------------------------------------------------------------------

/** Raised when a release manifest fails the reproducible-build contract. */
export class ReproducibleBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReproducibleBuildError";
  }
}

export interface ManifestVerificationReport {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly checkedEntries: number;
}

/**
 * Verify the manifest's INTERNAL contract: schema version, sorted unique
 * POSIX paths, normalized modes, well-formed sha256 per entry, fileCount
 * consistency. Pure structural verification — tree-independent.
 */
export function checkReleaseManifestShape(
  manifest: unknown,
): ManifestVerificationReport {
  const problems: string[] = [];
  if (typeof manifest !== "object" || manifest === null) {
    return { ok: false, problems: ["manifest is not an object"], checkedEntries: 0 };
  }
  const m = manifest as Readonly<Record<string, unknown>>;
  if (m.schema_version !== RELEASE_MANIFEST_SCHEMA_VERSION) {
    problems.push(`schema_version must be "${RELEASE_MANIFEST_SCHEMA_VERSION}"`);
  }
  if (m.manifestVersion !== 1) {
    problems.push("manifestVersion must be 1");
  }
  if (typeof m.generatedBy !== "string" || m.generatedBy.length < 3) {
    problems.push("generatedBy must name the producing tool");
  }
  const identity = m.identity;
  if (typeof identity !== "object" || identity === null) {
    problems.push("identity block is required (commitSha + environment)");
  } else {
    const i = identity as Readonly<Record<string, unknown>>;
    if (typeof i.commitSha !== "string" || !/^[0-9a-f]{40}$/.test(i.commitSha)) {
      problems.push("identity.commitSha must be a 40-hex git object id");
    }
    if (typeof i.environment !== "string" || i.environment.length < 1) {
      problems.push("identity.environment must be a non-empty label");
    }
  }
  if (!Array.isArray(m.files)) {
    problems.push("files must be an array");
    return { ok: problems.length === 0, problems, checkedEntries: 0 };
  }
  const files = m.files as readonly Record<string, unknown>[];
  let previousPath = "";
  const seen = new Set<string>();
  for (const entry of files) {
    const path = entry.path;
    if (typeof path !== "string" || path.length === 0) {
      problems.push("entry path must be a non-empty string");
      continue;
    }
    if (path.includes("\\") || path.startsWith("./") || path.startsWith("/")) {
      problems.push(`entry path '${path}' is not canonical POSIX-relative`);
    }
    if (seen.has(path)) {
      problems.push(`duplicate entry path '${path}'`);
    }
    seen.add(path);
    if (previousPath !== "" && path.localeCompare(previousPath, "en") <= 0) {
      problems.push(`entries are not in R1 sorted order at '${path}'`);
    }
    previousPath = path;
    if (entry.mode !== "0755" && entry.mode !== "0644") {
      problems.push(`entry '${path}' mode is not R2-normalized`);
    }
    if (typeof entry.sha256 !== "string" || !SHA256_HEX_PATTERN.test(entry.sha256)) {
      problems.push(`entry '${path}' sha256 is not 64-hex`);
    }
    if (typeof entry.bytes !== "number" || !Number.isInteger(entry.bytes) || entry.bytes < 0) {
      problems.push(`entry '${path}' bytes must be a non-negative integer`);
    }
  }
  if (m.fileCount !== files.length) {
    problems.push(
      `fileCount ${String(m.fileCount)} does not match entries ${String(files.length)}`,
    );
  }
  if (typeof m.totalDigest !== "string" || !SHA256_HEX_PATTERN.test(m.totalDigest)) {
    problems.push("totalDigest must be 64-hex sha256");
  }
  return { ok: problems.length === 0, problems, checkedEntries: files.length };
}

/**
 * The canonical entry stream a total digest is computed over (the exact
 * concatenation the release tool hashes — declared here so verification
 * and production share ONE law).
 */
export function canonicalManifestStream(
  entries: readonly ReleaseManifestEntry[],
): string {
  return entries
    .slice()
    .sort((left, right) => left.path.localeCompare(right.path, "en"))
    .map((entry) => `${entry.path}\t${entry.mode}\t${entry.sha256}\t${String(entry.bytes)}\n`)
    .join("");
}

/**
 * Verify a TREE OBSERVATION against a manifest: the observed entries
 * (paths + modes + digests + sizes, produced by the tool or a checker)
 * must equal the manifest's entries exactly — same set, same digests.
 * Differences are reported per class (missing, extra, modified).
 */
export function verifyTreeAgainstManifest(
  manifest: ReleaseManifest,
  observed: readonly ReleaseManifestEntry[],
): ManifestVerificationReport {
  const problems: string[] = [];
  const byPath = new Map(observed.map((entry) => [entry.path, entry]));
  const manifestPaths = new Set(manifest.files.map((entry) => entry.path));

  for (const entry of manifest.files) {
    const actual = byPath.get(entry.path);
    if (actual === undefined) {
      problems.push(`missing from tree: ${entry.path}`);
      continue;
    }
    if (actual.sha256 !== entry.sha256) {
      problems.push(
        `modified: ${entry.path} (manifest ${entry.sha256}, tree ${actual.sha256})`,
      );
    }
    if (actual.mode !== entry.mode) {
      problems.push(`mode drift: ${entry.path} (${entry.mode} -> ${actual.mode})`);
    }
    if (actual.bytes !== entry.bytes) {
      problems.push(`size drift: ${entry.path}`);
    }
  }
  for (const entry of observed) {
    if (!manifestPaths.has(entry.path)) {
      problems.push(`extra in tree: ${entry.path}`);
    }
  }
  return {
    ok: problems.length === 0,
    problems,
    checkedEntries: manifest.files.length,
  };
}

/**
 * Determinism proof over two manifest COMPUTATIONS: the same tree walked
 * twice must yield byte-identical entry streams (R1+R2 applied). The
 * tool's selftest calls this; the battery calls it with fixture streams.
 */
export function assertManifestStreamsIdentical(
  left: readonly ReleaseManifestEntry[],
  right: readonly ReleaseManifestEntry[],
  label = "manifest",
): void {
  const leftStream = canonicalManifestStream(left);
  const rightStream = canonicalManifestStream(right);
  if (leftStream !== rightStream) {
    throw new ReproducibleBuildError(
      `${label}: two walks of the same tree produced different streams — the reproducible-build contract is violated`,
    );
  }
}
