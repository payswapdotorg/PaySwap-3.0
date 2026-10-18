/**
 * @payswap/route-compiler — the neutral ExecutionVenue port (P5-W1).
 *
 * PORT of the old best-execution venue-port (MMI-19): on THIS branch the
 * extension lane (@payswap/onchain-extensions, P5-W2) ships venue packs
 * as DECLARATIVE data with NO executable methods ("execution belongs to
 * the best-execution (P5-W1) and adapters (P4-W3) lanes") — so THIS
 * package owns the venue port: the venue-NEUTRAL execution surface a
 * registered venue exposes to the engine.
 *
 * LAWS:
 * - venue-AGNOSTIC core: zero venue vocabulary in src (adversarially
 *   scanned; the metadata surface — package.json, tsconfig.json,
 *   vitest.config.ts — is scanned too, F-3);
 * - venues are OPAQUE registrations: descriptor + protocol binding +
 *   synchronous quote/health/write-planning methods; venue-specific
 *   shapes (router calldata, approvals, intent payloads) live in the
 *   venue pack, NEVER here (dependency direction venue -> core);
 * - the descriptor declares the incumbent baseline (INV-C08:
 *   nativeOptimization with benchmarkBaseline: true — never
 *   structurally disadvantaged);
 * - all port methods are SYNCHRONOUS (no I/O at the port surface; a real
 *   venue adapter materializes quotes from its own observation plane).
 */

import { ValidationError, VenueRegistryError } from "./errors.ts";
import { deepFreeze, requireBoundedString, requireObject, type Fail } from "./canonical.ts";
import {
  PINNED_SLIPPAGE_PROTECTION_MODELS,
  PINNED_SWAP_KINDS,
  isPinnedChainKey,
  isPinnedVenueKey,
  type PinnedAssetIdentity,
} from "./pins/onchain.ts";
import { validateAmountSpec, type AmountSpec } from "./amount.ts";
import type { VenueQuote, VenueQuoteOutcome } from "./quote.ts";
import type { HealthObservation } from "./quote-fees.ts";

const fail: Fail = (message: string) => new ValidationError(message);

/** The venue's declared provider-native optimization (the incumbent baseline, INV-C08). */
export interface VenueNativeOptimizationDeclaration {
  readonly optimizationKind: string;
  /** LITERAL true: a venue declaring an optimization declares it AS the baseline. */
  readonly benchmarkBaseline: true;
  readonly description: string;
}

/** The venue descriptor (identity + surface declaration). */
export interface VenueDescriptor {
  readonly venueId: string;
  readonly displayName: string;
  readonly chains: readonly string[];
  readonly swapKinds: readonly ("EXACT_INPUT" | "EXACT_OUTPUT")[];
  readonly quoteSemantics: "INDICATIVE" | "EXECUTABLE";
  readonly slippageProtection: "DECLARED_LIMIT" | "PROVIDER_DEFINED";
  readonly supportsSimulation: boolean;
  readonly nativeOptimization?: VenueNativeOptimizationDeclaration;
}

/** True iff a venue descriptor is structurally valid (fail-closed helper). */
export function validateVenueDescriptor(candidate: unknown): VenueDescriptor {
  const record = requireObject(candidate, "a VenueDescriptor", fail);
  const venueId = requireBoundedString(record["venueId"], "descriptor.venueId", 64, fail);
  if (!isPinnedVenueKey(venueId)) {
    throw fail("descriptor.venueId must match the pinned venue key pattern (an opaque id)");
  }
  const displayName = requireBoundedString(record["displayName"], "descriptor.displayName", 256, fail);
  const chains = record["chains"];
  if (!Array.isArray(chains) || chains.length === 0) {
    throw fail("descriptor.chains must be a non-empty array (a venue touches at least one chain)");
  }
  for (const chain of chains) {
    if (typeof chain !== "string" || !isPinnedChainKey(chain)) {
      throw fail("descriptor.chains entries must be canonical chain keys");
    }
  }
  const swapKinds = record["swapKinds"];
  if (!Array.isArray(swapKinds) || swapKinds.length === 0) {
    throw fail("descriptor.swapKinds must be a non-empty array");
  }
  for (const kind of swapKinds) {
    if (typeof kind !== "string" || !(PINNED_SWAP_KINDS as readonly unknown[]).includes(kind)) {
      throw fail("descriptor.swapKinds entries must be members of the pinned swap-kind vocabulary");
    }
  }
  const quoteSemantics = record["quoteSemantics"];
  if (quoteSemantics !== "INDICATIVE" && quoteSemantics !== "EXECUTABLE") {
    throw fail("descriptor.quoteSemantics must be INDICATIVE or EXECUTABLE");
  }
  const slippageProtection = record["slippageProtection"];
  if (
    typeof slippageProtection !== "string" ||
    !(PINNED_SLIPPAGE_PROTECTION_MODELS as readonly unknown[]).includes(slippageProtection)
  ) {
    throw fail("descriptor.slippageProtection must be a member of the pinned vocabulary");
  }
  const supportsSimulation = record["supportsSimulation"];
  if (typeof supportsSimulation !== "boolean") {
    throw fail("descriptor.supportsSimulation must be a boolean");
  }
  const nativeOptimization = record["nativeOptimization"];
  if (nativeOptimization !== undefined) {
    const optimizationRecord = requireObject(
      nativeOptimization,
      "descriptor.nativeOptimization",
      fail,
    );
    if (optimizationRecord["benchmarkBaseline"] !== true) {
      throw fail("descriptor.nativeOptimization.benchmarkBaseline must be true (INV-C08: a declared optimization IS the baseline)");
    }
  }
  return deepFreeze({
    venueId,
    displayName,
    chains: Object.freeze([...chains]) as readonly string[],
    swapKinds: Object.freeze([...swapKinds]) as readonly ("EXACT_INPUT" | "EXACT_OUTPUT")[],
    quoteSemantics,
    slippageProtection: slippageProtection as "DECLARED_LIMIT" | "PROVIDER_DEFINED",
    supportsSimulation,
    ...(nativeOptimization !== undefined ? { nativeOptimization } : {}),
  }) as VenueDescriptor;
}

/** The venue's protocol binding (which protocol capability realizes it). */
export interface VenueProtocolBinding {
  readonly protocolKey: string;
  readonly chainKey: string;
}

/** The neutral swap request (ONE request = ONE chain). */
export interface SwapRequest {
  readonly requestId: string;
  readonly chain: string;
  readonly inputAsset: PinnedAssetIdentity;
  readonly outputAsset: PinnedAssetIdentity;
  readonly swapKind: "EXACT_INPUT" | "EXACT_OUTPUT";
  readonly amount: AmountSpec;
}

/** Fail-closed validation of a swap request. */
export function validateSwapRequest(candidate: unknown): SwapRequest {
  const record = requireObject(candidate, "a SwapRequest", fail);
  const requestId = requireBoundedString(record["requestId"], "request.requestId", 256, fail);
  const chain = requireBoundedString(record["chain"], "request.chain", 256, fail);
  if (!isPinnedChainKey(chain)) {
    throw fail("request.chain must be a canonical chain key");
  }
  const inputAsset = validateAssetIdentity(record["inputAsset"], "request.inputAsset");
  const outputAsset = validateAssetIdentity(record["outputAsset"], "request.outputAsset");
  const swapKind = record["swapKind"];
  if (typeof swapKind !== "string" || !(PINNED_SWAP_KINDS as readonly unknown[]).includes(swapKind)) {
    throw fail("request.swapKind must be a member of the pinned swap-kind vocabulary");
  }
  const amount = validateAmountSpec(record["amount"], "request.amount");
  const expectedCurrency = swapKind === "EXACT_INPUT" ? inputAsset.symbol : outputAsset.symbol;
  if (amount.currency !== expectedCurrency) {
    throw fail(
      `request.amount must be denominated in the ${swapKind === "EXACT_INPUT" ? "input" : "output"} asset symbol ('${expectedCurrency}')`,
    );
  }
  return deepFreeze({
    requestId,
    chain,
    inputAsset,
    outputAsset,
    swapKind: swapKind as "EXACT_INPUT" | "EXACT_OUTPUT",
    amount,
  }) as SwapRequest;
}

/** Fail-closed validation of an asset identity. */
export function validateAssetIdentity(
  candidate: unknown,
  subject: string,
): PinnedAssetIdentity {
  const record = requireObject(candidate, `${subject} (an asset identity)`, fail);
  const chain = requireBoundedString(record["chain"], `${subject}.chain`, 256, fail);
  if (!isPinnedChainKey(chain)) {
    throw fail(`${subject}.chain must be a canonical chain key`);
  }
  const assetId = requireBoundedString(record["assetId"], `${subject}.assetId`, 256, fail);
  const symbol = requireBoundedString(record["symbol"], `${subject}.symbol`, 3, fail);
  return Object.freeze({ chain, assetId, symbol });
}

/** The write-planning input: quote + instance + route binding. */
export interface VenueWritePlanningInput {
  readonly quote: VenueQuote;
  /** The ONLY protocol-shaped authorization scope (INV-C05/INV-13). */
  readonly instance: { readonly instanceId: string; readonly capabilityId: string };
  readonly owner: string;
  readonly beneficiary: string;
  readonly routeRef: string;
  readonly routeHash: string;
  readonly expiryMs: number;
  readonly requestedBy: string;
}

/**
 * THE NEUTRAL VENUE PORT: descriptor + protocol binding + synchronous
 * quote / health / write-planning. Venue methods may THROW — the engine
 * contains every per-candidate failure honestly (never crashes the
 * decision, see best-execution.ts).
 */
export interface ExecutionVenue {
  readonly descriptor: VenueDescriptor;
  readonly protocol: VenueProtocolBinding;
  quote(request: SwapRequest, at: number): VenueQuoteOutcome;
  observeHealth(at: number): HealthObservation;
  planWrite(input: VenueWritePlanningInput): {
    readonly writeId: string;
    readonly action: string;
    readonly chain: string;
    readonly route: { readonly routeId: string; readonly routeHash: string };
    readonly expiry: number;
    readonly requestedBy: string;
    readonly writeDigest: string;
    readonly preparedAt: number;
  };
}

/** The deterministic venue registry of the best-execution engine. */
export class VenueRegistry {
  private readonly venuesById = new Map<string, ExecutionVenue>();

  /** Register a venue (validates the descriptor; duplicate ids rejected). */
  register(venue: ExecutionVenue): void {
    if (typeof venue !== "object" || venue === null) {
      throw new VenueRegistryError("a registered venue must be an object implementing the port");
    }
    const descriptor = validateVenueDescriptor(venue.descriptor);
    if (this.venuesById.has(descriptor.venueId)) {
      throw new VenueRegistryError(
        `venue '${descriptor.venueId}' is already registered (duplicate venue ids are rejected)`,
      );
    }
    if (typeof venue.quote !== "function" || typeof venue.observeHealth !== "function" || typeof venue.planWrite !== "function") {
      throw new VenueRegistryError(
        `venue '${descriptor.venueId}' must implement quote, observeHealth and planWrite (the port surface)`,
      );
    }
    this.venuesById.set(descriptor.venueId, venue);
  }

  /** The registered venues in registration order (copy — never the live list). */
  venues(): readonly ExecutionVenue[] {
    return [...this.venuesById.values()];
  }

  /** The venue with the given id, or undefined. */
  venue(venueId: string): ExecutionVenue | undefined {
    return this.venuesById.get(venueId);
  }

  /** The number of registered venues. */
  get size(): number {
    return this.venuesById.size;
  }

  /** True iff a venue id is registered. */
  has(venueId: string): boolean {
    return this.venuesById.has(venueId);
  }
}
