/**
 * Bridge implementation: skills validators (P3-W3).
 *
 * Validators for the pinned skill contracts: discovery roots, metadata
 * (scope/source vocabularies, frontmatter keys), and the Skill tool's
 * structured output.
 */

import { IssueCollector } from "../errors.ts";
import {
  cloneAndFreeze,
  isBoolean,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
  isStringArray,
} from "../shared.ts";
import { SKILL_SCOPES, SKILL_SOURCES } from "../wire/skills.ts";
import type {
  SkillMetadataWire,
  SkillRootWire,
  SkillStructuredOutputWire,
} from "../wire/skills.ts";

/** Structural guard: skill scope. */
export function isSkillScope(candidate: unknown): candidate is SkillMetadataWire["scope"] {
  return typeof candidate === "string" && SKILL_SCOPES.includes(candidate as SkillMetadataWire["scope"]);
}

/** Structural guard: skill source. */
export function isSkillSource(candidate: unknown): candidate is SkillMetadataWire["source"] {
  return typeof candidate === "string" && SKILL_SOURCES.includes(candidate as SkillMetadataWire["source"]);
}

/** Construct and freeze a validated SkillRootWire (path/scope/source/priority). */
export function skillRoot(input: unknown): SkillRootWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid skill root: must be an object");
  }
  issues.requireNonEmptyString("path", input.path);
  if (!isSkillScope(input.scope)) {
    issues.add("scope", `must be one of: ${SKILL_SCOPES.join(", ")}`);
  }
  if (!isSkillSource(input.source)) {
    issues.add("source", `must be one of: ${SKILL_SOURCES.join(", ")}`);
  }
  issues.requireNonNegativeInteger("priority", input.priority);
  if (input.pluginId !== undefined) {
    issues.requireNonEmptyString("pluginId", input.pluginId, "must be a non-empty string when present");
  }
  issues.throwIfAny("skill root");
  const record = input as unknown as SkillRootWire;
  return Object.freeze({
    path: record.path,
    scope: record.scope,
    source: record.source,
    priority: record.priority,
    ...(record.pluginId !== undefined ? { pluginId: record.pluginId } : {}),
  });
}

/**
 * Construct and freeze a validated SkillMetadataWire: non-empty name and
 * description, path fields, scope/source from the pinned vocabularies,
 * safeToAutoLoad boolean, string frontmatter keys, optional policy with the
 * implicit-invocation flag.
 */
export function skillMetadata(input: unknown): SkillMetadataWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid skill metadata: must be an object");
  }
  issues.requireNonEmptyString("name", input.name);
  issues.requireNonEmptyString("description", input.description);
  if (input.whenToUse !== undefined) {
    issues.requireNonEmptyString("whenToUse", input.whenToUse, "must be a non-empty string when present");
  }
  if (input.pluginName !== undefined) {
    issues.requireNonEmptyString("pluginName", input.pluginName, "must be a non-empty string when present");
  }
  if (input.pluginId !== undefined) {
    issues.requireNonEmptyString("pluginId", input.pluginId, "must be a non-empty string when present");
  }
  if (input.qualifiedName !== undefined) {
    issues.requireNonEmptyString("qualifiedName", input.qualifiedName, "must be a non-empty string when present");
  }
  issues.requireNonEmptyString("path", input.path);
  issues.requireNonEmptyString("directory", input.directory);
  issues.requireNonEmptyString("rootPath", input.rootPath);
  if (!isSkillScope(input.scope)) {
    issues.add("scope", `must be one of: ${SKILL_SCOPES.join(", ")}`);
  }
  if (!isSkillSource(input.source)) {
    issues.add("source", `must be one of: ${SKILL_SOURCES.join(", ")}`);
  }
  issues.requireBoolean("safeToAutoLoad", input.safeToAutoLoad);
  if (!isStringArray(input.frontmatterKeys)) {
    issues.add("frontmatterKeys", "must be a string array");
  }
  if (input.policy !== undefined) {
    if (!isRecord(input.policy)) {
      issues.add("policy", "must be an object when present");
    } else if (input.policy.allowImplicitInvocation !== undefined) {
      issues.requireBoolean(
        "policy.allowImplicitInvocation",
        input.policy.allowImplicitInvocation,
      );
    }
  }
  issues.throwIfAny("skill metadata");
  const record = input as unknown as SkillMetadataWire;
  return Object.freeze({
    name: record.name,
    description: record.description,
    ...(record.whenToUse !== undefined ? { whenToUse: record.whenToUse } : {}),
    ...(record.pluginName !== undefined ? { pluginName: record.pluginName } : {}),
    ...(record.pluginId !== undefined ? { pluginId: record.pluginId } : {}),
    ...(record.qualifiedName !== undefined ? { qualifiedName: record.qualifiedName } : {}),
    path: record.path,
    directory: record.directory,
    rootPath: record.rootPath,
    scope: record.scope,
    source: record.source,
    safeToAutoLoad: record.safeToAutoLoad,
    frontmatterKeys: Object.freeze([...record.frontmatterKeys]),
    ...(record.policy !== undefined
      ? { policy: Object.freeze({ ...record.policy }) }
      : {}),
  });
}

/**
 * Construct and freeze the Skill tool's structured output (pin of
 * SkillStructuredOutput): non-empty name and content, base directory,
 * truncated flag.
 */
export function skillStructuredOutput(input: unknown): SkillStructuredOutputWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid skill structured output: must be an object");
  }
  issues.requireNonEmptyString("name", input.name);
  issues.requireNonEmptyString("content", input.content);
  issues.requireNonEmptyString("baseDirectory", input.baseDirectory);
  issues.requireBoolean("truncated", input.truncated);
  issues.throwIfAny("skill structured output");
  const record = input as unknown as SkillStructuredOutputWire;
  return cloneAndFreeze(record);
}
