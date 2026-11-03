/**
 * PaySwap Desktop (P27-A, ADR-0020 D4/D10) — the U3 CONNECTED-ACCOUNT
 * LIFECYCLE: connected-seller account creation under the CURRENT
 * recommended Stripe account model, hosted-onboarding Account Links with
 * return handling, connected-account identity binding, capability and
 * requirements observations, reauthentication and reconciliation
 * read-backs.
 *
 * THE DATED-MODEL LAW (re-verified 2026-11-03, live docs — P27-0 §6):
 * - The legacy Standard/Express/Custom account types are DEPRECATED
 *   (docs.stripe.com/connect/{standard,express,custom}-accounts each carry
 *   the "applies only to platforms that already use legacy connected
 *   account types" notice). The CURRENT creation shape is CONTROLLER
 *   PROPERTIES + service agreement (docs.stripe.com/connect/
 *   service-agreement-types): controller[stripe_dashboard][type],
 *   controller[fees][payer], controller[losses][payments],
 *   controller[requirement_collection], capabilities[...][requested],
 *   tos_acceptance[service_agreement] = full | recipient.
 * - Hosted onboarding: POST /v1/account_links {account, refresh_url,
 *   return_url, type=account_onboarding} → a short-lived url +
 *   expires_at (docs.stripe.com/api/account_links/create, retrieved
 *   2026-11-03). The RETURN proves nothing — completion is observed on the
 *   account's own requirements/capabilities objects (D10).
 * - Country/requirements eligibility is API-computed per account
 *   (required-verification-information.md) — the lifecycle OBSERVES the
 *   account's own objects; no country list is encoded (D10).
 *
 * THE CENSUS LAW: every dispatched operation must resolve in the pinned
 * census (v2596 @ 2026-09-30.endive) and be dispatch-allowed — an unknown
 * operation is a typed UNPINNED_API_SURFACE refusal (fail-closed; pin
 * expansion is a P27-E/operator decision).
 *
 * THE REAUTH LAW (ADR-0018): PostAccountLinks carries the REAUTH approval
 * tier (PERMISSION_OR_CREDENTIAL_ADMIN) — its dispatch consumes a live,
 * digest-scoped, single-use reauthentication proof BEFORE the wire.
 *
 * KEY-READY (D11): without the operator's account-model decision every
 * creation verb refuses with the typed UNDECIDED gate; without the
 * platform credentials every verb refuses UNCONFIGURED. Never a default
 * guess, never a simulated onboarding. No LIVE (INV-25).
 */

import type { StripeActionParameter } from "./prepared-action-contracts.js";
import type {
  StripeDispatchTransport,
  StripeOperationCensusPort,
  StripeReauthenticationPort,
} from "./action-seams.js";
import type {
  StripeConnectAccountModelDecision,
  StripeConnectPlatformCredentialsInput,
  StripeConnectPlatformGateRecord,
} from "./connect-platform-gates.js";
import { validateAccountModelCapabilityConsistency } from "./connect-platform-gates.js";
import type {
  StripeConnectIdentityBinding,
  StripeConnectedAccountObservation,
} from "./connect-observations.js";
import { stripeConnectedAccountObservationOf } from "./connect-observations.js";
import type { StripeDispatchResponse } from "./action-seams.js";

/** The census operation ids the lifecycle composes (fail-closed against the pin). */
export const CONNECT_LIFECYCLE_OPERATIONS = Object.freeze({
  createAccount: "PostAccounts",
  readAccount: "GetAccountsAccount",
  listCapabilities: "GetAccountsAccountCapabilities",
  createAccountLink: "PostAccountLinks",
  createAccountSession: "PostAccountSessions",
} as const);

/** The typed lifecycle result vocabulary. */
export type StripeConnectLifecycleResult<T> =
  | { readonly kind: "OK"; readonly value: T }
  | { readonly kind: "UNCONFIGURED"; readonly missingItems: readonly string[] }
  | { readonly kind: "ACCOUNT_MODEL_UNDECIDED"; readonly missingDecision: string }
  | { readonly kind: "INCONSISTENT_DECISION"; readonly reason: string }
  | { readonly kind: "UNPINNED_API_SURFACE"; readonly operationId: string }
  | { readonly kind: "REAUTH_REQUIRED"; readonly detail: string }
  | { readonly kind: "REFUSED"; readonly httpStatus?: number; readonly providerErrorCode?: string; readonly detail: string }
  | { readonly kind: "UNKNOWN"; readonly operationId: string; readonly detail: string };

/** The deps (all injected seams — no ambient anything). */
export interface StripeConnectLifecycleDeps {
  readonly census: StripeOperationCensusPort;
  readonly transport: StripeDispatchTransport;
  readonly reauthentication?: StripeReauthenticationPort;
  readonly credentials: () => StripeConnectPlatformCredentialsInput;
  readonly gates: () => StripeConnectPlatformGateRecord;
  readonly nowIso: () => string;
  readonly createId: () => string;
  /** The bound seller-principal registry (the identity-binding store). */
  readonly identityBindings: {
    put(binding: StripeConnectIdentityBinding): void;
    byAccount(accountRef: string): StripeConnectIdentityBinding | undefined;
  };
}

function requireCensusOperation(
  census: StripeOperationCensusPort,
  operationId: string,
): { readonly ok: true; readonly view: ReturnType<StripeOperationCensusPort["resolve"]> } | { readonly ok: false } {
  const view = census.resolve(operationId);
  if (view === undefined || !census.dispatchAllowed(operationId)) {
    return { ok: false };
  }
  return { ok: true, view };
}

/** Form-encode nested controller/capability params onto the census body-parameter names. */
function bodyParametersOf(fields: Readonly<Record<string, string>>): StripeActionParameter[] {
  return Object.entries(fields).map(([name, value]) => ({ name, value, location: "body" as const }));
}

/** Compose the U3 connected-account lifecycle service. */
export function createStripeConnectAccountLifecycle(deps: StripeConnectLifecycleDeps): {
  /** The typed creation parameter plan for PostAccounts under the CURRENT model (no dispatch). */
  planAccountCreation(input: {
    readonly accountModelDecision: unknown;
    readonly country: string;
  }): StripeConnectLifecycleResult<{ readonly operationId: string; readonly parameters: readonly StripeActionParameter[] }>;
  /** Create the connected account (PostAccounts, CONFIRM tier). */
  createConnectedAccount(input: {
    readonly accountModelDecision: unknown;
    readonly country: string;
    readonly authorizationHeader: string;
    readonly apiVersion: string;
  }): Promise<StripeConnectLifecycleResult<{ readonly accountRef: string }>>;
  /** Create a hosted-onboarding Account Link (REAUTH tier — proof consumed before dispatch). */
  createOnboardingLink(input: {
    readonly accountRef: string;
    readonly returnUrl: string;
    readonly refreshUrl: string;
    readonly linkType: "account_onboarding" | "account_update";
    readonly principalId: string;
    readonly connectionId: string;
    readonly authorizationHeader: string;
    readonly apiVersion: string;
  }): Promise<StripeConnectLifecycleResult<{ readonly url: string; readonly expiresAt: string | null }>>;
  /** Observe the connected account's own objects (the D10 dated record). */
  observeConnectedAccount(input: {
    readonly accountRef: string;
    readonly authorizationHeader: string;
    readonly apiVersion: string;
  }): Promise<StripeConnectLifecycleResult<StripeConnectedAccountObservation>>;
  /** Bind the connected account identity to a PaySwap seller principal (monotonic). */
  bindSellerIdentity(input: {
    readonly accountRef: string;
    readonly sellerPrincipalRef: string;
  }): StripeConnectLifecycleResult<StripeConnectIdentityBinding>;
  /** The reconciliation read-back (INV-04 — the named retrieval for an UNKNOWN dispatch). */
  reconcile(input: {
    readonly accountRef: string;
    readonly authorizationHeader: string;
    readonly apiVersion: string;
  }): Promise<StripeConnectLifecycleResult<StripeConnectedAccountObservation>>;
} {
  const gateRefusal = (): StripeConnectLifecycleResult<never> | null => {
    const gates = deps.gates();
    if (gates.platformCredentials.kind === "UNCONFIGURED") {
      return { kind: "UNCONFIGURED", missingItems: gates.platformCredentials.missingItems };
    }
    if (gates.platformCredentials.kind === "LIVE_REFUSED") {
      return { kind: "REFUSED", detail: gates.platformCredentials.detail };
    }
    return null;
  };

  const planOf = (
    decision: unknown,
    country: string,
  ): StripeConnectLifecycleResult<{ readonly operationId: string; readonly parameters: readonly StripeActionParameter[] }> => {
    const gates = deps.gates();
    if (gates.accountModelDecision.kind === "UNCONFIGURED") {
      return { kind: "ACCOUNT_MODEL_UNDECIDED", missingDecision: gates.accountModelDecision.missingItems[0]! };
    }
    const accountModel = decision as StripeConnectAccountModelDecision;
    const consistency = validateAccountModelCapabilityConsistency(accountModel);
    if (!consistency.ok) {
      return { kind: "INCONSISTENT_DECISION", reason: consistency.reason };
    }
    const fields: Record<string, string> = {
      country,
      "controller[stripe_dashboard][type]": accountModel.stripeDashboardType,
      "controller[fees][payer]": accountModel.feesPayer,
      "controller[losses][payments]": accountModel.lossesPayer,
      "controller[requirement_collection]": accountModel.requirementCollection,
      "tos_acceptance[service_agreement]": accountModel.serviceAgreement,
    };
    for (const capability of accountModel.requestedCapabilities) {
      fields[`capabilities[${capability}][requested]`] = "true";
    }
    return {
      kind: "OK",
      value: {
        operationId: CONNECT_LIFECYCLE_OPERATIONS.createAccount,
        parameters: bodyParametersOf(fields),
      },
    };
  };

  const dispatch = async (
    operationId: string,
    parameters: readonly StripeActionParameter[],
    pathParams: Readonly<Record<string, string>>,
    authorizationHeader: string,
    apiVersion: string,
  ): Promise<StripeDispatchResponse> => {
    const merged: StripeActionParameter[] = [...parameters];
    for (const [name, value] of Object.entries(pathParams)) {
      merged.push({ name, value, location: "path" });
    }
    return deps.transport.send({
      operationId,
      apiNamespace: deps.census.resolve(operationId)?.apiNamespace ?? "v1",
      method: deps.census.resolve(operationId)?.method ?? "POST",
      path: deps.census.resolve(operationId)?.path ?? "",
      parameters: merged,
      authorization: authorizationHeader,
      apiVersion,
      correlationId: `connect-lifecycle:${operationId}:${deps.createId()}`,
    });
  };

  return {
    planAccountCreation(input) {
      const refusal = gateRefusal();
      if (refusal !== null) return refusal;
      return planOf(input.accountModelDecision, input.country);
    },

    async createConnectedAccount(input) {
      const refusal = gateRefusal();
      if (refusal !== null) return refusal;
      const census = requireCensusOperation(deps.census, CONNECT_LIFECYCLE_OPERATIONS.createAccount);
      if (!census.ok) {
        return { kind: "UNPINNED_API_SURFACE", operationId: CONNECT_LIFECYCLE_OPERATIONS.createAccount };
      }
      const plan = planOf(input.accountModelDecision, input.country);
      if (plan.kind !== "OK") return plan;
      const response = await dispatch(
        plan.value.operationId,
        plan.value.parameters,
        {},
        input.authorizationHeader,
        input.apiVersion,
      );
      if (!response.delivered) {
        return { kind: "UNKNOWN", operationId: plan.value.operationId, detail: response.failure?.kind ?? "undelivered" };
      }
      const body = response.body as { id?: unknown } | undefined;
      const accountRef = typeof body?.id === "string" ? body.id : null;
      if ((response.status ?? 0) < 200 || (response.status ?? 0) >= 300 || accountRef === null) {
        return {
          kind: "REFUSED",
          httpStatus: response.status,
          providerErrorCode: response.providerErrorCode,
          detail: "the connected-account creation was refused by the provider",
        };
      }
      return { kind: "OK", value: { accountRef } };
    },

    async createOnboardingLink(input) {
      const refusal = gateRefusal();
      if (refusal !== null) return refusal;
      const census = requireCensusOperation(deps.census, CONNECT_LIFECYCLE_OPERATIONS.createAccountLink);
      if (!census.ok) {
        return { kind: "UNPINNED_API_SURFACE", operationId: CONNECT_LIFECYCLE_OPERATIONS.createAccountLink };
      }
      // THE REAUTH LAW (ADR-0018): PostAccountLinks is REAUTH-tier — a
      // live digest-scoped proof is consumed BEFORE the wire.
      if (deps.reauthentication === undefined) {
        return {
          kind: "REAUTH_REQUIRED",
          detail: "the Account Link operation carries the REAUTH approval tier and no reauthentication plane is composed",
        };
      }
      const digest = `connect-account-link:${input.accountRef}:${input.linkType}`;
      const proof = await deps.reauthentication.verify({
        connectionId: input.connectionId,
        principalId: input.principalId,
        digest,
      });
      if (!proof.ok) {
        return { kind: "REAUTH_REQUIRED", detail: `the Account Link dispatch needs a live reauthentication proof: ${proof.reason}` };
      }
      const consumed = await deps.reauthentication.consume(proof.proofId);
      if (!consumed) {
        return { kind: "REAUTH_REQUIRED", detail: "the reauthentication proof was already consumed (single-use law)" };
      }
      const parameters = bodyParametersOf({
        account: input.accountRef,
        refresh_url: input.refreshUrl,
        return_url: input.returnUrl,
        type: input.linkType,
      });
      const response = await dispatch(
        CONNECT_LIFECYCLE_OPERATIONS.createAccountLink,
        parameters,
        {},
        input.authorizationHeader,
        input.apiVersion,
      );
      if (!response.delivered) {
        return { kind: "UNKNOWN", operationId: CONNECT_LIFECYCLE_OPERATIONS.createAccountLink, detail: response.failure?.kind ?? "undelivered" };
      }
      const body = response.body as { url?: unknown; expires_at?: unknown } | undefined;
      const url = typeof body?.url === "string" ? body.url : null;
      if ((response.status ?? 0) < 200 || (response.status ?? 0) >= 300 || url === null) {
        return {
          kind: "REFUSED",
          httpStatus: response.status,
          providerErrorCode: response.providerErrorCode,
          detail: "the Account Link creation was refused by the provider",
        };
      }
      return {
        kind: "OK",
        value: {
          url,
          expiresAt: typeof body?.expires_at === "number" ? new Date(body.expires_at * 1000).toISOString() : null,
        },
      };
    },

    async observeConnectedAccount(input) {
      const refusal = gateRefusal();
      if (refusal !== null) return refusal;
      const census = requireCensusOperation(deps.census, CONNECT_LIFECYCLE_OPERATIONS.readAccount);
      if (!census.ok) {
        return { kind: "UNPINNED_API_SURFACE", operationId: CONNECT_LIFECYCLE_OPERATIONS.readAccount };
      }
      const response = await dispatch(
        CONNECT_LIFECYCLE_OPERATIONS.readAccount,
        [],
        { account: input.accountRef },
        input.authorizationHeader,
        input.apiVersion,
      );
      if (!response.delivered) {
        return { kind: "UNKNOWN", operationId: CONNECT_LIFECYCLE_OPERATIONS.readAccount, detail: response.failure?.kind ?? "undelivered" };
      }
      if ((response.status ?? 0) < 200 || (response.status ?? 0) >= 300) {
        return {
          kind: "REFUSED",
          httpStatus: response.status,
          providerErrorCode: response.providerErrorCode,
          detail: "the connected-account read-back was refused by the provider",
        };
      }
      const observation = stripeConnectedAccountObservationOf(
        input.accountRef,
        response.body,
        deps.nowIso(),
      );
      if (observation === null) {
        return { kind: "UNKNOWN", operationId: CONNECT_LIFECYCLE_OPERATIONS.readAccount, detail: "the account read-back carried no account object" };
      }
      return { kind: "OK", value: observation };
    },

    bindSellerIdentity(input) {
      const existing = deps.identityBindings.byAccount(input.accountRef);
      if (existing !== undefined) {
        if (existing.sellerPrincipalRef === input.sellerPrincipalRef) {
          return { kind: "OK", value: existing };
        }
        return {
          kind: "REFUSED",
          detail: `the connected account ${input.accountRef} is already bound to seller principal ${existing.sellerPrincipalRef} — a rebinding requires an explicit unbind decision (monotonic law)`,
        };
      }
      const binding: StripeConnectIdentityBinding = Object.freeze({
        bindingId: `connect-binding:${deps.createId()}`,
        accountRef: input.accountRef,
        sellerPrincipalRef: input.sellerPrincipalRef,
        boundAt: deps.nowIso(),
        establishedByObservationAt: deps.nowIso(),
      });
      deps.identityBindings.put(binding);
      return { kind: "OK", value: binding };
    },

    async reconcile(input) {
      // INV-04: the named read-back after an UNKNOWN dispatch — the same
      // observation path, recorded as reconciliation evidence.
      const result = await this.observeConnectedAccount(input);
      return result;
    },
  };
}
