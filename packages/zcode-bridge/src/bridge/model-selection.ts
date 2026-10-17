/**
 * Bridge implementation: model selection (P3-W3).
 *
 * The substrate's strict ModelSelection law, the "$" reasoning separator,
 * and the canonical picker-value formatting/parsing rules — reproduced as
 * pure functions (the substrate pins trim-then-non-empty; the bridge keeps
 * the identical normalization).
 */

import { IssueCollector } from "../errors.ts";
import { isNonEmptyString, isRecord } from "../shared.ts";
import {
  MODEL_PROVIDER_SEPARATOR,
  MODEL_REASONING_SEPARATOR,
} from "../wire/model-selection.ts";
import type { ModelSelectionWire } from "../wire/model-selection.ts";

/** Structural guard: a valid ModelSelectionWire. */
export function isModelSelection(candidate: unknown): candidate is ModelSelectionWire {
  if (!isRecord(candidate)) return false;
  if (!isNonEmptyString(candidate.providerId)) return false;
  if (!isNonEmptyString(candidate.modelId)) return false;
  if (candidate.options !== undefined) {
    const options = candidate.options;
    if (!isRecord(options)) return false;
    const keys = Object.keys(options);
    if (keys.length > 1) return false;
    if (keys.length === 1 && keys[0] !== "reasoningLevel") return false;
    if (
      options.reasoningLevel !== undefined &&
      !isNonEmptyString(options.reasoningLevel)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Construct and freeze a validated ModelSelectionWire (pin of the strict
 * schema): providerId and modelId are trimmed and must be non-empty
 * afterwards; the optional options bag may carry ONLY a non-empty
 * reasoningLevel. Extra keys are rejected (strict).
 */
export function modelSelection(input: unknown): ModelSelectionWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid model selection: must be an object");
  }
  const providerId =
    typeof input.providerId === "string" ? input.providerId.trim() : input.providerId;
  const modelId =
    typeof input.modelId === "string" ? input.modelId.trim() : input.modelId;
  issues.requireNonEmptyString("providerId", providerId);
  issues.requireNonEmptyString("modelId", modelId);
  let reasoningLevel: string | undefined;
  if (input.options !== undefined) {
    const options = input.options;
    if (!isRecord(options)) {
      issues.add("options", "must be an object when present");
    } else {
      const presentKeys = Object.keys(options);
      if (
        presentKeys.length > 1 ||
        (presentKeys.length === 1 && presentKeys[0] !== "reasoningLevel")
      ) {
        issues.add("options", "may carry only 'reasoningLevel' (strict)");
      }
      if (options.reasoningLevel !== undefined) {
        const level =
          typeof options.reasoningLevel === "string"
            ? options.reasoningLevel.trim()
            : options.reasoningLevel;
        issues.requireNonEmptyString("options.reasoningLevel", level);
        if (isNonEmptyString(level)) {
          reasoningLevel = level;
        }
      }
    }
  }
  issues.throwIfAny("model selection");
  // After throwIfAny: providerId/modelId/reasoningLevel are validated
  // non-empty strings (the trims above produced them).
  return Object.freeze({
    providerId: providerId as string,
    modelId: modelId as string,
    ...(reasoningLevel !== undefined
      ? { options: Object.freeze({ reasoningLevel }) }
      : {}),
  });
}

/**
 * Format the canonical picker value (pin of formatModelPickerValue):
 * `providerId/modelId` plus `$reasoningLevel` when a level is present.
 * This is a DISPLAY boundary form, not a reversible serialization — the
 * domain form IS ModelSelectionWire.
 */
export function formatModelSelection(selection: ModelSelectionWire): string {
  const base = `${selection.providerId}${MODEL_PROVIDER_SEPARATOR}${selection.modelId}`;
  const reasoningLevel = selection.options?.reasoningLevel;
  return reasoningLevel === undefined
    ? base
    : `${base}${MODEL_REASONING_SEPARATOR}${reasoningLevel}`;
}

/**
 * Parse a picker value back into a validated ModelSelectionWire (pin of
 * parseModelPickerValue): the first "/" splits provider from model; the
 * first "$" inside the model part splits the reasoning level; boundary
 * positions (leading/trailing separators) reject the level form. Throws a
 * plain Error when the provider is missing.
 */
export function parseModelSelection(value: string): ModelSelectionWire {
  if (!isNonEmptyString(value)) {
    throw new Error("parseModelSelection: must be a non-empty string");
  }
  const normalized = value.trim();
  const providerSeparatorIndex = normalized.indexOf(MODEL_PROVIDER_SEPARATOR);
  if (providerSeparatorIndex <= 0) {
    throw new Error(
      `parseModelSelection: model selection is missing the provider: ${normalized}`,
    );
  }
  const providerId = normalized.slice(0, providerSeparatorIndex);
  const rawModelId = normalized.slice(providerSeparatorIndex + 1);
  const reasoningSeparatorIndex = rawModelId.indexOf(MODEL_REASONING_SEPARATOR);
  if (
    reasoningSeparatorIndex <= 0 ||
    reasoningSeparatorIndex >= rawModelId.length - 1
  ) {
    return modelSelection({ providerId, modelId: rawModelId });
  }
  return modelSelection({
    providerId,
    modelId: rawModelId.slice(0, reasoningSeparatorIndex),
    options: { reasoningLevel: rawModelId.slice(reasoningSeparatorIndex + 1) },
  });
}
