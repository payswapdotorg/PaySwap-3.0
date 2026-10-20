#!/usr/bin/env node
/**
 * PaySwap 3.0 — release manifest builder (P8-W3, lane p8-w3).
 *
 * NET-NEW substrate tooling (scripts/ is tooling — node builtins allowed;
 * packages/operations owns the CONTRACT this tool implements, see
 * src/reproducible-build.ts).
 *
 * Walks the repo tree and produces a deterministic JSON release manifest:
 * a sorted POSIX file list with per-file sha256, normalized modes, a
 * total digest, and the identity record (commit SHA from
 * `git rev-parse HEAD`, environment label from argv/env flags).
 *
 * THE CONTRACT (pinned to scripts/deterministic-tar-archive.mjs @ this
 * package's base — R1..R7, declared as data in
 * packages/operations/src/reproducible-build.ts):
 *   R1  depth-first walk, children visited in localeCompare(child, "en")
 *       sorted order; POSIX relative paths;
 *   R2  mode normalization: 0755 when any execute bit is set, else 0644;
 *   R3  no ambient metadata: no timestamps, hostnames, usernames or
 *       absolute paths anywhere in the manifest;
 *   R4  symlinks recorded as link entries (path + target), never
 *       followed, never hashed as content;
 *   R5  fail-closed walk: any entry that is not a regular file,
 *       directory or symlink THROWS;
 *   R6  repo-scale ignore set (exactly): VCS metadata (.git) and
 *       installed dependencies (node_modules) — the cleanliness a staged
 *       source tree always has; nothing else is ignored. The tool's own
 *       output file is excluded when written inside the walked tree;
 *   R7  determinism: two runs over the same tree with the same flags
 *       produce BYTE-IDENTICAL manifests.
 *
 * The total digest is the sha256 over the canonical entry stream:
 *   one line per file  `${path}\t${mode}\t${sha256}\t${bytes}\n` (sorted)
 *   then one line per symlink `${path}\tlink\t${linkName}\n` (sorted)
 * (the file stream is exactly canonicalManifestStream() from
 * packages/operations/src/reproducible-build.ts).
 *
 * Modes:
 *   node build-release-manifest.mjs [--env <label>] [--root <dir>] [--out <file>]
 *   node build-release-manifest.mjs --verify <manifest-file> [--root <dir>]
 *   node build-release-manifest.mjs --selftest
 *
 * Exit codes: 0 success/verified/selftest-passed; 1 verification or
 * selftest failure; 2 usage error.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const TOOL_PATH = "scripts/release/build-release-manifest.mjs";
const SCHEMA_VERSION = "1.0";
const IGNORED_DIR_NAMES = new Set([".git", "node_modules"]);

// ---------------------------------------------------------------------------
// The walk (R1/R2/R4/R5/R6)
// ---------------------------------------------------------------------------

function toPosix(p) {
  return p.split(sep).join("/");
}

/**
 * Depth-first deterministic walk. Children are visited in
 * localeCompare(child, "en") order (R1). `.git` and `node_modules`
 * directories are ignored (R6). `excluded` is a set of ABSOLUTE paths to
 * skip (the tool's own output file). Anything that is not a regular
 * file, directory or symlink throws (R5).
 */
function collectEntries(root, excluded) {
  const files = [];
  const symlinks = [];

  function visit(currentPath, relativePath) {
    const stat = lstatSync(currentPath);
    if (stat.isDirectory()) {
      const name = toPosix(relativePath);
      if (relativePath !== "" && IGNORED_DIR_NAMES.has(name.split("/").pop())) {
        return; // R6
      }
      const children = readdirSync(currentPath)
        .slice()
        .sort((left, right) => left.localeCompare(right, "en"));
      for (const child of children) {
        visit(
          join(currentPath, child),
          relativePath === "" ? child : `${relativePath}/${child}`,
        );
      }
      return;
    }
    if (stat.isSymbolicLink()) {
      symlinks.push({
        path: toPosix(relativePath),
        linkName: readlinkSync(currentPath).split(sep).join("/"),
      });
      return;
    }
    if (!stat.isFile()) {
      throw new Error(
        `Unsupported release-manifest entry: ${currentPath} (R5 fail-closed walk)`,
      );
    }
    if (excluded.has(resolve(currentPath))) {
      return; // the tool's own output file (R6 note)
    }
    files.push({
      path: toPosix(relativePath),
      mode: stat.mode & 0o111 ? "0755" : "0644", // R2
      sha256: sha256Bytes(readFileSync(currentPath)),
      bytes: stat.size,
    });
  }

  visit(root, "");
  files.sort((left, right) => left.path.localeCompare(right.path, "en"));
  symlinks.sort((left, right) => left.path.localeCompare(right.path, "en"));
  return { files, symlinks };
}

function sha256Bytes(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

// ---------------------------------------------------------------------------
// The manifest (R3/R7)
// ---------------------------------------------------------------------------

function canonicalEntryStream(files, symlinks) {
  let stream = "";
  for (const entry of files) {
    stream += `${entry.path}\t${entry.mode}\t${entry.sha256}\t${String(entry.bytes)}\n`;
  }
  for (const link of symlinks) {
    stream += `${link.path}\tlink\t${link.linkName}\n`;
  }
  return stream;
}

function buildManifest(root, excluded, identity) {
  const { files, symlinks } = collectEntries(root, excluded);
  const totalDigest = sha256Bytes(
    Buffer.from(canonicalEntryStream(files, symlinks), "utf8"),
  );
  // Fixed key order (insertion order) — byte-deterministic serialization.
  return {
    manifestVersion: 1,
    schema_version: SCHEMA_VERSION,
    generatedBy: TOOL_PATH,
    identity: {
      commitSha: identity.commitSha,
      environment: identity.environment,
    },
    fileCount: files.length,
    files,
    symlinkCount: symlinks.length,
    symlinks,
    totalDigest,
  };
}

function manifestToBytes(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function gitCommitSha(root) {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .toLowerCase();
}

function gitRepoRoot(fromDir) {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: fromDir,
    encoding: "utf8",
  })
    .trim();
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

function verifyTree(root, manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const excluded = new Set([resolve(manifestPath)]);
  const { files, symlinks } = collectEntries(root, excluded);
  const problems = [];

  const byPath = new Map(files.map((entry) => [entry.path, entry]));
  for (const entry of manifest.files ?? []) {
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
  const manifestPaths = new Set((manifest.files ?? []).map((entry) => entry.path));
  for (const entry of files) {
    if (!manifestPaths.has(entry.path)) {
      problems.push(`extra in tree: ${entry.path}`);
    }
  }
  const manifestLinks = new Map(
    (manifest.symlinks ?? []).map((link) => [link.path, link.linkName]),
  );
  for (const link of symlinks) {
    if (!manifestLinks.has(link.path)) {
      problems.push(`extra symlink in tree: ${link.path}`);
    } else if (manifestLinks.get(link.path) !== link.linkName) {
      problems.push(`symlink target drift: ${link.path}`);
    }
  }
  for (const [path] of manifestLinks) {
    if (!symlinks.some((link) => link.path === path)) {
      problems.push(`missing symlink from tree: ${path}`);
    }
  }
  const recomputedTotal = sha256Bytes(
    Buffer.from(canonicalEntryStream(files, symlinks), "utf8"),
  );
  if (manifest.totalDigest !== recomputedTotal) {
    problems.push(
      `totalDigest mismatch (manifest ${String(manifest.totalDigest)}, tree ${recomputedTotal})`,
    );
  }
  return { ok: problems.length === 0, problems, fileCount: files.length };
}

// ---------------------------------------------------------------------------
// Selftest (determinism + verification checks over a synthetic tree)
// ---------------------------------------------------------------------------

function selftest() {
  const tmp = mkdtempSync(join(tmpdir(), "payswap-release-manifest-"));
  let failures = 0;
  const check = (label, ok) => {
    if (!ok) {
      failures += 1;
    }
    console.log(`[${ok ? "PASS" : "FAIL"}] ${label}`);
  };
  try {
    const identity = { commitSha: "0".repeat(40), environment: "selftest" };

    // Build a synthetic tree (deliberately created OUT of sorted order).
    mkdirSync(join(tmp, "beta"));
    mkdirSync(join(tmp, "alpha", "nested"), { recursive: true });
    writeFileSync(join(tmp, "beta", "two.txt"), "content-two\n");
    writeFileSync(join(tmp, "alpha", "one.md"), "# one\n");
    writeFileSync(join(tmp, "alpha", "nested", "deep.json"), '{"k":1}\n');
    writeFileSync(join(tmp, "zzz.txt"), "zzz\n");
    chmodSync(join(tmp, "beta", "two.txt"), 0o755);
    // node_modules must be ignored (R6).
    mkdirSync(join(tmp, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(tmp, "node_modules", "pkg", "index.js"), "ignored\n");

    // (1) two runs over the same tree -> byte-identical (R7).
    const first = manifestToBytes(buildManifest(tmp, new Set(), identity));
    const second = manifestToBytes(buildManifest(tmp, new Set(), identity));
    check("determinism: two runs byte-identical", first === second);

    // (2) creation order does not matter (R1 sorted entries).
    const parsed = JSON.parse(first);
    const paths = parsed.files.map((entry) => entry.path);
    const sorted = paths.slice().sort((a, b) => a.localeCompare(b, "en"));
    check("R1: entries sorted", JSON.stringify(paths) === JSON.stringify(sorted));
    check(
      "R6: node_modules ignored",
      !paths.some((path) => path.includes("node_modules")),
    );
    check(
      "R2: exec bit normalized to 0755",
      parsed.files.find((entry) => entry.path === "beta/two.txt").mode === "0755",
    );

    // (3) --out inside the tree is self-excluded and deterministic.
    const outPath = join(tmp, "release-manifest.json");
    const withOut = manifestToBytes(
      buildManifest(tmp, new Set([resolve(outPath)]), identity),
    );
    writeFileSync(outPath, withOut);
    const withOut2 = manifestToBytes(
      buildManifest(tmp, new Set([resolve(outPath)]), identity),
    );
    check("R6/R7: output file self-excluded + deterministic", withOut === withOut2);
    check(
      "self-exclusion: manifest not in its own file list",
      !JSON.parse(withOut).files.some((entry) => entry.path === "release-manifest.json"),
    );

    // (4) verification passes on the pristine tree.
    let verdict = verifyTree(tmp, outPath);
    check("verify: pristine tree passes", verdict.ok);

    // (5) tampering a file fails verification.
    writeFileSync(join(tmp, "alpha", "one.md"), "# tampered\n");
    verdict = verifyTree(tmp, outPath);
    check(
      "verify: tampered file detected",
      !verdict.ok && verdict.problems.some((p) => p.startsWith("modified:")),
    );
    writeFileSync(join(tmp, "alpha", "one.md"), "# one\n");

    // (6) an extra file fails verification.
    writeFileSync(join(tmp, "unlisted.txt"), "extra\n");
    verdict = verifyTree(tmp, outPath);
    check(
      "verify: extra file detected",
      !verdict.ok && verdict.problems.some((p) => p.startsWith("extra in tree:")),
    );
    rmSync(join(tmp, "unlisted.txt"));

    // (7) mode drift fails verification.
    chmodSync(join(tmp, "zzz.txt"), 0o755);
    verdict = verifyTree(tmp, outPath);
    check(
      "verify: mode drift detected",
      !verdict.ok && verdict.problems.some((p) => p.startsWith("mode drift:")),
    );
    chmodSync(join(tmp, "zzz.txt"), 0o644);

    // (8) final re-verify green.
    verdict = verifyTree(tmp, outPath);
    check("verify: restored tree passes", verdict.ok);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  if (failures > 0) {
    console.error(`selftest: ${String(failures)} check(s) FAILED`);
    process.exitCode = 1;
  } else {
    console.log("selftest: ALL CHECKS PASSED");
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usageError(message) {
  console.error(`build-release-manifest: ${message}`);
  console.error(
    "usage: node build-release-manifest.mjs [--env <label>] [--root <dir>] [--out <file>]\n" +
      "       node build-release-manifest.mjs --verify <manifest-file> [--root <dir>]\n" +
      "       node build-release-manifest.mjs --selftest",
  );
  process.exit(2);
}

function main(argv) {
  let env = process.env.PAYSWAP_RELEASE_ENV ?? "unspecified";
  let root = undefined;
  let out = undefined;
  let verifyPath = undefined;
  let selftestMode = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--selftest") {
      selftestMode = true;
    } else if (arg === "--env") {
      env = argv[i + 1];
      if (env === undefined) usageError("--env requires a label");
      i += 1;
    } else if (arg === "--root") {
      root = argv[i + 1];
      if (root === undefined) usageError("--root requires a directory");
      i += 1;
    } else if (arg === "--out") {
      out = argv[i + 1];
      if (out === undefined) usageError("--out requires a file");
      i += 1;
    } else if (arg === "--verify") {
      verifyPath = argv[i + 1];
      if (verifyPath === undefined) usageError("--verify requires a manifest file");
      i += 1;
    } else {
      usageError(`unknown argument '${String(arg)}'`);
    }
  }

  if (selftestMode) {
    selftest();
    return;
  }

  const anchor = root !== undefined ? resolve(root) : resolve(".");
  let repoRoot;
  try {
    repoRoot = gitRepoRoot(anchor);
  } catch {
    usageError("not a git work tree (the identity record requires git)");
  }
  const walkRoot = root !== undefined ? resolve(root) : repoRoot;
  const commitSha = gitCommitSha(repoRoot);

  if (verifyPath !== undefined) {
    const report = verifyTree(walkRoot, resolve(verifyPath));
    if (report.ok) {
      console.log(
        `verify: PASS (${String(report.fileCount)} files match the manifest)`,
      );
    } else {
      console.error("verify: FAIL");
      for (const problem of report.problems) {
        console.error(`  - ${problem}`);
      }
      process.exitCode = 1;
    }
    return;
  }

  const excluded = new Set();
  if (out !== undefined) {
    const resolvedOut = resolve(out);
    if (resolvedOut.startsWith(resolve(walkRoot))) {
      excluded.add(resolvedOut);
    }
  }
  const manifest = buildManifest(walkRoot, excluded, {
    commitSha,
    environment: env,
  });
  const bytes = manifestToBytes(manifest);
  if (out !== undefined) {
    writeFileSync(out, bytes);
    console.error(
      `${TOOL_PATH}: wrote ${String(manifest.fileCount)} files to ${out} (totalDigest ${manifest.totalDigest})`,
    );
  } else {
    process.stdout.write(bytes);
  }
}

main(process.argv.slice(2));
