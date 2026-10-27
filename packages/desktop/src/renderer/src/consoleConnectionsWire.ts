/**
 * @zcode/desktop — the payswap-desktop CONNECTIONS wire types,
 * structurally re-declared for the renderer (P21-A, the
 * consolePaymentMissionWire precedent; split for the ≤400-line file
 * law).
 *
 * The host DTOs live in src/host/payswap (not renderer-importable), so
 * this mirror carries the pinned shapes BY VALUE — the established
 * two-sided drift discipline (test/payswap/desktop-console-client.test
 * .ts asserts the MEMBER sets cannot drift; the shapes are pinned by
 * structural mirroring).
 *
 * THE WIRE LAWS (P21-A, ADR-0014 D5/D9):
 * - NO MATERIAL renderer-ward: the key-entry members carry the key
 *   renderer→host ONCE (sealed immediately; the receipt carries counts
 *   and the opaque handle ref, never the key); the probe outcome
 *   carries provider references and lifecycle facts ONLY — never key
 *   material, never the credential handle, never envelope internals;
 * - the evidence-tier law (D9): the probe outcome is PROVIDER_OBSERVATION —
 *   what the provider's read-only endpoints answered, never more;
 * - the honest scope notes render verbatim (a Flutterwave probe proves
 *   read-only balance access — never send capability, F3).
 */

/** The providers a REAL verification probe exists for (mirrors the host pin). */
export type PaySwapProbeProviderId = "stripe" | "flutterwave" | "paystack";

/** The probe outcome vocabulary (mirrors the host pin). */
export type PaySwapConnectionProbeOutcome = "CONFIRMED" | "UNKNOWN" | "FAILED";

/** The evidence-tier vocabulary (mirrors the host pin — the tiers never mix). */
export type PaySwapConnectionProbeEvidenceTier = "PROVIDER_OBSERVATION";

/** The key-entry seal receipt (mirrors DesktopCredentialSealReceipt). */
export interface PaySwapCredentialSealReceiptDto {
  readonly connectionId: string;
  /** The opaque handle ref — non-returnable, no material ever flows back. */
  readonly credentialHandleRef: string;
  /** How many secret strings were sealed (audit surface, not the strings). */
  readonly sealedSecretCount: number;
  /** The honest next state (verification is still required for ACTIVE). */
  readonly nextState: string;
}

/** One probed connection's secret-free result (mirrors ConnectionProbeResultDto). */
export interface PaySwapConnectionProbeResultDto {
  readonly connectionId: string;
  readonly outcome: PaySwapConnectionProbeOutcome;
  /** Provider references the probe read (wallets / account / transactions). */
  readonly providerReferences: readonly string[];
  /** The connection state AFTER the outcome was recorded through the authority. */
  readonly state: string;
  /** People-language summary (no envelope internals, no key material). */
  readonly summary: string;
  /** Present iff FAILED — the provider failure code, never verbatim provider text. */
  readonly failureCode?: string;
}

/** The secret-free outcome of one probe run (mirrors ConnectionProbeOutcomeDto). */
export interface PaySwapConnectionProbeOutcomeDto {
  readonly providerId: PaySwapProbeProviderId;
  readonly probedOperation: string;
  readonly results: readonly PaySwapConnectionProbeResultDto[];
  readonly evidenceTier: PaySwapConnectionProbeEvidenceTier;
  readonly note: string;
}

/** One connection's status view (mirrors DesktopConnectionStatusView — the fields the renderer consumes). */
export interface PaySwapConnectionStatusViewDto {
  readonly connectionId: string;
  readonly providerId: string;
  readonly useCaseRef: string;
  readonly form: string;
  readonly credentialKind: string;
  readonly executionMode: string;
  readonly state: string;
  readonly credentialHandleRef: string;
  readonly createdAt: string;
  readonly lastTransitionAt: string;
}

/** The typed outcome of a setup seed (mirrors DesktopConnectionSetupOutcome — create or resume, honestly). */
export type PaySwapConnectionSetupOutcomeDto =
  | { readonly kind: "CREATED"; readonly connectionId: string; readonly state: string }
  | { readonly kind: "RESUMED"; readonly connectionId: string; readonly state: string }
  | { readonly kind: "REFUSED"; readonly reason: string };
