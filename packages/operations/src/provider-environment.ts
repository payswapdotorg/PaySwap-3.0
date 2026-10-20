/**
 * @payswap/operations — the exact provider environment + activation
 * records (P8-W3, hard law 6, part 1).
 *
 * REAUTHORED from payswap.org@8a735bf packages/operations/src/
 * provider-activation.ts onto the canonical architecture:
 * - the EXACT PROVIDER ENVIRONMENT is a typed record: provider, tier,
 *   the pinned @payswap/provider-runtime execution mode + transport
 *   class, the credential CONFIG KEY and HANDLE (never a value), and the
 *   honest limitations. The sandbox/live separation is structural:
 *   LIVE requires the production tier AND a PRODUCTION_HTTP transport —
 *   a FAKE_DETERMINISTIC transport can never serve live behavior (the
 *   pinned transport-binding law);
 * - ACTIVATION RECORDS are VERSIONED, IMMUTABLE and APPEND-ONLY: a new
 *   record SUPERSEDES a prior one by reference; history is never
 *   rewritten. ACTIVATED requires live probe evidence AND a connected
 *   instance reference; every other status forbids one. Operator input
 *   is never proof of integration;
 * - ENABLEMENT IS DATA, NOT ENVIRONMENT: per-provider enablement derives
 *   from the activation ledger plus explicit operator overrides — never
 *   from a redeploy. Fail-closed: no current ACTIVATED record means NOT
 *   ENABLED, whatever an override says; an override may only DISABLE.
 *
 * Deterministic only: no ambient clock, no entropy, no network. All
 * timestamps are caller-supplied ISO-8601 UTC strings.
 */

import { contentDigest, deepFreeze } from "./digest.js";
import type { EnvironmentTier } from "./environment.js";
import { isEnvironmentTier } from "./environment.js";
import {
  isPinnedExecutionMode,
  isPinnedTransportClass,
  PINNED_CREDENTIAL_HANDLE_PATTERN,
  type PinnedExecutionMode,
  type PinnedTransportClass,
} from "./pins/provider-runtime.js";
import { isSecretShaped } from "./secrets.js";

/** Raised when the provider-environment contract is violated. */
export class ProviderEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderEnvironmentError";
  }
}

const ISO_8601_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const PROVIDER_CREDENTIAL_CONFIG_KEY_PATTERN =
  /^PROVIDER_[A-Z0-9]+(?:_[A-Z0-9]+)*_CREDENTIAL_REF$/;
const VAULT_REFERENCE_PATTERN =
  /^vault:\/\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)+$/;

// ---------------------------------------------------------------------------
// The exact provider environment
// ---------------------------------------------------------------------------

/**
 * The EXACT provider environment: every field required — a rollout step
 * that cannot name its environment exactly cannot run (law 6).
 */
export interface ProviderEnvironmentRecord {
  readonly providerName: string;
  /** The operational tier this binding lives in. */
  readonly tier: EnvironmentTier;
  /** Pinned @payswap/provider-runtime execution mode. */
  readonly executionMode: PinnedExecutionMode;
  /** Pinned @payswap/provider-runtime transport class. */
  readonly transportClass: PinnedTransportClass;
  /** The credential config key (PROVIDER_<NAME>_CREDENTIAL_REF template). */
  readonly credentialConfigKey: string;
  /** The credential HANDLE — a vault reference or runtime handle, never a value. */
  readonly credentialHandle: string;
  /** Honest limitations carried into every consumer (e.g. "test-mode keys"). */
  readonly limitations: readonly string[];
  /** Deterministic fingerprint of the whole record. */
  readonly digest: string;
}

/**
 * Assemble + validate the exact provider environment (fail-closed):
 * sandbox/live separation is structural — LIVE requires the production
 * tier and a PRODUCTION_HTTP transport; the credential binding is
 * handle-only; secret-shaped values are rejected everywhere.
 */
export function defineProviderEnvironment(input: {
  readonly providerName: string;
  readonly tier: EnvironmentTier;
  readonly executionMode: PinnedExecutionMode;
  readonly transportClass: PinnedTransportClass;
  readonly credentialConfigKey: string;
  readonly credentialHandle: string;
  readonly limitations?: readonly string[];
}): ProviderEnvironmentRecord {
  if (typeof input.providerName !== "string" || input.providerName.length < 2) {
    throw new ProviderEnvironmentError("providerName must be a non-trivial string");
  }
  if (!isEnvironmentTier(input.tier)) {
    throw new ProviderEnvironmentError(
      `unknown environment tier '${String(input.tier)}'`,
    );
  }
  if (!isPinnedExecutionMode(input.executionMode)) {
    throw new ProviderEnvironmentError(
      "executionMode must be the pinned vocabulary (SANDBOX|LIVE)",
    );
  }
  if (!isPinnedTransportClass(input.transportClass)) {
    throw new ProviderEnvironmentError(
      "transportClass must be the pinned vocabulary (FAKE_DETERMINISTIC|PRODUCTION_HTTP)",
    );
  }
  if (
    !PROVIDER_CREDENTIAL_CONFIG_KEY_PATTERN.test(input.credentialConfigKey)
  ) {
    throw new ProviderEnvironmentError(
      `credentialConfigKey must match PROVIDER_<NAME>_CREDENTIAL_REF, got '${input.credentialConfigKey}'`,
    );
  }
  const handleIsReference =
    VAULT_REFERENCE_PATTERN.test(input.credentialHandle) ||
    PINNED_CREDENTIAL_HANDLE_PATTERN.test(input.credentialHandle);
  if (typeof input.credentialHandle !== "string" || !handleIsReference) {
    throw new ProviderEnvironmentError(
      "credentialHandle must be a vault:// reference or a runtime handle (never a value)",
    );
  }
  if (input.executionMode === "LIVE") {
    if (input.tier !== "production") {
      throw new ProviderEnvironmentError(
        `provider '${input.providerName}' declares LIVE execution outside the production tier — sandbox/live separation is structural`,
      );
    }
    if (input.transportClass !== "PRODUCTION_HTTP") {
      throw new ProviderEnvironmentError(
        `provider '${input.providerName}' declares LIVE execution over a '${input.transportClass}' transport — a fake transport can never serve live behavior`,
      );
    }
  }
  const body = {
    providerName: input.providerName,
    tier: input.tier,
    executionMode: input.executionMode,
    transportClass: input.transportClass,
    credentialConfigKey: input.credentialConfigKey,
    credentialHandle: input.credentialHandle,
    limitations: [...(input.limitations ?? [])],
  };
  if (isSecretShaped(JSON.stringify(body))) {
    throw new ProviderEnvironmentError(
      "secret-shaped value in a provider environment record (handles only)",
    );
  }
  return deepFreeze({ ...body, digest: contentDigest(body) });
}
