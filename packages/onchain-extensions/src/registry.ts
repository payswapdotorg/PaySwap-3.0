/**
 * @payswap/onchain-extensions — the declarative pack registry + composition
 * (Work Order P5-W2, lane R3-W2; ADAPT of the capability-lane registry
 * pattern: checks run BEFORE insertion so a rejected registration leaves
 * NO partial state; registration order is preserved; lookups are
 * fail-closed; the registry NEVER fabricates a pack).
 *
 * Family composition (the declarative law):
 * - sub-packs are REFERENCES (exact versioned pack ids), resolved by the
 *   registry — never embedded, never implicit;
 * - every referenced sub-pack must be registered BEFORE the composer (the
 *   capability-lane chain rule, applied to composition);
 * - the composer's family must allow the sub-pack's family
 *   (PACK_FAMILY_COMPOSITION — the frozen compatibility law);
 * - resolveComposition() projects the resolved tree; flattenPackTree()
 *   walks parent-first; neither executes anything.
 */

import { parsePackId } from './addressing.ts';
import { PackConflictError, PackNotFoundError } from './errors.ts';
import { validateOnchainExtensionPack } from './validation/core.ts';
import type { OnchainExtensionPack } from './wire/core.ts';
import { composableFamilies } from './wire/family-semantics.ts';
import type { PackFamily } from './wire/families.ts';

/** The resolved composition tree of a registered pack. */
export interface ResolvedPackComposition {
  readonly pack: OnchainExtensionPack;
  readonly subPacks: readonly ResolvedPackComposition[];
}

/** The declarative pack registry (deterministic, order-preserving). */
export class OnchainExtensionPackRegistry {
  /** Insertion-ordered map keyed by canonical packId. */
  readonly #packs = new Map<string, OnchainExtensionPack>();

  /**
   * Registers a pack. Validates it (fail closed), rejects duplicate pack
   * ids, and enforces the composition laws: every sub-pack reference must
   * resolve to an ALREADY-REGISTERED pack, and the composer's family must
   * allow each sub-pack's family. Checks run before insertion — a rejected
   * registration leaves no partial state.
   */
  register(candidate: unknown): OnchainExtensionPack {
    const pack = validateOnchainExtensionPack(candidate);
    if (this.#packs.has(pack.packId)) {
      throw new PackConflictError(
        `pack '${pack.packId}' is already registered — pack ids are unique per version`,
      );
    }
    for (const [index, ref] of pack.subPacks.entries()) {
      const subPack = this.#packs.get(ref.packId);
      if (subPack === undefined) {
        throw new PackConflictError(
          `subPacks[${index}] references '${ref.packId}' which is not registered — register sub-packs BEFORE the composer (the registry never fabricates a pack)`,
        );
      }
      const allowed = composableFamilies(pack.family);
      if (!(allowed as readonly unknown[]).includes(subPack.family)) {
        throw new PackConflictError(
          `subPacks[${index}] family '${subPack.family}' is not composable into family '${pack.family}' (allowed: [${allowed.join(', ')}])`,
        );
      }
    }
    this.#packs.set(pack.packId, pack);
    return pack;
  }

  /** Fail-closed lookup: throws PackNotFoundError on unknown ids. */
  require(packId: string): OnchainExtensionPack {
    const pack = this.#packs.get(packId);
    if (pack === undefined) {
      throw new PackNotFoundError(`no pack registered under '${packId}'`);
    }
    return pack;
  }

  /** Optional lookup: undefined when absent (never a fabrication). */
  pack(packId: string): OnchainExtensionPack | undefined {
    return this.#packs.get(packId);
  }

  has(packId: string): boolean {
    return this.#packs.has(packId);
  }

  /** Every registered pack, in registration order. */
  packs(): readonly OnchainExtensionPack[] {
    return [...this.#packs.values()];
  }

  /** Every registered pack of one family, in registration order. */
  packsForFamily(family: PackFamily): readonly OnchainExtensionPack[] {
    return this.packs().filter((pack) => pack.family === family);
  }

  /** Number of registered packs. */
  get size(): number {
    return this.#packs.size;
  }
}

/**
 * Projects the resolved composition tree of a registered pack. Total over
 * registered packs (registration enforces sub-pack resolvability); the
 * root is resolved by fail-closed lookup.
 */
export function resolveComposition(
  registry: OnchainExtensionPackRegistry,
  packId: string,
): ResolvedPackComposition {
  const pack = registry.require(packId);
  return {
    pack,
    subPacks: pack.subPacks.map((ref) => resolveComposition(registry, ref.packId)),
  };
}

/**
 * Flattens a resolved composition parent-first (the composer precedes its
 * sub-packs; deterministic depth-first order).
 */
export function flattenPackTree(
  composition: ResolvedPackComposition,
): readonly OnchainExtensionPack[] {
  const flattened: OnchainExtensionPack[] = [composition.pack];
  for (const sub of composition.subPacks) {
    flattened.push(...flattenPackTree(sub));
  }
  return flattened;
}

/**
 * Depth-first search for a sub-pack by id within a resolved composition
 * (the root itself matches). undefined when absent — never a fabrication.
 */
export function findSubPack(
  composition: ResolvedPackComposition,
  packId: string,
): OnchainExtensionPack | undefined {
  if (composition.pack.packId === packId) {
    return composition.pack;
  }
  for (const sub of composition.subPacks) {
    const found = findSubPack(sub, packId);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** The family of a canonical pack id, via the fail-closed parser. */
export function familyOfPackId(packId: string): PackFamily {
  return parsePackId(packId).family;
}
