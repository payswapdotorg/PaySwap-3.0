/**
 * @payswap/economic — the EconomicProgram (P1-W1, net-new).
 *
 * Old-repo concept reference (spec text only, no implementation):
 * payswap.org@8a735bf spec/architecture/DOMAIN-MODEL.md §intent lists
 * EconomicProgram beside EconomicGoal; WORK-OPERATING-PLANE.md records
 * "EconomicProgram and WorkProgram can reference each other" and
 * "a complex human request can compile into a Work Program"; the TL
 * handoff records the lineage chain EconomicGoal -> EconomicProgram ->
 * MoneyMovementIntent. Authored net-new under PaySwap 3.0:
 *
 * An EconomicProgram is a RECURRING and/or PARAMETERIZED goal envelope:
 * - `goalTemplate`: ONE fully-valid EconomicGoal serving as the template;
 * - `recurrence` (optional): a deterministic bounded rule — occurrences are
 *   derived by INTEGER arithmetic from a caller-supplied anchor (no ambient
 *   clock, no randomness); absent recurrence = a parameterized one-shot
 *   envelope that expands to exactly one goal;
 * - `parameters`: bounded name/value substitutions applied to the
 *   template's PROSE fields (objective, nonGoals) only — structured fields
 *   (amounts, refs, constraints) are never text-substituted (honest v1
 *   limitation, recorded in the evidence doc).
 *
 * Placeholder law (fail-closed): every `${name}` occurrence in the
 * template's objective/nonGoals must reference a declared parameter;
 * after substitution no `${` may remain. No escaping mechanism in v1.
 *
 * Expansion (`expandEconomicProgram`) is a PURE deterministic function:
 * same program -> byte-identical expanded goals. Each expanded occurrence
 * is re-validated fail-closed (e.g. substitution that would exceed the
 * objective length bound rejects the program, never silently truncates).
 */

import { InvalidEconomicProgramError } from "./errors.ts";
import { type EconomicGoal, validateEconomicGoal } from "./goal.ts";
import { sortedStrings } from "./digest.ts";
import {
  LIMITS,
  deepFreeze,
  requireBoundedString,
  requireExactKeys,
  requireObject,
  requirePositiveSafeInteger,
  requireSafeInteger,
  type Fail,
} from "./validate.ts";

const fail: Fail = (message: string) => new InvalidEconomicProgramError(message);

const PROGRAM_KEYS = ["goalTemplate", "parameters", "programId", "recurrence"] as const;
const RECURRENCE_KEYS = ["anchorAt", "intervalMs", "occurrenceWindowMs", "occurrences"] as const;
const PARAMETER_KEYS = ["name", "value"] as const;
const PARAMETER_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const PLACEHOLDER_PATTERN = /\$\{([^}]*)\}/g;

/** Deterministic bounded recurrence rule (all instants caller-supplied). */
export interface RecurrenceRule {
  /** Anchor instant (ms) of occurrence 0. */
  readonly anchorAt: number;
  /** Fixed interval between occurrence starts (ms, positive). */
  readonly intervalMs: number;
  /** Number of occurrences (integer in [1, 64] — bounded, never open-ended here). */
  readonly occurrences: number;
  /** Deadline window granted to each occurrence (ms, positive). */
  readonly occurrenceWindowMs: number;
}

/** One named parameter substitution applied to template prose fields. */
export interface ProgramParameter {
  /** Parameter name (letters/digits/underscore, starting with a letter, <= 64 chars). */
  readonly name: string;
  /** Substitution value (non-empty, bounded). */
  readonly value: string;
}

/** The EconomicProgram: a recurring/parameterized EconomicGoal envelope. ADVISORY DEMAND ONLY. */
export interface EconomicProgram {
  /** Deterministic program identity (e.g. `program:<...>`). */
  readonly programId: string;
  /** The goal template (a fully-valid EconomicGoal whose prose fields may carry `${name}` placeholders). */
  readonly goalTemplate: EconomicGoal;
  /** Optional recurrence rule (absent = parameterized one-shot envelope). */
  readonly recurrence?: RecurrenceRule;
  /** Parameter substitutions (bounded, unique names). */
  readonly parameters: readonly ProgramParameter[];
}

/** Fail-closed validation of a RecurrenceRule (bounded, safe-integer arithmetic). */
export function validateRecurrenceRule(candidate: unknown): RecurrenceRule {
  const record = requireObject(candidate, "a RecurrenceRule", fail);
  requireExactKeys(record, RECURRENCE_KEYS, "RecurrenceRule", fail);
  const anchorAt = requireSafeInteger(record["anchorAt"], "RecurrenceRule.anchorAt", fail);
  const intervalMs = requirePositiveSafeInteger(
    record["intervalMs"],
    "RecurrenceRule.intervalMs",
    fail,
  );
  const rawOccurrences = record["occurrences"];
  if (
    typeof rawOccurrences !== "number" ||
    !Number.isSafeInteger(rawOccurrences) ||
    rawOccurrences < 1 ||
    rawOccurrences > LIMITS.maxOccurrences
  ) {
    throw new InvalidEconomicProgramError(
      `RecurrenceRule.occurrences must be an integer in [1, ${LIMITS.maxOccurrences}] — an unbounded program is never accepted`,
    );
  }
  const occurrenceWindowMs = requirePositiveSafeInteger(
    record["occurrenceWindowMs"],
    "RecurrenceRule.occurrenceWindowMs",
    fail,
  );
  const rule: RecurrenceRule = { anchorAt, intervalMs, occurrences: rawOccurrences, occurrenceWindowMs };
  // Fail-closed arithmetic safety: every derived occurrence instant and
  // deadline must stay a safe integer (deterministic, no clamping).
  const lastStart = rule.anchorAt + (rule.occurrences - 1) * rule.intervalMs;
  if (!Number.isSafeInteger(lastStart) || !Number.isSafeInteger(lastStart + rule.occurrenceWindowMs)) {
    throw new InvalidEconomicProgramError(
      "RecurrenceRule derives instants outside the safe-integer range — the rule is rejected, never clamped",
    );
  }
  if (anchorAt < 0) {
    throw new InvalidEconomicProgramError("RecurrenceRule.anchorAt must be a non-negative instant");
  }
  return deepFreeze(rule);
}

/** Fail-closed validation of the parameter list (bounded, unique names, bounded values). */
function validateParameters(candidate: unknown): readonly ProgramParameter[] {
  if (candidate === undefined || !Array.isArray(candidate)) {
    throw new InvalidEconomicProgramError(
      "EconomicProgram.parameters must be an array (possibly empty)",
    );
  }
  if (candidate.length > LIMITS.maxParameters) {
    throw new InvalidEconomicProgramError(
      `EconomicProgram.parameters must carry at most ${LIMITS.maxParameters} entries`,
    );
  }
  const parameters = candidate.map((entry, index) => {
    const record = requireObject(entry, `EconomicProgram.parameters[${index}]`, fail);
    requireExactKeys(record, PARAMETER_KEYS, `EconomicProgram.parameters[${index}]`, fail);
    const name = requireBoundedString(
      record["name"],
      `EconomicProgram.parameters[${index}].name`,
      64,
      fail,
    );
    if (!PARAMETER_NAME_PATTERN.test(name)) {
      throw new InvalidEconomicProgramError(
        `EconomicProgram.parameters[${index}].name '${name}' must match /^[A-Za-z][A-Za-z0-9_]{0,63}$/`,
      );
    }
    const value = requireBoundedString(
      record["value"],
      `EconomicProgram.parameters[${index}].value`,
      LIMITS.parameterValueMaxLength,
      fail,
    );
    return deepFreeze({ name, value });
  });
  const seen = new Set<string>();
  for (const parameter of parameters) {
    if (seen.has(parameter.name)) {
      throw new InvalidEconomicProgramError(
        `EconomicProgram.parameters must not contain duplicate names ('${parameter.name}')`,
      );
    }
    seen.add(parameter.name);
  }
  return deepFreeze(parameters);
}

/** Applies parameter substitution to one prose field (deterministic, single pass, sorted parameter order). */
function substitute(text: string, parameters: readonly ProgramParameter[], field: string): string {
  const sorted = [...parameters].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  let result = text;
  for (const parameter of sorted) {
    result = result.split(`\${${parameter.name}}`).join(parameter.value);
  }
  if (/\$\{/.test(result)) {
    throw new InvalidEconomicProgramError(
      `${field} still contains an unresolved '\${' placeholder after substitution — undeclared placeholders are rejected, never guessed`,
    );
  }
  return result;
}

/** Fails closed when the template's prose references an undeclared placeholder. */
function requireKnownPlaceholders(goal: EconomicGoal, parameters: readonly ProgramParameter[]): void {
  const declared = new Set(parameters.map((parameter) => parameter.name));
  const prose: readonly string[] = [goal.objective, ...goal.nonGoals];
  for (const text of prose) {
    for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
      const name = match[1];
      if (name === undefined || !declared.has(name)) {
        throw new InvalidEconomicProgramError(
          `EconomicProgram.goalTemplate references undeclared parameter '${match[0]}' — every placeholder must be declared`,
        );
      }
    }
  }
}

/**
 * Fail-closed structural validation of an EconomicProgram: the embedded
 * goal template must itself be a valid EconomicGoal, parameters and
 * recurrence must satisfy their laws, and every placeholder must be
 * declared. Returns a frozen program.
 */
export function validateEconomicProgram(candidate: unknown): EconomicProgram {
  const record = requireObject(candidate, "an EconomicProgram", fail);
  const hasRecurrence = "recurrence" in record && record["recurrence"] !== undefined;
  requireExactKeys(
    record,
    hasRecurrence ? PROGRAM_KEYS : PROGRAM_KEYS.filter((k) => k !== "recurrence"),
    "EconomicProgram",
    fail,
  );
  const programId = requireBoundedString(
    record["programId"],
    "EconomicProgram.programId",
    LIMITS.refMaxLength,
    fail,
  );
  let goalTemplate: EconomicGoal;
  try {
    goalTemplate = validateEconomicGoal(record["goalTemplate"]);
  } catch (error) {
    if (error instanceof Error) {
      throw new InvalidEconomicProgramError(`EconomicProgram.goalTemplate: ${error.message}`);
    }
    throw error;
  }
  const recurrence = hasRecurrence ? validateRecurrenceRule(record["recurrence"]) : undefined;
  const parameters = validateParameters(record["parameters"]);
  requireKnownPlaceholders(goalTemplate, parameters);
  const program: EconomicProgram = hasRecurrence
    ? {
        programId,
        goalTemplate,
        recurrence: recurrence as RecurrenceRule,
        parameters,
      }
    : { programId, goalTemplate, parameters };
  return deepFreeze(program);
}

/**
 * Deterministic program expansion: returns the concrete EconomicGoal
 * occurrences of the program, in occurrence order. Pure function of the
 * program — same program -> byte-identical goals. Every expanded goal is
 * re-validated fail-closed (a substitution that would break any goal law
 * rejects the whole expansion, never silently repairs).
 */
export function expandEconomicProgram(candidate: unknown): readonly EconomicGoal[] {
  const program = validateEconomicProgram(candidate);
  const occurrences =
    program.recurrence === undefined ? 1 : program.recurrence.occurrences;
  const expanded: EconomicGoal[] = [];
  for (let index = 0; index < occurrences; index += 1) {
    const template = program.goalTemplate;
    const declaredAt =
      program.recurrence === undefined
        ? template.timeBounds.declaredAt
        : program.recurrence.anchorAt + index * program.recurrence.intervalMs;
    const deadlineAt =
      program.recurrence === undefined
        ? template.timeBounds.deadlineAt
        : declaredAt + program.recurrence.occurrenceWindowMs;
    const occurrence: EconomicGoal = deepFreeze({
      ...template,
      goalId: `${program.programId}:goal:${index}`,
      objective: substitute(template.objective, program.parameters, "objective"),
      nonGoals: template.nonGoals.map((nonGoal) =>
        substitute(nonGoal, program.parameters, "nonGoals"),
      ),
      timeBounds: { declaredAt, deadlineAt },
    });
    try {
      expanded.push(validateEconomicGoal(occurrence));
    } catch (error) {
      if (error instanceof Error) {
        throw new InvalidEconomicProgramError(
          `EconomicProgram expansion occurrence ${index} is invalid: ${error.message}`,
        );
      }
      throw error;
    }
  }
  return deepFreeze(expanded);
}

/** Deterministic canonical order helper for tests (sorted non-goal copies). */
export function canonicalNonGoals(goal: EconomicGoal): readonly string[] {
  return sortedStrings([...goal.nonGoals]);
}
