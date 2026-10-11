/**
 * @payswap/provider-runtime — event payload object-state extraction (P2-W2).
 *
 * Split from events.ts for the <=400-line file law. The extractor maps a
 * provider event payload onto the object-state observation it carries so
 * the ingestor can retain it in the raw-state store. Real provider
 * adapters plug their own provider-shaped extractor; the naive reference
 * handles only the two documented shapes and never guesses beyond them
 * (fail-open to `undefined`, which records the event WITHOUT object state).
 */

/** Extracts the object-state observation an event payload carries. */
export interface ProviderEventObjectExtractor {
  extract(payload: unknown):
    | {
        readonly objectType: string;
        readonly externalId: string;
        readonly revision: string;
        readonly state: unknown;
      }
    | undefined;
}

type Extracted = ReturnType<ProviderEventObjectExtractor['extract']>;

function candidateObject(obj: unknown): Extracted {
  if (obj === null || typeof obj !== 'object') return undefined;
  const record = obj as Record<string, unknown>;
  if (
    typeof record.objectType === 'string' &&
    typeof record.externalId === 'string' &&
    typeof record.revision === 'string' &&
    'state' in record
  ) {
    return {
      objectType: record.objectType,
      externalId: record.externalId,
      revision: record.revision,
      state: record.state,
    };
  }
  return undefined;
}

/**
 * The naive reference extractor: handles payloads shaped
 * `{ objectType, externalId, revision, state }` (root) or the nested
 * `{ object: { objectType, externalId, revision, state } }` form.
 */
export const naiveEventObjectExtractor: ProviderEventObjectExtractor = Object.freeze({
  extract(payload: unknown): Extracted {
    const direct = candidateObject(payload);
    if (direct !== undefined) return direct;
    if (payload !== null && typeof payload === 'object') {
      const nested = (payload as Record<string, unknown>).object;
      return candidateObject(nested);
    }
    return undefined;
  },
});
