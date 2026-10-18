/**
 * @payswap/onchain-domain — structural validation of the pinned wire
 * shapes (P4-W1, lane R2-W1).
 *
 * The validators below enforce the pinned SUBSET of the authority lanes'
 * laws (authority-named on each pin in src/pins.ts): the INV-13 instance
 * scope completeness, the INV-13 catalogue-entry discrimination, the
 * INV-5/INV-6/INV-15 explicit-mode + protocol-authorization-link execution
 * request law, and the pinned catalogue-base shape. The FULL laws
 * (fourteen-part executable declarations, certification, corridor
 * restrictions) remain the authority lanes' — these validators never
 * weaken and never re-own them.
 */

import { ValidationError } from "./errors.ts";
import {
  isNonEmptyString,
  isNonEmptyStringArray,
  isRecord,
  cloneAndFreeze,
} from "./shared.ts";
import type {
  PinnedCapabilityDefinition,
  PinnedExecutionMode,
  PinnedExecutionRequestValidation,
  PinnedConnectorExecutionRequest,
  ConnectedInstancePin,
  ProviderCatalogueEntryPin,
} from "./pins.ts";
import {
  PINNED_CAPABILITY_CLASSES,
  PINNED_EXECUTION_MODES,
  PINNED_EXECUTION_MODE_VOCABULARY_VERSION,
} from "./pins.ts";

// ---------------------------------------------------------------------------
// Vocabulary guards (pinned values)
// ---------------------------------------------------------------------------

/** Guard: a declared capability class (the pinned 13-member vocabulary). */
export function isPinnedCapabilityClass(value: unknown): value is (typeof PINNED_CAPABILITY_CLASSES)[number] {
  return (
    typeof value === "string" &&
    (PINNED_CAPABILITY_CLASSES as readonly unknown[]).includes(value)
  );
}

/** Guard: a declared execution mode (the pinned 3-mode vocabulary). */
export function isPinnedExecutionMode(value: unknown): value is PinnedExecutionMode {
  return (
    typeof value === "string" &&
    (PINNED_EXECUTION_MODES as readonly unknown[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// The pinned catalogue base (layer-1 subset validation)
// ---------------------------------------------------------------------------

/**
 * Validates the pinned catalogue base SUBSET: id/version/class/provenance
 * present and well-formed, plus the executable/non-executable
 * discriminator law (executable absence is EXPLICIT — never silent). The
 * authority lane's full base laws (conditions, cost, risk, economic
 * accountability, proof requirements, the fourteen-part declaration) are
 * NOT re-owned here: a value passing this validator still needs the
 * capability lane's own validators to be a registered definition.
 */
export function validatePinnedDefinitionBase(
  candidate: unknown,
): PinnedCapabilityDefinition {
  const errors: string[] = [];
  if (!isRecord(candidate)) {
    throw new ValidationError("capability definition (pinned base) must be an object");
  }
  const record = candidate;
  for (const field of ["id", "version"] as const) {
    if (!isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (!isPinnedCapabilityClass(record.capabilityClass)) {
    errors.push(
      `capabilityClass must be one of [${PINNED_CAPABILITY_CLASSES.join(", ")}] (the pinned capability-fabric vocabulary)`,
    );
  }
  const provenance = record.provenance;
  if (
    !isRecord(provenance) ||
    !isNonEmptyString(provenance.declaredBy) ||
    !isNonEmptyString(provenance.artifactRef) ||
    !isNonEmptyString(provenance.contentHash)
  ) {
    errors.push(
      "provenance must be { declaredBy, artifactRef, contentHash } (the pinned ProvenanceDescriptor — a catalogue entry without provenance is rejected)",
    );
  }
  if (record.executable === true) {
    if (typeof record.execution !== "object" || record.execution === null) {
      errors.push(
        "an executable definition must carry its execution declaration object (the fourteen-part law is the capability lane's authority — presence is required here)",
      );
    }
  } else if (record.executable === false) {
    if (!isNonEmptyString(record.nonExecutableReason)) {
      errors.push(
        "a non-executable definition must carry an explicit nonExecutableReason (executable absence is never silent)",
      );
    }
  } else {
    errors.push(
      "executable must be true or false (the catalogue discriminator is mandatory on the pinned base)",
    );
  }
  if (errors.length > 0) {
    throw new ValidationError(
      `Invalid capability definition (pinned base): ${errors.join("; ")}`,
      { errors: [...errors] },
    );
  }
  return cloneAndFreeze(candidate as unknown as PinnedCapabilityDefinition);
}

// ---------------------------------------------------------------------------
// The pinned connected instance (the INV-13 authorization scope)
// ---------------------------------------------------------------------------

/** Guard: a genuinely connected instance shape (INV-13 scope present). */
export function isConnectedInstancePin(value: unknown): value is ConnectedInstancePin {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNonEmptyString(value.instanceId) &&
    isNonEmptyString(value.capabilityId) &&
    isNonEmptyString(value.implementationId) &&
    isNonEmptyString(value.providerName) &&
    isNonEmptyString(value.providerVersion) &&
    isNonEmptyString(value.accountRef) &&
    isNonEmptyString(value.tenantRef) &&
    isRecord(value.authorization) &&
    isRecord(value.credentialScope) &&
    isRecord(value.geography) &&
    isRecord(value.permissionState) &&
    isRecord(value.eligibility) &&
    isRecord(value.configuration)
  );
}

/**
 * Runtime validation for a connected instance arriving from untyped
 * sources. Enforces the full pinned INV-13 scope: real account/tenant,
 * credential scope (opaque reference only — INV-19), authorization state,
 * geography/currency, permission state, eligibility and configuration.
 */
export function validatePinnedConnectedInstance(candidate: unknown): ConnectedInstancePin {
  const errors: string[] = [];
  if (!isRecord(candidate)) {
    throw new ValidationError("connected capability instance must be an object");
  }
  const record = candidate;
  for (const field of [
    "instanceId",
    "capabilityId",
    "implementationId",
    "providerName",
    "providerVersion",
    "accountRef",
    "tenantRef",
  ] as const) {
    if (!isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  const authorization = record.authorization;
  if (
    !isRecord(authorization) ||
    !["ACTIVE", "PENDING", "REVOKED", "EXPIRED", "UNKNOWN"].includes(
      String(authorization.status),
    )
  ) {
    errors.push(
      "authorization.status must be ACTIVE, PENDING, REVOKED, EXPIRED or UNKNOWN",
    );
  }
  const credentialScope = record.credentialScope;
  if (!isRecord(credentialScope) || !isNonEmptyString(credentialScope.credentialRef)) {
    errors.push("credentialScope.credentialRef must be a non-empty (opaque) string");
  } else if (
    credentialScope.credentialKind !== "API_KEY" &&
    credentialScope.credentialKind !== "OAUTH" &&
    credentialScope.credentialKind !== "DELEGATED_TOKEN" &&
    credentialScope.credentialKind !== "SESSION" &&
    credentialScope.credentialKind !== "PROVIDER_DEFINED"
  ) {
    errors.push("credentialScope.credentialKind must be a declared kind");
  }
  const geography = record.geography;
  if (!isRecord(geography) || !isNonEmptyStringArray(geography.countries)) {
    errors.push("geography.countries must be an array of country codes");
  }
  if (!isNonEmptyStringArray(record.currencies)) {
    errors.push("currencies must be a non-empty array of currency codes");
  }
  const permissionState = record.permissionState;
  if (!isRecord(permissionState)) {
    errors.push("permissionState must be a ConnectorPermissionState");
  } else {
    for (const field of ["granted", "requested", "missing"] as const) {
      if (!Array.isArray(permissionState[field])) {
        errors.push(`permissionState.${field} must be an array of strings`);
      }
    }
  }
  const eligibility = record.eligibility;
  if (
    !isRecord(eligibility) ||
    typeof eligibility.eligible !== "boolean" ||
    !Array.isArray(eligibility.reasons)
  ) {
    errors.push("eligibility must be { eligible: boolean, reasons: string[] }");
  }
  const configuration = record.configuration;
  if (!isRecord(configuration)) {
    errors.push("configuration must be a provider-neutral record");
  } else {
    for (const [key, value] of Object.entries(configuration)) {
      if (
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean"
      ) {
        errors.push(
          `configuration.${key} must be a string, number or boolean (provider-neutral primitives only)`,
        );
      }
    }
  }
  if (errors.length > 0) {
    throw new ValidationError(
      `Invalid connected capability instance: ${errors.join("; ")}`,
      { errors: [...errors] },
    );
  }
  return cloneAndFreeze(candidate as unknown as ConnectedInstancePin);
}

// ---------------------------------------------------------------------------
// The pinned catalogue entry (the INV-13 advertisement shape)
// ---------------------------------------------------------------------------

/** Guard: a provider catalogue entry shape (an advertisement, never authority). */
export function isProviderCatalogueEntryPin(
  value: unknown,
): value is ProviderCatalogueEntryPin {
  if (!isRecord(value)) {
    return false;
  }
  const scope = value.advertisedScope;
  return (
    isNonEmptyString(value.catalogueEntryId) &&
    scope !== undefined &&
    scope !== null &&
    typeof scope === "object" &&
    (scope as Readonly<Record<string, unknown>>).platformWide === true
  );
}

// ---------------------------------------------------------------------------
// The pinned execution request (explicit-mode + authorization-link law)
// ---------------------------------------------------------------------------

/**
 * Validates that an execution request carries an explicit, valid mode AND
 * the protocol authorization link (the pinned capability-fabric law):
 * missing mode, stale mode vocabulary, missing instance reference, missing
 * idempotency key and a missing protocol authorization reference are all
 * violations. NO mode — including PASS_THROUGH_NATIVE (the INV-15 incumbent
 * baseline, never disadvantaged) — bypasses protocol authorization.
 */
export function validatePinnedExecutionRequest(
  request: unknown,
): PinnedExecutionRequestValidation {
  const violations: string[] = [];
  const candidate = request as Partial<PinnedConnectorExecutionRequest> | null;

  if (candidate === null || typeof candidate !== "object") {
    return {
      ok: false,
      violations: ["execution request must be an object"],
    };
  }

  if (!isPinnedExecutionMode(candidate.executionMode)) {
    violations.push(
      "executionMode is REQUIRED and must be explicit on every execution: PASS_THROUGH_NATIVE | COMPOSED_PAYSWAP | OPTIMIZED_MULTI_PROVIDER",
    );
  }
  if (candidate.modeVocabularyVersion !== PINNED_EXECUTION_MODE_VOCABULARY_VERSION) {
    violations.push(
      `modeVocabularyVersion must be '${PINNED_EXECUTION_MODE_VOCABULARY_VERSION}' (versioned mode contract)`,
    );
  }
  if (
    typeof candidate.capabilityInstanceId !== "string" ||
    candidate.capabilityInstanceId === ""
  ) {
    violations.push(
      "capabilityInstanceId is required (must reference a ConnectedCapabilityInstance, never a provider catalogue entry or definition — INV-13)",
    );
  }
  if (typeof candidate.idempotencyKey !== "string" || candidate.idempotencyKey === "") {
    violations.push("idempotencyKey is required");
  }
  const authorization = candidate.protocolAuthorization;
  if (
    authorization === null ||
    typeof authorization !== "object" ||
    typeof authorization.commandId !== "string" ||
    authorization.commandId === "" ||
    authorization.principal === null ||
    typeof authorization.principal !== "object" ||
    typeof authorization.principal.principalType !== "string" ||
    typeof authorization.principal.principalId !== "string" ||
    typeof authorization.authorizationEvidenceRef !== "string" ||
    authorization.authorizationEvidenceRef === ""
  ) {
    violations.push(
      "protocolAuthorization is required: no execution mode (including PASS_THROUGH_NATIVE) can bypass protocol authorization",
    );
  }

  if (violations.length > 0) {
    return { ok: false, violations };
  }
  return { ok: true, mode: (candidate as PinnedConnectorExecutionRequest).executionMode };
}

// ---------------------------------------------------------------------------
// The pinned provider implementation subset (layer-2 validation)
// ---------------------------------------------------------------------------

import type { ProviderImplementationPin } from "./pins.ts";

/**
 * Validates the pinned ProviderImplementation SUBSET: identity fields
 * present, the EXACT capability-version pin present (catalogue resolution
 * must be deterministic — the authority law), and the opaque adapter
 * reference. The authority's full layer-2 laws (corridor scopes, documented
 * deviations, the narrowing restriction set) are NOT re-owned here.
 */
export function validatePinnedProviderImplementation(
  candidate: unknown,
): ProviderImplementationPin {
  const errors: string[] = [];
  if (!isRecord(candidate)) {
    throw new ValidationError("provider implementation (pinned subset) must be an object");
  }
  const record = candidate;
  for (const field of [
    "implementationId",
    "providerName",
    "providerVersion",
    "capabilityVersion",
    "version",
    "adapterRef",
  ] as const) {
    if (!isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (!isNonEmptyString(record.capabilityId)) {
    errors.push("capabilityId must be a non-empty string (the implemented definition)");
  }
  if (errors.length > 0) {
    throw new ValidationError(
      `Invalid provider implementation (pinned subset): ${errors.join("; ")}`,
      { errors: [...errors] },
    );
  }
  return cloneAndFreeze(candidate as unknown as ProviderImplementationPin);
}
