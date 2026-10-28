/**
 * PaySwap Desktop (P13-B) — the node composition edge for the provider
 * connection plane.
 *
 * Binds the ConnectionSessionAuthority to the REAL node:fs (the
 * connections.json record store) and the substrate ICredentialService
 * (the AES-256-GCM credential store). The host bootstrap calls this
 * ONCE and passes the result as `connectionAuthority` on the service
 * options; tests never touch this module (they inject fakes through
 * the authority's own options).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ICredentialService } from "@zcode/services";
import {
  ConnectionSessionAuthority,
  type ConnectionSessionAuthorityOptions,
} from "./session-authority.js";
import { DurableConnectionCredentialBroker } from "./credential-broker.js";
import { openProbeEvidenceStore, type ProbeEvidenceStore } from "./probe-evidence.js";
import type { HostFetch } from "./host-https-transports.js";

/** The node:fs binding for the connections record store. */
export const CONNECTIONS_NODE_FILE_SYSTEM = {
  readFile: (path: string) => readFile(path, "utf8"),
  writeFile: (path: string, data: string) => writeFile(path, data, "utf8"),
  mkdir: async (path: string) => {
    await mkdir(path, { recursive: true });
  },
} as const;

/**
 * Compose the connection session authority over the node bindings.
 * `userDataDirectory` is the PaySwap user-data root (the same root the
 * workspace store lives under); the records live in `connections/`.
 */
export function createNodeConnectionSessionAuthority(input: {
  readonly userDataDirectory: string;
  readonly credentialService: Pick<ICredentialService, "load" | "save" | "delete">;
  readonly options?: Omit<ConnectionSessionAuthorityOptions, "fileSystem" | "directory" | "broker">;
}): ConnectionSessionAuthority {
  return new ConnectionSessionAuthority({
    fileSystem: CONNECTIONS_NODE_FILE_SYSTEM,
    directory: join(input.userDataDirectory, "connections"),
    broker: new DurableConnectionCredentialBroker(input.credentialService),
    ...input.options,
  });
}

/**
 * The composed product connection plane (P21-D lane 151-a — the
 * reviewer's composition-root ask): the EXACT options fragment the
 * host registration root forwards to registerPaySwapDesktopService.
 *
 * Composes, over the REAL node bindings under
 * `<userDataDirectory>/connections`:
 * - the ConnectionSessionAuthority (the records + the sealed
 *   credentials through the substrate ICredentialService — the D4
 *   durable broker law);
 * - the probe-evidence ledger (probe-evidence.json BESIDE
 *   connections.json — the placement law) opened over the same
 *   directory;
 * - and binds the REAL fetch the verification probes AND the
 *   lane-aware Stripe execution kernel ride (the composition edge
 *   binds globalThis.fetch; tests inject deterministic fakes).
 *
 * With this fragment on the service options, the shipped app's
 * connection channel members answer over the REAL plane (key entry,
 * probes, the bridge derivation, the corridor capability chains) and
 * the payment-mission runtime composes the LANE-AWARE authority
 * (ACTIVE SANDBOX Stripe lanes only — the grant law stays inside the
 * credential seal). WITHOUT it, every one of those members keeps the
 * honest fail-closed typed error (the workspace-store posture — the
 * preserved default, asserted by the composition battery).
 */
export async function composeNodeConnectionPlane(input: {
  readonly userDataDirectory: string;
  readonly credentialService: Pick<ICredentialService, "load" | "save" | "delete">;
  /** The REAL fetch binding (the product binds globalThis.fetch at the registration root). */
  readonly fetchImpl: HostFetch;
  readonly log?: (level: "info" | "warn" | "error", message: string) => void;
}): Promise<{
  readonly connectionAuthority: ConnectionSessionAuthority;
  readonly connectionProbe: {
    readonly evidenceStore: ProbeEvidenceStore;
    readonly fetchImpl: HostFetch;
  };
}> {
  const directory = join(input.userDataDirectory, "connections");
  const evidenceStore = await openProbeEvidenceStore({
    fileSystem: CONNECTIONS_NODE_FILE_SYSTEM,
    directory,
  });
  const connectionAuthority = createNodeConnectionSessionAuthority({
    userDataDirectory: input.userDataDirectory,
    credentialService: input.credentialService,
  });
  input.log?.(
    "info",
    `payswap-desktop: product connection plane composed (${directory} — records + probe evidence + the sealed credential store; the lane-aware kernel path is live)`,
  );
  return {
    connectionAuthority,
    connectionProbe: { evidenceStore, fetchImpl: input.fetchImpl },
  };
}
