import { describe, expect, it } from "vitest";
import {
  amendOrganization,
  contentDigest,
  isReleased,
  nextOrganizationVersion,
  releaseOrganization,
} from "../src/index.ts";
import { makeOrgDraft, makeReleasedOrg } from "./fixtures.ts";

/**
 * NET-NEW (P3-W1): organizations as VERSIONED GRAPHS (FROZEN §7). Version
 * chains are explicit (derivedFrom lineage to the prior version's frozen
 * content hash), history is preserved (earlier versions stay immutable),
 * and execution pins the exact version + hash.
 */

const T0 = 5_000_000;

describe("nextOrganizationVersion — explicit version lineage", () => {
  it("derives version N+1 from a released version with derivedFrom lineage", () => {
    const v1 = makeReleasedOrg();
    const draftV2 = nextOrganizationVersion(v1);
    expect(draftV2.version).toBe(2);
    expect(draftV2.derivedFrom).toEqual({ version: 1, contentHash: v1.release.contentHash });
    expect(isReleased(draftV2)).toBe(false);
    // the graph content is carried (bodies/instances/edges), the release is not
    expect(draftV2.instances).toEqual(v1.instances);
    expect(draftV2.communicationEdges).toEqual(v1.communicationEdges);
  });

  it("the released source is never mutated by deriving a new version", () => {
    const v1 = makeReleasedOrg();
    nextOrganizationVersion(v1);
    expect(v1.version).toBe(1);
    expect(isReleased(v1)).toBe(true);
  });

  it("releasing the derived version freezes a DIFFERENT content hash (the chain advances)", () => {
    const v1 = makeReleasedOrg();
    const v2 = releaseOrganization(nextOrganizationVersion(v1), T0);
    expect(v2.version).toBe(2);
    expect(v2.derivedFrom?.contentHash).toBe(v1.release.contentHash);
    expect(v2.release.contentHash).not.toBe(v1.release.contentHash);
  });

  it("an amended derived version diverges from the unamended derivation", () => {
    const v1 = makeReleasedOrg();
    const plain = nextOrganizationVersion(v1);
    const amended = amendOrganization(plain, (draft) => ({
      ...draft,
      communicationEdges: [
        ...draft.communicationEdges,
        { fromInstanceId: "instance-reviewer", toInstanceId: "instance-payer", channel: "a2a" },
      ],
    }));
    expect(contentDigest(amended)).not.toBe(contentDigest(plain));
    expect(amended.communicationEdges).toHaveLength(2);
    // the plain derivation is untouched
    expect(plain.communicationEdges).toHaveLength(1);
  });

  it("multi-version chains carry unbroken lineage (v1 <- v2 <- v3)", () => {
    const v1 = makeReleasedOrg();
    const v2 = releaseOrganization(nextOrganizationVersion(v1), T0 + 1);
    const v3 = releaseOrganization(nextOrganizationVersion(v2), T0 + 2);
    expect(v3.derivedFrom).toEqual({ version: 2, contentHash: v2.release.contentHash });
    expect(v2.derivedFrom).toEqual({ version: 1, contentHash: v1.release.contentHash });
    // every historical version remains immutable and released
    for (const version of [v1, v2]) {
      expect(isReleased(version)).toBe(true);
      expect(() => {
        (version as { id: string }).id = "org:mutated";
      }).toThrow(TypeError);
    }
  });

  it("the version law rejects a derivation lineage that does not point backwards", () => {
    const v2 = releaseOrganization(nextOrganizationVersion(makeReleasedOrg()), T0);
    // forging a v3 that derives from v2 but claims version 1 fails validation
    const forged = { ...nextOrganizationVersion(v2), version: 1 };
    expect(() => releaseOrganization(forged as never, T0 + 1)).toThrow(/strictly less than/);
  });

  it("graph edits between versions are real versioned-graph evolution (add an instance + edges)", () => {
    const v1 = makeReleasedOrg();
    const draftV2 = amendOrganization(nextOrganizationVersion(v1), (draft) => ({
      ...draft,
      instances: [
        ...draft.instances,
        {
          id: "instance-auditor",
          bodyRef: { id: "body:payer", version: 2 },
          principal: { agentKeyFingerprint: "agent-key-3", ownerRef: "user:owner-1" },
          runtimeState: { status: "IDLE" },
        },
      ],
      communicationEdges: [
        ...draft.communicationEdges,
        { fromInstanceId: "instance-reviewer", toInstanceId: "instance-auditor", channel: "a2a" },
      ],
    }));
    const v2 = releaseOrganization(draftV2, T0);
    expect(v2.instances.map((instance) => instance.id)).toEqual([
      "instance-payer",
      "instance-reviewer",
      "instance-auditor",
    ]);
    expect(v1.instances).toHaveLength(2); // history preserved
    expect(makeOrgDraft().id).toBe("org:payops-1");
  });
});
