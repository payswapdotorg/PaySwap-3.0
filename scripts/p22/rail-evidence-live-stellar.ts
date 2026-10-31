/**
 * P22-D RAIL-EVIDENCE LIVE-STELLAR TIER HARNESS (ADR-0016 D12 — the
 * closure policy's NAMED GATE, operator-gated; the scripts/p21/
 * rail-evidence-real-flow-e2e.ts precedent applied to the onchain rail).
 *
 * Runs the LIVE STELLAR TESTNET READ tier of the corridor's rail FOR
 * REAL, through the REAL P22-H machinery end-to-end:
 *
 *   the connection-ACTIVATION members (seed with the testnet keypair
 *   use case → connectionSubmitStellarSecretKey: the ONE material-
 *   carrying path, sealed immediately → connectionRunStellarAccountRead-
 *   Probe: the REAL host-side account-read probe INSIDE the credential
 *   seal over the REAL HTTPS transport at horizon-testnet.stellar.org →
 *   the outcome recorded through the authority's own recorder → ACTIVE
 *   on probe-CONFIRMED alone) → the onchain chain derivation (the REAL
 *   four-layer law over the REAL statuses + evidence: the definition,
 *   the implementation, the instance, the observation — the capability
 *   model's closed vocabularies).
 *
 * Honest notes (recorded verbatim in the receipt — the truth rules):
 * - THE READ TIER ONLY: this harness proves the rail's REAL observation
 *   (the account read over the public testnet Horizon). NO dispatch,
 *   NO contract deployment and NO transfer is executed or claimed — the
 *   corridor's live execution legs stay the STANDING OPERATOR ACTION
 *   (they additionally depend on a funded testnet wallet; the closure
 *   policy's carry-forward, never a silent pass).
 * - SANDBOX-scoped by construction: the stellar:testnet plane only; a
 *   pubnet-shaped target is never offered (INV-25 — the pubnet plane is
 *   not registered in this deployment).
 * - The six-fact separation (the P22-D reclassification): a CONFIRMED
 *   account read proves READ access on the sealed keypair's public
 *   account — the observed-health fact. It never proves the corridor's
 *   GHS collection leg executable, never proves an entitlement, and
 *   never proves an authorization.
 *
 * Credential law (the p21a precedent): the keypair comes ONLY from
 * STELLAR_TESTNET_PUBLIC_KEY + STELLAR_TESTNET_SECRET_KEY (the station
 * secret store); it never enters model context, never echoes, never
 * lands in any receipt (machine-scanned — the script REFUSES to emit on
 * a leak).
 *
 * Exit codes: 0 = every executed gate held; 1 = a failure; 2 = no
 * credentials at all (the honest pre-gate state — nothing is simulated).
 *
 * Usage:
 *   . /home/z/my-project/secrets/payment-providers.env && \
 *     pnpm exec tsx scripts/p22/rail-evidence-live-stellar.ts
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createNodeConnectionSessionAuthority } from "../../packages/desktop/src/host/payswap/connections/node-composition.js";
import { openProbeEvidenceStore } from "../../packages/desktop/src/host/payswap/connections/probe-evidence.js";
import { createPaySwapDesktopService } from "../../packages/desktop/src/host/payswap/shell/service.js";
import { onchainsFromPlanes } from "../../packages/desktop/src/host/payswap/connections/onchain-chain-derivation.js";
import { PINNED_STELLAR_CHAIN_KEY } from "../../packages/desktop/src/host/payswap/connections/onchain-rail-pins.js";
import { createAesGcmCredentialService, REAL_FETCH } from "../p21/rail-evidence-lib.js";

interface Gate {
  readonly held: boolean;
  readonly detail: string;
}

async function main(): Promise<number> {
  const publicKey = process.env.STELLAR_TESTNET_PUBLIC_KEY?.trim() || undefined;
  const secretKey = process.env.STELLAR_TESTNET_SECRET_KEY?.trim() || undefined;
  if (publicKey === undefined || secretKey === undefined) {
    console.error(
      "[p22d-live-stellar] STELLAR_TESTNET_PUBLIC_KEY + STELLAR_TESTNET_SECRET_KEY not provided — the live Stellar testnet tier stays operator-gated (the closure policy's NAMED GATE). Nothing is simulated.",
    );
    return 2;
  }
  const ranAt = new Date().toISOString();
  const gates: Record<string, Gate> = {};

  const workspaceDir = await mkdtemp(join(tmpdir(), "payswap-p22d-live-stellar-"));
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
    const service = await createPaySwapDesktopService(
      { scope: { kind: "local" }, log: () => {} },
      {
        connectionAuthority: authority,
        connectionProbe: {
          evidenceStore,
          fetchImpl: (url: string, init: RequestInit) => REAL_FETCH(url, init),
          nowMs: () => Date.now(),
        },
      },
    );

    // ---- seed + seal (the ONE material-carrying path, through the channel member) ----
    const seeded = await service.connectionSeedSetup({
      providerId: "stellar:testnet",
      useCaseRef: "testnet-keypair-wallet",
    });
    const seededOk = seeded.kind === "CREATED" || seeded.kind === "RESUMED";
    gates.seed = {
      held: seededOk,
      detail: `${seeded.kind}${seeded.kind === "CREATED" || seeded.kind === "RESUMED" ? ` (${seeded.connectionId})` : ""}`,
    };
    if (!seededOk || seeded.kind !== "CREATED") {
      throw new Error(`the stellar seed did not CREATE a connection (${seeded.kind})`);
    }
    const sealed = await service.connectionSubmitStellarSecretKey({
      connectionId: seeded.connectionId,
      publicKey,
      secretKey,
    });
    gates.seal = {
      held: sealed.sealedSecretCount === 2 && sealed.nextState === "KEY_SEALED",
      detail: `sealed=${String(sealed.sealedSecretCount)} nextState=${sealed.nextState}`,
    };

    // ---- THE LIVE ACCOUNT READ (the REAL probe over the REAL Horizon) ----
    const probe = await service.connectionRunStellarAccountReadProbe();
    const confirmed = probe.results.every((row) => row.outcome === "CONFIRMED");
    gates.liveRead = {
      held: confirmed && probe.probedOperation === "stellar.account.read",
      detail: confirmed
        ? `CONFIRMED over ${probe.providerRef} (${probe.results.map((row) => row.providerReferences.join("/")).join("; ")})`
        : `outcomes ${probe.results.map((row) => row.outcome).join(", ")}`,
    };

    // ---- the status law: ACTIVE on probe-CONFIRMED alone ----
    const statuses = await authority.connectionStatuses();
    const stellarStatus = statuses.find((row) => row.providerId === "stellar:testnet");
    gates.status = {
      held: stellarStatus?.state === "ACTIVE",
      detail: `state=${stellarStatus?.state ?? "absent"}`,
    };

    // ---- the evidence law: the structured, secret-free record ----
    const evidence = await evidenceStore.latestProbeEvidence();
    const stellarEvidence = evidence.find((row) => row.providerId === "stellar:testnet");
    gates.evidence = {
      held:
        stellarEvidence !== undefined &&
        stellarEvidence.outcome === "CONFIRMED" &&
        stellarEvidence.evidenceTier === "PROVIDER_OBSERVATION" &&
        stellarEvidence.executionMode === "SANDBOX",
      detail:
        stellarEvidence === undefined
          ? "no stellar evidence record"
          : `outcome=${stellarEvidence.outcome} tier=${stellarEvidence.evidenceTier} mode=${stellarEvidence.executionMode} positions=${JSON.stringify(stellarEvidence.assetPositions ?? null)}`,
    };

    // ---- THE ONCHAIN CHAIN DERIVATION (the four-layer law over the REAL evidence) ----
    const chains = onchainsFromPlanes({ statuses, evidence });
    const chain = chains[0];
    gates.chain = {
      held:
        chain !== undefined &&
        chain.definition.id === `capability:onchain-rail:${PINNED_STELLAR_CHAIN_KEY}` &&
        chain.instance.connectionRef === stellarStatus?.connectionId &&
        chain.observation.availability === "AVAILABLE",
      detail:
        chain === undefined
          ? "no onchain chain derived from the live evidence"
          : `definition=${chain.definition.id} instance=${chain.instance.connectionRef} availability=${chain.observation.availability}`,
    };

    // ---- the receipt (secret-free, machine-scanned — REFUSES to emit on a leak) ----
    const receipt = {
      harness:
        "scripts/p22/rail-evidence-live-stellar.ts (the P22-D live Stellar testnet READ tier — ADR-0016 D12's named gate, operator-gated; the p21a rail-evidence precedent)",
      ranAt,
      gates,
      probe: {
        providerRef: probe.providerRef,
        probedOperation: probe.probedOperation,
        evidenceTier: probe.evidenceTier,
        results: probe.results.map((row) => ({
          outcome: row.outcome,
          state: row.state,
          summary: row.summary,
        })),
      },
      honestNotes: [
        "THE READ TIER ONLY: the live account read over the public testnet Horizon; NO dispatch, NO contract deployment and NO transfer is executed or claimed — the corridor's live execution legs stay the standing operator action (a funded testnet wallet dependency; the closure policy's carry-forward, never a silent pass).",
        "SANDBOX-scoped by construction: the stellar:testnet plane only; a pubnet-shaped target is never offered (INV-25).",
        "THE SIX-FACT SEPARATION: a CONFIRMED account read proves READ access on the sealed keypair's public account (the observed-health fact) — never the GHS collection leg's executability, never an entitlement, never an authorization.",
      ],
      secretScan: { patterns: ["Stellar S… StrKey (56-char base32)"], findings: [] as string[], result: "" },
    };
    const secretShapes = [/\bS[A-Z2-7]{55}\b/, /FLWSECK(_TEST)?-[A-Za-z0-9]{10,}/, /sk_(live|test)_[A-Za-z0-9]{10,}/];
    const receiptText = JSON.stringify(receipt, null, 2);
    for (const pattern of secretShapes) {
      const match = pattern.exec(receiptText);
      if (match !== null) {
        receipt.secretScan.findings.push(match[0].slice(0, 8) + "…");
      }
    }
    if (receipt.secretScan.findings.length > 0) {
      console.error(
        "[p22d-live-stellar] SECRET LEAK in the receipt — refusing to emit. Findings: " +
          receipt.secretScan.findings.join(", "),
      );
      return 1;
    }
    receipt.secretScan.result = "CLEAN (no secret-shaped material in this receipt)";
    const receiptPath = join(
      process.cwd(),
      "docs/productization-evidence",
      `p22d-live-stellar-RECEIPT-${ranAt.slice(0, 10)}.json`,
    );
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    console.log(`[p22d-live-stellar] receipt: ${receiptPath}`);
    for (const [id, gate] of Object.entries(gates)) {
      console.log(`[${gate.held ? "PASS" : "FAIL"}] ${id}: ${gate.detail}`);
    }
    const failed = Object.values(gates).filter((gate) => !gate.held);
    console.log(`[p22d-live-stellar] gates: ${Object.keys(gates).length - failed.length}/${Object.keys(gates).length} held`);
    return failed.length === 0 ? 0 : 1;
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
}

process.exitCode = await main();
