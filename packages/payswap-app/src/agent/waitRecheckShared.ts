/**
 * @payswap/app — the SHARED WAIT RE-CHECK plane seam (P21-B run 3,
 * ADR-0014 D9/D10), split from ./waitRecheckPins.ts for the ≤400-line
 * file law (the agentComposerShared.ts pattern).
 *
 * The per-document shared seam a PLATFORM HOST binds at its composition
 * root: the desktop renderer's composition root binds the REAL re-check
 * evaluator (P21-C's recheckWait over fresh observations) BEFORE the
 * wait surface renders; the web tier binds nothing — the honest
 * not-wired note (the ADR-0010 D7 analogue).
 */

import type { WaitRecheckPlanePort } from "./waitRecheckPins.js";

let sharedWaitRecheck: WaitRecheckPlanePort | undefined;

/** Bind the shared wait re-check plane (the platform host's composition root). */
export function bindSharedWaitRecheckPlane(plane: WaitRecheckPlanePort): void {
  sharedWaitRecheck = plane;
}

/** Test/inspection helper: drop the shared binding (never used in src). */
export function resetSharedWaitRecheckPlane(): void {
  sharedWaitRecheck = undefined;
}

/** The shared binding (undefined = the honest not-wired re-check tier). */
export function sharedWaitRecheckPlane(): WaitRecheckPlanePort | undefined {
  return sharedWaitRecheck;
}
