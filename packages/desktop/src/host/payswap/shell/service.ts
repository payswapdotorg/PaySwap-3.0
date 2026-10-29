/**
 * PaySwap Desktop (P7-W2 + P10-B) — the host-side product service.
 *
 * Implements IPaySwapDesktopService over the pure product folds (mission
 * surface, honest states, quote disclosure, security gate, progress
 * timeline, delegation) and, since P10-B, the console workspace surface:
 * host-computed deploymentFacts (facts about configured planes, never
 * renderer-invented) + the DESKTOP_PROFILE workspace store (demand-side
 * mission intent only, persisted under the seam's store directory).
 * Every method is a pure projection or a typed-reference delegation —
 * there is NO method that executes money movement, mints authorization
 * or writes financial truth (the no-parallel-engine law, enforced
 * structurally by the interface).
 *
 * LOGGER DISCIPLINE (ZCode Platform Baseline): the service logs through
 * the injected host seam log (writeHostLog-shaped) — never a console
 * bypass; no secret material is ever logged (the inputs carry none).
 */

import type { IPaySwapDesktopService, PaySwapDesktopHostSeam, PaySwapDesktopSession } from "./contracts.js";
import type {
  DesktopDelegatedMovementRef,
  DesktopDelegationReceipt,
  DesktopJourneyObservationInput,
  DesktopJourneyStateView,
  DesktopMissionBoardView,
  DesktopProgressFoldInput,
  DesktopProgressTimelineView,
  DesktopQuoteDisclosureInput,
  DesktopQuoteDisclosureView,
  DesktopSecurityGateInput,
  DesktopSecurityGateView,
  PaySwapDesktopDeploymentFacts,
} from "../product/contracts.js";
import { foldDesktopMissionBoard } from "../product/mission-surface.js";
import { deriveDesktopJourneyState } from "../product/honest-states.js";
import { foldDesktopQuoteTerms } from "../product/quote-terms.js";
import { foldDesktopSecurityDecision } from "../product/security-gate.js";
import { foldDesktopProgressTimeline } from "../product/progress-timeline.js";
import { delegateDesktopMoneyMovement } from "../product/delegation.js";
import type { ConnectionSessionAuthority } from "../connections/session-authority.js";
import type { WorkspaceStoreFileSystem } from "../product/workspace-store-persistence.js";
import type {
  DesktopConnectionSetupOutcome,
  DesktopConnectionStatusView,
  DesktopCredentialSealReceipt,
  DesktopProviderCallbackView,
  DesktopProviderRegistryView,
} from "../connections/contracts.js";
import type { PaymentMissionRuntime } from "../payments/payment-mission-runtime.js";
import type { DispatchLaneCandidateRecord } from "../payments/dispatch-lane-resolver.js";
import type { ProbeEvidenceStore } from "../connections/probe-evidence.js";
import type { HostFetch } from "../connections/host-https-transports.js";
import type { ZCodeSessionSettingsState } from "@zcode/shared";
import { createConnectionProbeChannelMembers } from "../connections/probe-members.js";
import { createConnectionStellarChannelMembers } from "../connections/stellar-members.js";
import {
  createAbsentConnectionCapabilityChainChannelMembers,
  createConnectionCapabilityChainChannelMembers,
} from "../connections/chain-members.js";
import { sessionModelCatalogMembersOf } from "./session-model-members.js";
import {
  DECLARED_STRIPE_TEST_CORRIDOR,
  createGateEnvironmentFromConnections,
} from "../connections/gate-environment.js";
import {
  createPaymentMissionChannelMembers,
  createPaymentMissionRuntimeResolver,
} from "./payment-mission-members.js";
import { createPaymentApprovalChannelMembers } from "./approval-members.js";
import { createPaymentDispatchChannelMembers } from "./dispatch-members.js";
import { createPaymentReconciliationChannelMembers } from "./reconcile-members.js";
import {
  createAbsentPaymentVerifyChannelMembers,
  createPaymentVerifyChannelMembers,
} from "./verify-members.js";
import { createLaneAwareStripeReadBack } from "../payments/execution-lane-composition.js";
import { createWorkspaceStoreChannelMembers } from "./workspace-store-members.js";
import { ConnectionPlaneNotConfiguredError } from "./plane-errors.js";

/** The typed fail-closed plane errors live in ./plane-errors.ts (the ≤400-line file-law split); re-exported for the established import surface. */
export {
  ConnectionPlaneNotConfiguredError,
  PaymentPlaneNotConfiguredError,
  SessionModelCatalogNotConfiguredError,
} from "./plane-errors.js";

/** Options for constructing the service (id generation injectable — deterministic tests). */
export interface PaySwapDesktopServiceOptions {
  /** Session id factory; defaults to a UUID. Injected by tests for determinism. */
  readonly createSessionId?: () => string;
  /** Session creation timestamp (ISO-8601); defaults to the injected clock or a fixed composition-time value. */
  readonly createdAt?: string;
  /**
   * (P10-B) The injected file system for the DESKTOP_PROFILE workspace
   * store snapshot. The node:fs binding is supplied at the COMPOSITION
   * EDGE (composition.ts); tests inject fakes. Required exactly when the
   * seam carries a storeDirectory — otherwise the service fails closed.
   */
  readonly workspaceStoreFileSystem?: WorkspaceStoreFileSystem;
  /**
   * (P13-B) The connection session authority (registry + records +
   * broker + state bindings), composed at the composition edge with the
   * substrate ICredentialService and the node:fs binding. When ABSENT,
   * the connection-plane members fail closed with a typed error on
   * first use — never a silent no-op, never an in-memory-only plane
   * pretending to be durable.
   */
  readonly connectionAuthority?: ConnectionSessionAuthority;
  /**
   * (P21-A, ADR-0014 D5) The connection-ACTIVATION plane deps: the
   * probe-evidence ledger (composed with the authority at the node
   * edge) + the REAL fetch binding the host-side probes and the
   * execution kernel ride (the composition edge binds globalThis.fetch;
   * tests inject deterministic fakes). When ABSENT, the two new
   * key-entry members still ride the authority, but the verification-
   * probe runner fails closed with the typed
   * ConnectionPlaneNotConfiguredError — never a caller-asserted
   * outcome, never an in-memory-only probe pretending to be real.
   */
  readonly connectionProbe?: {
    readonly evidenceStore: ProbeEvidenceStore;
    readonly fetchImpl: HostFetch;
    readonly nowMs?: () => number;
  };
  /**
   * (P17-A) The payment-mission runtime, composed at the composition
   * edge over the payments store directory (store → runtime →
   * recoverInterruptions once). When ABSENT, every paymentMission*
   * member fails closed with the typed PaymentPlaneNotConfiguredError.
   */
  readonly paymentMissionRuntime?: PaymentMissionRuntime;
  /** (P17-A) The host clock for the payment-mission members — instants are stamped at the channel edge, never renderer-supplied. */
  readonly paymentMissionClock?: () => string;
  /**
   * (P21-D Gap C, ADR-0014 D4) The substrate session-settings read
   * backing the sessionModelCatalog member (see
   * ./session-model-substrate-read.ts). ABSENT → the member fails
   * closed typed; undefined-resolving reads → the honest EMPTY catalog.
   */
  readonly sessionModelCatalog?: {
    readonly readSettings: () => Promise<ZCodeSessionSettingsState | undefined>;
  };
}

function defaultSessionId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * The host-computed honest deployment facts for THIS deployment: no
 * economic intake plane, no capability observations, no merchant
 * checkout binding, no provider observations and no reachable
 * delegation plane exist — the all-unconfigured truth. These are FACTS
 * ABOUT CONFIGURED PLANES (never UI state, never renderer-invented); no
 * plane exists in this deployment, so every fact is false. When a plane
 * is ever configured, the owning lane flips its fact here.
 */
function computeHonestDeploymentFacts(): PaySwapDesktopDeploymentFacts {
  return {
    economicIntakeConfigured: false,
    capabilityObservationsAvailable: false,
    merchantCheckoutContextBound: false,
    providerObservationsAvailable: false,
    delegationPlaneReachable: false,
  };
}

/** Create the PaySwap Desktop product service bound to one host seam. */
export function createPaySwapDesktopService(
  seam: PaySwapDesktopHostSeam,
  options: PaySwapDesktopServiceOptions = {},
): IPaySwapDesktopService {
  const createSessionId = options.createSessionId ?? defaultSessionId;
  const session: PaySwapDesktopSession = {
    sessionId: createSessionId(),
    scope: seam.scope,
    clientMode: "desktop-continuous",
    createdAt: options.createdAt ?? "1970-01-01T00:00:00.000Z",
  };
  seam.log(
    "info",
    "payswap-desktop: product service composed",
    JSON.stringify({ sessionId: session.sessionId, scopeKind: seam.scope.kind }),
  );

  // (P13-B) The connection session authority — optional at construction
  // (unconfigured seams compose fine) and fail-closed per-call.
  const connectionAuthority = options.connectionAuthority;
  function resolveConnectionAuthority(): ConnectionSessionAuthority {
    if (connectionAuthority === undefined) {
      throw new ConnectionPlaneNotConfiguredError();
    }
    return connectionAuthority;
  }

  // (P17-A + P18-A) The payment-mission plane: the read/input members
  // and the edge-pinned approval members over the composed runtime —
  // ONE fail-closed resolver shared by both member families (the
  // not-configured warning logs ONCE), instants stamped at the channel
  // edge from the injected clock.
  const seamLog = (level: "info" | "warn" | "error", message: string) => {
    seam.log(level, message);
  };
  const paymentMissionClock = options.paymentMissionClock ?? (() => new Date().toISOString());
  const resolvePaymentMissionRuntime = createPaymentMissionRuntimeResolver(
    options.paymentMissionRuntime,
    seamLog,
  );

  // (P19-A, ADR-0012 D2) The dispatch members' lane-candidate port —
  // the connections registry's own read model (the status views are a
  // structural superset of the resolver's candidate records). Fail-
  // closed PER CALL with the typed error when the connections plane
  // was not composed — the lane set is never fabricated to mask a
  // missing plane; a composed plane with zero records is the honest
  // empty lane.
  const listLaneCandidateRecords = async (): Promise<readonly DispatchLaneCandidateRecord[]> => {
    return await resolveConnectionAuthority().connectionStatuses();
  };

  // (P21-A, ADR-0014 D5) The connection-ACTIVATION members: the two new
  // key-entry verbs ride the SAME authority resolver; the probe runner
  // additionally requires the probe plane (the evidence ledger + the
  // REAL fetch binding) and fails closed with the same typed error
  // when it was not composed — the workspace-store posture.
  const connectionProbe = options.connectionProbe;
  function resolveProbeEvidenceStore(): ProbeEvidenceStore {
    if (connectionProbe === undefined) {
      throw new ConnectionPlaneNotConfiguredError();
    }
    return connectionProbe.evidenceStore;
  }
  const connectionProbeMembers =
    connectionAuthority !== undefined && connectionProbe !== undefined
      ? createConnectionProbeChannelMembers({
          resolveAuthority: resolveConnectionAuthority,
          resolveEvidenceStore: resolveProbeEvidenceStore,
          fetchImpl: connectionProbe.fetchImpl,
          nowMs: connectionProbe.nowMs ?? Date.now,
          log: seamLog,
        })
      : {
          async connectionSubmitFlutterwaveSecretKey(input: {
            readonly connectionId: string;
            readonly secretKey: string;
          }): Promise<DesktopCredentialSealReceipt> {
            return resolveConnectionAuthority().submitFlutterwaveSecretKey(input);
          },
          async connectionSubmitPaystackSecretKey(input: {
            readonly connectionId: string;
            readonly secretKey: string;
          }): Promise<DesktopCredentialSealReceipt> {
            return resolveConnectionAuthority().submitPaystackSecretKey(input);
          },
          async connectionRunVerificationProbe(providerId: string) {
            // The probe runner is REAL or absent — never a caller-asserted
            // outcome (resolveProbeEvidenceStore throws the typed error
            // when the probe plane was not composed; the authority
            // resolver likewise when the connection plane is absent).
            resolveConnectionAuthority();
            resolveProbeEvidenceStore();
            void providerId;
            throw new ConnectionPlaneNotConfiguredError();
          },
        };

  // (P22-H, ADR-0016 D2/D9) The ONCHAIN RAIL members — the Stellar
  // keypair-entry verb + the host-side REAL Horizon account-read probe
  // runner (the probe-members pattern applied to the rail; the PSP
  // vocabulary is never touched — ADR-0008 D5).
  const connectionStellarMembers =
    connectionAuthority !== undefined && connectionProbe !== undefined
      ? createConnectionStellarChannelMembers({
          resolveAuthority: resolveConnectionAuthority,
          resolveEvidenceStore: resolveProbeEvidenceStore,
          fetchImpl: connectionProbe.fetchImpl,
          nowMs: connectionProbe.nowMs ?? Date.now,
          log: seamLog,
        })
      : {
          async connectionSubmitStellarSecretKey(input: {
            readonly connectionId: string;
            readonly publicKey: string;
            readonly secretKey: string;
          }): Promise<DesktopCredentialSealReceipt> {
            return resolveConnectionAuthority().submitStellarSecretKey(input);
          },
          async connectionRunStellarAccountReadProbe() {
            // The probe runner is REAL or absent — never a caller-asserted
            // outcome (the absent-plane postures throw the typed errors).
            resolveConnectionAuthority();
            resolveProbeEvidenceStore();
            throw new ConnectionPlaneNotConfiguredError();
          },
        };

  // (P21-D Gap A, ADR-0014 D6/D12) The connection-capability-chains
  // member: the corridor route chains derived from the REAL bridge over
  // the SAME fail-closed resolvers (the probe-members pattern — the
  // member requires BOTH planes; a composed plane with zero ACTIVE
  // connections returns the honest empty chain set).
  const connectionChainMembers =
    connectionAuthority !== undefined && connectionProbe !== undefined
      ? createConnectionCapabilityChainChannelMembers({
          resolveAuthority: resolveConnectionAuthority,
          resolveEvidenceStore: resolveProbeEvidenceStore,
          log: seamLog,
        })
      : createAbsentConnectionCapabilityChainChannelMembers();

  // (P21-D Gap C, ADR-0014 D4) The session-model-catalog member: the
  // substrate session settings' model availability mapped 1:1 onto the
  // catalog DTOs (the members module owns the absent/composed postures).
  const sessionModelCatalogMembers = sessionModelCatalogMembersOf(
    options.sessionModelCatalog,
    seamLog,
  );

  // (P21-D reviewer-gate, Gap C) The VERIFICATION member: the single-act
  // authoritative read-back over the LANE-AWARE Stripe read-back port,
  // composed over the SAME connection + probe planes the dispatch
  // authority rides (a read-back is never fabricated over an ineligible
  // lane). When either plane is absent the member is still spread (the
  // census holds) but fails closed with the typed
  // PaymentPlaneNotConfiguredError — the absent probe-members posture.
  const paymentVerifyMembers =
    connectionAuthority !== undefined && connectionProbe !== undefined
      ? createPaymentVerifyChannelMembers({
          resolveRuntime: resolvePaymentMissionRuntime,
          readBackPort: createLaneAwareStripeReadBack({
            connectionAuthority,
            fetchImpl: connectionProbe.fetchImpl,
            ...(connectionProbe.nowMs !== undefined ? { nowMs: connectionProbe.nowMs } : {}),
            log: seamLog,
          }),
          now: paymentMissionClock,
          log: seamLog,
        })
      : createAbsentPaymentVerifyChannelMembers(resolvePaymentMissionRuntime);

  const service: IPaySwapDesktopService = {
    session,

    deploymentFacts(): PaySwapDesktopDeploymentFacts {
      return computeHonestDeploymentFacts();
    },

    async missionBoard(facts: PaySwapDesktopDeploymentFacts): Promise<DesktopMissionBoardView> {
      const board = foldDesktopMissionBoard(facts);
      seam.log(
        "info",
        "payswap-desktop: mission board folded",
        JSON.stringify({
          rows: board.rows.length,
          anyDispatchable: board.rows.some((row) => row.affordance.kind === "DELEGATE_JOURNEY"),
        }),
      );
      return board;
    },

    async quoteDisclosure(
      input: DesktopQuoteDisclosureInput,
    ): Promise<DesktopQuoteDisclosureView> {
      return foldDesktopQuoteTerms(input);
    },

    async progressTimeline(
      input: DesktopProgressFoldInput,
    ): Promise<DesktopProgressTimelineView> {
      return foldDesktopProgressTimeline(input);
    },

    async securityDecision(input: DesktopSecurityGateInput): Promise<DesktopSecurityGateView> {
      return foldDesktopSecurityDecision(input);
    },

    async journeyState(
      observation: DesktopJourneyObservationInput,
    ): Promise<DesktopJourneyStateView> {
      return deriveDesktopJourneyState(observation);
    },

    async delegateMoneyMovement(
      movement: DesktopDelegatedMovementRef,
    ): Promise<DesktopDelegationReceipt> {
      const receipt = delegateDesktopMoneyMovement(movement);
      seam.log(
        "info",
        "payswap-desktop: money movement delegated via typed reference (acknowledgement only)",
        JSON.stringify({ journeyId: receipt.journeyId, acceptedBy: receipt.acceptedBy }),
      );
      return receipt;
    },

    // (P10-B) The §5 workspace-store surface (split to
    // ./workspace-store-members.ts at P18-A for the file law — the
    // same member names, the same lazy fail-closed store posture).
    ...createWorkspaceStoreChannelMembers({
      storeDirectory: seam.storeDirectory,
      fileSystem: options.workspaceStoreFileSystem,
      log: (level, message, ...args) => seam.log(level, message, ...args),
    }),

    // -----------------------------------------------------------------------
    // Provider connections (P13-B — ADR-0007 D3/D4/D5)
    // -----------------------------------------------------------------------

    async connectionRegistry(): Promise<readonly DesktopProviderRegistryView[]> {
      return resolveConnectionAuthority().registry();
    },

    async connectionStatuses(): Promise<readonly DesktopConnectionStatusView[]> {
      return resolveConnectionAuthority().connectionStatuses();
    },

    async connectionSeedSetup(input: {
      readonly providerId: string;
      readonly useCaseRef: string;
    }): Promise<DesktopConnectionSetupOutcome> {
      const outcome = await resolveConnectionAuthority().seedConnectionSetup(input);
      seam.log(
        "info",
        "payswap-desktop: connection setup seeded (record only — nothing connected)",
        JSON.stringify({ kind: outcome.kind, providerId: input.providerId }),
      );
      return outcome;
    },

    async connectionSubmitStripeRestrictedKey(input: {
      readonly connectionId: string;
      readonly secretKey: string;
    }): Promise<DesktopCredentialSealReceipt> {
      const receipt = await resolveConnectionAuthority().submitStripeRestrictedKey(input);
      // NO key material in the log line — the receipt shape guarantees it.
      seam.log(
        "info",
        "payswap-desktop: stripe restricted key sealed (verification still required)",
        JSON.stringify({
          connectionId: receipt.connectionId,
          sealedSecretCount: receipt.sealedSecretCount,
          nextState: receipt.nextState,
        }),
      );
      return receipt;
    },

    async connectionRecordVerificationOutcome(input: {
      readonly connectionId: string;
      readonly outcome: "CONFIRMED" | "UNKNOWN" | "FAILED";
      readonly evidenceSummary: string;
    }): Promise<DesktopConnectionStatusView> {
      return resolveConnectionAuthority().recordVerificationOutcome(input);
    },

    async connectionConsumeProviderCallback(input: {
      readonly state: string;
      readonly error?: string;
    }): Promise<DesktopProviderCallbackView> {
      return resolveConnectionAuthority().consumeProviderCallback(input);
    },

    async connectionRevoke(connectionId: string): Promise<DesktopConnectionStatusView> {
      return resolveConnectionAuthority().revokeConnection(connectionId);
    },

    // (P21-A, ADR-0014 D5) The connection-ACTIVATION members — the
    // Flutterwave/Paystack key-entry verbs + the host-side REAL probe
    // runner (the caller-trust fix: the ONLY ACTIVE path stays a
    // probe-CONFIRMED outcome recorded through the authority's own
    // recorder; the outcome never echoes key material).
    ...connectionProbeMembers,

    // (P22-H, ADR-0016 D2/D9) The ONCHAIN RAIL members — the Stellar
    // keypair verb + the Horizon account-read probe runner.
    ...connectionStellarMembers,

    // (P21-D Gap A, ADR-0014 D6/D12) The connection-capability-chains
    // member — the bridge-derived corridor route chains (capability
    // metadata only; the honest empty set when nothing is ACTIVE).
    ...connectionChainMembers,

    // (P21-D Gap C, ADR-0014 D4) The session-model-catalog member — the
    // substrate session settings' model availability as catalog DTOs.
    ...sessionModelCatalogMembers,

    // (P17-A, ADR-0010 D2) The payment-mission plane — read/input
    // members over the composed runtime (instants are stamped at the
    // channel edge from the host clock, never renderer-supplied).
    // (P21-A, ADR-0014 D6) When the connection plane + the probe plane
    // are composed, the preview member's gate environment comes from
    // the connection→capability bridge over the declared test corridor
    // (the REAL environment when connections are ACTIVE with confirmed
    // probe evidence; the honest-empty one otherwise — byte-identical).
    ...createPaymentMissionChannelMembers({
      resolveRuntime: resolvePaymentMissionRuntime,
      now: paymentMissionClock,
      log: seamLog,
      ...(connectionAuthority !== undefined && connectionProbe !== undefined
        ? {
            gateEnvironmentOf: async (input: {
              readonly now: string;
              readonly missionAmount?: { readonly currency: string; readonly minorUnits: string };
            }) => {
              // The statuses + evidence read through the composed planes
              // (fail-closed typed resolvers, never fabricated).
              const [statuses, evidence] = await Promise.all([
                resolveConnectionAuthority().connectionStatuses(),
                resolveProbeEvidenceStore().latestProbeEvidence(),
              ]);
              return createGateEnvironmentFromConnections({
                now: input.now,
                statuses,
                evidence,
                declaredTestCorridor: DECLARED_STRIPE_TEST_CORRIDOR,
                ...(input.missionAmount !== undefined ? { missionAmount: input.missionAmount } : {}),
              });
            },
          }
        : {}),
    }),

    // (P18-A, ADR-0011 D2) The approval members — the SAME resolver
    // and host clock, with the decision origin + principal PINNED at
    // the channel edge and the artifact never on the wire.
    ...createPaymentApprovalChannelMembers({
      resolveRuntime: resolvePaymentMissionRuntime,
      now: paymentMissionClock,
      log: seamLog,
    }),

    // (P19-A, ADR-0012 D1/D2) The dispatch members — the armed-effect
    // READ + the lane-choice ACT over the SAME resolver and host clock:
    // the eligible set recomputes host-side at act time, the artifact /
    // operation / INV-25 mode resolve host-side, and the lane-candidate
    // port fails closed typed when the connections plane is absent.
    ...createPaymentDispatchChannelMembers({
      resolveRuntime: resolvePaymentMissionRuntime,
      now: paymentMissionClock,
      log: seamLog,
      listLaneCandidateRecords,
    }),

    // (P20-A, ADR-0013 D1) The reconciliation members — the pending
    // READ + the evidence-submission ACT over the SAME resolver and
    // host clock (the member-family pattern): the pending set derives
    // and recomputes host-side by the runtime's own unresolved rule,
    // the evidence bounds validate at the edge, and the runtime's
    // reconcile verb stays the ONLY closer of an UNKNOWN.
    ...createPaymentReconciliationChannelMembers({
      resolveRuntime: resolvePaymentMissionRuntime,
      now: paymentMissionClock,
      log: seamLog,
    }),

    // (P21-D reviewer-gate, Gap C) The verification member — the
    // single-act authoritative read-back over the composed lane-aware
    // port (the absent-planes posture above fails closed typed).
    ...paymentVerifyMembers,
  };
  return service;
}
