/**
 * PaySwap Desktop renderer (P21-B run 4 / Part E, ADR-0014 D5) — the
 * CONNECTIONS-ACTIVATION composition root: binds the payswap-desktop
 * channel's activation members (statuses / seed / the three key-entry
 * verbs / the verification probe) into the app's pinned
 * ConnectionsActivationPort, at the desktop renderer's business-root
 * initialization.
 *
 * THE WIRING LAWS (ADR-0014 D5/D11 — the missionIntakeComposition pattern):
 * - 1:1 MEMBER MAPPING: the adapter maps each port member onto its
 *   channel member and NOTHING else; the key input carries EXACTLY the
 *   two caller fields; the probe takes the provider id verbatim.
 * - THE ONE MATERIAL PATH: the key crosses renderer→host ONCE and is
 *   sealed immediately host-side; the receipt carries counts and the
 *   opaque handle ref, never the key; this adapter never stores,
 *   echoes or logs key material.
 * - FAIL-CLOSED: a member rejection rethrows (the typed error surfaces
 *   through the panel's honest error line, never coerced).
 * - THE SHARED SEAM: composeConnectionsActivationBinding binds the
 *   shared plane BEFORE the connections surface renders. The web tier
 *   binds nothing: the honest unbound note (ADR-0010 D7 analogue).
 *
 * Mounting law: this module is a composition root beside
 * ./missionIntakeComposition.ts (the ADR-0010 D1 renderer-exemption
 * precedent; module ownership unchanged — no new edges).
 */

import {
  bindSharedConnectionsActivationPlane,
  resetSharedConnectionsActivationPlane,
  type ConnectionsActivationPort,
  type ConnectionsActivationPortWithStellarRail,
} from "@payswap/app";
import type { DesktopConsoleChannelServices } from "./consoleWorkspaceMount.js";
import type {
  PaySwapConnectionProbeOutcomeDto,
  PaySwapConnectionSetupOutcomeDto,
  PaySwapConnectionStatusViewDto,
  PaySwapCredentialSealReceiptDto,
  PaySwapStellarAccountReadOutcomeDto,
} from "./consoleConnectionsWire.js";

/* -------- the channel client surface this composition rides -------- */

/**
 * The activation members the port rides (the channel client's surface —
 * the drift-tested member set; see consoleWorkspaceMount.tsx).
 * (P22-B, ADR-0016 D9) The two Stellar rail members: the keypair submit
 * (BOTH halves cross once as ONE material) and the Horizon account-read
 * probe (the rail's own ACTIVE path — the PSP vocabulary is NEVER
 * touched host-side).
 */
export interface ConnectionsActivationChannelClient {
  connectionStatuses(): Promise<readonly PaySwapConnectionStatusViewDto[]>;
  connectionSeedSetup(input: {
    readonly providerId: string;
    readonly useCaseRef: string;
  }): Promise<PaySwapConnectionSetupOutcomeDto>;
  connectionSubmitStripeRestrictedKey(input: {
    readonly connectionId: string;
    readonly secretKey: string;
  }): Promise<PaySwapCredentialSealReceiptDto>;
  connectionSubmitFlutterwaveSecretKey(input: {
    readonly connectionId: string;
    readonly secretKey: string;
  }): Promise<PaySwapCredentialSealReceiptDto>;
  connectionSubmitPaystackSecretKey(input: {
    readonly connectionId: string;
    readonly secretKey: string;
  }): Promise<PaySwapCredentialSealReceiptDto>;
  connectionRunVerificationProbe(providerId: string): Promise<PaySwapConnectionProbeOutcomeDto>;
  connectionSubmitStellarSecretKey(input: {
    readonly connectionId: string;
    readonly publicKey: string;
    readonly secretKey: string;
  }): Promise<PaySwapCredentialSealReceiptDto>;
  connectionRunStellarAccountReadProbe(): Promise<PaySwapStellarAccountReadOutcomeDto>;
}

/**
 * Compose the connections-activation binding over the channel service:
 * bind the REAL members behind the app's pinned port. Idempotent at
 * the composition-root tier (the shared seam holds ONE plane — the
 * business root calls this exactly once).
 */
export function composeConnectionsActivationBinding(
  services: DesktopConsoleChannelServices,
): {
  readonly plane: ConnectionsActivationPort & ConnectionsActivationPortWithStellarRail;
  readonly reset: () => void;
} {
  const client = services.payswapDesktopService as unknown as ConnectionsActivationChannelClient;
  const plane: ConnectionsActivationPort & ConnectionsActivationPortWithStellarRail = {
    statuses: () => client.connectionStatuses(),
    seedSetup: (input) => client.connectionSeedSetup(input),
    submitStripeKey: (input) => client.connectionSubmitStripeRestrictedKey(input),
    submitFlutterwaveSecretKey: (input) => client.connectionSubmitFlutterwaveSecretKey(input),
    submitPaystackSecretKey: (input) => client.connectionSubmitPaystackSecretKey(input),
    runVerificationProbe: (providerId) => client.connectionRunVerificationProbe(providerId),
    // (P22-B) The Stellar rail members — the keypair crosses once; the
    // account read runs host-side inside the seal.
    submitStellarSecretKey: (input) => client.connectionSubmitStellarSecretKey(input),
    runStellarAccountReadProbe: () => client.connectionRunStellarAccountReadProbe(),
  };
  bindSharedConnectionsActivationPlane(plane);
  return { plane, reset: resetSharedConnectionsActivationPlane };
}
