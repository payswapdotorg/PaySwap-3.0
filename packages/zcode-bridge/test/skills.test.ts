/**
 * Skills surface tests (P3-W3).
 */

import { describe, expect, it } from "vitest";

import {
  SKILL_DIAGNOSTIC_CODES,
  SKILL_SCOPES,
  SKILL_SOURCES,
  isSkillScope,
  isSkillSource,
  skillMetadata,
  skillRoot,
  skillStructuredOutput,
} from "../src/index.ts";

const VALID_METADATA = {
  name: "dynamic-workflows",
  description: "Authoring contract for dynamic workflows",
  path: "/skills/dynamic-workflows/SKILL.md",
  directory: "/skills/dynamic-workflows",
  rootPath: "/skills",
  scope: "user",
  source: "bundled",
  safeToAutoLoad: true,
  frontmatterKeys: ["name", "description", "when_to_use"],
};

describe("skills surface", () => {
  it("pins the scope and source vocabularies", () => {
    expect([...SKILL_SCOPES]).toEqual(["project", "user", "system", "admin"]);
    expect([...SKILL_SOURCES]).toEqual([
      "agents",
      "zcode",
      "bundled",
      "plugin",
      "remote",
    ]);
    expect(Object.isFrozen(SKILL_SCOPES)).toBe(true);
    expect(Object.isFrozen(SKILL_SOURCES)).toBe(true);
  });

  it("pins all 13 diagnostic codes in substrate declaration order", () => {
    expect(SKILL_DIAGNOSTIC_CODES.length).toBe(13);
    expect(SKILL_DIAGNOSTIC_CODES[0]).toBe("skill_root_not_found");
    expect(SKILL_DIAGNOSTIC_CODES[12]).toBe("skill_not_found");
    expect(SKILL_DIAGNOSTIC_CODES).toContain("skill_duplicate_name");
    expect(Object.isFrozen(SKILL_DIAGNOSTIC_CODES)).toBe(true);
  });

  it("guards recognize scopes and sources", () => {
    expect(isSkillScope("admin")).toBe(true);
    expect(isSkillScope("global")).toBe(false);
    expect(isSkillSource("plugin")).toBe(true);
    expect(isSkillSource("marketplace")).toBe(false);
  });

  it("constructs and freezes a valid skill root", () => {
    const root = skillRoot({
      path: "/root",
      scope: "project",
      source: "agents",
      priority: 1,
      pluginId: "org.plugin",
    });
    expect(Object.isFrozen(root)).toBe(true);
    expect(root.pluginId).toBe("org.plugin");
  });

  it("skill root rejects bad vocabulary and negative priorities", () => {
    expect(() =>
      skillRoot({ path: "/r", scope: "everywhere" as never, source: "zcode", priority: 0 }),
    ).toThrowError(/scope/);
    expect(() =>
      skillRoot({ path: "/r", scope: "user", source: "nowhere" as never, priority: 0 }),
    ).toThrowError(/source/);
    expect(() =>
      skillRoot({ path: "/r", scope: "user", source: "zcode", priority: -1 }),
    ).toThrowError(/priority/);
  });

  it("constructs and freezes valid skill metadata with optional members", () => {
    const metadata = skillMetadata({
      ...VALID_METADATA,
      whenToUse: "when authoring workflows",
      qualifiedName: "plugin:dynamic-workflows",
      pluginName: "plugin",
      policy: { allowImplicitInvocation: false },
    });
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(metadata.policy?.allowImplicitInvocation).toBe(false);
    expect(metadata.frontmatterKeys.length).toBe(3);
  });

  it("metadata rejects empty names, bad scopes and non-string frontmatter keys", () => {
    expect(() => skillMetadata({ ...VALID_METADATA, name: "" })).toThrowError(/name/);
    expect(() =>
      skillMetadata({ ...VALID_METADATA, scope: "cloud" as never }),
    ).toThrowError(/scope/);
    expect(() =>
      skillMetadata({ ...VALID_METADATA, frontmatterKeys: [1] as never }),
    ).toThrowError(/frontmatterKeys/);
    expect(() =>
      skillMetadata({ ...VALID_METADATA, safeToAutoLoad: "yes" as never }),
    ).toThrowError(/safeToAutoLoad/);
  });

  it("constructs and freezes the Skill tool structured output", () => {
    const output = skillStructuredOutput({
      name: "dynamic-workflows",
      content: "skill body",
      baseDirectory: "/skills/dynamic-workflows",
      truncated: false,
    });
    expect(Object.isFrozen(output)).toBe(true);
    expect(output.truncated).toBe(false);
    expect(() =>
      skillStructuredOutput({ name: "", content: "x", baseDirectory: "y", truncated: true }),
    ).toThrowError(/name/);
  });
});
