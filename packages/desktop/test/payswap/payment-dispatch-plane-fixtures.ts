/**
 * PaySwap Desktop (P19-A) — the dispatch-plane battery's shared
 * fixtures, split from ./payment-approval-plane-harness.ts for the
 * ≤400-line file law.
 *
 * - THE CONNECTIONS-PLANE FIXTURE WORLD (the connections-plane
 *   battery's own pattern): the REAL ConnectionSessionAuthority over
 *   an in-memory fs + the reversible-stand-in credential service, so
 *   the lane-candidate records arrive through the REAL registry read
 *   path (connectionStatuses) — never a fabricated lane list.
 * - THE SEEDERS: an ACTIVE SANDBOX connection through the REAL verbs
 *   (seed → seal → CONFIRMED probe — the only honest ACTIVE path); a
 *   PROPOSED connection (the non-ACTIVE ineligible lane); and an
 *   ACTIVE LIVE RECORD written into the durable record file itself
 *   (the REAL verbs can never produce LIVE in this SANDBOX-only
 *   deployment — the LIVE-ineligibility law is exercised over a
 *   hand-built persisted record, clearly labeled).
 * - THE DISPATCH-PLANE SCANNERS: the artifact/lineage deep scan
 *   extended to the armed card, whose LANES lawfully carry the
 *   operator's choice key (connectionRef, ADR-0012 D2) — the scan
 *   forbids the choice key everywhere EXCEPT on a lane entry, and the
 *   lane-shape law (exactly the pinned keys; no credentials, no
 *   handles, no secrets anywhere).
 */

import { expect } from "vitest";

import {
  ConnectionSessionAuthority,
  DurableConnectionCredentialBroker,
} from "../../src/host/payswap/connections/index.js";
import { T0 } from "./payment-approval-plane-harness.js";

/** A fake key (test material ONLY — non-contiguous construction). */
const FAKE_STRIPE_KEY = "rk" + "_test_FAKE51keyDoNotUseP19A";

/** The REAL authority over an in-memory world (deterministic ids + pinned clock). */
export function connectionWorld() {
  const files = new Map<string, string>();
  const fileSystem = {
    readFile: async (path: string) => {
      const data = files.get(path);
      if (data === undefined) throw new Error("ENOENT");
      return data;
    },
    writeFile: async (path: string, data: string) => {
      files.set(path, data);
    },
    mkdir: async () => {},
  };
  // The substrate ICredentialService cipher boundary, modeled with a
  // reversible stand-in (the connections-plane battery's own discipline).
  const cipherBoundary = (value: string, direction: "seal" | "open"): string =>
    direction === "seal"
      ? Buffer.from(value, "utf8").reverse().toString("base64")
      : Buffer.from(value, "base64").reverse().toString("utf8");
  let idSeq = 0;
  const authority = new ConnectionSessionAuthority({
    fileSystem,
    directory: "/mem/connections",
    broker: new DurableConnectionCredentialBroker({
      load: async (key: string) => {
        const raw = files.get(key);
        return raw === undefined ? null : cipherBoundary(raw, "open");
      },
      save: async (key: string, value: string) => {
        files.set(key, cipherBoundary(value, "seal"));
      },
      delete: async (key: string) => {
        files.delete(key);
      },
    }),
    nowIso: () => T0,
    createId: () => `p19a-${(idSeq += 1)}`,
  });
  return { authority, files };
}

/** Seed an ACTIVE SANDBOX connection through the REAL authority verbs (the only ACTIVE path — a CONFIRMED probe outcome). */
export async function seedActiveSandboxConnection(
  authority: ConnectionSessionAuthority,
): Promise<string> {
  const seeded = await authority.seedConnectionSetup({
    providerId: "stripe",
    useCaseRef: "own-store-test-mode",
  });
  if (seeded.kind !== "CREATED") throw new Error("the fixture connection seed did not create");
  await authority.submitStripeRestrictedKey({
    connectionId: seeded.connectionId,
    secretKey: FAKE_STRIPE_KEY,
  });
  const confirmed = await authority.recordVerificationOutcome({
    connectionId: seeded.connectionId,
    outcome: "CONFIRMED",
    evidenceSummary: "acct_FAKEP19A read through the fake test transport (P19-A fixture)",
  });
  if (confirmed.state !== "ACTIVE" || confirmed.executionMode !== "SANDBOX") {
    throw new Error("the fixture connection did not reach ACTIVE SANDBOX");
  }
  return seeded.connectionId;
}

/** Seed a connection that stays PROPOSED (the non-ACTIVE ineligible lane, honestly listed). */
export async function seedProposedConnection(
  authority: ConnectionSessionAuthority,
): Promise<string> {
  // A CONFIGURED form on a provider the other fixtures do not use (the
  // authority's convergence law resumes an existing (provider, form)
  // pair instead of creating) — seeding leaves it PROPOSED: no key
  // sealed, no probe recorded, never ACTIVE.
  const seeded = await authority.seedConnectionSetup({
    providerId: "paystack",
    useCaseRef: "own-store-test-mode",
  });
  if (seeded.kind !== "CREATED") throw new Error("the fixture connection seed did not create");
  return seeded.connectionId;
}

/**
 * Seed an ACTIVE LIVE connection record through the durable record file
 * itself (the registry's own storage — the authority loads it once on
 * first read): the REAL verbs can never produce LIVE (this deployment
 * refuses live keys), so the LIVE-ineligibility law is exercised over a
 * hand-built persisted record on a DIFFERENT provider form than the
 * SANDBOX fixtures (the authority's convergence law would otherwise
 * resume this record instead of creating the SANDBOX one). Must run
 * BEFORE any authority verb.
 */
export function seedLiveActiveConnectionRecord(
  world: ReturnType<typeof connectionWorld>,
): string {
  const connectionId = "conn:p19a-live-fixture";
  world.files.set(
    "/mem/connections/connections.json",
    `${JSON.stringify(
      {
        version: 1,
        records: [
          {
            connectionId,
            providerId: "flutterwave",
            useCaseRef: "own-store-test-mode",
            state: "ACTIVE",
            credentialHandleRef: "broker://fixture/p19a-live",
            executionMode: "LIVE",
            createdAt: T0,
            lastTransitionAt: T0,
            transitions: [
              {
                at: T0,
                from: "PROPOSED",
                to: "ACTIVE",
                cause: "FIXTURE",
                evidence: "a clearly-labeled fixture LIVE record (P19-A) — no real credential exists",
              },
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return connectionId;
}

// ---------------------------------------------------------------------------
// The dispatch-plane scanners (the P18-A deep scan, extended)
// ---------------------------------------------------------------------------

/** True when the object carries the pinned lane key set (a lane entry). */
function isLaneEntry(value: object): boolean {
  const keys = Object.keys(value);
  return (
    keys.includes("connectionRef") && keys.includes("label") && keys.includes("providerId")
  );
}

/**
 * THE DISPATCH-PLANE ARTIFACT / LINEAGE SCANNER: the P18-A law holds
 * VERBATIM (no artifact key/token, no idempotency/command/correlation
 * ids) with ONE lawful exception — a LANE entry may carry the
 * operator's choice key (connectionRef, ADR-0012 D2); everywhere else
 * the choice key is forbidden lineage (the outcome never echoes it).
 */
export function assertNoArtifactOrLineageExceptLaneChoice(
  dto: unknown,
  ...forbiddenLiterals: string[]
): void {
  const strings: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      strings.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value !== null && typeof value === "object") {
      const isLane = isLaneEntry(value);
      for (const [key, child] of Object.entries(value)) {
        expect(key).not.toMatch(/artifact/i);
        if (!isLane) {
          expect(["idempotencyKey", "commandId", "correlationId", "connectionRef"]).not.toContain(key);
        }
        visit(child);
      }
    }
  };
  visit(dto);
  for (const text of strings) {
    expect(text).not.toMatch(/pmt-auth-\d+/); // authorization artifact ids
    expect(text).not.toMatch(/^pmt-cmd:/); // command ids
    expect(text).not.toMatch(/^pmt-corr:/); // correlation ids
    for (const literal of forbiddenLiterals) {
      expect(text).not.toContain(literal);
    }
  }
}

/**
 * THE LANE-SHAPE LAW: every key on every lane is one of the pinned
 * four, and NO credentials, credential handles or secrets appear
 * anywhere in the serialized lanes (the INV-19 discipline — the
 * registry's handle refs never cross).
 */
export function assertLaneShapesClean(lanes: readonly unknown[]): void {
  for (const lane of lanes) {
    if (lane === null || typeof lane !== "object") continue;
    for (const key of Object.keys(lane)) {
      expect(["connectionRef", "label", "providerId", "ineligible"]).toContain(key);
    }
  }
  const serialized = JSON.stringify(lanes);
  expect(serialized).not.toMatch(/credential/i);
  expect(serialized).not.toMatch(/handle/i);
  expect(serialized).not.toMatch(/secret/i);
  expect(serialized).not.toMatch(/apiKey/i);
}
