/**
 * @payswap/merchant — the PINNED WIRE SHAPES of the provider-state
 * envelope (P5-W3, lane R3-W3; commit 1/4 — the type-level pins).
 *
 * LAYER LAW: zero sibling imports (the v1 leaf-in-flight law). Every
 * mirror below names its AUTHORITY — the provider-state envelope
 * contract (old packages/connectors provider-state @ 8a735bf; INV-14
 * on the 3.0 side). Raw provider state is preserved VERBATIM (never
 * flattened into a generic status) wherever it is needed for action,
 * reconciliation and audit; the merchant Stripe-connection observations
 * record their raw state inside this envelope shape.
 *
 * Pins in this module (authority: the provider-state envelope):
 * - PinnedProviderStateEnvelope (SUBSET: provider/object/revision/
 *   state/classification/timestamps/provenance; history, failure and
 *   metadata are owned by the envelope authority)
 * - PinnedProviderStateClassification + the pinned classification
 *   families and lifecycle-step vocabulary used by Stripe connection
 *   observations
 * - PINNED_ENVELOPE_PROVENANCE_SOURCES (byte-identical)
 */

// ---------------------------------------------------------------------------
// The envelope (authority: the provider-state contract)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: the provider-state envelope's classification
 * `family` vocabulary members this package pins (the connector rails'
 * observed families; the full vocabulary is owned by the envelope
 * authority — these are the members the Stripe connection observations
 * use, byte-identical where they appear in the old rails mapping).
 */
export const PINNED_ENVELOPE_CLASSIFICATION_FAMILIES = Object.freeze([
  "connected_account",
  "customer_action_required",
  "async_processing",
  "capture",
  "other",
] as const);

/** STRUCTURAL PIN — authority: the envelope `ProviderStateClassification`. */
export interface PinnedProviderStateClassification {
  readonly family: string;
  readonly lifecycleStep: string;
  readonly isTerminal: boolean;
  readonly requiresCustomerAction: boolean;
}

/**
 * VALUE PIN — authority: the provider-state envelope's provenance
 * `source` vocabulary (byte-identical members).
 */
export const PINNED_ENVELOPE_PROVENANCE_SOURCES = Object.freeze([
  "PROVIDER_API",
  "PROVIDER_WEBHOOK",
  "OPERATOR",
] as const);

/**
 * STRUCTURAL PIN — authority: the provider-state envelope
 * `ProviderStateEnvelope` (SUBSET: the provider/object/revision/state/
 * classification/timestamps/provenance surface the merchant connection
 * observations need; history, actionRequired, failure, privacy and
 * metadata members are owned by the envelope authority and stay opaque
 * here). `state` is the RAW provider-native state — opaque passthrough,
 * never flattened (INV-14).
 */
export interface PinnedProviderStateEnvelope {
  readonly provider: {
    readonly name: string;
    readonly version: string;
  };
  readonly object: {
    readonly objectType: string;
    readonly externalId: string;
  };
  readonly revision: string;
  /** Raw provider-native state. Opaque passthrough; never flattened. */
  readonly state: unknown;
  readonly classification: PinnedProviderStateClassification;
  readonly timestamps: {
    readonly observedAt: string;
  };
  readonly provenance: {
    readonly source: (typeof PINNED_ENVELOPE_PROVENANCE_SOURCES)[number];
  };
}

/**
 * The pinned SHAPE LAW of an envelope (pure predicate): provider name +
 * object type + external id + revision are non-empty strings, the
 * classification carries its four members and the provenance source is
 * a declared member. The fail-closed constructor lives in
 * src/settlement-config.ts.
 */
export function pinnedProviderStateEnvelopeIsShaped(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<PinnedProviderStateEnvelope>;
  if (
    typeof record.provider?.name !== "string" ||
    record.provider.name.length === 0 ||
    typeof record.provider.version !== "string" ||
    record.provider.version.length === 0
  ) {
    return false;
  }
  if (
    typeof record.object?.objectType !== "string" ||
    record.object.objectType.length === 0 ||
    typeof record.object.externalId !== "string" ||
    record.object.externalId.length === 0
  ) {
    return false;
  }
  if (typeof record.revision !== "string" || record.revision.length === 0) {
    return false;
  }
  const classification = record.classification;
  if (
    classification === null ||
    typeof classification !== "object" ||
    typeof classification.family !== "string" ||
    typeof classification.lifecycleStep !== "string" ||
    typeof classification.isTerminal !== "boolean" ||
    typeof classification.requiresCustomerAction !== "boolean"
  ) {
    return false;
  }
  if (typeof record.timestamps?.observedAt !== "string" || record.timestamps.observedAt.length === 0) {
    return false;
  }
  const source = record.provenance?.source;
  return (
    typeof source === "string" &&
    (PINNED_ENVELOPE_PROVENANCE_SOURCES as readonly string[]).includes(source)
  );
}
