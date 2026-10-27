/**
 * PaySwap Desktop (P21-A, ADR-0014 D6/D9) — the CONNECTION→CAPABILITY
 * BRIDGE: the host-side conversion of each ACTIVE connection + its
 * probe evidence into the capability facts the payment plane consumes
 * (the audit's "single biggest structural seam" — zero connected
 * instances existed before this wave).
 *
 * THE CONVERSION LAW (D6):
 * - ONLY ACTIVE connections whose latest probe evidence is CONFIRMED
 *   convert — a catalogue entry NEVER becomes an instance (INV-13 stays
 *   machine-enforced: the derived instance is a structural mirror of
 *   the canonical ConnectedCapabilityInstance — account/tenant scope,
 *   authorization, credential scope, permission state, eligibility and
 *   configuration all present — and NEVER an advertisement; the battery
 *   drives the REAL capability guard against both shapes).
 * - Zero ACTIVE connections (or none with confirmed evidence) derive
 *   NOTHING — the honest-empty gate environment stays the default,
 *   byte-identical (the P13-C live truth; the environment composition
 *   over this derivation lives in ./gate-environment.ts).
 *
 * THE EVIDENCE-TIER LAW (D9): every derived fact carries its tier and
 * the tiers never mix — PROVIDER_OBSERVATION here (the instances, the
 * freshness-stamped + versioned observations, the probed-account funding
 * sources and the execution scopes); the TEST_DATA facts (the merchant
 * directory destinations + the declared test corridor) are composed in
 * ./gate-environment.ts with their own tier labels.
 *
 * THE CAPABILITY LAW (F3/C9): the Flutterwave probe proves balance-read
 * ONLY — the FLW instance carries read-only operation classes, NEVER a
 * send/transfer class, and no corridor eligibility as a sending rail;
 * the wallet OBSERVATION stays honest (the accounts are observed, never
 * hidden — the exclusion is explained at the corridor, not by omission).
 */

import type { DesktopConnectionStatusView } from "./contracts.js";
import type { ConnectionProbeKeyClass, PaySwapProbeProviderId } from "./probe-contracts.js";
import type { ProbeEvidenceRecord } from "./probe-evidence.js";
import {
  listMerchantDirectoryEntries,
} from "../payments/merchant-directory.js";
import type {
  ObservedDestination,
  ObservedFundingSource,
} from "../payments/intent-compiler.js";
import type { ConnectedProviderScope } from "../payments/validation-gates.js";

/** The evidence tier of every probe-derived fact (D9). */
export const BRIDGE_PROVIDER_OBSERVATION_TIER = "PROVIDER_OBSERVATION" as const;

/** The read-only operation classes (the canonical closed set, mirrored). */
export const BRIDGE_READ_ONLY_OPERATION_CLASSES: readonly string[] = Object.freeze([
  "READ_PROVIDER_STATE",
  "OBSERVE_EXTERNAL_FUNDS",
  "MANAGE_CONNECTION",
]);

/** The SANDBOX execution operation classes a FULL_TEST Stripe key derives (the canonical set, mirrored). */
export const BRIDGE_STRIPE_SANDBOX_EXECUTION_OPERATION_CLASSES: readonly string[] = Object.freeze([
  ...BRIDGE_READ_ONLY_OPERATION_CLASSES,
  "CREATE_EXTERNAL_EFFECT",
  "CANCEL_OR_REVERSE_EFFECT",
]);

/** The observation freshness policy (the ObservationFreshnessPolicy mirror). */
export const BRIDGE_OBSERVATION_FRESHNESS_POLICY = Object.freeze({
  /** Observations older than this (seconds) are STALE and exclude the route. */
  maxAgeSeconds: 900,
} as const);

/**
 * One derived connected capability instance — a structural mirror of the
 * canonical ConnectedCapabilityInstance (layer 3: the registry's four-
 * layer chain definition→implementation→instance→observation) plus the
 * bridge's own evidence fields. NEVER a ProviderCatalogueEntry: no
 * advertisedScope, no platform-wide claim — account/tenant scope,
 * authorization, credential scope (an OPAQUE ref), permission state,
 * eligibility and configuration are all present (INV-13).
 */
export interface BridgeConnectedInstance {
  // ---- the ConnectedCapabilityInstance structural mirror ----
  readonly instanceId: string;
  readonly capabilityId: string;
  readonly implementationId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  readonly accountRef: string;
  readonly tenantRef: string;
  readonly authorization: { readonly status: "ACTIVE"; readonly grantedAt: string };
  readonly credentialScope: {
    /** The OPAQUE connection reference — never credential material (INV-19). */
    readonly credentialRef: string;
    readonly credentialKind: "API_KEY";
  };
  readonly geography: { readonly countries: readonly string[] };
  readonly currencies: readonly string[];
  readonly permissionState: {
    readonly granted: readonly string[];
    readonly requested: readonly string[];
    readonly missing: readonly string[];
  };
  readonly eligibility: { readonly eligible: boolean; readonly reasons: readonly string[] };
  readonly configuration: Readonly<Record<string, string | number | boolean>>;
  // ---- the bridge's own evidence fields ----
  readonly connectionRef: string;
  readonly providerId: PaySwapProbeProviderId;
  readonly evidenceTier: typeof BRIDGE_PROVIDER_OBSERVATION_TIER;
  /** The provider-referenced account refs (the Stripe account id; the FLW currency wallets). */
  readonly accountRefs: readonly string[];
  readonly operationClasses: readonly string[];
  readonly observedAt: string;
  readonly observationVersion: number;
  readonly keyClass: ConnectionProbeKeyClass;
}

/** One derived capability observation (layer 4 — freshness-stamped, versioned). */
export interface BridgeCapabilityObservation {
  readonly instanceId: string;
  readonly observedAt: string;
  readonly observationVersion: number;
  readonly availability: "AVAILABLE";
  readonly probedOperation: string;
  readonly providerReferences: readonly string[];
  readonly evidenceTier: typeof BRIDGE_PROVIDER_OBSERVATION_TIER;
  readonly freshness: { readonly observedAt: string; readonly maxAgeSeconds: number };
}

/** The bridge's full derivation (the gate environment's real inputs). */
export interface BridgeDerivation {
  readonly instances: readonly BridgeConnectedInstance[];
  readonly observations: readonly BridgeCapabilityObservation[];
  readonly fundingSources: readonly ObservedFundingSource[];
  readonly destinations: readonly ObservedDestination[];
  readonly connectedScopes: readonly ConnectedProviderScope[];
}

/** The registry's own display names (the pinned registry — never guessed). */
const PROVIDER_DISPLAY_NAMES: Readonly<Record<PaySwapProbeProviderId, string>> = Object.freeze({
  stripe: "Stripe",
  flutterwave: "Flutterwave",
  paystack: "Paystack",
});

/** The latest CONFIRMED evidence per connection (the bridge's only conversion input). */
function confirmedEvidenceByConnection(
  evidence: readonly ProbeEvidenceRecord[],
): Map<string, ProbeEvidenceRecord> {
  const latest = new Map<string, ProbeEvidenceRecord>();
  for (const record of evidence) {
    if (record.outcome !== "CONFIRMED") {
      continue;
    }
    const previous = latest.get(record.connectionId);
    if (previous === undefined || record.observationVersion >= previous.observationVersion) {
      latest.set(record.connectionId, record);
    }
  }
  return latest;
}

/** The operation classes a credential class derives (the grant law — never widened). */
function operationClassesOf(providerId: PaySwapProbeProviderId, keyClass: ConnectionProbeKeyClass): readonly string[] {
  if (providerId === "stripe" && keyClass === "FULL_TEST") {
    // The SANDBOX execution grant: ONLY a FULL test secret key derives
    // it (the kernel re-checks inside the seal on every dispatch).
    return BRIDGE_STRIPE_SANDBOX_EXECUTION_OPERATION_CLASSES;
  }
  // F3/C9: Flutterwave + Paystack are read-only by construction; a
  // RESTRICTED Stripe key never derives an execution grant from the key
  // alone. NO send/transfer class is ever derived for these.
  return BRIDGE_READ_ONLY_OPERATION_CLASSES;
}

/** The honest account reference for a connected account (provider-referenced). */
function accountRefOf(
  status: DesktopConnectionStatusView,
  record: ProbeEvidenceRecord,
): string {
  if (record.accountRef !== null) {
    return record.accountRef;
  }
  // The FLW/Paystack probes read no account id — the connected account
  // is referenced through the connection itself (the provider-referenced
  // wallets are carried in accountRefs below).
  return `${status.providerId}:account:${status.connectionId}`;
}

/** Deterministic connection order (createdAt, then connectionId). */
function connectionOrder(
  a: DesktopConnectionStatusView,
  b: DesktopConnectionStatusView,
): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.connectionId === b.connectionId ? 0 : a.connectionId < b.connectionId ? -1 : 1;
}

/**
 * Derive the capability facts from the connections registry's own read
 * model + the probe-evidence ledger. PURE: same inputs → same outputs;
 * the instants are DATA (the evidence's observedAt), never ambient.
 */
export function deriveConnectionCapabilityBridge(input: {
  readonly statuses: readonly DesktopConnectionStatusView[];
  readonly evidence: readonly ProbeEvidenceRecord[];
}): BridgeDerivation {
  const confirmed = confirmedEvidenceByConnection(input.evidence);
  const instances: BridgeConnectedInstance[] = [];
  const observations: BridgeCapabilityObservation[] = [];
  const fundingSources: ObservedFundingSource[] = [];
  const connectedScopes: ConnectedProviderScope[] = [];

  const active = input.statuses
    .filter((status) => status.state === "ACTIVE" && confirmed.has(status.connectionId))
    .sort(connectionOrder);

  for (const status of active) {
    const record = confirmed.get(status.connectionId)!;
    const providerId = status.providerId as PaySwapProbeProviderId;
    if (providerId !== "stripe" && providerId !== "flutterwave" && providerId !== "paystack") {
      continue;
    }
    const providerName = PROVIDER_DISPLAY_NAMES[providerId];
    const accountRef = accountRefOf(status, record);
    const operationClasses = operationClassesOf(providerId, record.keyClass);
    const accountRefs =
      providerId === "stripe" && record.accountRef !== null
        ? [record.accountRef]
        : [...record.providerReferences];
    const executable = operationClasses.includes("CREATE_EXTERNAL_EFFECT");

    const instance: BridgeConnectedInstance = Object.freeze({
      instanceId: `instance:${status.connectionId}`,
      capabilityId: `capability:connected-account:${providerId}`,
      implementationId: `implementation:https:${providerId}`,
      providerName,
      providerVersion: "p21",
      accountRef,
      tenantRef: accountRef,
      authorization: Object.freeze({ status: "ACTIVE" as const, grantedAt: record.observedAt }),
      credentialScope: Object.freeze({
        credentialRef: status.connectionId,
        credentialKind: "API_KEY" as const,
      }),
      geography: Object.freeze({ countries: Object.freeze([]) }),
      currencies: Object.freeze([...record.balanceCurrencies]),
      permissionState: Object.freeze({
        granted: Object.freeze([...operationClasses]),
        requested: Object.freeze([...operationClasses]),
        missing: Object.freeze([]),
      }),
      eligibility: Object.freeze({
        eligible: executable,
        reasons: executable
          ? Object.freeze([])
          : Object.freeze([
              providerId === "stripe"
                ? "a RESTRICTED Stripe key never derives an execution grant from the key alone — restricted-key grants derive only from their DECLARED scopes"
                : `a ${providerName} probe proves read-only access only — no send or transfer operation exists for ${providerName} in this deployment (F3)`,
            ]),
      }),
      configuration: Object.freeze({
        executionMode: record.executionMode,
        keyClass: record.keyClass,
        transportId: record.transportId,
      }),
      connectionRef: status.connectionId,
      providerId,
      evidenceTier: BRIDGE_PROVIDER_OBSERVATION_TIER,
      accountRefs: Object.freeze(accountRefs),
      operationClasses: Object.freeze([...operationClasses]),
      observedAt: record.observedAt,
      observationVersion: record.observationVersion,
      keyClass: record.keyClass,
    });
    instances.push(instance);
    observations.push(
      Object.freeze({
        instanceId: instance.instanceId,
        observedAt: record.observedAt,
        observationVersion: record.observationVersion,
        availability: "AVAILABLE" as const,
        probedOperation: record.probedOperation,
        providerReferences: Object.freeze([...record.providerReferences]),
        evidenceTier: BRIDGE_PROVIDER_OBSERVATION_TIER,
        freshness: Object.freeze({
          observedAt: record.observedAt,
          maxAgeSeconds: BRIDGE_OBSERVATION_FRESHNESS_POLICY.maxAgeSeconds,
        }),
      }),
    );
    connectedScopes.push(
      Object.freeze({
        connectedInstanceId: status.connectionId,
        providerName,
        operationClasses: Object.freeze([...operationClasses]),
      }),
    );

    // The probed-account funding sources (PROVIDER_OBSERVATION — the
    // probe's own balance denominations; never invented):
    if (providerId === "stripe" && record.accountRef !== null && record.balanceCurrencies.length > 0) {
      fundingSources.push(
        Object.freeze({
          locationRef: record.accountRef,
          currency: record.balanceCurrencies[0]!,
          observationRef: `probe:${record.accountRef}`,
          displayName: `Stripe test account ${record.accountRef}`,
        }),
      );
    }
    if (providerId === "flutterwave") {
      for (const currency of record.balanceCurrencies) {
        fundingSources.push(
          Object.freeze({
            locationRef: `${status.connectionId}:wallet:${currency}`,
            currency,
            observationRef: `probe:${status.connectionId}:${currency}`,
            displayName: `Flutterwave ${currency} wallet (test)`,
          }),
        );
      }
    }
  }

  // The merchant-directory destinations (TEST_DATA tier — the tiers
  // never mix: the provenance is the DIRECTORY ref, never a probe ref).
  const destinations: ObservedDestination[] = [];
  for (const entry of listMerchantDirectoryEntries()) {
    const rail = instances.find(
      (instance) =>
        instance.providerId === entry.receivingContext.providerId && instance.accountRef !== "",
    );
    if (rail === undefined) {
      continue;
    }
    destinations.push(
      Object.freeze({
        locationRef: `${entry.merchantId}@${rail.accountRef}`,
        currency: entry.receivingContext.receivingCurrency,
        observationRef: `merchant-directory:${entry.merchantId}`,
        displayName: entry.displayName,
      }),
    );
  }

  return Object.freeze({
    instances: Object.freeze(instances),
    observations: Object.freeze(observations),
    fundingSources: Object.freeze(fundingSources),
    destinations: Object.freeze(destinations),
    connectedScopes: Object.freeze(connectedScopes),
  });
}
