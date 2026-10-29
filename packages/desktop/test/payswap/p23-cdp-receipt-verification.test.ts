/**
 * PaySwap Desktop (P23-D, ADR-0015 D10 — the E2E law's machine-checked
 * receipt tier) — THE CDP EMERGENCE-JOURNEY RECEIPT VERIFICATION: the
 * receipt JSON re-checked by the battery (the merge-fidelity precedent —
 * the durable evidence is machine-verified, never a narrative-only
 * claim). Every assertion is over the RECEIPT's own recorded facts:
 *
 * - the TWELVE known steps, each PASS (the seed, the launch-1 journey
 *   with the CARDS, the wait + the honest consent-gated refusal, the
 *   persisted records, the relaunch persistence, the re-derived cards,
 *   the EQUAL view digests, the recomputed refusal);
 * - the card-CONTENT evidence in the step details (2 party changes + 4
 *   platform work items + 2 hypotheses — ≥3 meaningfully different kinds;
 *   the fnv1a64 view digests on both launches);
 * - THE PERSISTENCE PROOF: launch 1's digest EQUALS launch 2's (the
 *   byte-identical deterministic re-derivation over the persisted
 *   mission + connections — the conditionals survive relaunch);
 * - the secret scan CLEAN (the receipt is secret-free);
 * - the honest-scope disclosure present (the scripted-test-world tier —
 *   the connection state seeded through the REAL member path over the
 *   scripted transport; no live probe claimed);
 * - the screenshots exist on disk (the visual evidence chain).
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { join } from "node:path";

const RECEIPT_PATH = join(import.meta.dirname, "../../../../docs/productization-evidence/p23-d-cdp-emergence-journey-RECEIPT-2026-10-29.json");
const ASSETS_DIR = join(import.meta.dirname, "../../../../docs/productization-evidence/assets");

const RECEIPT_STEP_IDS = [
  "seed-1",
  "run1-1",
  "run1-2",
  "run1-3",
  "run1-4",
  "run1-5",
  "run1-6",
  "run1-7",
  "run2-1",
  "run2-4",
  "run2-3",
  "run2-5",
] as const;

describe("the P23-D CDP emergence-journey receipt (ADR-0015 D10 — the machine-checked evidence tier)", () => {
  const receipt = JSON.parse(readFileSync(RECEIPT_PATH, "utf8")) as {
    readonly harness: string;
    readonly honestScope: string;
    readonly steps: readonly { readonly id: string; readonly name: string; readonly status: string; readonly detail: string }[];
    readonly screenshots: readonly string[];
    readonly journeySummary: { readonly persistence: string };
    readonly secretScan: { readonly result: string; readonly findings: readonly string[] };
  };

  it("every known step PASSes (the twelve-step journey — the seed, the cards, the wait, the refusal, the persistence, the re-derivation)", () => {
    expect(receipt.steps.map((step) => step.id)).toEqual([...RECEIPT_STEP_IDS]);
    for (const step of receipt.steps) {
      expect(step.status, `${step.id}: ${step.name}`).toBe("PASS");
    }
  });

  it("the card-CONTENT evidence: both launches display the repair cards (2 party changes + 4 platform work items + 2 hypotheses — ≥3 meaningfully different kinds)", () => {
    const launch1 = receipt.steps.find((step) => step.id === "run1-4")!;
    const launch2 = receipt.steps.find((step) => step.id === "run2-4")!;
    expect(launch1.detail).toContain("conditional=2 platform=4 hypotheses=2");
    expect(launch2.detail).toContain("conditional=2 platform=4 hypotheses=2");
    expect(launch1.detail).toMatch(/view=fnv1a64:[a-f0-9]{16}/);
    expect(launch2.detail).toMatch(/view=fnv1a64:[a-f0-9]{16}/);
  });

  it("THE PERSISTENCE PROOF: the re-derived view digest EQUALS launch 1's (the byte-identical deterministic re-derivation — the conditionals survive relaunch)", () => {
    const digestStep = receipt.steps.find((step) => step.id === "run2-3")!;
    const match = /launch1=(fnv1a64:[a-f0-9]{16}) launch2=(fnv1a64:[a-f0-9]{16})/.exec(digestStep.detail);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(match![2]);
    expect(receipt.journeySummary.persistence).toContain("SURVIVED");
    expect(receipt.journeySummary.persistence).toContain(match![1]);
  });

  it("the honest no-route + the honest refusal are recorded (the authority tier unchanged by the cards; the consent carry-forward surfaced)", () => {
    expect(receipt.steps.find((step) => step.id === "run1-3")!.detail).toContain("NO_ROUTE_FOR_CORRIDOR");
    expect(receipt.steps.find((step) => step.id === "run1-6")!.detail).toContain("consent-gate refusal rendered");
    expect(receipt.steps.find((step) => step.id === "run2-5")!.name).toContain("re-check refusal recomputes");
  });

  it("the receipt is SECRET-FREE and discloses the scripted-test-world tier (never a live-probe claim)", () => {
    expect(receipt.secretScan.findings).toEqual([]);
    expect(receipt.secretScan.result).toContain("CLEAN");
    expect(receipt.honestScope).toContain("ZERO live provider credentials");
    expect(receipt.honestScope).toContain("SCRIPTED provider transport");
    expect(receipt.honestScope).toContain("NO live provider was contacted or is claimed");
  });

  it("the screenshots exist on disk (the visual evidence chain)", () => {
    expect(receipt.screenshots.length).toBeGreaterThanOrEqual(10);
    for (const name of receipt.screenshots) {
      expect(existsSync(join(ASSETS_DIR, name)), name).toBe(true);
    }
  });
});
