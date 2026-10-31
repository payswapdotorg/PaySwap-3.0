/**
 * PaySwap Desktop (P22-H, ADR-0016 D2/D5) — the ONCHAIN RAIL CHAIN
 * DERIVATION: the corridor's relay chain derived from the onchain
 * plane's OWN four-layer hierarchy (ADR-0008 D5 preserved — never a PSP
 * probe id, never the PSP bridge loop, never the PSP DEFINITION_CATALOG).
 *
 * THE FOUR LAYERS (the chain-from-bridge precedent, applied to the rail):
 * - Layer 1 DEFINITION: the pinned Stellar rail capability definition —
 *   its own fail-closed catalogue keyed by the chain key
 *   (`stellar:testnet`), NEVER the PSP (providerId, keyClass) catalog;
 * - Layer 2 IMPLEMENTATION: the rail's adapter record (Horizon REST,
 *   the injected-fetch seam — no SDK), claiming ONLY the currencies and
 *   issuer-scoped assets the account read OBSERVED;
 * - Layer 3 INSTANCE: the rail connection itself (the PROVIDERLESS_RAIL
 *   form; the credential scope carries the OPAQUE connection ref and
 *   the STELLAR_KEYPAIR kind — never material, INV-19);
 * - Layer 4 OBSERVATION: the Horizon account-read evidence (probe
 *   CONFIRMED ⇒ AVAILABLE/REACHABLE ⇒ AVAILABLE; the asset positions
 *   observed — the issuer-scoped refs that ground the corridor's
 *   USDC relay).
 *
 * THE HONEST-EMPTY LAW: no ACTIVE stellar:testnet connection with
 *   CONFIRMED account-read evidence derives NO chain (fail-closed,
 *   deterministic — zero rails pretend to exist).
 */

import type { DesktopConnectionStatusView } from "./contracts.js";
import type { ProbeEvidenceRecord } from "./probe-evidence.js";
import type { BridgeConnectedInstance } from "./capability-bridge.js";
import type {
  ConnectionCapabilityImplementation,
  ConnectionCapabilityObservationScope,
  ConnectionCapabilityRouteChain,
} from "./chain-from-bridge.js";
import type { PinnedConnectionCapabilityDefinition } from "./chain-definitions.js";
import { PINNED_STELLAR_CHAIN_KEY } from "./onchain-rail-pins.js";
import { PINNED_STELLAR_RAIL_PROVIDER_REF } from "./probe-contracts.js";

/** The onchain rail's provider ref (the chain key — the PSP triple is never touched). */
const PINNED_STELLAR_RAIL_PROVIDER_REF_KEY = PINNED_STELLAR_RAIL_PROVIDER_REF;

/** The input planes (the same shapes the bridge reads). */
export interface OnchainChainDerivationInput {
  readonly statuses: readonly DesktopConnectionStatusView[];
  readonly evidence: readonly ProbeEvidenceRecord[];
}

/** The pinned rail definition id (the capability id law: the chain key IS the id namespace). */
const STELLAR_RAIL_DEFINITION_ID = `capability:onchain-rail:${PINNED_STELLAR_CHAIN_KEY}` as const;

/**
 * Layer 1 — the pinned Stellar rail capability definition (fail-closed
 * catalogue of ONE: the testnet keypair wallet rail; executable in
 * SANDBOX only, INV-25). THE FULL CAPABILITY-MODEL SHAPE (the 2026-10-31
 * CDP finding: the corridor projection's REAL validators reject a thin
 * definition — capabilityClass, conditions, cost, risk, provenance,
 * economicAccountability, proofRequirements and the fourteen-part
 * execution declaration are all mandatory for an executable rail; the
 * stripeSandboxExecutableDefinition pattern, chain-definitions.ts).
 */
export function stellarRailCapabilityDefinition(): PinnedConnectionCapabilityDefinition {
  return Object.freeze({
    id: STELLAR_RAIL_DEFINITION_ID,
    version: "1",
    displayName: "Stellar Testnet Onchain Rail",
    summary:
      "The Stellar testnet onchain rail (stellar:testnet): account-based, deterministic finality, no reorgs. The relay wallet connection rides the PROVIDERLESS_RAIL form with a sealed keypair; the corridor chain derives from the onchain plane's own four-layer hierarchy (ADR-0008 D5), never a PSP probe id.",
    capabilityClass: "rail_movement",
    conditions: [
      {
        kind: "jurisdiction",
        description:
          "SANDBOX on stellar:testnet only — a pubnet-shaped target is never offered (INV-25; the pubnet plane is not registered in this deployment)",
        hardConstraint: true,
      },
    ],
    cost: [],
    risk: {
      riskClass: "settlement",
      severity: "low",
      mitigations: ["deterministic finality — no reorgs on stellar:testnet", "authoritative read-backs over Horizon"],
    },
    provenance: {
      declaredBy: "payswap:desktop-onchain-plane",
      artifactRef: `onchain:${PINNED_STELLAR_CHAIN_KEY}/horizon-rest@1`,
      contentHash: "fnv1a64:p22d-onchain-rail-stellar-testnet@1",
    },
    economicAccountability: {
      accountablePartyRef: `onchain:${PINNED_STELLAR_CHAIN_KEY}`,
      ledgerAccountRef: `ledger:onchain/${PINNED_STELLAR_CHAIN_KEY}`,
      recoursePolicyRef: "policy:recourse/onchain-observation",
    },
    proofRequirements: [{ proofLevel: "P1", scope: "observation" }],
    executable: true,
    operationClasses: Object.freeze([
      "READ_PROVIDER_STATE",
      "OBSERVE_EXTERNAL_FUNDS",
      "MANAGE_CONNECTION",
      "CREATE_EXTERNAL_EFFECT",
    ]),
    effectClasses: Object.freeze(["NONE", "OBSERVATION_ONLY", "STATE_CHANGING"]),
    restrictions: Object.freeze([
      Object.freeze({
        rs: `onchain:${PINNED_STELLAR_CHAIN_KEY}`,
        summary: "SANDBOX on stellar:testnet only — a pubnet-shaped target is never offered (INV-25; the pubnet plane is not registered in this deployment).",
      }),
    ]),
    execution: {
      contractVersion: "1.0.0",
      semantics: {
        summary: "Stellar testnet payment-operation transfer",
        effectDescription: "Moves the issuer-scoped stablecoin between accounts on stellar:testnet (the corridor's onchain relay leg)",
      },
      stateMachine: {
        initial: "CREATED",
        states: [
          { name: "CREATED", isTerminal: false },
          { name: "SETTLED", isTerminal: true },
        ],
        transitions: [{ from: "CREATED", to: "SETTLED", trigger: "transaction-success" }],
      },
      preconditions: [
        {
          preconditionId: "pre:onchain-asset-observed",
          description: "The transferred asset position is observed on the rail (the issuer-scoped asset, never a bare code)",
          confirmedBy: "PROVIDER",
        },
      ],
      // The required scope names the rail's OWN operation-class vocabulary
      // (the instance's permissionState.granted set — the 2026-10-31 CDP
      // finding: the corridor evaluation checks requiredScopes against the
      // granted operation classes, so the scope must be that vocabulary).
      authorizationRequirements: { requiredScopes: ["CREATE_EXTERNAL_EFFECT"], requiresHumanApproval: false },
      financialEffectClass: "CONSEQUENTIAL_EXTERNAL_EFFECT",
      idempotency: {
        keyScope: "ENDPOINT_SPECIFIC",
        carriesProviderKey: true,
        retryPolicy: "NEVER_RETRY_AFTER_AMBIGUITY",
        reconciliationRequired: true,
      },
      compensation: {
        cancellable: false,
        refundable: false,
        compensationMechanism:
          "none at the leg tier — the ledger's effect is final; the corridor's compensation plane operates at the mission level (the custody-block + lawful-CANCEL laws)",
        lateReturnRepresentable: false,
      },
      partialExecution: { supported: false, semantics: "single atomic payment operation per leg" },
      userActions: [],
      providerStateMapping: { preservedInEnvelope: true, consequentialFamilies: ["capture"] },
      externalReferences: { carriesExternalIds: true, revisionTracking: "PROVIDER_REVISIONS", correlationIdRequired: true },
      evidenceRequirements: [{ evidenceKind: "FUNDING", required: true }],
      economicTerms: { termsRef: "terms:stellar-testnet", termsVersion: "1.0.0", pricingModel: "none (testnet rail — no fee is charged or claimed)" },
      jurisdictionEligibility: {
        declaredVia: "RESTRICTION_SET",
        restrictionSet: {
          restrictionSetId: `rs:onchain-${PINNED_STELLAR_CHAIN_KEY}-relay`,
          version: "1.0.0",
          currencies: ["GHS", "KES"],
          customerTypes: ["PERSONAL", "BUSINESS"],
          requiredFields: [
            {
              fieldId: "onchain.relay_account",
              description: "The corridor relay wallet's StrKey account on the rail",
              appliesTo: "SENDER",
            },
          ],
          cutoffs: [],
          terms: { termsRef: "terms:stellar-testnet", termsVersion: "1.0.0", deliveryEstimateLabel: "INDICATIVE" },
          declaredBy: "payswap:desktop-onchain-plane",
        },
      },
      executionModes: ["PASS_THROUGH_NATIVE"],
    },
  } as PinnedConnectionCapabilityDefinition);
}

/** Layer 2 — the rail's adapter implementation record (Horizon REST, no SDK).
 * The advisory corridor scope carries the OBSERVED ASSETS (the issuer-
 * scoped refs) and NO fiat-currency claim — an onchain rail moves assets,
 * not fiat, so the currencies dimension stays ABSENT (unrestricted; the
 * 2026-10-31 CDP finding: the asset codes like "USDC" are not ISO-3
 * currency codes and the REAL implementation validator rejects them). */
function stellarRailImplementation(
  observedAssetRefs: readonly string[],
): ConnectionCapabilityImplementation {
  return Object.freeze({
    implementationId: `implementation:onchain:${PINNED_STELLAR_CHAIN_KEY}`,
    providerName: PINNED_STELLAR_CHAIN_KEY,
    providerVersion: "horizon-rest-1",
    capabilityId: STELLAR_RAIL_DEFINITION_ID,
    capabilityVersion: "1",
    version: "1",
    adapterRef: `adapter:stellar/horizon@1`,
    corridors: Object.freeze([
      Object.freeze(
        observedAssetRefs.length > 0
          ? { assets: Object.freeze([...observedAssetRefs]) }
          : {},
      ),
    ]),
    knownDeviations: Object.freeze([]),
  } as ConnectionCapabilityImplementation);
}

/** Layer 3 — the rail connection as the instance (the opaque-connection law, INV-19).
 * The capability model's closed vocabularies (the 2026-10-31 CDP findings):
 * accountRef is the registry's own CONNECTION reference (the bridge's own
 * law — the rail carries no provider account id; the opaque ref is the
 * honest one), and credentialKind is PROVIDER_DEFINED (the model's bucket
 * for provider-specific credential forms — the keypair; the connection
 * plane's STELLAR_KEYPAIR vocabulary stays its own). */
function stellarRailInstance(
  status: DesktopConnectionStatusView,
  record: ProbeEvidenceRecord,
): BridgeConnectedInstance {
  return Object.freeze({
    instanceId: `instance:${status.connectionId}`,
    capabilityId: STELLAR_RAIL_DEFINITION_ID,
    implementationId: `implementation:onchain:${PINNED_STELLAR_CHAIN_KEY}`,
    providerName: PINNED_STELLAR_CHAIN_KEY,
    providerVersion: "horizon-rest-1",
    accountRef: status.connectionId,
    tenantRef: "payswap-test",
    authorization: Object.freeze({ status: "ACTIVE" as const, grantedAt: record.observedAt }),
    credentialScope: Object.freeze({
      credentialRef: status.connectionId,
      credentialKind: "PROVIDER_DEFINED" as const,
    }),
    geography: Object.freeze({ countries: Object.freeze([]) }),
    currencies: Object.freeze([...record.balanceCurrencies]),
    permissionState: Object.freeze({
      granted: Object.freeze(["READ_PROVIDER_STATE", "OBSERVE_EXTERNAL_FUNDS", "MANAGE_CONNECTION", "CREATE_EXTERNAL_EFFECT"]),
      requested: Object.freeze([]),
      missing: Object.freeze([]),
    }),
    eligibility: Object.freeze({ eligible: true, reasons: Object.freeze([]) }),
    configuration: Object.freeze({
      executionMode: "SANDBOX",
      chainKey: PINNED_STELLAR_CHAIN_KEY,
      transportId: record.transportId,
    }),
    connectionRef: status.connectionId,
    providerId: PINNED_STELLAR_RAIL_PROVIDER_REF_KEY,
    evidenceTier: "PROVIDER_OBSERVATION" as const,
    accountRefs: Object.freeze([]),
    operationClasses: Object.freeze([
      "READ_PROVIDER_STATE",
      "OBSERVE_EXTERNAL_FUNDS",
      "MANAGE_CONNECTION",
      "CREATE_EXTERNAL_EFFECT",
    ]),
    observedAt: record.observedAt,
    observationVersion: record.observationVersion,
    keyClass: record.keyClass,
  } as BridgeConnectedInstance);
}

/** Layer 4 — the account-read evidence as the observation scope (the two-axis law). */
function stellarRailObservation(record: ProbeEvidenceRecord): ConnectionCapabilityObservationScope {
  return Object.freeze({
    instanceId: `instance:${record.connectionId}`,
    observedAt: record.observedAt,
    observationVersion: record.observationVersion,
    capabilityState: "AVAILABLE" as const,
    sourceAvailability: "REACHABLE" as const,
    availability: "AVAILABLE" as const,
    eligibility: "ELIGIBLE" as const,
    health: Object.freeze({ status: "probe-confirmed", lastCheckedAt: record.observedAt }),
    provenance: Object.freeze({
      providerName: PINNED_STELLAR_CHAIN_KEY,
      source: "PROVIDER_API" as const,
      capturedAt: record.observedAt,
    }),
  } as ConnectionCapabilityObservationScope);
}

/**
 * THE CORRIDOR RELAY CHAIN DERIVATION (pure, deterministic, fail-closed):
 * for every ACTIVE stellar:testnet connection whose LATEST account-read
 * evidence is CONFIRMED, derive the four-layer chain. The evidence's
 * asset positions (the issuer-scoped refs) are the corridor's USDC
 * grounding — a relay without positions grounds a rail with no assets
 * (the chain still derives; the corridor compile needs the positions).
 */
export function onchainsFromPlanes(
  input: OnchainChainDerivationInput,
): readonly ConnectionCapabilityRouteChain[] {
  const chains: ConnectionCapabilityRouteChain[] = [];
  const latestByConnection = new Map<string, ProbeEvidenceRecord>();
  for (const record of input.evidence) {
    if (record.providerId !== PINNED_STELLAR_RAIL_PROVIDER_REF_KEY) {
      continue; // the PSP records are the bridge's own input, never ours
    }
    const existing = latestByConnection.get(record.connectionId);
    if (existing === undefined || record.observationVersion > existing.observationVersion) {
      latestByConnection.set(record.connectionId, record);
    }
  }
  for (const status of input.statuses) {
    if (status.providerId !== PINNED_STELLAR_RAIL_PROVIDER_REF_KEY || status.state !== "ACTIVE") {
      continue;
    }
    const record = latestByConnection.get(status.connectionId);
    if (record === undefined || record.outcome !== "CONFIRMED") {
      continue; // no CONFIRMED account read ⇒ no observation ⇒ no chain
    }
    const assetRefs = record.assetPositions ?? [];
    chains.push(
      Object.freeze({
        definition: stellarRailCapabilityDefinition(),
        implementation: stellarRailImplementation(assetRefs),
        instance: stellarRailInstance(status, record),
        observation: stellarRailObservation(record),
      } as ConnectionCapabilityRouteChain),
    );
  }
  return Object.freeze(
    [...chains].sort((a, b) => (a.instance.connectionRef < b.instance.connectionRef ? -1 : 1)),
  );
}
