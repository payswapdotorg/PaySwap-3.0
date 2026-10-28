/**
 * @zcode/desktop — the payswap-desktop SESSION-MODEL wire types,
 * structurally re-declared for the renderer (P21-D Gap C, the
 * consoleConnectionsWire precedent; split for the ≤400-line file law).
 *
 * The host DTO lives in src/host/payswap/shell/session-model-catalog.ts
 * (not renderer-importable), so this mirror carries the pinned shape BY
 * VALUE — the established two-sided drift discipline
 * (test/payswap/desktop-console-client.test.ts asserts the MEMBER sets
 * cannot drift; the shape is pinned by structural mirroring).
 *
 * THE WIRE LAW (ADR-0014 D4): the entry carries model METADATA ONLY —
 * the substrate session settings' model availability (provider/model
 * ids, label, description, the reasoning levels + default) as the agent
 * protocol reported it. NO credentials, NO secret material, NO
 * authorization artifacts; an empty catalog is the honest no-models
 * truth, never a fabricated list.
 */

/** One available substrate model (mirrors the host SessionModelCatalogEntryDto). */
export interface PaySwapSessionModelCatalogEntryDto {
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
