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
