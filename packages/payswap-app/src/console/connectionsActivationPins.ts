/**
 * @payswap/app — STRUCTURAL PINS of the connection-ACTIVATION plane
 * (P21-B run 4 / Part E, ADR-0014 D5/D6/D10).
 *
 * MIRROR DISCIPLINE (the missionIntakePins pattern): @payswap/app src
 * NEVER imports the desktop host — the channel members this port rides
 * are pinned STRUCTURALLY here (same shapes), and the platform host's
 * composition root binds the REAL channel members behind it. The wire
 * DTOs live in the renderer's consoleConnectionsWire.ts (READ-ONLY
 * reference, never imported).
 *
 * LAWS (ADR-0014 D5/D11 + the P13 honesty laws):
 * - THE ONE MATERIAL PATH: a key crosses renderer→host ONCE through the
 *   submit members and is sealed immediately; the receipt carries counts
 *   and the opaque handle ref, NEVER the key. The UI never echoes,
 *   persists or logs key material; the input clears on submit.
 * - THE ONLY ACTIVE PATH: a connection becomes ACTIVE through a
 *   probe-CONFIRMED outcome recorded by the authority's own recorder —
 *   never through a UI assertion.
 * - THE EVIDENCE-TIER LAW: the probe outcome is PROVIDER_OBSERVATION —
 *   what the provider's read-only endpoints answered, never more (a
 *   Flutterwave probe proves read-only balance access — never send
 *   capability, F3); the tier label renders with the outcome.
 * - ZERO FINANCIAL AUTHORITY: the port submits keys and runs probes; it
 *   never dispatches, authorizes or observes money movement.
 * - The app ships NO default (an unbound port renders the honest
 *   unbound note — the ADR-0010 D7 web analogue).
 */

/* --------------------------- the DTO pins ---------------------------- */

/** The probe-provider vocabulary (mirrors the host pin). */
export const CONNECTIONS_ACTIVATION_PROVIDERS = Object.freeze([
  "stripe",
  "flutterwave",
  "paystack",
] as const);
export type ConnectionsActivationProviderId =
  (typeof CONNECTIONS_ACTIVATION_PROVIDERS)[number];

/** The probe-outcome vocabulary (mirrors the host pin). */
export const CONNECTIONS_PROBE_OUTCOMES = Object.freeze([
  "CONFIRMED",
  "UNKNOWN",
  "FAILED",
] as const);
export type ConnectionsProbeOutcomeKind =
  (typeof CONNECTIONS_PROBE_OUTCOMES)[number];

/** The evidence tier a probe outcome carries (the tiers never mix). */
export const CONNECTIONS_PROBE_EVIDENCE_TIER = "PROVIDER_OBSERVATION" as const;

/** The key-entry seal receipt (mirrors the wire's credential-seal receipt). */
export interface ConnectionsSealReceiptPin {
  readonly connectionId: string;
  /** The opaque handle ref — non-returnable, no material ever flows back. */
  readonly credentialHandleRef: string;
  /** How many secret strings were sealed (audit surface, not the strings). */
  readonly sealedSecretCount: number;
  /** The honest next state (verification is still required for ACTIVE). */
  readonly nextState: string;
}

/** One probed connection's secret-free result (mirrors the wire DTO). */
export interface ConnectionsProbeResultPin {
  readonly connectionId: string;
  readonly outcome: ConnectionsProbeOutcomeKind;
  /** Provider references the probe read (wallets / account / transactions). */
  readonly providerReferences: readonly string[];
  /** The connection state AFTER the outcome was recorded by the authority. */
  readonly state: string;
  /** People-language summary (no envelope internals, no key material). */
  readonly summary: string;
  /** Present iff FAILED — the provider failure code, never verbatim text. */
  readonly failureCode?: string;
}

/** The secret-free outcome of one probe run (mirrors the wire DTO). */
export interface ConnectionsProbeOutcomePin {
  readonly providerId: ConnectionsActivationProviderId;
  readonly probedOperation: string;
  readonly results: readonly ConnectionsProbeResultPin[];
  readonly evidenceTier: typeof CONNECTIONS_PROBE_EVIDENCE_TIER;
  readonly note: string;
}

/** The typed outcome of a setup seed (create-or-resume, honestly). */
export type ConnectionsSeedOutcomePin =
  | { readonly kind: "CREATED"; readonly connectionId: string; readonly state: string }
  | { readonly kind: "RESUMED"; readonly connectionId: string; readonly state: string }
  | { readonly kind: "REFUSED"; readonly reason: string };

/** One connection's status view (the fields the activation card renders). */
export interface ConnectionsStatusPin {
  readonly connectionId: string;
  readonly providerId: string;
  readonly useCaseRef: string;
  readonly state: string;
  readonly lastTransitionAt: string;
}

/* ------------------------------- the port ---------------------------- */

/**
 * The connection-activation port (the pinned mirror of the channel
 * members the activation panel rides). The platform host's composition
 * root binds the REAL channel adapter; the app ships NO default.
 */
export interface ConnectionsActivationPort {
  /** The connection statuses (never fabricated — empty is honest). */
  statuses(): Promise<readonly ConnectionsStatusPin[]>;
  /** Seed a connection setup (create-or-resume; a refusal names the exact gap). */
  seedSetup(input: {
    readonly providerId: ConnectionsActivationProviderId;
    readonly useCaseRef: string;
  }): Promise<ConnectionsSeedOutcomePin>;
  /** The Stripe key-entry verb (the key crosses once; sealed immediately). */
  submitStripeKey(input: {
    readonly connectionId: string;
    readonly secretKey: string;
  }): Promise<ConnectionsSealReceiptPin>;
  /** The Flutterwave key-entry verb (the same seal law). */
  submitFlutterwaveSecretKey(input: {
    readonly connectionId: string;
    readonly secretKey: string;
  }): Promise<ConnectionsSealReceiptPin>;
  /** The Paystack key-entry verb (the same seal law). */
  submitPaystackSecretKey(input: {
    readonly connectionId: string;
    readonly secretKey: string;
  }): Promise<ConnectionsSealReceiptPin>;
  /** Run the REAL verification probe host-side (the only ACTIVE path). */
  runVerificationProbe(
    providerId: ConnectionsActivationProviderId,
  ): Promise<ConnectionsProbeOutcomePin>;
}

/* -------------------------- the honest notes -------------------------- */

/** The unbound-port note (the web tier's honest truth). */
export const CONNECTIONS_ACTIVATION_UNBOUND_NOTE =
  "Provider key entry and verification run through the platform host's credential seal — this deployment has no host binding wired, so no key can be entered or verified honestly here. Nothing is simulated." as const;

/** The seal-law note (rendered with every key-entry form). */
export const CONNECTIONS_ACTIVATION_SEAL_NOTE =
  "The key crosses to the host once and is sealed immediately — it is never echoed, stored or logged by this page, and the receipt you see carries only counts and an opaque handle. Test-mode keys only; live keys are refused." as const;

/** The evidence-tier note (rendered with every probe outcome). */
export const CONNECTIONS_ACTIVATION_TIER_NOTE =
  "A verification probe is a PROVIDER_OBSERVATION: it proves exactly what the provider's read-only endpoints answered — no more. A confirmed probe activates the connection for the operations its evidence establishes; it never certifies a live corridor and never proves a send capability the provider did not evidence." as const;
