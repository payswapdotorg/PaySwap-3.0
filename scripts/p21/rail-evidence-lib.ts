/**
 * P21-A RAIL-EVIDENCE HARNESS LIB (ADR-0014 D5/D6/D8/D9/D11) — the
 * shared machinery of scripts/p21/rail-evidence-real-flow-e2e.ts,
 * split for the file-size law (the entry stays under the lint cap).
 *
 * Contents: the harness-local AES-256-GCM credential service (the
 * U1-harness boundary — the substrate safeStorage stand-in), the
 * secret-free subtest record shapes, the REAL fetch binding, the probe
 * service composition over the channel members, the per-provider
 * connection-ACTIVATION subtest, and the nine revise-path intake
 * values (the declared test corridor's facts). The truth laws live in
 * the entry's header and the receipt's honest notes.
 */

import { mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { createNodeConnectionSessionAuthority } from "../../packages/desktop/src/host/payswap/connections/node-composition.js";
import { openProbeEvidenceStore } from "../../packages/desktop/src/host/payswap/connections/probe-evidence.js";
import { DECLARED_STRIPE_TEST_CORRIDOR } from "../../packages/desktop/src/host/payswap/connections/gate-environment.js";
import { createPaySwapDesktopService } from "../../packages/desktop/src/host/payswap/shell/service.js";
import type { ConnectionSessionAuthority } from "../../packages/desktop/src/host/payswap/connections/index.js";
import type { ProbeEvidenceStore } from "../../packages/desktop/src/host/payswap/connections/probe-evidence.js";
import type { IPaySwapDesktopService } from "../../packages/desktop/src/host/payswap/shell/contracts.js";

/** A REAL AES-256-GCM credential service (the substrate contract stand-in — the U1-harness boundary). */
export function createAesGcmCredentialService() {
  const master = randomBytes(32);
  const store = new Map<string, string>();
  const seal = (plaintext: string): string => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", master, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
  };
  const open = (sealed: string): string => {
    const [ivB64, tagB64, dataB64] = sealed.split(".");
    const decipher = createDecipheriv("aes-256-gcm", master, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  };
  return {
    load: async (key: string): Promise<string | null> => {
      const sealed = store.get(key);
      return sealed === undefined ? null : open(sealed);
    },
    save: async (key: string, value: string): Promise<void> => {
      store.set(key, seal(value));
    },
    delete: async (key: string): Promise<void> => {
      store.delete(key);
    },
  };
}

export interface Gate {
  readonly held: boolean;
  readonly detail: string;
}

/** One provider's rail-evidence subtest record (secret-free). */
export interface ProbeSubtest {
  readonly providerId: string;
  readonly ran: boolean;
  readonly skippedNote?: string;
  readonly gates: Record<string, Gate>;
  readonly probe: Record<string, unknown> | null;
  readonly connection: Record<string, unknown> | null;
}

export const REAL_FETCH = globalThis.fetch;

/** The REAL service over the REAL network (the probe members ride globalThis.fetch). */
export async function composeProbeService(
  authority: ConnectionSessionAuthority,
  evidenceStore: ProbeEvidenceStore,
): Promise<IPaySwapDesktopService> {
  return createPaySwapDesktopService(
    { scope: { kind: "local" }, log: () => {} },
    {
      createSessionId: () => `session-p21a-rail-${randomBytes(6).toString("hex")}`,
      connectionAuthority: authority,
      connectionProbe: {
        evidenceStore,
        fetchImpl: (url, init) => REAL_FETCH(url, init),
        nowMs: () => Date.now(),
      },
    },
  );
}

/** Run one provider's connection-ACTIVATION rail through the REAL channel members. */
export async function runProbeSubtest(input: {
  readonly providerId: "stripe" | "flutterwave" | "paystack";
  readonly secretKey: string | undefined;
  readonly sealMember: "connectionSubmitStripeRestrictedKey" | "connectionSubmitFlutterwaveSecretKey" | "connectionSubmitPaystackSecretKey";
  readonly fakeLiveKey: string;
}): Promise<ProbeSubtest> {
  const gates: Record<string, Gate> = {};
  if (input.secretKey === undefined) {
    return {
      providerId: input.providerId,
      ran: false,
      skippedNote: `${input.providerId.toUpperCase()}_SECRET_KEY not provided — this subtest stays operator-gated; nothing is simulated`,
      gates,
      probe: null,
      connection: null,
    };
  }
  const workspaceDir = await mkdtemp(join(tmpdir(), `payswap-p21a-${input.providerId}-`));
  try {
    const authority = createNodeConnectionSessionAuthority({
      userDataDirectory: workspaceDir,
      credentialService: createAesGcmCredentialService(),
    });
    const evidenceStore = await openProbeEvidenceStore({
      fileSystem: {
        readFile: (path: string) => readFile(path, "utf8"),
        writeFile: (path: string, data: string) => writeFile(path, data, "utf8"),
        mkdir: async (path: string) => {
          await mkdir(path, { recursive: true });
        },
      },
      directory: join(workspaceDir, "connections"),
    });
    const service = await composeProbeService(authority, evidenceStore);

    // ---- seed + seal (the ONE material-carrying path, through the channel member) ----
    const seeded = await service.connectionSeedSetup({
      providerId: input.providerId,
      useCaseRef: "own-store-test-mode",
    });
    if (seeded.kind !== "CREATED" && seeded.kind !== "RESUMED") {
      throw new Error(`connection seed refused: ${JSON.stringify(seeded)}`);
    }
    const connectionId = seeded.connectionId;
    const seal = (await (service as unknown as Record<string, (i: unknown) => Promise<unknown>>)[
      input.sealMember
    ]({ connectionId, secretKey: input.secretKey })) as { nextState: string; sealedSecretCount: number };
    gates["seal-pending-verification"] = {
      held: seal.nextState === "PENDING_VERIFICATION" && seal.sealedSecretCount === 1,
      detail: `sealed ${String(seal.sealedSecretCount)} secret(s); state ${seal.nextState} (verification still required)`,
    };

    // ---- the INV-25 live-key refusal (a fake live key, non-contiguous construction) ----
    try {
      await (service as unknown as Record<string, (i: unknown) => Promise<unknown>>)[input.sealMember]({
        connectionId,
        secretKey: input.fakeLiveKey,
      });
      gates["inv25-live-key-refused"] = {
        held: false,
        detail: "the fake LIVE key was NOT refused — INV-25 violation",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      gates["inv25-live-key-refused"] = {
        held: /INV-25|SANDBOX-only|test-mode/i.test(message),
        detail: `refused: ${message.slice(0, 140)}`,
      };
    }

    // ---- THE REAL PROBE — host-side, inside the seal, over the REAL network ----
    const probeStartedAt = Date.now();
    const outcome = await service.connectionRunVerificationProbe(input.providerId);
    const latencyMs = Date.now() - probeStartedAt;
    const result = outcome.results.find((row) => row.connectionId === connectionId) ?? outcome.results[0]!;
    gates["probe-outcome-recorded-through-authority"] = {
      held: result.outcome === "CONFIRMED" && result.state === "ACTIVE",
      detail: `probe ${result.outcome}; connection ${result.state} (the ONLY ACTIVE path is probe-CONFIRMED recorded through the authority's own recorder)`,
    };
    gates["evidence-tier-labeled"] = {
      held: outcome.evidenceTier === "PROVIDER_OBSERVATION",
      detail: `evidence tier ${outcome.evidenceTier}; probed operation ${outcome.probedOperation}`,
    };
    const statuses = await service.connectionStatuses();
    const current = statuses.find((status) => status.connectionId === connectionId);
    gates["active-on-probe-alone"] = {
      held: current?.state === "ACTIVE" && current.transitionHistory.at(-1)?.cause === "PROBE_CONFIRMED",
      detail: `final state ${current?.state ?? "UNKNOWN"} via ${current?.transitionHistory.at(-1)?.cause ?? "UNKNOWN"}`,
    };
    const evidence = await evidenceStore.latestProbeEvidence();
    const record = evidence.find((row) => row.connectionId === connectionId);
    gates["structured-evidence-landed"] = {
      held:
        record !== undefined &&
        record.outcome === "CONFIRMED" &&
        record.evidenceTier === "PROVIDER_OBSERVATION" &&
        record.observationVersion === 1 &&
        typeof record.observedAt === "string",
      detail:
        record === undefined
          ? "no structured evidence record landed"
          : `observationVersion ${String(record.observationVersion)}; observedAt ${record.observedAt}; keyClass ${record.keyClass}`,
    };
    return {
      providerId: input.providerId,
      ran: true,
      gates,
      probe: {
        probedOperation: outcome.probedOperation,
        outcome: result.outcome,
        providerReferences: result.providerReferences,
        transport: "REAL HTTPS (the host transport over globalThis.fetch)",
        latencyMs,
        note: outcome.note,
      },
      connection: {
        connectionId,
        state: current?.state ?? "UNKNOWN",
        executionMode: current?.executionMode ?? "UNKNOWN",
      },
    };
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
}

/** The nine revise-path intake values (the declared test corridor's facts). */
export function reviseIntakeValueFor(fieldId: string): unknown {
  switch (fieldId) {
    case "amountAndCurrency":
      return { minorUnits: "1500", currency: "USD" };
    case "fundingSource":
      return DECLARED_STRIPE_TEST_CORRIDOR.fundingInstrument.displayName;
    case "recipient":
      return "Merchant X (Stripe-only test)";
    case "countryCorridor":
      return {
        sourceCountry: DECLARED_STRIPE_TEST_CORRIDOR.sourceCountry,
        destinationCountry: DECLARED_STRIPE_TEST_CORRIDOR.destinationCountry,
        destinationCurrency: DECLARED_STRIPE_TEST_CORRIDOR.currency,
      };
    case "speedDeadline":
      return { deadlineAt: new Date(Date.now() + 86_400_000).toISOString() };
    case "feeCap":
      return { kind: "CAPPED", amount: { minorUnits: "100", currency: "USD" } };
    case "purpose":
      return "P21-A rail-evidence real-flow verification (the revise path)";
    case "privacyCompliance":
      return { kind: "CONSTRAINED", notes: "no special constraints" };
    case "partialPaymentPreference":
      return { kind: "REQUIRE_FULL" };
    default:
      throw new Error(`unexpected field ${fieldId}`);
  }
}

