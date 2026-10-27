/**
 * PaySwap Desktop (P21-A, ADR-0014 D5) — the connection-ACTIVATION
 * channel members: the Flutterwave/Paystack key-entry verbs (the Stripe
 * member's seal law) + the host-side REAL verification-probe runner
 * (THE CALLER-TRUST FIX).
 *
 * THE CALLER-TRUST FIX: connectionRunVerificationProbe(providerId)
 * executes the REAL probe host-side INSIDE the authority's credential
 * seal, over the REAL HTTPS transport code (the injected fetch binding
 * — globalThis.fetch at the composition edge), and records the outcome
 * through the authority's OWN recordVerificationOutcome — the ONLY
 * ACTIVE path stays probe-CONFIRMED (UNKNOWN/FAILED keep
 * PENDING_VERIFICATION; the existing connectionRecordVerificationOutcome
 * member stays for the labeled scripted/fixture tier only).
 *
 * THE EDGE LAW (the P18-A/P19-A/P20-A discipline): the provider id is
 * validated at the edge BEFORE any authority call; the probe targets
 * only the provider's connections that carry a SEALED credential
 * (deterministic order: createdAt, then connectionId); the outcome DTO
 * carries provider references and lifecycle facts ONLY — never key
 * material, never the credential handle, never envelope internals.
 * INV-25 unchanged: the test-prefix shape checks fail closed at the
 * key-entry verbs (a LIVE key is refused, never sealed) and the probe
 * re-validates the mode binding inside the seal.
 */

import { ConnectionSessionError, type ConnectionSessionAuthority } from "./session-authority.js";
import type { DesktopCredentialSealReceipt } from "./contracts.js";
import {
  CONNECTION_PROBE_HONEST_NOTES,
  CONNECTION_PROBE_OPERATIONS,
  PAYSWAP_PROBE_PROVIDER_IDS,
  type ConnectionProbeOutcomeDto,
  type ConnectionProbeResultDto,
  type PaySwapProbeProviderId,
} from "./probe-contracts.js";
import type { ProbeEvidenceStore } from "./probe-evidence.js";
import {
  createFlutterwaveHostTransport,
  createPaystackHostTransport,
  createStripeHostTransport,
  type HostFetch,
  type HostTransport,
} from "./host-https-transports.js";
import { hostProbeOf, type HostProbeResult } from "./verification-probes.js";
import type { IPaySwapDesktopService } from "../shell/contracts.js";

/** What the probe members need from the service (injected — never ambient). */
export interface ConnectionProbeChannelDeps {
  /** Resolves the composed connection session authority (fail-closed typed). */
  readonly resolveAuthority: () => ConnectionSessionAuthority;
  /** Resolves the composed probe-evidence ledger (composed with the authority). */
  readonly resolveEvidenceStore: () => ProbeEvidenceStore;
  /** The REAL fetch binding (the composition edge binds globalThis.fetch; tests inject fakes). */
  readonly fetchImpl: HostFetch;
  /** The host epoch clock (probe instants — injected, never ambient). */
  readonly nowMs: () => number;
  /** The host seam log (never console; no secret material is ever logged). */
  readonly log: (level: "info" | "warn" | "error", message: string, ...args: readonly unknown[]) => void;
}

/** The transport per provider (the member's dispatch table). */
function transportOf(providerId: PaySwapProbeProviderId, fetchImpl: HostFetch): HostTransport {
  if (providerId === "stripe") {
    return createStripeHostTransport(fetchImpl);
  }
  if (providerId === "flutterwave") {
    return createFlutterwaveHostTransport(fetchImpl);
  }
  return createPaystackHostTransport(fetchImpl);
}

/** The people-language per-connection summary (no envelope internals, no key material). */
function probeSummaryOf(result: HostProbeResult): string {
  if (result.outcome === "CONFIRMED") {
    return "The read-only probe confirmed — the provider answered through the real transport, and the connection is ACTIVE on this evidence alone.";
  }
  if (result.outcome === "UNKNOWN") {
    return "The probe could not interpret the provider's answer — the outcome is unknown, it reconciles by running the read-only probe again, and nothing is guessed.";
  }
  return `The probe failed (${result.failure?.code ?? "PROBE_FAILED"})${result.failure?.keyRejected === true ? " — the provider rejected the credential itself" : ""}. The connection stays pending verification; the operator may rotate the key and retry.`;
}

/** The lifecycle evidence summary the authority records (people language, secret-free). */
function evidenceSummaryOf(result: HostProbeResult, providerId: PaySwapProbeProviderId): string {
  if (result.outcome === "CONFIRMED") {
    return `read-only probe CONFIRMED via ${result.transportId} (${CONNECTION_PROBE_OPERATIONS[providerId]}): ${result.providerReferences.join("/")}`;
  }
  const detail =
    result.failure !== undefined
      ? ` (${result.failure.code})`
      : result.ambiguityReason !== undefined
        ? ` (ambiguity ${result.ambiguityReason})`
        : "";
  return `read-only probe ${result.outcome}${detail} — recorded honestly, no ACTIVE transition`;
}

/**
 * Create the connection-activation channel members (P21-A, ADR-0014
 * D5). Returned as a Pick of the service interface so the service can
 * spread them beside the P13-B connection members over the SAME
 * fail-closed authority resolver.
 */
export function createConnectionProbeChannelMembers(
  deps: ConnectionProbeChannelDeps,
): Pick<
  IPaySwapDesktopService,
  | "connectionSubmitFlutterwaveSecretKey"
  | "connectionSubmitPaystackSecretKey"
  | "connectionRunVerificationProbe"
> {
  return {
    async connectionSubmitFlutterwaveSecretKey(input: {
      readonly connectionId: string;
      readonly secretKey: string;
    }): Promise<DesktopCredentialSealReceipt> {
      const receipt = await deps.resolveAuthority().submitFlutterwaveSecretKey(input);
      // NO key material in the log line — the receipt shape guarantees it.
      deps.log(
        "info",
        "payswap-desktop: flutterwave secret key sealed (verification still required)",
        JSON.stringify({
          connectionId: receipt.connectionId,
          sealedSecretCount: receipt.sealedSecretCount,
          nextState: receipt.nextState,
        }),
      );
      return receipt;
    },

    async connectionSubmitPaystackSecretKey(input: {
      readonly connectionId: string;
      readonly secretKey: string;
    }): Promise<DesktopCredentialSealReceipt> {
      const receipt = await deps.resolveAuthority().submitPaystackSecretKey(input);
      deps.log(
        "info",
        "payswap-desktop: paystack secret key sealed (verification still required)",
        JSON.stringify({
          connectionId: receipt.connectionId,
          sealedSecretCount: receipt.sealedSecretCount,
          nextState: receipt.nextState,
        }),
      );
      return receipt;
    },

    async connectionRunVerificationProbe(providerId: string): Promise<ConnectionProbeOutcomeDto> {
      // (1) THE EDGE VALIDATION — before any authority call: only the
      // providers a REAL probe exists for are addressable.
      if (
        typeof providerId !== "string" ||
        !(PAYSWAP_PROBE_PROVIDER_IDS as readonly string[]).includes(providerId)
      ) {
        throw new ConnectionSessionError(
          "UNKNOWN_PROVIDER",
          `no verification probe exists for provider '${String(providerId)}' (the probe providers are ${PAYSWAP_PROBE_PROVIDER_IDS.join(", ")})`,
        );
      }
      const provider = providerId as PaySwapProbeProviderId;
      const authority = deps.resolveAuthority();
      const evidenceStore = deps.resolveEvidenceStore();

      // (2) The probe targets: the provider's connections that carry a
      // SEALED credential, in deterministic order. A connection with no
      // seal is refused typed — the probe runs inside the seal or not
      // at all (never a caller-asserted outcome).
      const statuses = await authority.connectionStatuses();
      const targets = statuses
        .filter((status) => status.providerId === provider && status.credentialHandleRef !== "")
        .sort((a, b) =>
          a.createdAt === b.createdAt
            ? a.connectionId < b.connectionId
              ? -1
              : 1
            : a.createdAt < b.createdAt
              ? -1
              : 1,
        );
      if (targets.length === 0) {
        throw new ConnectionSessionError(
          "CREDENTIAL_REQUIRED",
          `no connection for provider '${provider}' has a sealed credential — seal a test-mode key before running the verification probe`,
        );
      }

      // (3) THE REAL PROBE — inside the credential seal, over the REAL
      // HTTPS transport code, with the outcome recorded through the
      // authority's OWN recorder (the ONLY ACTIVE path).
      const transport = transportOf(provider, deps.fetchImpl);
      const results: ConnectionProbeResultDto[] = [];
      for (const target of targets) {
        const probe = hostProbeOf(provider, {
          transport,
          nowMs: deps.nowMs,
          executionMode: target.executionMode === "LIVE" ? "LIVE" : "SANDBOX",
        });
        const probed = await authority.withSealedCredential(
          target.connectionId,
          probe,
          `connection-verification-probe:${provider}`,
        );
        const view = await authority.recordVerificationOutcome({
          connectionId: target.connectionId,
          outcome: probed.outcome,
          evidenceSummary: evidenceSummaryOf(probed, provider),
        });
        // (4) The structured, secret-free evidence record (the bridge's
        // input) — freshness-stamped, versioned by the ledger.
        await evidenceStore.recordProbeEvidence({
          connectionId: target.connectionId,
          providerId: provider,
          probedOperation: CONNECTION_PROBE_OPERATIONS[provider],
          outcome: probed.outcome,
          providerReferences: [...probed.providerReferences],
          accountRef: probed.accountRef,
          providerLiveMode: probed.providerLiveMode,
          keyClass: probed.keyClass,
          balanceCurrencies: [...probed.balanceCurrencies],
          transportId: probed.transportId,
          executionMode: probed.executionMode,
          observedAt: new Date(deps.nowMs()).toISOString(),
          evidenceTier: "PROVIDER_OBSERVATION",
        });
        const row: ConnectionProbeResultDto = {
          connectionId: target.connectionId,
          outcome: probed.outcome,
          providerReferences: [...probed.providerReferences],
          state: view.state,
          summary: probeSummaryOf(probed),
          ...(probed.failure !== undefined ? { failureCode: probed.failure.code } : {}),
        };
        results.push(row);
      }

      deps.log(
        "info",
        `payswap-desktop: verification probe ran for provider ${provider} (${String(results.length)} connection(s), outcomes ${results.map((row) => row.outcome).join(", ")}) — the outcome recorded through the authority's own recorder`,
      );
      return {
        providerId: provider,
        probedOperation: CONNECTION_PROBE_OPERATIONS[provider],
        results,
        evidenceTier: "PROVIDER_OBSERVATION",
        note: CONNECTION_PROBE_HONEST_NOTES[provider],
      };
    },
  };
}
