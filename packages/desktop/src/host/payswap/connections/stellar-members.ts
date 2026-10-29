/**
 * PaySwap Desktop (P22-H, ADR-0016 D2/D9) — the ONCHAIN RAIL channel
 * members: the Stellar keypair-entry verb + the host-side REAL Horizon
 * account-read probe runner.
 *
 * THE MEMBER LAW (the probe-members precedent, applied to the rail):
 * `connectionRunStellarAccountReadProbe()` executes the REAL probe
 * host-side INSIDE the authority's credential seal, over the REAL
 * Horizon testnet transport (the injected fetch binding —
 * globalThis.fetch at the composition edge), and records the outcome
 * through the authority's OWN recordVerificationOutcome — the ONLY
 * ACTIVE path stays probe-CONFIRMED. The probe addresses the
 * `stellar:testnet` connections ONLY — the PSP vocabulary
 * (PAYSWAP_PROBE_PROVIDER_IDS) is NEVER touched (ADR-0008 D5: the rail
 * is not a payment provider).
 *
 * THE EDGE LAW: the runner targets only the rail's connections that
 * carry a SEALED credential (deterministic order); the outcome DTO
 * carries positions and lifecycle facts ONLY — never key material,
 * never the credential handle (INV-19). The structured evidence record
 * lands in the probe-evidence ledger with the issuer-scoped asset
 * positions (the corridor chain's grounding input).
 */

import { ConnectionSessionError, type ConnectionSessionAuthority } from "./session-authority.js";
import type { DesktopCredentialSealReceipt } from "./contracts.js";
import {
  PINNED_STELLAR_RAIL_PROVIDER_REF,
  STELLAR_ACCOUNT_READ_HONEST_NOTE,
  STELLAR_ACCOUNT_READ_PROBED_OPERATION,
  type ConnectionProbeOutcomeKind,
} from "./probe-contracts.js";
import type { ProbeEvidenceStore } from "./probe-evidence.js";
import { createStellarHorizonHostTransport, type HostFetch } from "./host-https-transports.js";
import { createHostStellarAccountReadProbe } from "./stellar-account-probe.js";
import type { IPaySwapDesktopService } from "../shell/contracts.js";

/** What the Stellar members need from the service (injected — never ambient). */
export interface ConnectionStellarChannelDeps {
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

/** One probed Stellar connection's secret-free result row. */
export interface StellarAccountReadResultDto {
  readonly connectionId: string;
  readonly outcome: ConnectionProbeOutcomeKind;
  /** The account ref (G…) + the issuer-scoped asset refs observed. */
  readonly providerReferences: readonly string[];
  /** The connection state AFTER the outcome was recorded through the authority. */
  readonly state: string;
  /** People-language summary (no envelope internals, no key material). */
  readonly summary: string;
  /** Present iff FAILED — the failure code, never verbatim provider text. */
  readonly failureCode?: string;
}

/** The secret-free outcome of one Stellar account-read probe run. */
export interface StellarAccountReadOutcomeDto {
  readonly providerRef: typeof PINNED_STELLAR_RAIL_PROVIDER_REF;
  readonly probedOperation: typeof STELLAR_ACCOUNT_READ_PROBED_OPERATION;
  readonly results: readonly StellarAccountReadResultDto[];
  readonly evidenceTier: "PROVIDER_OBSERVATION";
  readonly note: string;
}

/** The people-language per-connection summary (no key material). */
function stellarProbeSummaryOf(outcome: ConnectionProbeOutcomeKind, failureCode?: string): string {
  if (outcome === "CONFIRMED") {
    return "The Horizon account read confirmed — the keypair's testnet account answered through the real transport, its asset positions are observed, and the connection is ACTIVE on this evidence alone.";
  }
  if (outcome === "UNKNOWN") {
    return "The account read could not interpret Horizon's answer — the outcome is unknown, it reconciles by running the read-only probe again, and nothing is guessed.";
  }
  return `The account read failed (${failureCode ?? "PROBE_FAILED"}). The connection stays pending verification; fund the testnet account or rotate the keypair and retry.`;
}

/**
 * Create the onchain-rail channel members (P22-H). Returned as a Pick of
 * the service interface so the service can spread them beside the P21-A
 * connection members over the SAME fail-closed authority resolver.
 */
export function createConnectionStellarChannelMembers(
  deps: ConnectionStellarChannelDeps,
): Pick<IPaySwapDesktopService, "connectionSubmitStellarSecretKey" | "connectionRunStellarAccountReadProbe"> {
  return {
    async connectionSubmitStellarSecretKey(input: {
      readonly connectionId: string;
      readonly publicKey: string;
      readonly secretKey: string;
    }): Promise<DesktopCredentialSealReceipt> {
      const receipt = await deps.resolveAuthority().submitStellarSecretKey(input);
      // NO key material in the log line — the receipt shape guarantees it.
      deps.log(
        "info",
        "payswap-desktop: stellar keypair sealed (verification still required)",
        JSON.stringify({
          connectionId: receipt.connectionId,
          sealedSecretCount: receipt.sealedSecretCount,
          nextState: receipt.nextState,
        }),
      );
      return receipt;
    },

    async connectionRunStellarAccountReadProbe(): Promise<StellarAccountReadOutcomeDto> {
      const authority = deps.resolveAuthority();
      const evidenceStore = deps.resolveEvidenceStore();

      // (1) The probe targets: the stellar:testnet connections that carry
      // a SEALED credential, in deterministic order. The PSP edge
      // validation is INTENTIONALLY not consulted — the rail addresses
      // its own connections by the pinned chain key, never a PSP id.
      const statuses = await authority.connectionStatuses();
      const targets = statuses
        .filter(
          (status) =>
            status.providerId === PINNED_STELLAR_RAIL_PROVIDER_REF && status.credentialHandleRef !== "",
        )
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
          "no stellar:testnet connection has a sealed keypair — seal a keypair before running the account-read probe",
        );
      }

      // (2) THE REAL PROBE — inside the credential seal, over the REAL
      // Horizon testnet transport, with the outcome recorded through the
      // authority's OWN recorder (the ONLY ACTIVE path).
      const transport = createStellarHorizonHostTransport(deps.fetchImpl);
      const results: StellarAccountReadResultDto[] = [];
      for (const target of targets) {
        const probe = createHostStellarAccountReadProbe({
          transport,
          nowMs: deps.nowMs,
          executionMode: target.executionMode === "LIVE" ? "LIVE" : "SANDBOX",
        });
        const probed = await authority.withSealedCredential(
          target.connectionId,
          probe,
          "stellar-account-read-probe",
        );
        const view = await authority.recordVerificationOutcome({
          connectionId: target.connectionId,
          outcome: probed.outcome,
          evidenceSummary:
            probed.outcome === "CONFIRMED"
              ? `stellar account read CONFIRMED via ${probed.transportId} (${STELLAR_ACCOUNT_READ_PROBED_OPERATION}): ${probed.providerReferences.join("/")}`
              : `stellar account read ${probed.outcome}${probed.failure !== undefined ? ` (${probed.failure.code})` : probed.ambiguityReason !== undefined ? ` (ambiguity ${probed.ambiguityReason})` : ""} — recorded honestly, no ACTIVE transition`,
        });
        // (3) The structured, secret-free evidence record (the onchain
        // chain derivation's input) — freshness-stamped, versioned.
        await evidenceStore.recordProbeEvidence({
          connectionId: target.connectionId,
          providerId: PINNED_STELLAR_RAIL_PROVIDER_REF,
          probedOperation: STELLAR_ACCOUNT_READ_PROBED_OPERATION,
          outcome: probed.outcome,
          providerReferences: [...probed.providerReferences],
          accountRef: probed.accountRef,
          providerLiveMode: probed.providerLiveMode,
          keyClass: probed.keyClass,
          balanceCurrencies: [...probed.balanceCurrencies],
          ...(probed.positions !== null ? { assetPositions: [...probed.positions.assetRefs] } : {}),
          transportId: probed.transportId,
          executionMode: probed.executionMode,
          observedAt: new Date(deps.nowMs()).toISOString(),
          evidenceTier: "PROVIDER_OBSERVATION",
        });
        results.push({
          connectionId: target.connectionId,
          outcome: probed.outcome,
          providerReferences: [...probed.providerReferences],
          state: view.state,
          summary: stellarProbeSummaryOf(probed.outcome, probed.failure?.code),
          ...(probed.failure !== undefined ? { failureCode: probed.failure.code } : {}),
        });
      }

      deps.log(
        "info",
        `payswap-desktop: stellar account-read probe ran (${String(results.length)} connection(s), outcomes ${results.map((row) => row.outcome).join(", ")}) — the outcome recorded through the authority's own recorder`,
      );
      return {
        providerRef: PINNED_STELLAR_RAIL_PROVIDER_REF,
        probedOperation: STELLAR_ACCOUNT_READ_PROBED_OPERATION,
        results,
        evidenceTier: "PROVIDER_OBSERVATION",
        note: STELLAR_ACCOUNT_READ_HONEST_NOTE,
      };
    },
  };
}
