/**
 * @payswap/app — the ONCHAIN RAIL view fold (P12 Lane C, C3).
 *
 * The honest projection of the onchain family onto the product surface:
 * everything here is either (a) declared catalogue/vocabulary data pinned
 * from the accepted onchain packages (rendered as clearly-labeled
 * REFERENCE), or (b) an UNAVAILABLE/EMPTY row with its typed reason —
 * NEVER a fabricated wallet, balance, quote, transaction or connected
 * venue. The fold is pure: the pins arrive as explicit inputs (defaults
 * = the pinned constants) so the view stays deterministic and testable.
 *
 * The honest home (FEATURE-MAP §3): the CONNECTIONS area owns rail setup
 * — wallet/account connection is a connected-instance concern — with the
 * observation vocabulary cross-anchored on ACCOUNTS (externally-observed
 * balances) and the capability flavors on CAPABILITIES.
 */

import {
  CHAIN_ENVIRONMENT_REGISTRY_PIN,
  CHAIN_FAMILIES_PIN,
  ONCHAIN_CAPABILITY_KINDS_PIN,
  ONCHAIN_EXECUTION_OUTCOMES_PIN,
  ONCHAIN_FAILURE_CLASSES_PIN,
  ONCHAIN_FEE_MODELS_PIN,
  ONCHAIN_OPERATION_KINDS_PIN,
  ONCHAIN_RETRY_GUIDANCE_PIN,
  RAIL_ENVIRONMENT_CLASSES_PIN,
  SIMULATION_STATUSES_PIN,
  SYNTHETIC_VENUE_PACKS_PIN,
  WALLET_CUSTODY_MODELS_PIN,
  type RailEnvironmentClassPin,
  type SyntheticVenuePackPin,
} from "../pins/onchain-pins.js";

/** The honest operational state of one onchain capability row. */
export type OnchainCapabilityState =
  /** No implementation exists in this deployment — the typed reason renders. */
  | "UNAVAILABLE"
  /** The contract vocabulary exists and renders as labeled reference. */
  | "REFERENCE"
  /** The observation contract exists; zero observations exist — honest empty. */
  | "NO_OBSERVATIONS";

/** One row of the onchain capability checklist. */
export interface OnchainCapabilityRow {
  readonly id: string;
  readonly label: string;
  readonly state: OnchainCapabilityState;
  /** What the row renders: the typed reason (UNAVAILABLE) or the law/line. */
  readonly line: string;
}

/** One declared chain catalogue row (descriptive, never authority). */
export interface OnchainChainRow {
  readonly chainKey: string;
  readonly environmentClass: RailEnvironmentClassPin;
}

/** The onchain rail view. */
export interface OnchainRailView {
  /** The declared chain catalogue (chain identity IS the environment). */
  readonly chains: readonly OnchainChainRow[];
  /** The chain families vocabulary (reference). */
  readonly families: readonly string[];
  /** The rail environment classes (reference). */
  readonly environmentClasses: readonly string[];
  /** The C3 capability checklist — every row honest. */
  readonly capabilities: readonly OnchainCapabilityRow[];
  /** The synthetic venue packs — rendered AS synthetic model deployments. */
  readonly venues: readonly SyntheticVenuePackPin[];
  /** The operation kinds vocabulary (reference). */
  readonly operationKinds: readonly string[];
  /** The execution-observation outcome vocabulary (reference). */
  readonly executionOutcomes: readonly string[];
  /** The failure-class vocabulary (reference). */
  readonly failureClasses: readonly string[];
  /** The retry-guidance vocabulary (reference). */
  readonly retryGuidance: readonly string[];
  /** The wallet custody-model vocabulary (reference). */
  readonly custodyModels: readonly string[];
  /** The onchain capability flavor vocabulary (reference). */
  readonly capabilityKinds: readonly string[];
  /** The simulation-status vocabulary (reference). */
  readonly simulationStatuses: readonly string[];
  /** The per-family fee-model vocabulary (reference). */
  readonly feeModels: readonly string[];
}

/**
 * The typed UNAVAILABLE reasons (verbatim law: every reason names WHAT is
 * missing — never a stub that pretends).
 */
export const ONCHAIN_UNAVAILABLE_REASONS = {
  walletConnection:
    "No wallet connection surface exists in this deployment — no wallet, account or signer is connected, and none is invented. Connecting requires the wallet-connection plane (a trusted-surface wallet integration over the connected-instance model), which is not wired.",
  networkContextLive:
    "Live network context is UNAVAILABLE: RPC/indexer transports are contracts in this repository (vendor-neutral transport shapes), and no transport is wired in this deployment. The declared chain catalogue below is the honest extent of network context today.",
  balances:
    "No externally-observed balances exist — zero asset observations are recorded. An onchain asset position is an OBSERVATION (observer identity, freshness, provenance), never PaySwap custody and never a balance PaySwap holds; none has been observed, so none is shown.",
  transactionPreview:
    "Transaction preview is UNAVAILABLE: a preview requires a prepared write plus a simulation observation (expected-state diff), and no execution plane exists in this deployment. The preview contracts are real; no preview is fabricated.",
  scopedSigning:
    "Scoped signing is UNAVAILABLE in this deployment — no signer adapter is wired at a trusted surface. The law is real and unchanged: signing requests are only ever produced from re-checked, authorized writes; the kernel never broadcasts.",
  historyEvidence:
    "No onchain history or evidence records exist — observations are mandatory-evidence contracts in the packages, and zero observations are recorded in this deployment.",
} as const;

/**
 * Fold the onchain rail view (pure). Defaults pin the accepted vocabulary;
 * tests may inject pins to verify the fold.
 */
export function foldOnchainRail(input?: {
  readonly chains?: readonly OnchainChainRow[];
  readonly venues?: readonly SyntheticVenuePackPin[];
}): OnchainRailView {
  const chains =
    input?.chains ??
    Object.entries(CHAIN_ENVIRONMENT_REGISTRY_PIN).map(([chainKey, environmentClass]) => ({
      chainKey,
      environmentClass,
    }));
  return {
    chains,
    families: CHAIN_FAMILIES_PIN,
    environmentClasses: RAIL_ENVIRONMENT_CLASSES_PIN,
    capabilities: [
      {
        id: "wallet-connection",
        label: "Wallet / account connection",
        state: "UNAVAILABLE",
        line: ONCHAIN_UNAVAILABLE_REASONS.walletConnection,
      },
      {
        id: "network-context",
        label: "Network context",
        state: "UNAVAILABLE",
        line: ONCHAIN_UNAVAILABLE_REASONS.networkContextLive,
      },
      {
        id: "balances",
        label: "Externally-observed balances",
        state: "NO_OBSERVATIONS",
        line: ONCHAIN_UNAVAILABLE_REASONS.balances,
      },
      {
        id: "transaction-preview",
        label: "Transaction preview",
        state: "UNAVAILABLE",
        line: ONCHAIN_UNAVAILABLE_REASONS.transactionPreview,
      },
      {
        id: "fee-provenance",
        label: "Fee provenance",
        state: "REFERENCE",
        line: "Fee semantics are declared per family (EVM gas auction EIP-1559 base fee + priority; Solana signature fees; UTXO satoshi-per-vbyte; Stellar stroops-per-operation) and fail closed when a fee cannot be expressed. No live fee observation exists — a fee line never renders without one.",
      },
      {
        id: "scoped-signing",
        label: "Scoped signing authorization",
        state: "UNAVAILABLE",
        line: ONCHAIN_UNAVAILABLE_REASONS.scopedSigning,
      },
      {
        id: "simulation-security",
        label: "Simulation & security checks",
        state: "REFERENCE",
        line: "Simulation is an OBSERVATION, never authority: an inconclusive simulation stays OUTCOME_UNKNOWN, and the deterministic gates decide BLOCK > UNKNOWN > ALLOW over every guard dimension. No simulation has run in this deployment.",
      },
      {
        id: "state-vocabulary",
        label: "State vocabulary",
        state: "REFERENCE",
        line: "The full observation vocabulary is pinned: BROADCAST (submitted is not finality), CONFIRMED (a finality CANDIDATE, never finality), FAILED, OUTCOME_UNKNOWN — with reorg detection and confirmation depth on candidates. UNKNOWN never becomes FAILED or success.",
      },
      {
        id: "history-evidence",
        label: "History & evidence",
        state: "NO_OBSERVATIONS",
        line: ONCHAIN_UNAVAILABLE_REASONS.historyEvidence,
      },
    ],
    venues: input?.venues ?? SYNTHETIC_VENUE_PACKS_PIN,
    operationKinds: ONCHAIN_OPERATION_KINDS_PIN,
    executionOutcomes: ONCHAIN_EXECUTION_OUTCOMES_PIN,
    failureClasses: ONCHAIN_FAILURE_CLASSES_PIN,
    retryGuidance: ONCHAIN_RETRY_GUIDANCE_PIN,
    custodyModels: WALLET_CUSTODY_MODELS_PIN,
    capabilityKinds: ONCHAIN_CAPABILITY_KINDS_PIN,
    simulationStatuses: SIMULATION_STATUSES_PIN,
    feeModels: ONCHAIN_FEE_MODELS_PIN,
  };
}
