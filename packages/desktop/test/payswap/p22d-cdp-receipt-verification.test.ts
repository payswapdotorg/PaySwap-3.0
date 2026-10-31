/**
 * PaySwap Desktop (P22-D, ADR-0016 D10/D12 — the E2E law's machine-checked
 * receipt tier) — THE CDP CORRIDOR-JOURNEY RECEIPT VERIFICATION: the
 * receipt JSON re-checked by the battery (the merge-fidelity precedent —
 * the durable evidence is machine-verified, never a narrative-only
 * claim). Every assertion is over the RECEIPT's own recorded facts:
 *
 * - the FOURTEEN known steps, each PASS (the 3-provider seed, the
 *   launch-1 corridor journey with the honest no-route advisory view,
 *   the wait + the honest consent-gated refusal, the NO-BYPASS approval
 *   refusal with the composite surfaces never rendering, the persisted
 *   records, the relaunch persistence, the re-derived view with the
 *   EQUAL digest, the recomputed refusal law);
 * - the card-CONTENT evidence in the step details (the corridor-derived
 *   conditional + the platform work + the hypotheses over the seeded
 *   3-provider plane; ZERO corridor card surfaces; the fnv1a64 view
 *   digests on both launches);
 * - THE PERSISTENCE PROOF: launch 1's digest EQUALS launch 2's (the
 *   byte-identical deterministic re-derivation over the persisted
 *   mission + connections);
 * - the honest BLOCKED preview + the D11 corridor hop bound + the
 *   no-bypass GATES_BLOCKED refusal are recorded (the refusal detail
 *   carries the never-rendered composite-surface counts);
 * - the secret scan CLEAN (the receipt is secret-free) and the
 *   honest-scope disclosure present (the scripted-test-world tier —
 *   the connection state seeded through the REAL member path over the
 *   scripted transport; no live probe claimed; the four-leg corridor
 *   card's tier split disclosed — the bridge battery's scripted tier,
 *   with the engine-tier corridor composition the named carry-forward);
 * - the screenshots exist on disk (the visual evidence chain).
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { join } from "node:path";

const RECEIPT_PATH = join(import.meta.dirname, "../../../../docs/productization-evidence/p22-d-cdp-corridor-journey-RECEIPT-2026-10-31.json");
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
  "run1-8",
  "run2-1",
  "run2-4",
  "run2-3",
  "run2-7",
  "run2-5",
] as const;

describe("the P22-D CDP corridor-journey receipt (ADR-0016 D10/D12 — the machine-checked evidence tier)", () => {
  const receipt = JSON.parse(readFileSync(RECEIPT_PATH, "utf8")) as {
    readonly harness: string;
    readonly honestScope: string;
    readonly steps: readonly { readonly id: string; readonly name: string; readonly status: string; readonly detail: string }[];
    readonly screenshots: readonly string[];
    readonly journeySummary: { readonly persistence: string };
    readonly secretScan: { readonly result: string; readonly findings: readonly string[] };
  };

  it("every known step PASSes (the fourteen-step journey — the seed, the corridor ask, the blocked preview, the no-route advisory view, the wait, the no-bypass refusal, the persistence, the re-derivation)", () => {
    expect(receipt.steps.map((step) => step.id)).toEqual([...RECEIPT_STEP_IDS]);
    for (const step of receipt.steps) {
      expect(step.status, `${step.id}: ${step.name}`).toBe("PASS");
    }
  });

  it("the card-CONTENT evidence: both launches display the corridor-derived advisory view with ZERO corridor card surfaces (the engine tier honestly composes none — the four-leg card is the bridge battery's scripted tier)", () => {
    const launch1 = receipt.steps.find((step) => step.id === "run1-4")!;
    const launch2 = receipt.steps.find((step) => step.id === "run2-4")!;
    expect(launch1.detail).toContain("corridorSurfaces=0");
    expect(launch2.detail).toContain("corridorSurfaces=0");
    expect(launch1.detail).toMatch(/conditional=[1-9] platform=[1-9] hypotheses=[1-9]/);
    expect(launch2.detail).toMatch(/conditional=[1-9] platform=[1-9] hypotheses=[1-9]/);
    expect(launch1.detail).toMatch(/view=fnv1a64:[a-f0-9]{16}/);
    expect(launch2.detail).toMatch(/view=fnv1a64:[a-f0-9]{16}/);
  });

  it("THE PERSISTENCE PROOF: the re-derived view digest EQUALS launch 1's (the byte-identical deterministic re-derivation — the advisory view survives relaunch)", () => {
    const digestStep = receipt.steps.find((step) => step.id === "run2-3")!;
    const match = /launch1=(fnv1a64:[a-f0-9]{16}) launch2=(fnv1a64:[a-f0-9]{16})/.exec(digestStep.detail);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(match![2]);
    expect(receipt.journeySummary.persistence).toContain("SURVIVED");
    expect(receipt.journeySummary.persistence).toContain(match![1]);
  });

  it("the honest BLOCKED preview on the D11 corridor bound + the no-bypass GATES_BLOCKED refusal are recorded (the blocked preview never arms; the composite surfaces never render)", () => {
    expect(receipt.steps.find((step) => step.id === "run1-3")!.detail).toContain("NO_ROUTE_FOR_CORRIDOR");
    expect(receipt.steps.find((step) => step.id === "run1-3")!.detail).toContain("at most 6 hops");
    const refusal = receipt.steps.find((step) => step.id === "run1-7")!;
    expect(refusal.detail).toContain("scope=0 armed=0 engage-dispatch=0 send=0");
    expect(receipt.steps.find((step) => step.id === "run2-5")!.name).toContain("refusal law recomputes");
  });

  it("the receipt is SECRET-FREE and discloses the scripted-test-world tier + the corridor card's tier split (never a live-probe claim; the engine-tier composition the named carry-forward)", () => {
    expect(receipt.secretScan.findings).toEqual([]);
    expect(receipt.secretScan.result).toContain("CLEAN");
    expect(receipt.honestScope).toContain("ZERO live provider credentials");
    expect(receipt.honestScope).toContain("SCRIPTED provider transport");
    expect(receipt.honestScope).toContain("NO live provider was contacted or is claimed");
    expect(receipt.honestScope).toContain("THE BLOCKED PREVIEW NEVER ARMS");
    expect(receipt.honestScope).toContain("IN-REPO bridge battery");
    expect(receipt.honestScope).toContain("NAMED CARRY-FORWARD");
  });

  it("the screenshots exist on disk (the visual evidence chain)", () => {
    expect(receipt.screenshots.length).toBeGreaterThanOrEqual(10);
    for (const name of receipt.screenshots) {
      expect(existsSync(join(ASSETS_DIR, name)), name).toBe(true);
    }
  });
});
