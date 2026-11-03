/**
 * PaySwap Desktop (P24-D, ADR-0017 D1/D10) — the STRIPE PLANE
 * COMPOSITION: the production composition of Worker 1's REAL
 * catalogue/validator/transport (./stripe-plane-adapters.ts — the
 * lifted P24-2 recipe) with Worker 2's REAL host planes (the
 * prepared-action executor over the frozen contracts, the RAK
 * operation-level permission binding, the per-connection API-version
 * state, the verified-evidence account context, the seal) over the
 * PRODUCT CONNECTION PLANE (the ConnectionSessionAuthority + the probe
 * evidence ledger + the REAL fetch).
 *
 * THE SEAM LAWS honored verbatim:
 * - THE SEAL (ADR-0008): credential material exists ONLY inside
 *   authority.withSealedCredential consumers; nothing in this
 *   composition captures, logs or returns it.
 * - THE ACCOUNT CONTEXT: verified probe evidence ONLY (never
 *   model/user text); U2/U3 stay UNCONFIGURED-refused; INV-25
 *   SANDBOX-only holds.
 * - DURABILITY: the RAK scope declarations, the per-connection
 *   API-version state and the prepared-action store persist under the
 *   payswap workspace directory (the same root as the connection
 *   records); the store's secret-shape scan gates every write.
 * - The census/validator/transport are the REAL provider-runtime
 *   source objects (never by-value copies — the layer-law disclosure
 *   in ./stripe-plane-adapters.ts).
 */

import { createStripeAccountContextResolver } from "../connections/stripe-account-context.js";
import { StripeRakPermissionBinding } from "../connections/stripe-rak-permissions.js";
import { StripeApiVersionStateStore } from "../connections/stripe-api-version-state.js";
import type { ConnectionSessionAuthority } from "../connections/session-authority.js";
import type { ProbeEvidenceStore } from "../connections/probe-evidence.js";
import { createStripePreparedActionExecutor } from "./prepared-action-executor.js";
import { openStripePreparedActionStore } from "./prepared-action-store.js";
import {
  createStripeReauthenticationService,
  reauthenticationPortOf,
  StripeReauthenticationStore,
} from "./reauthentication.js";
import type { StripePreparedActionExecutor } from "./prepared-action-contracts.js";
import type {
  StripeActionAccountContextResolver,
  StripeActionPermissionPort,
  StripeActionApiVersionPort,
  StripeActionSeal,
  StripeOperationCensusPort,
  StripeOperationSchemaValidator,
  StripeDispatchTransport,
  StripeReauthenticationPort,
} from "./action-seams.js";
import {
  realCensusPort,
  realDispatchTransport,
  realSchemaValidator,
  nodeFetchForStripePlane,
} from "./stripe-plane-adapters.js";

/** The node fs seam the state stores ride (the CONNECTIONS_NODE_FILE_SYSTEM shape). */
export interface StripePlaneFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

/** What the stripe plane composes over (injected at the host edge). */
export interface StripePlaneCompositionInput {
  /** The product connection plane's authority (records + the seal). */
  readonly authority: ConnectionSessionAuthority;
  /** The probe-evidence ledger (the account-context evidence read). */
  readonly evidenceStore: ProbeEvidenceStore;
  /** The REAL fetch binding (the transports ride it). */
  readonly fetchImpl: typeof globalThis.fetch;
  /** The payswap workspace store directory (state files land under it). */
  readonly storeDirectory: string;
  /** The node fs seam (the composition edge binds node:fs/promises). */
  readonly fileSystem: StripePlaneFileSystem;
  /** The host clock (ISO) — instants are stamped at the composition, never caller-supplied. */
  readonly nowIso?: () => string;
  /** Id factory for the executor's minted artifacts; defaults to crypto.randomUUID. */
  readonly createId?: () => string;
  /** The host log (never console; no secret material is ever logged). */
  readonly log?: (level: "info" | "warn" | "error", message: string) => void;
}

/** The composed stripe action plane (what the channel members ride). */
export interface StripeActionPlane {
  readonly census: StripeOperationCensusPort;
  readonly schemaValidator: StripeOperationSchemaValidator;
  readonly transport: StripeDispatchTransport;
  readonly seal: StripeActionSeal;
  readonly accountContext: StripeActionAccountContextResolver;
  readonly permissions: StripeActionPermissionPort & {
    declaredScopesOf(connectionId: string): readonly string[];
  };
  readonly apiVersion: StripeActionApiVersionPort;
  readonly executor: StripePreparedActionExecutor;
  /** (P26-A, ADR-0018) The re-authentication plane — the REAUTH tier's proof machinery. */
  readonly reauthentication: StripeReauthenticationPort;
}

/** Compose the REAL stripe action plane over the connection plane. */
export async function composeStripeActionPlane(
  input: StripePlaneCompositionInput,
): Promise<StripeActionPlane> {
  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const createId = input.createId ?? (() => globalThis.crypto.randomUUID());
  const directory = input.storeDirectory.replace(/\/+$/, "");

  const census = realCensusPort();

  // The account-context resolver over the authority's durable reads +
  // the probe-evidence ledger (verified evidence ONLY).
  const accountContext = createStripeAccountContextResolver({
    getConnection: (connectionId) => input.authority.connectionRecordOf(connectionId),
    getLatestProbeEvidence: async (connectionId) => {
      const all = await input.evidenceStore.latestProbeEvidence();
      return all.find((record) => record.connectionId === connectionId) ?? null;
    },
    getCredentialSealedAt: (connectionId) => input.authority.credentialSealedAtOf(connectionId),
  });

  // The RAK operation-level permission binding over the REAL census
  // (scope declarations persist under the workspace directory).
  const permissions = new StripeRakPermissionBinding({
    census,
    fileSystem: input.fileSystem,
    directory: `${directory}/stripe-rak`,
    nowIso,
  });
  await permissions.load();

  // The per-connection API-version state (the ADR-0017 D2 migration law).
  const apiVersion = new StripeApiVersionStateStore({
    fileSystem: input.fileSystem,
    directory: `${directory}/stripe-versions`,
    nowIso,
  });
  await apiVersion.load();

  // The durable prepared-action store (the snapshot + the append-only
  // audit; the secret-shape scan gates every write).
  const store = await openStripePreparedActionStore({
    fileSystem: input.fileSystem,
    directory: `${directory}/stripe-actions`,
  });

  // THE P26-A RE-AUTHENTICATION PLANE (ADR-0018): the proof store under the
  // same workspace root; the service probes with the FRESH credential over
  // the REAL transport (the material never persists — the store's
  // secret-shape scan gates every write).
  const reauthenticationStore = new StripeReauthenticationStore(
    input.fileSystem,
    `${directory}/stripe-reauth/proofs.json`,
  );

  // The REAL transport over the REAL fetch.
  const transport = realDispatchTransport(nodeFetchForStripePlane(input.fetchImpl));

  const reauthenticationService = createStripeReauthenticationService({
    census,
    transport,
    accountContext,
    store: reauthenticationStore,
    nowMs: () => Date.parse(nowIso()),
    createId,
  });
  const reauthentication = reauthenticationPortOf(reauthenticationService);

  // The seal over the connection authority (ADR-0008 — material never escapes).
  const seal: StripeActionSeal = {
    withSealedCredential: (connectionId, consumer, context) =>
      input.authority.withSealedCredential(connectionId, consumer, context),
  };

  const schemaValidator = realSchemaValidator();

  // The executor over everything (the frozen contracts made real).
  const executor = createStripePreparedActionExecutor({
    census,
    schemaValidator,
    transport,
    seal,
    accountContext,
    permissions,
    apiVersion,
    nowMs: () => Date.parse(nowIso()),
    nowIso,
    createId,
    store,
    reauthentication,
  });

  input.log?.(
    "info",
    "payswap-desktop: stripe action plane composed (real census/validator/transport + executor over the connection plane + the re-authentication plane)",
  );

  return {
    census,
    schemaValidator,
    transport,
    seal,
    accountContext,
    permissions,
    apiVersion,
    executor,
    reauthentication,
  };
}
