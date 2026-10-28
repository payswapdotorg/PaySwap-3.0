/**
 * PaySwap Desktop (P21-D Gap C, ADR-0014 D4) — the SESSION-MODEL-CATALOG
 * derivation: the PURE 1:1 mapping of the substrate session settings'
 * REAL model availability (ZCodeSessionSettingsState.model.available,
 * fed by the agent protocol — the same state
 * packages/ui/src/lib/zcodeSessionProjection.ts projects for the native
 * composer) onto the wire DTO the desktop channel's sessionModelCatalog
 * member returns for the renderer's model-catalog composition root.
 *
 * THE LAWS (the chain-from-bridge.ts precedent):
 * - 1:1 AND HONEST: providerId from the model's ref.providerId, modelId
 *   from ref.modelId, the label, the description, the model's OWN
 *   reasoning-level values and its default level. An EMPTY available
 *   list stays EMPTY — never an invented model, never a substituted
 *   default (the ADR-0014 D4 law).
 * - THE DEFAULT-LEVEL GUARD (the zcodeSessionProjection.ts parity): the
 *   default level rides the DTO ONLY when it is among the model's own
 *   levels — a foreign default is omitted, never coerced into the
 *   vocabulary.
 * - THE WIRE LAW: the DTO carries model METADATA ONLY — no credentials,
 *   no secret material, no authorization artifacts. The substrate model
 *   option's fields are metadata by construction; this mapping never
 *   widens them (contextWindow/maxOutputTokens/properties stay
 *   substrate-owned — the app's CatalogModel consumes the four fields
 *   its controls read).
 * - DETERMINISTIC: same settings state in, value-equal list out.
 */

import type { ZCodeSessionSettingsState } from "@zcode/shared";

/**
 * One available model as the channel carries it (the wire DTO; the
 * renderer mirror is PaySwapSessionModelCatalogEntryDto in
 * src/renderer/src/consoleSessionModelWire.ts — drift-tested by the
 * member-set census, pinned by structural mirroring).
 */
export interface SessionModelCatalogEntryDto {
  /** The substrate provider id (e.g. "zai") — opaque here. */
  readonly providerId: string;
  /** The substrate model id (e.g. "glm-5.2") — opaque here. */
  readonly modelId: string;
  /** The model's own display name (the substrate label). */
  readonly label: string;
  /** The model's own description, when the substrate reports one. */
  readonly description?: string;
  /** The model's OWN reasoning-level values (the difficulty vocabulary). */
  readonly reasoningLevels: readonly string[];
  /** The model's default level — ONLY when it is among its own levels. */
  readonly defaultReasoningLevel?: string;
}

/**
 * Derive the session-model catalog from the substrate session settings
 * (PURE): settings.model.available mapped 1:1 onto the DTO list. An
 * empty available list derives the honest EMPTY list; a model without a
 * reasoning vocabulary carries an empty levels list (never an invented
 * tier); a default level outside the model's own levels is omitted.
 */
export function sessionModelCatalogFromSettings(
  settings: ZCodeSessionSettingsState,
): readonly SessionModelCatalogEntryDto[] {
  return settings.model.available.map((model) => {
    const reasoningLevels = (model.reasoning?.levels ?? []).map((level) => level.value);
    const defaultLevel = model.reasoning?.defaultLevel;
    const defaultReasoningLevel =
      defaultLevel !== undefined && reasoningLevels.includes(defaultLevel)
        ? defaultLevel
        : undefined;
    return {
      providerId: model.ref.providerId,
      modelId: model.ref.modelId,
      label: model.label,
      ...(model.description !== undefined ? { description: model.description } : {}),
      reasoningLevels,
      ...(defaultReasoningLevel !== undefined ? { defaultReasoningLevel } : {}),
    };
  });
}
