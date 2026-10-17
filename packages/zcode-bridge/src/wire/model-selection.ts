/**
 * Pinned wire shapes: model and provider selection (P3-W3).
 *
 * PIN of packages/shared/src/model-selection.ts (the strict ModelSelection
 * schema, the "$" reasoning separator, and the picker-value formatting and
 * parsing rules) and packages/provider/src/registry.ts (the provider
 * registry validation vocabulary — a descriptive projection: the bridge
 * validates SELECTION SHAPE, never provider credentials).
 *
 * Migration map: model/provider selection is KEEP (product-neutral platform
 * mechanics).
 */

/** The reasoning-level separator in canonical picker form (pin). */
export const MODEL_REASONING_SEPARATOR = "$" as const;

/** The provider/model separator in canonical picker form (pin). */
export const MODEL_PROVIDER_SEPARATOR = "/" as const;

/**
 * A model selection (pin of the modelSelectionSchema: strict, trimmed,
 * non-empty providerId + modelId, optional strict options bag carrying only
 * reasoningLevel).
 */
export interface ModelSelectionWire {
  readonly providerId: string;
  readonly modelId: string;
  readonly options?: { readonly reasoningLevel?: string };
}

/** Selection validation outcome kinds (pin of ModelSelectionValidation shapes). */
export type ModelSelectionValidationKindWire =
  | "ok"
  | "provider-not-found"
  | "model-not-found"
  | "reasoning-level-missing"
  | "reasoning-level-not-supported";

/** The frozen selection validation vocabulary. */
export const MODEL_SELECTION_VALIDATION_KINDS: readonly ModelSelectionValidationKindWire[] =
  Object.freeze([
    "ok",
    "provider-not-found",
    "model-not-found",
    "reasoning-level-missing",
    "reasoning-level-not-supported",
  ]);

/** Effective-selection issue kinds (pin of EffectiveModelSelectionResult.selectionIssue). */
export type ModelSelectionIssueWire =
  | "selection-missing"
  | "account-connection-unavailable"
  | "provider-not-found"
  | "model-not-found"
  | "reasoning-level-missing"
  | "reasoning-level-not-supported";

/** The frozen effective-selection issue vocabulary. */
export const MODEL_SELECTION_ISSUES: readonly ModelSelectionIssueWire[] =
  Object.freeze([
    "selection-missing",
    "account-connection-unavailable",
    "provider-not-found",
    "model-not-found",
    "reasoning-level-missing",
    "reasoning-level-not-supported",
  ]);
