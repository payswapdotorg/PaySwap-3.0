/**
 * @payswap/economic — versioned economic inputs (P1-W1, net-new).
 *
 * The work-order law: "any quote or corridor details entering
 * goals/constraints are VERSIONED economic inputs (typed version envelope +
 * explicit content), never implicit ambient state".
 *
 * A VersionedEconomicInput is exactly that envelope:
 * - a CLOSED kind vocabulary (QUOTE, CORRIDOR, FX_RATE, MARKET_DATA, OTHER);
 * - a positive integer VERSION pinning the content's schema/semantics;
 * - an opaque sourceRef for observation lineage (quotes/corridor details are
 *   provider observations — carried explicitly, never ambient);
 * - the EXPLICIT content as CANONICAL JSON text (recursively sorted keys,
 *   byte-stable) — validated by a parse + re-serialize round-trip so the
 *   same logical content always has the same bytes, and digests of it are
 *   stable.
 *
 * Versioned economic inputs establish NO authorization and NO financial
 * finality, and they never expire silently: freshness/eligibility gating is
 * downstream (capability lane observations, policy lanes), never here.
 */

import { InvalidEconomicInputError } from "./errors.ts";
import { canonicalJsonStringify } from "./digest.ts";
import {
  LIMITS,
  deepFreeze,
  requireBoundedString,
  requireExactKeys,
  requireObject,
  requirePositiveSafeInteger,
  type Fail,
} from "./validate.ts";

const fail: Fail = (message: string) => new InvalidEconomicInputError(message);

/** Closed vocabulary of economic-input kinds. */
export const ECONOMIC_INPUT_KINDS = [
  "QUOTE",
  "CORRIDOR",
  "FX_RATE",
  "MARKET_DATA",
  "OTHER",
] as const;

/** The kind of a versioned economic input. */
export type EconomicInputKind = (typeof ECONOMIC_INPUT_KINDS)[number];

const ECONOMIC_INPUT_KEYS = ["content", "kind", "sourceRef", "version"] as const;

/** A typed, versioned, explicit economic input (quote/corridor detail) attached to a goal. */
export interface VersionedEconomicInput {
  /** The kind of economic input (closed vocabulary). */
  readonly kind: EconomicInputKind;
  /** The version of the input's schema/semantics (positive integer). */
  readonly version: number;
  /** Opaque observation-lineage reference (never authority). */
  readonly sourceRef: string;
  /** The explicit content as CANONICAL JSON text (sorted keys, byte-stable). */
  readonly content: string;
}

/** Fail-closed validation of one VersionedEconomicInput. */
export function validateEconomicInput(candidate: unknown): VersionedEconomicInput {
  const record = requireObject(candidate, "a VersionedEconomicInput", fail);
  requireExactKeys(record, ECONOMIC_INPUT_KEYS, "VersionedEconomicInput", fail);
  const kind = record["kind"];
  if (typeof kind !== "string" || !(ECONOMIC_INPUT_KINDS as readonly string[]).includes(kind)) {
    throw new InvalidEconomicInputError(
      `VersionedEconomicInput.kind must be one of [${ECONOMIC_INPUT_KINDS.join(", ")}] (got: ${String(kind)})`,
    );
  }
  const version = requirePositiveSafeInteger(
    record["version"],
    "VersionedEconomicInput.version",
    fail,
  );
  const sourceRef = requireBoundedString(
    record["sourceRef"],
    "VersionedEconomicInput.sourceRef",
    LIMITS.refMaxLength,
    fail,
  );
  const content = requireBoundedString(
    record["content"],
    "VersionedEconomicInput.content",
    LIMITS.contentMaxLength,
    fail,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new InvalidEconomicInputError(
      "VersionedEconomicInput.content must be valid JSON text",
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InvalidEconomicInputError(
      "VersionedEconomicInput.content must be a JSON OBJECT (explicit content, not a bare scalar or array)",
    );
  }
  let reserialized: string;
  try {
    reserialized = canonicalJsonStringify(parsed);
  } catch {
    throw new InvalidEconomicInputError(
      "VersionedEconomicInput.content must be JSON-shaped (canonicalizable)",
    );
  }
  if (reserialized !== content) {
    throw new InvalidEconomicInputError(
      "VersionedEconomicInput.content must be CANONICAL JSON (recursively sorted keys, no whitespace variance) — ambient or non-canonical content is rejected",
    );
  }
  const input: VersionedEconomicInput = {
    kind: kind as EconomicInputKind,
    version,
    sourceRef,
    content,
  };
  return deepFreeze(input);
}

/**
 * Fail-closed validation of a goal's economic-input list: bounded, each
 * entry valid, no exact duplicates (same kind+version+sourceRef+content
 * twice is an input error, never silently deduplicated).
 */
export function validateEconomicInputs(
  candidate: unknown,
): readonly VersionedEconomicInput[] {
  if (!Array.isArray(candidate)) {
    throw new InvalidEconomicInputError("EconomicGoal.economicInputs must be an array");
  }
  if (candidate.length > LIMITS.maxEconomicInputs) {
    throw new InvalidEconomicInputError(
      `EconomicGoal.economicInputs must carry at most ${LIMITS.maxEconomicInputs} entries`,
    );
  }
  const inputs = candidate.map((entry, index) => {
    try {
      return validateEconomicInput(entry);
    } catch (error) {
      if (error instanceof Error) {
        throw new InvalidEconomicInputError(
          `EconomicGoal.economicInputs[${index}]: ${error.message}`,
        );
      }
      throw error;
    }
  });
  const seen = new Set<string>();
  for (const input of inputs) {
    const key = `${input.kind}\u0000${input.version}\u0000${input.sourceRef}\u0000${input.content}`;
    if (seen.has(key)) {
      throw new InvalidEconomicInputError(
        "EconomicGoal.economicInputs must not contain exact duplicates",
      );
    }
    seen.add(key);
  }
  return deepFreeze(inputs);
}

/** Deterministic canonical sort key for a versioned economic input (permutation invariance). */
export function economicInputSortKey(input: VersionedEconomicInput): string {
  return `${input.kind}\u0000${input.version}\u0000${input.sourceRef}\u0000${input.content}`;
}
