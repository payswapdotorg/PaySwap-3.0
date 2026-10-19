/**
 * Pinned wire-shape fixtures for the @payswap/lab test suite (P6-W1): the
 * LOCAL PINNED shapes from src/pins — structurally compatible with the
 * authority shapes of the accepted capability lane, but imported from THIS
 * package only (zero sibling imports; the TL wires the real imports at
 * integration). All identifiers, timestamps and amounts are fixed
 * constants — no clock, no randomness.
 */

import type {
  PinnedCapabilityDefinition,
  PinnedConnectedInstance,
  PinnedProviderCatalogueEntry,
} from "../src/pins/capability.ts";
import type { PinnedCapabilityObservation } from "../src/pins/observation.ts";
import { pinObservation } from "../src/pins/observation.ts";
import type {
  PinnedCertificationRecord,
  PinnedDeclaredCapability,
  PinnedSmartContractExtension,
} from "../src/pins/certification.ts";
import type { SimulatedWorld } from "../src/simulation-world.ts";
import type { SimulationProgram } from "../src/simulation-plan.ts";
import { BASELINE_WORLD } from "../src/scenarios.ts";

// ---------------------------------------------------------------------------
// Connector capability definitions
// ---------------------------------------------------------------------------

/**
 * The incumbent provider-native routing capability (INV-15): declares
 * nativeOptimization with benchmarkBaseline === true.
 */
export function makeNativeRoutingDefinition(): PinnedCapabilityDefinition {
  return {
    capabilityId: "psp.native-routing",
    capabilityVersion: "1.0.0",
    summary: "provider-native payment routing optimization",
    kind: "WRITE",
    requiredPermissions: ["payments:write"],
    executionModes: [
      "PASS_THROUGH_NATIVE",
      "COMPOSED_PAYSWAP",
      "OPTIMIZED_MULTI_PROVIDER",
    ],
    nativeOptimization: {
      optimizationKind: "ROUTING",
      benchmarkBaseline: true,
    },
  };
}

/** A plain (non-native) payout capability. */
export function makeComposedPayoutDefinition(input?: {
  capabilityId?: string;
  executionModes?: readonly PinnedCapabilityDefinition["executionModes"][number][];
}): PinnedCapabilityDefinition {
  return {
    capabilityId: input?.capabilityId ?? "psp.payouts",
    capabilityVersion: "1.0.0",
    summary: "provider payout execution capability",
    kind: "WRITE",
    requiredPermissions: ["payments:write"],
    executionModes: input?.executionModes ?? [
      "PASS_THROUGH_NATIVE",
      "COMPOSED_PAYSWAP",
      "OPTIMIZED_MULTI_PROVIDER",
    ],
  };
}

// ---------------------------------------------------------------------------
// Connected instances + observations
// ---------------------------------------------------------------------------

export function makeInstance(input: {
  instanceId: string;
  capabilityId: string;
  simulatedRailId?: string;
  currencies?: readonly string[];
  authorizationStatus?: PinnedConnectedInstance["authorization"]["status"];
  eligible?: boolean;
  countries?: readonly string[];
}): PinnedConnectedInstance {
  return {
    instanceId: input.instanceId,
    capabilityId: input.capabilityId,
    implementationId: `${input.capabilityId}:impl:1`,
    providerName: "psp-mock",
    providerVersion: "2024-01",
    accountRef: "acct-123",
    tenantRef: "tenant-1",
    authorization: {
      status: input.authorizationStatus ?? "ACTIVE",
      grantedAt: "2026-01-01T00:00:00Z",
    },
    credentialScope: {
      credentialRef: "cred-1",
      credentialKind: "API_KEY",
    },
    geography: { countries: [...(input.countries ?? ["DE", "FR", "US"])] },
    currencies: [...(input.currencies ?? ["EUR", "USD"])],
    permissionState: {
      granted: ["payments:write"],
      requested: ["payments:write"],
      missing: [],
    },
    eligibility: {
      eligible: input.eligible ?? true,
      reasons: [],
    },
    configuration:
      input.simulatedRailId !== undefined
        ? { simulatedRailId: input.simulatedRailId }
        : {},
  };
}

/**
 * Builds an observation the way the capability authority's
 * `observeCapability` does: the two axes are the input, the derived
 * availability is computed by the pinned canonical resolver (a
 * caller-supplied availability is ignored — the derivation is never
 * ambient, never stale).
 */
export function makeObservation(input: {
  instanceId: string;
  observationVersion?: number;
  capabilityState?: Parameters<typeof pinObservation>[0]["capabilityState"];
  sourceAvailability?: Parameters<typeof pinObservation>[0]["sourceAvailability"];
  availabilityOverride?: PinnedCapabilityObservation["availability"];
}): PinnedCapabilityObservation {
  const observed = pinObservation({
    instanceId: input.instanceId,
    observedAt: "2026-10-01T00:00:00Z",
    observationVersion: input.observationVersion ?? 1,
    capabilityState: input.capabilityState ?? "AVAILABLE",
    sourceAvailability: input.sourceAvailability ?? "REACHABLE",
    eligibility: "ELIGIBLE",
    health: { status: "HEALTHY", lastCheckedAt: "2026-10-01T00:00:00Z" },
    provenance: {
      providerName: "psp-mock",
      source: "PROVIDER_API",
      capturedAt: "2026-10-01T00:00:00Z",
    },
  });
  if (input.availabilityOverride === undefined) {
    return observed;
  }
  // The tampering hook: a stored availability that DISAGREES with the
  // fresh two-axis derivation (the AXES_INCONSISTENT probe).
  return { ...observed, availability: input.availabilityOverride };
}

// ---------------------------------------------------------------------------
// Catalogue entries (INV-13 negative path)
// ---------------------------------------------------------------------------

export function makeCatalogueEntry(input: {
  capabilityId: string;
}): PinnedProviderCatalogueEntry {
  return {
    catalogueEntryId: `cat-${input.capabilityId}`,
    providerName: "psp-mock",
    providerVersion: "2024-01",
    capabilityId: input.capabilityId,
    summary: "advertised platform-wide capability",
    advertisedScope: {
      platformWide: true,
      advertisedGeographies: ["DE", "FR", "US"],
      advertisedCurrencies: ["EUR", "USD"],
    },
  };
}

// ---------------------------------------------------------------------------
// Certification records + smart-contract extensions
// ---------------------------------------------------------------------------

export function makeCertification(input: {
  subjectId: string;
  version?: string;
  status?: PinnedCertificationRecord["status"];
}): PinnedCertificationRecord {
  return {
    recordId: `cert-${input.subjectId}`,
    subject: {
      kind: "capability",
      subjectId: input.subjectId,
      version: input.version ?? "1.0.0",
    },
    status: input.status ?? "CERTIFIED",
    evidence: [
      {
        evidenceId: `ev-${input.subjectId}-1`,
        kind: "TEST_RUN",
        artifactRef: "artifacts/test-run-1",
        contentHash: "hash-1",
      },
    ],
    certifiedAt: "2026-09-01T00:00:00Z",
  };
}

export function makeSmartContractExtension(input?: {
  searchable?: boolean;
}): PinnedSmartContractExtension {
  const searchable = input?.searchable ?? true;
  return {
    kind: "smart_contract_extension",
    chainRef: "ethereum:mainnet",
    contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
    sourceHash: "0x" + "a1".repeat(32),
    bytecodeHash: "0x" + "b2".repeat(32),
    upgradeAuthority: { kind: "IMMUTABLE", description: "no upgrade path" },
    adminAuthority: { kind: "MULTISIG", description: "3-of-5 operations multisig" },
    searchableByLabAfterCertification: searchable,
  };
}

// ---------------------------------------------------------------------------
// DECLARED_CAPABILITY fixture (the accepted P6-W1 rename of the old
// ServiceAccessCapability fixture)
// ---------------------------------------------------------------------------

export function makeDeclaredCapability(input?: {
  id?: string;
}): PinnedDeclaredCapability {
  const id = input?.id ?? "svc.fraud-scoring";
  return {
    id,
    capabilityClass: "developer_service",
    conditions: [
      { kind: "eligibility", description: "tenant onboarded", hardConstraint: true },
    ],
    cost: [{ componentId: "usage-fee", kind: "per_use_fee", bps: 0n }],
    risk: { riskClass: "operational", severity: "low", mitigations: [] },
    provenance: {
      declaredBy: "lab-fixture",
      artifactRef: "artifacts/lab-fixture",
      contentHash: "hash-fixture",
    },
    economicAccountability: {
      accountablePartyRef: "party:ops",
      ledgerAccountRef: "ledger:ops",
      recoursePolicyRef: "policy:ops-recourse",
    },
  };
}
// ---------------------------------------------------------------------------
// Fixture construction laws
// ---------------------------------------------------------------------------
// Every builder is a pure function of its explicit inputs; observedAt /
// grantedAt / certifiedAt constants are fixed ISO strings (never a clock).
// makeObservation derives availability ONLY through the pinned canonical
// resolver (pinObservation) — a caller cannot smuggle a stale stored
// availability except through the explicit availabilityOverride hook,
// which exists precisely to probe the AXES_INCONSISTENT path.
// makeInstance always carries an ACTIVE authorization, granted
// permissions and a passing eligibility unless the caller overrides —
// the fixtures fail OPEN only where the suite under test fails closed.
