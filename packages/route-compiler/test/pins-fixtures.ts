/**
 * @payswap/route-compiler test fixtures — authority-shaped values for the
 * structural-pin subset-typing proofs (P5-W1; the real-contracts pair
 * INVERTED onto pin laws: byte-identity + real-value subset-typing).
 */

import type { PinnedConnectedInstance, PinnedCapabilityObservation, PinnedCorridorView } from "../src/pins/capability.ts";
import type { MoneyMovementIntentPin } from "../src/pins/economic.ts";
import { corridorViewFixture, NOW_ISO, PSP_PROVIDER } from "./fixtures.ts";

/**
 * A REAL-SHAPED authority connected instance (the full authority surface
 * per @payswap/capability src/connected-instance.ts — including the
 * fields the pin deliberately does NOT carry). Subset-typing proof: the
 * authority value must be structurally assignable to the pin.
 */
export function realShapedInstance(): PinnedConnectedInstance & {
  credentialScope: { credentialRef: string; credentialKind: string };
  geography: { countries: readonly string[] };
  configuration: Readonly<Record<string, unknown>>;
} {
  return {
    instanceId: "instance:authority-shaped:001",
    capabilityId: "psp.payouts",
    implementationId: "impl:authority-shaped",
    providerName: PSP_PROVIDER,
    providerVersion: "1.0.0",
    accountRef: "acct-authority-001",
    tenantRef: "tenant:authority-shaped",
    authorization: {
      status: "ACTIVE",
      grantedAt: NOW_ISO,
      authorizationRef: "authz:authority-shaped:001",
    },
    permissionState: {
      granted: ["payments:read", "payouts:write"],
      requested: ["payouts:write"],
      missing: [],
    },
    eligibility: { eligible: true, reasons: [] },
    currencies: ["EUR", "USD"],
    credentialScope: { credentialRef: "credential-broker:ref:001", credentialKind: "API_KEY" },
    geography: { countries: ["DE", "FR"] },
    configuration: { venueKind: "fixture" },
  };
}

/**
 * A REAL-SHAPED authority capability observation (the two-axis law with
 * the derived availability agreeing — the authority's own validation
 * would accept this value).
 */
export function realShapedObservation(): PinnedCapabilityObservation & {
  quota?: { limit: number; remaining: number };
  terms?: { version: string; changePending: boolean };
} {
  return {
    instanceId: "instance:authority-shaped:001",
    observedAt: NOW_ISO,
    observationVersion: 3,
    capabilityState: "AVAILABLE",
    sourceAvailability: "REACHABLE",
    availability: "AVAILABLE",
    eligibility: "ELIGIBLE",
    health: { status: "HEALTHY", lastCheckedAt: NOW_ISO },
    provenance: { providerName: PSP_PROVIDER, source: "PROVIDER_API", capturedAt: NOW_ISO },
    quota: { limit: 1000, remaining: 950 },
    terms: { version: "1.0.0", changePending: false },
  };
}

/** A REAL-SHAPED authority intent (the 10-key neutral form, all laws met). */
export function realShapedIntent(): MoneyMovementIntentPin {
  return {
    intentId: "intent:authority-shaped:001",
    principalRef: "principal:authority-shaped",
    origin: {
      locationRef: "fundsloc:authority-origin",
      currency: "EUR",
      observationRef: "obs:authority-origin",
    },
    destination: {
      locationRef: "fundsloc:authority-destination",
      currency: "USC",
      observationRef: "obs:authority-destination",
    },
    originAmount: { currency: "EUR", minorUnits: "10000" },
    arrivalCurrency: "USC",
    constraints: { maxSettlementMs: 600000, maxRouteHops: 4 },
    intentAuthorizationRef: "authz:authority-shaped-intent:001",
    declaredAt: 0,
    expiresAt: 3_600_000,
  };
}

/** A REAL-SHAPED authority corridor view (the projection output). */
export function realShapedCorridorView(): PinnedCorridorView {
  return corridorViewFixture();
}
