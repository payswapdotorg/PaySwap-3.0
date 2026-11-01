/**
 * PaySwap Desktop (P24-2, ADR-0017 D10 — THE CORE OF THE WAVE) — the
 * REAL StripePreparedActionExecutor over the FROZEN contracts
 * (./prepared-action-contracts.ts — implemented, never modified).
 *
 * THE TWO-PHASE LAW: prepare → validate → preview(confirmationInputs) →
 * human confirmation → authorize → execute → verify/reconcile.
 * - PREPARE: census admission (DENY unless IMPLEMENTED-class), schema
 *   validation (the digest binds the NORMALIZED form), the HOST-resolved
 *   account context (verified evidence only), the opaque mint, the
 *   canonical SHA-256 digest, expiry, confirmationInputs +
 *   idempotencyKeyRef + readBackOperationId.
 * - AUTHORIZE: the single-use, digest-bound artifact. Digest mismatch,
 *   expiry and unknown actions refuse; one live authorization per
 *   action; replay after consumption refuses.
 * - EXECUTE: re-resolve context/permissions, re-check the approval
 *   tier, re-derive the grant INSIDE the seal (ADR-0008), dispatch
 *   through the transport seam, classify honestly (INV-04) and append
 *   the secret-free audit record. Parameter/context change after
 *   approval invalidates; expired actions are never auto-executed.
 */

import type {
  StripeActionAuditRecord,
  StripeActionAuthorization,
  StripeActionExecutionOutcome,
  StripePreparedAction,
  StripePreparedActionExecutor,
} from "./prepared-action-contracts.js";
import type { StripePreparedActionExecutorDeps } from "./action-seams.js";
import type { StripePreparedActionStore } from "./prepared-action-store.js";
import { classifyDispatchOutcome, classifiedOperationOf } from "./prepared-action-classify.js";
import { APPROVAL_TIER_RANK, StripeGrantRefusal, sealApiKeyOf } from "./prepared-action-gates.js";
import { canonicalBindingOf, confirmationInputsOf, digestOf } from "./prepared-action-digest.js";

/** The default prepared-action lifetime (30 minutes — the expiry law). */
export const STRIPE_PREPARED_ACTION_TTL_MS = 30 * 60 * 1000;

/** The default authorization lifetime (10 minutes — never outlives the action). */
export const STRIPE_ACTION_AUTHORIZATION_TTL_MS = 10 * 60 * 1000;

/** Compose the REAL executor (the frozen-contract implementation). */
export function createStripePreparedActionExecutor(
  deps: StripePreparedActionExecutorDeps & { readonly store: StripePreparedActionStore },
): StripePreparedActionExecutor {
  const preparedActionTtlMs = deps.preparedActionTtlMs ?? STRIPE_PREPARED_ACTION_TTL_MS;
  const authorizationTtlMs = deps.authorizationTtlMs ?? STRIPE_ACTION_AUTHORIZATION_TTL_MS;
  const store = deps.store;

  return {
    async prepare(proposal) {
      if (typeof proposal.taskId !== "string" || proposal.taskId.length === 0) {
        return { ok: false, reason: "a prepared action requires the task it belongs to (the approval lineage)" };
      }
      // ---- admission: the census decides (unknown or non-IMPLEMENTED → DENY) ----
      const operation = deps.census.resolve(proposal.operationId);
      if (operation === undefined) {
        return { ok: false, reason: `unknown catalogue operation '${proposal.operationId}' (DENY)` };
      }
      if (!deps.census.dispatchAllowed(proposal.operationId)) {
        return {
          ok: false,
          reason: `operation '${proposal.operationId}' has support state '${operation.supportState}' — only IMPLEMENTED-class operations dispatch (UNKNOWN OVERLAY = DENY)`,
        };
      }
      // ---- parameter validation: the digest binds the NORMALIZED form ----
      const validated = await deps.schemaValidator.validate(proposal.operationId, proposal.parameters);
      if (!validated.ok) {
        return {
          ok: false,
          reason: `parameter validation refused (${validated.refusal.kind}${"name" in validated.refusal ? `: ${validated.refusal.name}` : ""})`,
        };
      }
      // ---- the account context: verified connection evidence ONLY ----
      const context = await deps.accountContext.resolve(proposal.connectionId);
      if (!context.ok) {
        return { ok: false, reason: context.reason };
      }
      // ---- the RAK operation-level eligibility (declared scopes) ----
      const eligibility = await deps.permissions.operationEligibility({
        connectionId: proposal.connectionId,
        operationId: proposal.operationId,
      });
      if (!eligibility.ok) {
        return { ok: false, reason: eligibility.reason };
      }
      // ---- mint + digest ----
      const preparedActionId = `stripe-action:${deps.createId()}`;
      const binding = canonicalBindingOf({
        operationId: proposal.operationId,
        catalogueRelease: deps.census.catalogueRelease,
        accountContext: context.accountContext,
        parameters: validated.normalized,
      });
      const digested = digestOf(binding);
      if (!digested.ok) {
        return { ok: false, reason: `refused to digest the binding (${digested.refusal.kind})` };
      }
      const nowMs = deps.nowMs();
      const action: StripePreparedAction = Object.freeze({
        preparedActionId,
        operationId: proposal.operationId,
        catalogueRelease: deps.census.catalogueRelease,
        accountContext: context.accountContext,
        parameters: validated.normalized,
        digest: digested.digest,
        effectClass: operation.effectClass,
        approvalTier: operation.approvalTier,
        confirmationInputs: confirmationInputsOf({
          operationId: proposal.operationId,
          summary: operation.summary,
          effectClass: operation.effectClass,
          approvalTier: operation.approvalTier,
          accountContext: context.accountContext,
          parameters: validated.normalized,
        }),
        idempotencyKeyRef: `idem:${preparedActionId}`,
        readBackOperationId: operation.readBackOperationId,
        expiresAt: new Date(nowMs + preparedActionTtlMs).toISOString(),
        createdBy: "model_proposal",
      });
      await store.putAction(action);
      return { ok: true, action };
    },

    async authorize(input) {
      const action = await store.getAction(input.preparedActionId);
      if (action === null) {
        return { ok: false, reason: `unknown prepared action '${input.preparedActionId}'` };
      }
      const nowMs = deps.nowMs();
      if (Date.parse(action.expiresAt) <= nowMs) {
        return {
          ok: false,
          reason: `prepared action '${input.preparedActionId}' expired at ${action.expiresAt} (expired actions are never authorized, never auto-executed)`,
        };
      }
      // The digest law: the confirmed digest MUST equal the action's.
      if (input.confirmedDigest !== action.digest) {
        return {
          ok: false,
          reason: "digest mismatch — the approved preview does not bind this prepared action (a new preview is required)",
        };
      }
      // One LIVE authorization per action (single-use each).
      const existing = await store.authorizationsForAction(input.preparedActionId);
      const live = existing.find(
        (authorization) =>
          authorization.consumedAt === null && Date.parse(authorization.expiresAt) > nowMs,
      );
      if (live !== undefined) {
        return {
          ok: false,
          reason: `prepared action '${input.preparedActionId}' already carries a live authorization ('${live.authorizationId}') — it is single-use; consume it or let it expire`,
        };
      }
      const authorization: StripeActionAuthorization = Object.freeze({
        authorizationId: `stripe-authz:${deps.createId()}`,
        preparedActionId: input.preparedActionId,
        approvedDigest: action.digest,
        approvedByPrincipalId: input.principalId,
        accountContext: action.accountContext,
        consumedAt: null,
        expiresAt: new Date(
          Math.min(nowMs + authorizationTtlMs, Date.parse(action.expiresAt)),
        ).toISOString(),
      });
      await store.putAuthorization(authorization);
      return { ok: true, authorization };
    },

    async execute(authorizationId): Promise<StripeActionExecutionOutcome> {
      const authorization = await store.getAuthorization(authorizationId);
      if (authorization === null) {
        return {
          kind: "FAILED",
          reason: "REFUSED_BEFORE_DISPATCH",
          detail: `unknown authorization '${authorizationId}' (the model can reference an authorization; it can never mint, edit or supply a valid one)`,
        };
      }
      const nowMs = deps.nowMs();
      const nowIso = deps.nowIso();
      if (authorization.consumedAt !== null) {
        return {
          kind: "FAILED",
          reason: "REFUSED_BEFORE_DISPATCH",
          detail: `authorization '${authorizationId}' was already consumed at ${authorization.consumedAt} — single-use; replay is refused`,
        };
      }
      const action = await store.getAction(authorization.preparedActionId);
      if (action === null) {
        return {
          kind: "FAILED",
          reason: "REFUSED_BEFORE_DISPATCH",
          detail: `the prepared action '${authorization.preparedActionId}' no longer exists`,
        };
      }
      // THE RESUME LAW first: an expired prepared action is dead even
      // when its authorization is still within its own (shorter) TTL —
      // expired actions are never auto-executed.
      if (Date.parse(action.expiresAt) <= nowMs) {
        return {
          kind: "FAILED",
          reason: "REFUSED_BEFORE_DISPATCH",
          detail: `the prepared action expired at ${action.expiresAt} (expired actions are never auto-executed on resume)`,
        };
      }
      if (Date.parse(authorization.expiresAt) <= nowMs) {
        return {
          kind: "FAILED",
          reason: "REFUSED_BEFORE_DISPATCH",
          detail: `authorization '${authorizationId}' expired at ${authorization.expiresAt}`,
        };
      }
      // ---- single-use: consume durably BEFORE dispatch (a crash after
      // this point leaves UNKNOWN, reconciled by read-back — never a
      // replayable authorization). ----
      const consumed = await store.consumeAuthorization(authorizationId, nowIso);
      if (!consumed) {
        return {
          kind: "FAILED",
          reason: "REFUSED_BEFORE_DISPATCH",
          detail: `authorization '${authorizationId}' was already consumed — single-use; replay is refused`,
        };
      }

      // ---- the ADR-0008 re-resolution (outside the seal; no material) ----
      const audit = async (outcome: StripeActionExecutionOutcome, requestIds: readonly string[]) => {
        const record: StripeActionAuditRecord = Object.freeze({
          preparedActionId: action.preparedActionId,
          authorizationId,
          operationId: action.operationId,
          accountContext: action.accountContext,
          outcome,
          providerRequestIds: Object.freeze([...requestIds]),
          at: nowIso,
        });
        await store.appendAuditRecord(record);
        return outcome;
      };

      const context = await deps.accountContext.resolve(action.accountContext.connectionId);
      if (!context.ok) {
        return audit(
          {
            kind: "FAILED",
            reason: "POLICY",
            detail: `the connection's verified account context no longer resolves: ${context.reason} (a new preview is required)`,
          },
          [],
        );
      }
      if (
        context.accountContext.stripeAccountId !== action.accountContext.stripeAccountId ||
        context.accountContext.environment !== action.accountContext.environment ||
        context.accountContext.connectionId !== action.accountContext.connectionId
      ) {
        return audit(
          {
            kind: "FAILED",
            reason: "POLICY",
            detail: "the account context changed after approval — the authorization is invalidated (a new preview is required)",
          },
          [],
        );
      }
      const operation = deps.census.resolve(action.operationId);
      if (operation === undefined || !deps.census.dispatchAllowed(action.operationId)) {
        return audit(
          {
            kind: "FAILED",
            reason: "POLICY",
            detail: `operation '${action.operationId}' is no longer dispatchable under the census (support state changed since approval)`,
          },
          [],
        );
      }
      // The overlay approval-tier re-check: a tier INCREASE after
      // approval means the recorded confirmation is no longer sufficient.
      if (
        (APPROVAL_TIER_RANK[operation.approvalTier] ?? 99) >
        (APPROVAL_TIER_RANK[action.approvalTier] ?? 99)
      ) {
        return audit(
          {
            kind: "FAILED",
            reason: "POLICY",
            detail: `the approval tier for '${action.operationId}' increased from ${action.approvalTier} to ${operation.approvalTier} since approval (a new, stronger confirmation is required)`,
          },
          [],
        );
      }
      const eligibility = await deps.permissions.operationEligibility({
        connectionId: action.accountContext.connectionId,
        operationId: action.operationId,
      });
      if (!eligibility.ok) {
        return audit(
          { kind: "FAILED", reason: "PERMISSION_MISSING", detail: eligibility.reason },
          [],
        );
      }
      const requestApiVersion = await deps.apiVersion.requestApiVersionOf(
        action.accountContext.connectionId,
      );

      // ---- the seal: the grant re-derives over the REAL material ----
      try {
        const response = await deps.seal.withSealedCredential(
          action.accountContext.connectionId,
          (material) => {
            const apiKey = sealApiKeyOf(material);
            const grant = deps.permissions.deriveDispatchGrant({
              apiKey,
              connectionId: action.accountContext.connectionId,
              environment: action.accountContext.environment,
              operationId: action.operationId,
              requiredPermissionRule: operation.requiredPermissionRule,
            });
            if (!grant.ok) {
              throw new StripeGrantRefusal(grant.reason);
            }
            return deps.transport.send({
              operationId: action.operationId,
              apiNamespace: operation.apiNamespace,
              method: operation.method,
              path: operation.path,
              parameters: action.parameters,
              // The wire key binds ONLY when the operation's idempotency
              // class takes one (v1 state-changing POSTs — the P24-1
              // classification; a key on any other class is refused by
              // the real transport, so the executor never sends one).
              ...(operation.idempotencyKeyAllowed
                ? { idempotencyKey: `idem-${action.digest}` }
                : {}),
              authorization: `Bearer ${apiKey}`,
              apiVersion: requestApiVersion,
              // The host-minted preparedActionId is the unique provider
              // correlation (the frozen action shape carries no task-id
              // field; the approval lineage rides the audit record's
              // authorization id).
              correlationId: `prepared-action-dispatch:${action.preparedActionId}`,
            });
          },
          `prepared-action-dispatch:${action.preparedActionId}`,
        );
        const outcome = await classifyDispatchOutcome(
          classifiedOperationOf(action, operation),
          response,
          audit,
        );
        await deps.apiVersion.recordCatalogueSurfaceUse(
          action.accountContext.connectionId,
          deps.census.catalogueRelease,
        );
        if (outcome.kind === "PROVIDER_REJECTED" && outcome.httpStatus === 403) {
          // The withdrawn-permission loop (handoff §13.2): a 403 on a
          // dispatched operation records a withdrawal observation that
          // removes the operation from the exposed set until the RAK
          // scopes are refreshed and re-probed.
          await deps.permissions.recordDispatchObservation({
            connectionId: action.accountContext.connectionId,
            operationId: action.operationId,
            httpStatus: outcome.httpStatus,
            providerErrorCode: outcome.providerErrorCode,
          });
        }
        return outcome;
      } catch (error) {
        if (error instanceof StripeGrantRefusal) {
          return audit({ kind: "FAILED", reason: "PERMISSION_MISSING", detail: error.message }, []);
        }
        if (error instanceof Error && error.message.startsWith("the sealed credential material")) {
          return audit({ kind: "FAILED", reason: "VALIDATION", detail: error.message }, []);
        }
        // An unexpected failure after consumption: the honest state is
        // UNKNOWN — the request MAY have been dispatched; the
        // reconciliation read-back is the only path back to terminal.
        return audit(
          {
            kind: "UNKNOWN",
            reconciliationOperationId: action.readBackOperationId,
            note: `dispatch raised '${error instanceof Error ? error.message : "an unknown error"}' after the single-use authorization was consumed — reconcile by read-back before any retry (INV-04)`,
          },
          [],
        );
      }
    },

    async inspect(preparedActionId) {
      return store.getAction(preparedActionId);
    },
  };
}
