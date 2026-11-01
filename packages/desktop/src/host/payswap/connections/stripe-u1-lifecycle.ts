/**
 * PaySwap Desktop (P24-2, ADR-0017 D5 + handoff §11 Worker-2 item 2) —
 * the U1 OWN-ACCOUNT (Sandbox) LIFECYCLE SERVICE: key rotation, RAK
 * scope refresh and re-probe, composed over the EXISTING authority
 * verbs (submitStripeRestrictedKey / withSealedCredential /
 * recordVerificationOutcome — the P13-B/P21-A seam) plus this wave's
 * RAK permission binding and probe-evidence ledger.
 *
 * HONESTY LAWS:
 * - U2 (delegated OAuth) and U3 (Connect) stay UNCONFIGURED: this
 *   service exposes NO verbs for them; their exact missing operator
 *   configuration is declared (provider-pins) and never simulated.
 * - Organization keys (sk_org_) are OUT OF SCOPE (ADR-0017 D5):
 *   rotation REFUSES them typed — an organization context is never
 *   silently substituted for account scope.
 * - pk_ is refused as a server-side secret; whsec_ is refused as an
 *   API key (an endpoint signing secret is not a credential for API
 *   calls); live keys are refused (INV-25 — the existing verb's law).
 * - ROTATION INVALIDATES: the existing verb re-seals and returns the
 *   connection to PENDING_VERIFICATION; the account-context resolver's
 *   freshness law (evidence must postdate the seal) blocks dispatch
 *   until a CONFIRMED re-probe lands.
 * - Actual key validation is ALWAYS the probe (never string
 *   heuristics): the re-probe is the only path that re-exposes
 *   operations.
 */

import type { ConnectionSessionAuthority } from "./session-authority.js";
import type { ProbeEvidenceStore } from "./probe-evidence.js";
import type { StripeRakPermissionBinding } from "./stripe-rak-permissions.js";
import { CONNECTION_PROBE_OPERATIONS } from "./probe-contracts.js";
import type { HostTransport } from "./host-https-transports.js";
import { createHostStripeVerificationProbe, type HostProbeResult } from "./verification-probes.js";
import { stripeServerKeyShape } from "../stripe/stripe-pins.js";

/** The typed key-rotation refusal (structural shape law — never echoes the key). */
export type StripeU1RotationRefusal =
  | { readonly kind: "PUBLISHABLE_KEY_REFUSED"; readonly detail: string }
  | { readonly kind: "ORGANIZATION_KEY_OUT_OF_SCOPE"; readonly detail: string }
  | { readonly kind: "WEBHOOK_SECRET_REFUSED"; readonly detail: string }
  | { readonly kind: "UNKNOWN_KEY_SHAPE"; readonly detail: string }
  | { readonly kind: "LIVE_KEY_REFUSED"; readonly detail: string }
  | { readonly kind: "UNKNOWN_CONNECTION"; readonly detail: string };

/** The deps (all injected; the composition edge binds the real authority + transport). */
export interface StripeU1LifecycleDeps {
  readonly authority: Pick<
    ConnectionSessionAuthority,
    | "submitStripeRestrictedKey"
    | "withSealedCredential"
    | "recordVerificationOutcome"
    | "connectionStatuses"
  >;
  readonly evidenceStore: ProbeEvidenceStore;
  readonly permissionBinding: StripeRakPermissionBinding;
  /** The host Stripe HTTPS transport (the probe rides it inside the seal). */
  readonly transport: HostTransport;
  readonly nowMs: () => number;
}

/** The U1 lifecycle service. */
export class StripeU1LifecycleService {
  readonly #deps: StripeU1LifecycleDeps;

  constructor(deps: StripeU1LifecycleDeps) {
    this.#deps = deps;
  }

  /**
   * KEY ROTATION: the structural shape law gives the exact honest
   * refusal for pk_/sk_org_/whsec_/unknown shapes BEFORE the existing
   * seal verb runs (the verb itself enforces the test-mode prefix law —
   * INV-25 live refusal unchanged). A successful rotation re-seals and
   * returns the connection to PENDING_VERIFICATION: the account-context
   * freshness law blocks dispatch until the re-probe confirms.
   */
  async rotateKey(input: {
    readonly connectionId: string;
    readonly secretKey: string;
  }): Promise<
    | {
        readonly ok: true;
        readonly receipt: {
          readonly connectionId: string;
          readonly credentialHandleRef: string;
          readonly sealedSecretCount: number;
          readonly nextState: string;
        };
        readonly note: string;
      }
    | { readonly ok: false; readonly refusal: StripeU1RotationRefusal }
  > {
    const statuses = await this.#deps.authority.connectionStatuses();
    const status = statuses.find((entry) => entry.connectionId === input.connectionId);
    if (status === undefined || status.providerId !== "stripe") {
      return {
        ok: false,
        refusal: {
          kind: "UNKNOWN_CONNECTION",
          detail: `no Stripe connection '${input.connectionId}' exists (U2/U3 are UNCONFIGURED and never simulated; organization scope is out of scope)`,
        },
      };
    }
    const shape = stripeServerKeyShape(input.secretKey);
    if (shape === "PUBLISHABLE_KEY") {
      return {
        ok: false,
        refusal: {
          kind: "PUBLISHABLE_KEY_REFUSED",
          detail: "a publishable pk_ key is not a server-side credential and is never sealed for API dispatch (handoff §2.3/§9.3)",
        },
      };
    }
    if (shape === "ORGANIZATION_KEY") {
      return {
        ok: false,
        refusal: {
          kind: "ORGANIZATION_KEY_OUT_OF_SCOPE",
          detail: "organization keys (sk_org_) are out of scope in this release (ADR-0017 D5 — organization access is a separate, reviewed account model; never silently generalized from account-level keys)",
        },
      };
    }
    if (shape === "WEBHOOK_SIGNING_SECRET") {
      return {
        ok: false,
        refusal: {
          kind: "WEBHOOK_SECRET_REFUSED",
          detail: "a whsec_ value is an endpoint-specific webhook signing secret, not an API key (it is sealed per webhook destination, never as a connection credential)",
        },
      };
    }
    if (shape === "UNKNOWN") {
      return {
        ok: false,
        refusal: {
          kind: "UNKNOWN_KEY_SHAPE",
          detail: "the supplied key does not carry a canonical Stripe key prefix (expected rk_test_… or sk_test_… for the U1 SANDBOX form)",
        },
      };
    }
    if (input.secretKey.startsWith("rk_live_") || input.secretKey.startsWith("sk_live_")) {
      return {
        ok: false,
        refusal: {
          kind: "LIVE_KEY_REFUSED",
          detail: "INV-25: a live-mode Stripe key is refused — this deployment is SANDBOX-only (live-mode expansion is a separate ADR with operator authorization)",
        },
      };
    }
    // The EXISTING verb: re-seal (rotation = replacement) + the lawful
    // PENDING_VERIFICATION transition (re-verification required).
    const receipt = await this.#deps.authority.submitStripeRestrictedKey(input);
    return {
      ok: true,
      receipt,
      note: "key rotated — the connection is PENDING_VERIFICATION and account context does not resolve until a CONFIRMED re-probe (the freshness law)",
    };
  }

  /**
   * RAK SCOPE REFRESH: (re-)declare the exact permission strings the
   * restricted key carries (after the user edits them in the Stripe
   * dashboard). A refresh clears the connection's withdrawal
   * observations and recomputes the exposed-operation set. Actual
   * permission validation remains the probe/dispatch evidence — the
   * declaration is the binding, never the proof.
   */
  async refreshScopes(input: {
    readonly connectionId: string;
    readonly permissions: readonly string[];
    readonly principalId: string;
  }): Promise<
    | {
        readonly ok: true;
        readonly declaredPermissions: readonly string[];
        readonly exposedOperations: readonly string[];
      }
    | {
        readonly ok: false;
        readonly reason: string;
      }
  > {
    const declared = await this.#deps.permissionBinding.declareScopes(input);
    if (!declared.ok) {
      const refusal = declared.refusal;
      const reason =
        refusal.kind === "MALFORMED_PERMISSION"
          ? `'${refusal.value}' is not a Stripe permission string (expected "<resource>: Read" or "<resource>: Write" — the overlay's camelCase family naming, e.g. "customers: Write")`
          : refusal.kind === "EMPTY_DECLARATION"
            ? "a scope declaration requires at least one permission string"
            : "a secret-shaped value was refused in the scope declaration (fail-closed)";
      return { ok: false, reason };
    }
    const exposedOperations = await this.#deps.permissionBinding.exposedOperations(input.connectionId);
    return {
      ok: true,
      declaredPermissions: declared.declaration.declaredPermissions,
      exposedOperations,
    };
  }

  /**
   * RE-PROBE: run the REAL host Stripe verification probe inside the
   * credential seal, record the outcome through the authority's own
   * recorder (the ONLY ACTIVE path), land the structured evidence, and
   * recompute the exposed-operation set. A key-rejected probe records
   * the dead-key observation (everything withdraws); a CONFIRMED probe
   * clears key rejections.
   */
  async reprobe(input: {
    readonly connectionId: string;
  }): Promise<
    | {
        readonly ok: true;
        readonly outcome: HostProbeResult["outcome"];
        readonly state: string;
        readonly exposedOperations: readonly string[];
      }
    | { readonly ok: false; readonly reason: string }
  > {
    const statuses = await this.#deps.authority.connectionStatuses();
    const status = statuses.find((entry) => entry.connectionId === input.connectionId);
    if (status === undefined || status.providerId !== "stripe") {
      return { ok: false, reason: `no Stripe connection '${input.connectionId}' exists` };
    }
    if (status.credentialHandleRef === "") {
      return {
        ok: false,
        reason: `connection '${input.connectionId}' carries no sealed credential — seal a test-mode key first`,
      };
    }
    const probe = createHostStripeVerificationProbe({
      transport: this.#deps.transport,
      nowMs: this.#deps.nowMs,
      executionMode: "SANDBOX",
    });
    const probed = await this.#deps.authority.withSealedCredential(
      input.connectionId,
      probe,
      `stripe-u1-reprobe:${input.connectionId}`,
    );
    const view = await this.#deps.authority.recordVerificationOutcome({
      connectionId: input.connectionId,
      outcome: probed.outcome,
      evidenceSummary: evidenceSummaryOf(probed),
    });
    await this.#deps.evidenceStore.recordProbeEvidence({
      connectionId: input.connectionId,
      providerId: "stripe",
      probedOperation: CONNECTION_PROBE_OPERATIONS.stripe,
      outcome: probed.outcome,
      providerReferences: [...probed.providerReferences],
      accountRef: probed.accountRef,
      providerLiveMode: probed.providerLiveMode,
      keyClass: probed.keyClass,
      balanceCurrencies: [...probed.balanceCurrencies],
      transportId: probed.transportId,
      executionMode: probed.executionMode,
      observedAt: new Date(this.#deps.nowMs()).toISOString(),
      evidenceTier: "PROVIDER_OBSERVATION",
    });
    if (probed.outcome === "FAILED" && probed.failure?.keyRejected === true) {
      await this.#deps.permissionBinding.recordKeyRejected(input.connectionId);
    }
    if (probed.outcome === "CONFIRMED") {
      await this.#deps.permissionBinding.clearKeyRejections(input.connectionId);
    }
    const exposedOperations = await this.#deps.permissionBinding.exposedOperations(input.connectionId);
    return { ok: true, outcome: probed.outcome, state: view.state, exposedOperations };
  }
}

/** The lifecycle evidence summary (people language, secret-free). */
function evidenceSummaryOf(result: HostProbeResult): string {
  if (result.outcome === "CONFIRMED") {
    return `read-only probe CONFIRMED via ${result.transportId} (${CONNECTION_PROBE_OPERATIONS.stripe}): ${result.providerReferences.join("/")}`;
  }
  const detail =
    result.failure !== undefined
      ? ` (${result.failure.code})`
      : result.ambiguityReason !== undefined
        ? ` (ambiguity ${result.ambiguityReason})`
        : "";
  return `read-only probe ${result.outcome}${detail} — recorded honestly, no ACTIVE transition`;
}
