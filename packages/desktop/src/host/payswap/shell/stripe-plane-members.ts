/**
 * PaySwap Desktop (P24-D, ADR-0017 D9/D10) — the STRIPE PLANE channel
 * members: the conversation plane's host-side surface over the composed
 * stripe action plane (./stripe/stripe-plane-composition.ts) and the
 * product connection plane's authority.
 *
 * THE MEMBER LAWS (the session-model-members + payment-mission precedents):
 * - FAIL-CLOSED ABSENT SEAM: without the composed plane every member
 *   throws the typed StripePlaneNotConfiguredError — never a fabricated
 *   catalogue, never a caller-asserted action.
 * - THE CATALOGUE: the census facts (the pinned 644-operation inventory
 *   joined with the reviewed overlay) 1:1 — the renderer never
 *   generates catalogue data.
 * - THE ACCOUNTS: verified probe evidence ONLY (the account-context
 *   resolver); an unresolved connection is omitted honestly, never
 *   guessed; the RAK-declared rules ride the facts.
 * - THE READS: READ_ONLY effect class ONLY, schema-validated, RAK
 *   eligible, dispatched inside the seal (ADR-0008) through the REAL
 *   catalogue transport; an undelivered read is TIMEOUT_UNKNOWN
 *   (INV-04 — never FAILED).
 * - THE ACTIONS: the frozen two-phase law — prepare/authorize/execute/
 *   inspect over the executor; the model references, never mints; the
 *   principal is HOST-RESOLVED (the local desktop operator — never
 *   renderer-supplied).
 */

import type { ConnectionSessionAuthority } from "../connections/session-authority.js";
import type { StripeActionPlane } from "../stripe/stripe-plane-composition.js";
import { sealApiKeyOf, StripeGrantRefusal } from "../stripe/prepared-action-gates.js";
import type { IPaySwapDesktopService } from "./contracts.js";
import { StripePlaneNotConfiguredError } from "./plane-errors.js";

/** The host-resolved principal for this deployment (the local desktop operator). */
export const STRIPE_PLANE_LOCAL_PRINCIPAL_ID = "principal:local-desktop-operator" as const;

/** What the stripe plane members need (injected at the host composition edge). */
export interface StripePlaneChannelDeps {
  readonly plane: StripeActionPlane;
  readonly authority: Pick<ConnectionSessionAuthority, "connectionStatuses">;
  /** The host seam log (never console; no secret material is ever logged). */
  readonly log: (level: "info" | "warn" | "error", message: string, ...args: readonly unknown[]) => void;
}

/** The service-wiring helper (keeps service.ts within its budget). */
export function stripePlaneMembersOf(
  options: StripePlaneChannelDeps | undefined,
  log: StripePlaneChannelDeps["log"],
): Pick<
  IPaySwapDesktopService,
  | "stripeCatalogueRelease"
  | "stripeListOperationFacts"
  | "stripeOperationFact"
  | "stripeListAccountFacts"
  | "stripeAccountFacts"
  | "stripeExecuteRead"
  | "stripePrepareAction"
  | "stripeAuthorizeAction"
  | "stripeExecuteAction"
  | "stripeInspectAction"
  | "stripePlanePrincipalId"
> {
  return options !== undefined
    ? createStripePlaneChannelMembers({ ...options, log })
    : createAbsentStripePlaneChannelMembers();
}

/** The ABSENT-seam posture (the session-model-members precedent). */
export function createAbsentStripePlaneChannelMembers(): Pick<
  IPaySwapDesktopService,
  | "stripeCatalogueRelease"
  | "stripeListOperationFacts"
  | "stripeOperationFact"
  | "stripeListAccountFacts"
  | "stripeAccountFacts"
  | "stripeExecuteRead"
  | "stripePrepareAction"
  | "stripeAuthorizeAction"
  | "stripeExecuteAction"
  | "stripeInspectAction"
  | "stripePlanePrincipalId"
> {
  const refuse = async (): Promise<never> => {
    throw new StripePlaneNotConfiguredError();
  };
  return {
    stripeCatalogueRelease: refuse,
    stripeListOperationFacts: refuse,
    stripeOperationFact: refuse,
    stripeListAccountFacts: refuse,
    stripeAccountFacts: refuse,
    stripeExecuteRead: refuse,
    stripePrepareAction: refuse,
    stripeAuthorizeAction: refuse,
    stripeExecuteAction: refuse,
    stripeInspectAction: refuse,
    stripePlanePrincipalId: () => STRIPE_PLANE_LOCAL_PRINCIPAL_ID,
  };
}

/** Create the stripe plane channel members over the composed plane. */
export function createStripePlaneChannelMembers(
  deps: StripePlaneChannelDeps,
): Pick<
  IPaySwapDesktopService,
  | "stripeCatalogueRelease"
  | "stripeListOperationFacts"
  | "stripeOperationFact"
  | "stripeListAccountFacts"
  | "stripeAccountFacts"
  | "stripeExecuteRead"
  | "stripePrepareAction"
  | "stripeAuthorizeAction"
  | "stripeExecuteAction"
  | "stripeInspectAction"
  | "stripePlanePrincipalId"
> {
  const { plane, authority } = deps;

  const accountFactsOf = async (connectionId: string) => {
    const context = await plane.accountContext.resolve(connectionId);
    if (!context.ok) {
      return undefined;
    }
    return {
      connectionId: context.accountContext.connectionId,
      stripeAccountId: context.accountContext.stripeAccountId,
      accountModel: context.accountContext.accountModel,
      environment: context.accountContext.environment,
      grantedPermissionRules: plane.permissions.declaredScopesOf(connectionId),
    };
  };

  return {
    async stripeCatalogueRelease() {
      return plane.census.catalogueRelease;
    },

    async stripeListOperationFacts(filter) {
      const views = plane.census.enumerate();
      if (filter === undefined) {
        return views;
      }
      return views.filter(
        (view) =>
          (filter.resourceFamily === undefined || view.resourceFamily === filter.resourceFamily) &&
          (filter.packId === undefined || view.packId === filter.packId) &&
          (filter.supportState === undefined || view.supportState === filter.supportState) &&
          (filter.apiNamespace === undefined || view.apiNamespace === filter.apiNamespace),
      );
    },

    async stripeOperationFact(operationId) {
      return plane.census.resolve(operationId) ?? null;
    },

    async stripeListAccountFacts() {
      const statuses = await authority.connectionStatuses();
      const facts: {
        connectionId: string;
        stripeAccountId: string;
        accountModel: string;
        environment: string;
        grantedPermissionRules: readonly string[];
      }[] = [];
      for (const status of statuses) {
        if (status.providerId !== "stripe" || status.state !== "ACTIVE") {
          continue;
        }
        const factsForConnection = await accountFactsOf(status.connectionId);
        if (factsForConnection !== undefined) {
          facts.push(factsForConnection);
        }
      }
      return facts;
    },

    async stripeAccountFacts(connectionId) {
      return (await accountFactsOf(connectionId)) ?? null;
    },

    async stripeExecuteRead(request) {
      const operation = plane.census.resolve(request.operationId);
      if (operation === undefined || !plane.census.dispatchAllowed(request.operationId)) {
        return {
          ok: false as const,
          error: {
            code: "UNKNOWN_OPERATION" as const,
            message: `unknown or non-IMPLEMENTED catalogue operation '${request.operationId}' (DENY)`,
            retryable: false,
          },
        };
      }
      if (operation.effectClass !== "READ_ONLY") {
        return {
          ok: false as const,
          error: {
            code: "PERMISSION_MISSING" as const,
            message: `operation '${request.operationId}' is not a READ_ONLY operation — the read tool never dispatches it`,
            retryable: false,
          },
        };
      }
      // The flat arguments record becomes seam parameters with
      // PROVISIONAL locations (path params from the census view; the
      // rest by method default) — the validator's normalized output is
      // the binding truth (the digest law), never these provisional
      // values.
      const pathParamSet = new Set(operation.pathParams);
      const parameters = Object.entries(request.arguments ?? {}).map(([name, value]) => ({
        name,
        value,
        location: (pathParamSet.has(name)
          ? "path"
          : operation.method === "GET"
            ? "query"
            : "body") as "path" | "query" | "body",
      }));
      const validated = await plane.schemaValidator.validate(request.operationId, parameters);
      if (!validated.ok) {
        return {
          ok: false as const,
          error: {
            code: "VALIDATION" as const,
            message: `parameter validation refused (${validated.refusal.kind})`,
            retryable: false,
          },
        };
      }
      const context = await plane.accountContext.resolve(request.connectionId);
      if (!context.ok) {
        return {
          ok: false as const,
          error: {
            code: "PERMISSION_MISSING" as const,
            message: context.reason,
            retryable: false,
          },
        };
      }
      const eligibility = await plane.permissions.operationEligibility({
        connectionId: request.connectionId,
        operationId: request.operationId,
      });
      if (!eligibility.ok) {
        return {
          ok: false as const,
          error: { code: "PERMISSION_MISSING" as const, message: eligibility.reason, retryable: false },
        };
      }
      const requestApiVersion = await plane.apiVersion.requestApiVersionOf(request.connectionId);
      try {
        const response = await plane.seal.withSealedCredential(
          request.connectionId,
          (material) => {
            const apiKey = sealApiKeyOf(material);
            const grant = plane.permissions.deriveDispatchGrant({
              apiKey,
              connectionId: request.connectionId,
              environment: context.accountContext.environment,
              operationId: request.operationId,
              requiredPermissionRule: operation.requiredPermissionRule,
            });
            if (!grant.ok) {
              throw new StripeGrantRefusal(grant.reason);
            }
            return plane.transport.send({
              operationId: request.operationId,
              apiNamespace: operation.apiNamespace,
              method: operation.method,
              path: operation.path,
              parameters: validated.normalized,
              authorization: `Bearer ${apiKey}`,
              apiVersion: requestApiVersion,
              correlationId: `read:${request.callId}`,
            });
          },
          `read:${request.callId}`,
        );
        if (response.delivered) {
          if (response.status !== undefined && response.status >= 200 && response.status < 300) {
            await plane.apiVersion.recordCatalogueSurfaceUse(
              request.connectionId,
              plane.census.catalogueRelease,
            );
            return { ok: true as const, output: response.body };
          }
          return {
            ok: false as const,
            error: {
              code: "PROVIDER_FAILURE" as const,
              message: `the provider rejected the read (HTTP ${String(response.status)}${
                response.providerErrorCode !== undefined
                  ? `: ${response.providerErrorCode}`
                  : ""
              })`,
              retryable: true,
            },
          };
        }
        return {
          ok: false as const,
          error: {
            code: "TIMEOUT_UNKNOWN" as const,
            message: "the read was not delivered (the request may have landed — INV-04 UNKNOWN, never FAILED)",
            retryable: true,
          },
        };
      } catch (thrown: unknown) {
        if (thrown instanceof StripeGrantRefusal) {
          return {
            ok: false as const,
            error: { code: "PERMISSION_MISSING" as const, message: thrown.message, retryable: false },
          };
        }
        const message = thrown instanceof Error ? thrown.message : String(thrown);
        deps.log("warn", "payswap-desktop: stripe read failed", { message });
        return {
          ok: false as const,
          error: { code: "PROVIDER_FAILURE" as const, message, retryable: true },
        };
      }
    },

    async stripePrepareAction(proposal) {
      const result = await plane.executor.prepare({
        operationId: proposal.operationId,
        parameters: proposal.parameters,
        connectionId: proposal.connectionId,
        taskId: proposal.taskId,
      });
      return result;
    },

    async stripeAuthorizeAction(input) {
      const result = await plane.executor.authorize({
        preparedActionId: input.preparedActionId,
        // The principal is HOST-RESOLVED (the local desktop operator) —
        // the renderer's value is advisory only and never trusted.
        principalId: STRIPE_PLANE_LOCAL_PRINCIPAL_ID,
        confirmedDigest: input.confirmedDigest,
      });
      return result;
    },

    async stripeExecuteAction(authorizationId) {
      return plane.executor.execute(authorizationId);
    },

    async stripeInspectAction(preparedActionId) {
      return plane.executor.inspect(preparedActionId);
    },

    stripePlanePrincipalId() {
      return STRIPE_PLANE_LOCAL_PRINCIPAL_ID;
    },
  };
}
