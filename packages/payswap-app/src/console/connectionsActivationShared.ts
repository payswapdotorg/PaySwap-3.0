/**
 * @payswap/app — the SHARED CONNECTIONS-ACTIVATION plane seam (P21-B
 * run 4 / Part E, ADR-0014 D5), the waitRecheckShared.ts pattern.
 *
 * The per-document shared seam a PLATFORM HOST binds at its composition
 * root: the desktop renderer binds the REAL channel members behind the
 * pinned ConnectionsActivationPort BEFORE the connections surface
 * renders; the web tier binds nothing — the honest unbound note.
 */

import type { ConnectionsActivationPort } from "./connectionsActivationPins.js";

let sharedConnectionsActivation: ConnectionsActivationPort | undefined;

/** Bind the shared connections-activation plane (the platform host's composition root). */
export function bindSharedConnectionsActivationPlane(plane: ConnectionsActivationPort): void {
  sharedConnectionsActivation = plane;
}

/** Test/inspection helper: drop the shared binding (never used in src). */
export function resetSharedConnectionsActivationPlane(): void {
  sharedConnectionsActivation = undefined;
}

/** The shared binding (undefined = the honest unbound activation tier). */
export function sharedConnectionsActivationPlane(): ConnectionsActivationPort | undefined {
  return sharedConnectionsActivation;
}
