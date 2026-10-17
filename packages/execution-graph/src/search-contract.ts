/**
 * @payswap/execution-graph — SEARCH contracts (P3-W2; ADAPT of
 * payswap.org@8a735bf packages/lab/src/search.ts, W2-004).
 *
 * Executable capability discovery + replaceable search plug-ins, re-grounded
 * on the ACCEPTED 3.0 capability fabric (P2-W1):
 * - INV-13: provider-backed executable selection is grounded in a
 *   ConnectedCapabilityInstance + a current CapabilityObservation, NEVER in
 *   provider catalogue definitions alone. A catalogue entry with no
 *   connected instance is returned as an explicit REJECTED selection with
 *   reason CATALOGUE_ENTRY_ONLY.
 * - Two-axis availability (INV-04/INV-07 discipline): the axes are kept
 *   separate; an observation whose source is UNREACHABLE or UNKNOWN yields
 *   effective availability UNKNOWN — surfaced as such (never success, never
 *   failure) and never executable.
 * - INV-15: a definition declaring a native optimization baseline is
 *   returned as an INCUMBENT BASELINE block — exactly like any other block,
 *   no ranking advantage.
 *
 * LAW 1 seam: every executable block carries the exact observation version
 * it was selected on (the selection is pinned, not ambient).
 */

import type {
  CapabilityObservation,
  ConnectedCapabilityInstance,
  EffectiveAvailability,
  ExecutionMode,
  ProviderCatalogueEntry,
} from '@payswap/capability';
import type { StrategyProgram } from './strategy-contract.ts';
import type { SimulatedWorld } from './simulation-contract.ts';
import type { ObservationVersionPin } from './observation-version-contract.ts';

/** A search query (provider-neutral scoping dimensions). */
export interface ExecutionSearchQuery {
  readonly domain: string;
  readonly currency?: string;
  readonly country?: string;
  readonly capabilityId?: string;
  readonly executionMode?: ExecutionMode;
}

/** Why a capability did not yield an executable block. */
export type SearchRejectionReason =
  | 'CATALOGUE_ENTRY_ONLY'
  | 'NO_CONNECTED_INSTANCE'
  | 'NO_OBSERVATION'
  | 'AUTHORIZATION_NOT_ACTIVE'
  | 'NOT_ELIGIBLE'
  | 'CURRENCY_NOT_SUPPORTED'
  | 'GEOGRAPHY_NOT_SUPPORTED'
  | 'EFFECTIVELY_UNAVAILABLE';

/** The per-candidate selection outcome (executable, unknown or rejected). */
export type SearchSelection =
  | {
      readonly status: 'EXECUTABLE';
      readonly instance: ConnectedCapabilityInstance;
      readonly observation: CapabilityObservation;
      readonly effectiveAvailability: 'AVAILABLE' | 'DEGRADED';
      /** INV-15: incumbent provider-native baseline block. */
      readonly isIncumbentBaseline: boolean;
      /** LAW 1: the pinned observation version this selection rests on. */
      readonly pinnedObservation: ObservationVersionPin;
    }
  | {
      readonly status: 'UNKNOWN';
      readonly instance: ConnectedCapabilityInstance;
      readonly observation: CapabilityObservation;
      /**
       * Two-axis UNKNOWN is surfaced verbatim — never converted into
       * success or failure.
       */
      readonly effectiveAvailability: 'UNKNOWN';
      readonly reason: 'SOURCE_UNREACHABLE' | 'SOURCE_UNKNOWN' | 'AXES_INCONSISTENT';
      readonly pinnedObservation: ObservationVersionPin;
    }
  | {
      readonly status: 'REJECTED';
      readonly catalogueEntry: ProviderCatalogueEntry | undefined;
      readonly reason: SearchRejectionReason;
      readonly detail: string;
    };

/** An executable block: a connected instance + its current observation. */
export interface ExecutableBlock {
  readonly instance: ConnectedCapabilityInstance;
  readonly observation: CapabilityObservation;
  readonly effectiveAvailability: 'AVAILABLE' | 'DEGRADED';
  readonly isIncumbentBaseline: boolean;
  /** LAW 1: the exact observation version this block was selected on. */
  readonly pinnedObservation: ObservationVersionPin;
}

/** The search index (deterministic snapshot of the capability fabric). */
export interface ExecutionSearchIndex {
  readonly instances: readonly ConnectedCapabilityInstance[];
  readonly observations: readonly CapabilityObservation[];
  readonly catalogueEntries: readonly ProviderCatalogueEntry[];
}

/** The result of `selectExecutableBlocks`. */
export interface SearchSelectionResult {
  readonly selections: readonly SearchSelection[];
  readonly executable: readonly ExecutableBlock[];
}

/** The derived availability label re-derive helper input (two-axis law). */
export type DerivedAvailability = EffectiveAvailability;

/** Input handed to a search plug-in. */
export interface ExecutionSearchInput {
  readonly world: SimulatedWorld;
  readonly executableBlocks: readonly ExecutableBlock[];
  readonly query: ExecutionSearchQuery;
}

/** A candidate program discovered by a search plug-in. */
export interface SearchedCandidate {
  readonly candidateId: string;
  /** Plug-in id or baseline origin label. */
  readonly origin: string;
  readonly executionMode: ExecutionMode;
  readonly program: StrategyProgram;
  readonly instanceRefs: readonly string[];
  /** LAW 1: the observation pins the candidate's grounding rests on. */
  readonly pinnedObservations: readonly ObservationVersionPin[];
  /** INV-15: this candidate IS the incumbent provider-native baseline. */
  readonly isIncumbentBaseline: boolean;
}

/**
 * A replaceable search plug-in (the Director's learned-component seam):
 * deterministic baselines ship with the package; evolutionary search,
 * bandits, RL and hybrid portfolios all plug in HERE. A plug-in's output is
 * advisory candidate data — never authority (INV-09/INV-10).
 */
export interface ExecutionSearchPlugin {
  readonly pluginId: string;
  readonly description: string;
  search(input: ExecutionSearchInput): readonly SearchedCandidate[];
}
