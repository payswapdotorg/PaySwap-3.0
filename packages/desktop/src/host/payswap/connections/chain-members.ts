/**
 * PaySwap Desktop (P21-D Gap A, ADR-0014 D6/D12) — the CONNECTION
 * CAPABILITY CHAINS channel member: the host-side read that derives the
 * corridor route chains from the REAL connection bridge (the registry's
 * own statuses + the probe-evidence ledger) and returns them as wire
 * DTOs for the renderer's route-planning composition.
 *
 * THE WIRE LAW (the DTO law): the chains carry capability metadata
 * ONLY — the four layers the REAL corridor validators re-validate
 * fail-closed renderer-side. NO credentials, NO secret material, NO
 * authorization artifacts: the instance's credential scope carries the
 * OPAQUE connection reference (INV-19 — the same id the
 * connectionStatuses member already discloses), never the handle,
 * never the key; the authorization field carries the lifecycle STATUS
 * the statuses member already discloses, never an artifact.
 *
 * THE EDGE LAW (the probe-members pattern): the member requires BOTH
 * composed planes (the connection authority + the probe-evidence
 * ledger) and fails closed with the typed
 * ConnectionPlaneNotConfiguredError when either is absent — never a
 * silent empty set pretending the planes exist. A COMPOSED plane with
 * zero ACTIVE connections derives the honest empty chain set (the
 * bridge's own law).
 */

import type { ConnectionSessionAuthority } from "./session-authority.js";
import type { ProbeEvidenceStore } from "./probe-evidence.js";
import { deriveConnectionCapabilityBridge } from "./capability-bridge.js";
import { chainsFromBridge, type ConnectionCapabilityRouteChain } from "./chain-from-bridge.js";
import { onchainsFromPlanes } from "./onchain-chain-derivation.js";
import type { IPaySwapDesktopService } from "../shell/contracts.js";
import { ConnectionPlaneNotConfiguredError } from "../shell/plane-errors.js";

/** What the chain member needs from the service (injected — never ambient). */
export interface ConnectionChainChannelDeps {
  /** Resolves the composed connection session authority (fail-closed typed). */
  readonly resolveAuthority: () => ConnectionSessionAuthority;
  /** Resolves the composed probe-evidence ledger (composed with the authority). */
  readonly resolveEvidenceStore: () => ProbeEvidenceStore;
  /** The host seam log (never console; no secret material is ever logged). */
  readonly log: (level: "info" | "warn" | "error", message: string, ...args: readonly unknown[]) => void;
}

/**
 * The ABSENT-planes posture (the service wiring picks this when the
 * connection or probe plane was not composed): the member is REAL or
 * absent — it fails closed with the typed ConnectionPlaneNotConfigured-
 * Error on first use, never a silent empty set pretending the planes
 * exist (the workspace-store posture; the split keeps the service file
 * within the file law).
 */
export function createAbsentConnectionCapabilityChainChannelMembers(): Pick<
  IPaySwapDesktopService,
  "connectionCapabilityChains"
> {
  return {
    async connectionCapabilityChains(): Promise<readonly ConnectionCapabilityRouteChain[]> {
      throw new ConnectionPlaneNotConfiguredError();
    },
  };
}

/**
 * Create the connection-capability-chains channel member. Returned as a
 * Pick of the service interface so the service can spread it beside the
 * P13-B/P21-A connection members over the SAME fail-closed resolvers.
 */
export function createConnectionCapabilityChainChannelMembers(
  deps: ConnectionChainChannelDeps,
): Pick<IPaySwapDesktopService, "connectionCapabilityChains"> {
  return {
    async connectionCapabilityChains(): Promise<readonly ConnectionCapabilityRouteChain[]> {
      // The bridge's own inputs, read through the composed planes
      // (fail-closed typed resolvers, never fabricated).
      const [statuses, evidence] = await Promise.all([
        deps.resolveAuthority().connectionStatuses(),
        deps.resolveEvidenceStore().latestProbeEvidence(),
      ]);
      // (P22-H, ADR-0016 D2/D5) The PSP bridge chains + the ONCHAIN RAIL
      // chains: the corridor's relay chain derives from the onchain
      // plane's own four-layer hierarchy (never a PSP probe id —
      // ADR-0008 D5 preserved); the two derivations are DISJOINT by
      // construction (the bridge skips the rail's provider ref; the
      // onchain derivation skips the PSP records).
      const bridgeChains = chainsFromBridge(
        deriveConnectionCapabilityBridge({ statuses, evidence }),
      );
      const onchainChains = onchainsFromPlanes({ statuses, evidence });
      const chains = Object.freeze([...bridgeChains, ...onchainChains]);
      deps.log(
        "info",
        `payswap-desktop: ${String(chains.length)} connection capability chain(s) derived (${String(bridgeChains.length)} PSP bridge + ${String(onchainChains.length)} onchain rail — capability metadata only — no credentials, no secret material, no authorization artifacts)`,
      );
      return chains;
    },
  };
}
