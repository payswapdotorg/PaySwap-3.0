/**
 * PaySwap Desktop (P24-2, ADR-0017 D5 + handoff §2.3/§3.4/§9.4) — the
 * VERIFIED-EVIDENCE ACCOUNT-CONTEXT RESOLVER: the ONLY source of the
 * StripeActionAccountContext a prepared action binds to.
 *
 * THE LAW (the frozen contract's load-bearing comment): account context
 * resolves ONLY from verified connection evidence — a connected-account
 * id supplied by the model or the user is never proof that the active
 * credential can access that account. This resolver reads:
 * - the persisted connection record (the lifecycle state — only an
 *   ACTIVE connection with verified evidence resolves);
 * - the latest probe-evidence record (the Stripe account ref the
 *   account read CONFIRMED + the provider-reported livemode flag).
 *
 * ACCOUNT-MODEL HONESTY (ADR-0017 D5): only U1 (own-account restricted
 * key, the 'own-store-test-mode' form) resolves in this release. U2
 * (delegated OAuth) and U3 (Connect) are UNCONFIGURED — their exact
 * missing operator configuration is returned as the refusal (never
 * simulated, never a fabricated context). Organization scope is never
 * silently substituted.
 *
 * INV-25: a LIVE environment never resolves in this deployment, and
 * the provider-reported livemode flag must match the environment
 * (SANDBOX ⇔ livemode false) — a mismatch is refused.
 */

import type { StripeActionAccountContextResolver } from "../stripe/action-seams.js";
import type { StripeActionAccountContext } from "../stripe/prepared-action-contracts.js";
import { PINNED_STRIPE_PROVIDER_ID } from "./provider-pins.js";
import {
  PINNED_STRIPE_U2_MISSING_OPERATOR_CONFIGURATION,
  PINNED_STRIPE_U3_MISSING_OPERATOR_CONFIGURATION,
} from "./provider-pins.js";
import type { PersistedConnectionRecord } from "./record-store.js";
import type { ProbeEvidenceRecord } from "./probe-evidence.js";

/** The U1 use-case ref (the only resolvable Stripe form in this release). */
export const STRIPE_U1_USE_CASE_REF = "own-store-test-mode" as const;

/** The read seams the resolver composes over (injected; deterministic tests). */
export interface StripeAccountContextReads {
  getConnection(connectionId: string): Promise<PersistedConnectionRecord | null>;
  getLatestProbeEvidence(connectionId: string): Promise<ProbeEvidenceRecord | null>;
  /** The credential seal's sealedAt (ISO) — the ROTATION FRESHNESS law — or null when unknowable. */
  getCredentialSealedAt(connectionId: string): Promise<string | null>;
}

/** The provider-reported account-id shape (acct_…). */
const STRIPE_ACCOUNT_ID_PATTERN = /^acct_[A-Za-z0-9]+$/;

/**
 * Compose the resolver. The connection record + the probe evidence are
 * the ONLY inputs; nothing model- or user-supplied participates.
 */
export function createStripeAccountContextResolver(
  reads: StripeAccountContextReads,
): StripeActionAccountContextResolver {
  return {
    async resolve(connectionId) {
      if (typeof connectionId !== "string" || connectionId.length === 0) {
        return { ok: false, reason: "a connection id is required to resolve account context" };
      }
      const record = await reads.getConnection(connectionId);
      if (record === null) {
        return { ok: false, reason: `unknown connection '${connectionId}' (no persisted connection record)` };
      }
      if (record.providerId !== PINNED_STRIPE_PROVIDER_ID) {
        return {
          ok: false,
          reason: `connection '${connectionId}' is a '${record.providerId}' connection, not a Stripe connection`,
        };
      }
      if (record.state !== "ACTIVE") {
        return {
          ok: false,
          reason:
            `connection '${connectionId}' is ${record.state} — only an ACTIVE connection with verified probe evidence resolves account context` +
            (record.state === "PENDING_VERIFICATION"
              ? " (a CONFIRMED re-probe is required — e.g. after a key rotation, the fresh seal has not been verified)"
              : ""),
        };
      }
      if (record.useCaseRef === "existing-account-grant") {
        return {
          ok: false,
          reason: `U2 (delegated OAuth) is declared UNCONFIGURED in this deployment — missing: ${PINNED_STRIPE_U2_MISSING_OPERATOR_CONFIGURATION.join("; ")}. It is never simulated; no account context resolves for it.`,
        };
      }
      if (record.useCaseRef === "marketplace-connected-accounts") {
        return {
          ok: false,
          reason: `U3 (Connect platform/connected accounts) is declared UNCONFIGURED in this deployment — missing: ${PINNED_STRIPE_U3_MISSING_OPERATOR_CONFIGURATION.join("; ")}. It is never simulated; a connected seller is never ACTIVE from a redirect alone.`,
        };
      }
      if (record.useCaseRef !== STRIPE_U1_USE_CASE_REF) {
        return {
          ok: false,
          reason: `connection '${connectionId}' carries use case '${record.useCaseRef}', which is not a declared Stripe account model in this release (never guessed)`,
        };
      }
      if (record.executionMode !== "SANDBOX") {
        return {
          ok: false,
          reason: "INV-25: this deployment is SANDBOX-only — a LIVE connection never resolves account context (live-mode expansion is a separate ADR with operator authorization)",
        };
      }
      const evidence = await reads.getLatestProbeEvidence(connectionId);
      if (evidence === null) {
        return {
          ok: false,
          reason: `connection '${connectionId}' carries no probe evidence — the verification probe is the only ACTIVE path`,
        };
      }
      if (evidence.outcome !== "CONFIRMED") {
        return {
          ok: false,
          reason: `connection '${connectionId}' latest probe evidence is ${evidence.outcome} — account context resolves only from CONFIRMED evidence`,
        };
      }
      if (evidence.accountRef === null || !STRIPE_ACCOUNT_ID_PATTERN.test(evidence.accountRef)) {
        return {
          ok: false,
          reason: `connection '${connectionId}' probe evidence carries no verified Stripe account id (acct_…) — never a fabricated context`,
        };
      }
      if (evidence.providerLiveMode === true) {
        return {
          ok: false,
          reason: "INV-25: the provider reported live mode on a SANDBOX connection (environment mismatch refused — sandbox and live credentials cannot cross-bind)",
        };
      }
      // THE ROTATION FRESHNESS LAW: probe evidence that predates the
      // current credential seal is STALE — a rotated key has not been
      // re-verified, so the account context it certified does not bind
      // (a re-probe is required before any prepared action).
      const sealedAt = await reads.getCredentialSealedAt(connectionId);
      if (sealedAt !== null && evidence.observedAt < sealedAt) {
        return {
          ok: false,
          reason: `connection '${connectionId}' probe evidence (observed ${evidence.observedAt}) predates the current credential seal (${sealedAt}) — the key was rotated and a re-probe is required before account context resolves`,
        };
      }
      const accountContext: StripeActionAccountContext = Object.freeze({
        connectionId: record.connectionId,
        stripeAccountId: evidence.accountRef,
        accountModel: "OWN_ACCOUNT_RESTRICTED_KEY",
        environment: "SANDBOX",
      });
      return { ok: true, accountContext };
    },
  };
}
