/**
 * Pinned wire shapes: skills (P3-W3).
 *
 * PIN of apps/zcode-cli/packages/contracts/src/skills/index.ts (the
 * SkillScope/SkillSource/SkillRoot/SkillMetadata contracts and the 13-code
 * diagnostic vocabulary) and apps/zcode-cli/packages/contracts/src/tools/
 * skill.ts (the Skill tool's structured output). Skills are reusable local
 * instruction packs — product-neutral platform mechanics per the migration
 * map (plugins/skills: KEEP).
 */

/** Skill scopes (pin of SkillScope). */
export type SkillScopeWire = "project" | "user" | "system" | "admin";

/** The frozen skill-scope vocabulary. */
export const SKILL_SCOPES: readonly SkillScopeWire[] = Object.freeze([
  "project",
  "user",
  "system",
  "admin",
]);

/** Skill sources (pin of SkillSource). */
export type SkillSourceWire =
  | "agents"
  | "zcode"
  | "bundled"
  | "plugin"
  | "remote";

/** The frozen skill-source vocabulary. */
export const SKILL_SOURCES: readonly SkillSourceWire[] = Object.freeze([
  "agents",
  "zcode",
  "bundled",
  "plugin",
  "remote",
]);

/** Skill discovery roots (pin of SkillRoot). */
export interface SkillRootWire {
  readonly path: string;
  readonly scope: SkillScopeWire;
  readonly source: SkillSourceWire;
  readonly priority: number;
  readonly pluginId?: string;
}

/** Skill invocation policy (pin of SkillPolicy). */
export interface SkillPolicyWire {
  readonly allowImplicitInvocation?: boolean;
}

/**
 * Skill metadata (pin of SkillMetadata): the descriptive identity of a
 * discovered skill.
 */
export interface SkillMetadataWire {
  readonly name: string;
  readonly description: string;
  readonly whenToUse?: string;
  readonly pluginName?: string;
  readonly pluginId?: string;
  readonly qualifiedName?: string;
  readonly path: string;
  readonly directory: string;
  readonly rootPath: string;
  readonly scope: SkillScopeWire;
  readonly source: SkillSourceWire;
  readonly safeToAutoLoad: boolean;
  readonly frontmatterKeys: readonly string[];
  readonly policy?: SkillPolicyWire;
}

/**
 * Skill diagnostic codes (pin of SkillDiagnosticCode — all 13, frozen in
 * substrate declaration order).
 */
export const SKILL_DIAGNOSTIC_CODES: readonly string[] = Object.freeze([
  "skill_root_not_found",
  "skill_scan_failed",
  "skill_read_failed",
  "skill_missing_frontmatter",
  "skill_invalid_frontmatter",
  "skill_missing_name",
  "skill_invalid_name",
  "skill_missing_description",
  "skill_description_too_long",
  "skill_unknown_frontmatter",
  "skill_duplicate_name",
  "skill_too_large",
  "skill_not_found",
]);

/** Skill diagnostic severities (pin of SkillDiagnosticSeverity). */
export type SkillDiagnosticSeverityWire = "warning" | "error";

/** The frozen severity vocabulary. */
export const SKILL_DIAGNOSTIC_SEVERITIES: readonly SkillDiagnosticSeverityWire[] =
  Object.freeze(["warning", "error"]);

/** A skill diagnostic (pin of SkillDiagnostic). */
export interface SkillDiagnosticWire {
  readonly code: string;
  readonly severity: SkillDiagnosticSeverityWire;
  readonly message: string;
  readonly path?: string;
  readonly skillName?: string;
}

/** A discovery load outcome (pin of SkillLoadOutcome). */
export interface SkillLoadOutcomeWire {
  readonly skills: readonly SkillMetadataWire[];
  readonly diagnostics: readonly SkillDiagnosticWire[];
  readonly totalDiscovered: number;
}

/**
 * The Skill tool's structured output (pin of SkillStructuredOutput in
 * contracts/src/tools/skill.ts).
 */
export interface SkillStructuredOutputWire {
  readonly name: string;
  readonly content: string;
  readonly baseDirectory: string;
  readonly truncated: boolean;
}
