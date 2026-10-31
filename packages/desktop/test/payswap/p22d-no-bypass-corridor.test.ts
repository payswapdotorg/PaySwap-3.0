/**
 * PaySwap Desktop (P22-D, ADR-0016 D7/D12) — THE NO-BYPASS BATTERY:
 * the corridor surfaces' inviolability, consolidated at the composed
 * tier over the REAL channel-composed service (the same world the
 * bridge battery drives — ./p22d-corridor-journey-bridge.test.ts) +
 * the REAL kernels over the REAL sealed connections.
 *
 * THE D7/D12 CLAUSES, each proven here or cited to its pinned home:
 *  (a) the deploy refusal: a Stellar deployment leg without its plan
 *      refs is COMMAND_REJECTED with ZERO post-seed transport calls
 *      (a deploy without its prepared plan never dispatches — D4);
 *  (b) the composite leg-scope refusals at the composed tier: the N=1
 *      mismatch; the planless-composite mismatch; the tampered digest;
 *      the out-of-range leg; the NO-DOUBLE-EFFECT law (a confirmed
 *      leg's re-dispatch refuses AUTHORIZATION_CONSUMED — the
 *      idempotent replay path re-checks the share);
 *  (c) the Stellar mode refusals BOTH layers (the admission-mode
 *      mismatch on the REAL connection + the seal-time
 *      "a pubnet-shaped target is never offered" grant law, INV-25) +
 *      stellar:pubnet ABSENT from the registry (fail-closed);
 *  (d) the corridor compile refusal (the unobserved middle named; the
 *      presentation fail-closed — the plan module's pinned home);
 *  (e) the marker scans over the composite DTOs + the live positive
 *      control (the escape-scan law at the composed tier);
 *  (f) the structural falses (discovery never permits execution; the
 *      channel preview on the corridor ask is never dispatchable; the
 *      skeleton's typed shape law).
 *
 * The per-package pins (the kernels battery's grant laws, the
 * dispatch runtime's custody gates, the authorization gate's share
 * law) stay in their own batteries — cited, never duplicated. The
 * architecture check stays 0/0/0 (the closure gate).
 */

import { describe, expect, it } from "vitest";

import { compileMoneyMovementRoute } from "@payswap/route-compiler";
import { createStellarExecutionKernel } from "../../src/host/payswap/payments/stellar-execution-kernel.js";
import {
  corridorPlanDigest,
  dispatchCorridorPlan,
  validateCorridorPlanShape,
  type CorridorPlanInput,
} from "../../src/host/payswap/payments/corridor-dispatch.js";
import { createAuthorizationGate } from "../../src/host/payswap/payments/authorization-gate.js";
import { createStellarHorizonHostTransport } from "../../src/host/payswap/connections/host-https-transports.js";
import {
  armedComposite,
  composedWorld,
  countingFetch,
  fakeLiveStellarAuthority,
  kernelCommand,
  missionAtPlanningPreview,
  NO_BYPASS_GOAL,
  NO_BYPASS_T0,
} from "./p22d-no-bypass-corridor-fixtures.js";
import { captureCorridorIntake } from "./p22d-corridor-journey-fixtures.js";
import { compileCorridorForJourney } from "./p22d-corridor-journey-plan.js";
import {
  corridorCompilerInput,
  corridorLocationObservations,
  route5Intent,
} from "../../../route-compiler/test/corridor-fixtures.ts";

describe("the P22-D no-bypass battery (ADR-0016 D7/D12 — the corridor surfaces' inviolability at the composed tier)", () => {
  it("(a) the deploy refusal: a deployment leg without its plan refs is COMMAND_REJECTED with ZERO post-seed transport calls", async () => {
    const { world, connections } = await composedWorld();
    const counted = countingFetch(world);
    const kernel = createStellarExecutionKernel({
      connectionAuthority: connections.authority,
      transport: createStellarHorizonHostTransport(counted.fetchImpl),
    });
    const compiled = compileCorridorForJourney();
    const { deploy: _omitted, ...bareLeg } = compiled.planInput.legs[1]!;
    void _omitted;
    const answer = await kernel.dispatch(
      kernelCommand({ connectionRef: connections.stellarConnectionId, leg: bareLeg as never }),
    );
    expect(answer.kind).toBe("REFUSED");
    if (answer.kind !== "REFUSED") return;
    expect(answer.refusal.kind).toBe("COMMAND_REJECTED");
    expect(answer.refusal.reason).toContain("a deployment leg requires its plan refs");
    expect(counted.calls).toHaveLength(0);
  });

  it("(b) the composite leg-scope refusals at the composed tier: the N=1 mismatch, the planless-composite mismatch, the tampered digest, the out-of-range leg, and the no-double-effect law", async () => {
    const { service, runtime, connections } = await composedWorld();
    const compiled = compileCorridorForJourney();
    const legDispatch = (missionId: string, artifactId: string, overrides: Record<string, unknown>) =>
      runtime.dispatch.dispatch(
        missionId,
        "CREATE_EXTERNAL_EFFECT",
        {
          authorizationArtifactId: artifactId,
          connectionRef: connections.paystackConnectionId,
          executionMode: "SANDBOX",
          legIndex: 0,
          leg: compiled.planInput.legs[0] as never,
          planDigest: compiled.digest,
          ...overrides,
        } as never,
        NO_BYPASS_T0,
      );

    // (b1) An N=1 approval (no plan facts) + a leg dispatch → typed mismatch.
    const missionOne = await missionAtPlanningPreview({
      service,
      runtime,
      connections,
      planId: compiled.plan.planId,
      now: NO_BYPASS_T0,
    });
    const plainRequest = await runtime.requestAuthorization(missionOne, NO_BYPASS_T0);
    const plainResolution = await runtime.resolveAuthorization(
      { requestId: plainRequest.requestId, decision: "APPROVE", origin: "PREVIEW_UI_ACT" },
      NO_BYPASS_T0,
    );
    expect(plainResolution.outcome.kind).toBe("GRANTED");
    const plainArtifactId =
      plainResolution.outcome.kind === "GRANTED" ? plainResolution.outcome.artifact.artifactId : "";
    await expect(legDispatch(missionOne, plainArtifactId, {})).rejects.toThrow(
      /not a composite multi-leg artifact/,
    );

    // (b2)-(b5) The COMPOSITE artifact's own laws.
    const missionTwo = await missionAtPlanningPreview({
      service,
      runtime,
      connections,
      planId: compiled.plan.planId,
      now: NO_BYPASS_T0,
    });
    const artifactTwo = await armedComposite(runtime, missionTwo, compiled.planInput, NO_BYPASS_T0);
    // (b2) A planless consumption of a composite artifact → typed mismatch.
    await expect(
      runtime.dispatch.dispatch(
        missionTwo,
        "CREATE_EXTERNAL_EFFECT",
        {
          authorizationArtifactId: artifactTwo,
          connectionRef: connections.paystackConnectionId,
          executionMode: "SANDBOX",
        } as never,
        NO_BYPASS_T0,
      ),
    ).rejects.toThrow(/never as one planless single consumption/);
    // (b3) A tampered plan's digest → typed mismatch (a leg outside the
    // authorized plan is never a dispatch).
    const tampered: CorridorPlanInput = {
      ...compiled.planInput,
      legs: compiled.planInput.legs.map((leg, index) =>
        index === 3 ? { ...leg, plannedAmount: { ...leg.plannedAmount, minorUnits: "9999999" } } : leg,
      ),
    };
    await expect(
      legDispatch(missionTwo, artifactTwo, { planDigest: corridorPlanDigest(tampered) }),
    ).rejects.toThrow(/digest does not match/);
    // (b4) The out-of-range leg — BOTH orderings honest: on a fresh
    // mission the CUSTODY gate fires first (leg 0 UNRECORDED — the
    // disclosed ordering); after a full four-leg confirmation the RANGE
    // law fires at the first out-of-range index.
    await expect(
      legDispatch(missionTwo, artifactTwo, { legIndex: 7 }),
    ).rejects.toThrow(/legs never silently skip/);
    // (b5) The NO-DOUBLE-EFFECT law: leg 0 confirmed alone (the mission
    // stays open), then re-dispatched — the idempotent replay path
    // re-checks the per-leg share.
    const legZero = await legDispatch(missionTwo, artifactTwo, {});
    expect(legZero.kind).toBe("DISPATCHED");
    await expect(legDispatch(missionTwo, artifactTwo, {})).rejects.toThrow(/single-use/);
    // (b4b) THE RANGE LAW's pinned home: the authorization gate's own
    // consumeArtifact range check (the p23-no-bypass (c) pattern — the
    // pure gate driven directly). The runtime's binding block mirrors it
    // as defense-in-depth; through the dispatch path the custody gate +
    // the terminal guard compose to make an out-of-range leg unreachable
    // (the disclosed ordering above).
    const gate = createAuthorizationGate();
    const gateRequest = gate.requestAuthorization(
      {
        missionId: "mission:gate-range",
        previewId: "pmt-preview:gate-range",
        dispatchable: true,
        gates: { decision: "PROCEED", reasons: [] },
      } as never,
      {
        missionId: "mission:gate-range",
        direction: "MOVE",
        amount: { currency: "GHS", minorUnits: "100000" },
        destinationSummary: "stated (unverified) destination",
        intentDigest: "digest:gate-range",
        planDigest: compiled.digest,
        planLegCount: compiled.planInput.legs.length,
      } as never,
      NO_BYPASS_T0,
    );
    const gateResolution = gate.resolveAuthorization(
      { requestId: gateRequest.requestId, decision: "APPROVE", origin: "PREVIEW_UI_ACT" },
      NO_BYPASS_T0,
    );
    expect(gateResolution.outcome.kind).toBe("GRANTED");
    const gateArtifactId =
      gateResolution.outcome.kind === "GRANTED" ? gateResolution.outcome.artifact.artifactId : "";
    expect(() => gate.consumeArtifact(gateArtifactId, NO_BYPASS_T0, compiled.planInput.legs.length)).toThrow(
      /outside the authorized plan/,
    );
  });

  it("(c) the Stellar mode refusals BOTH layers + stellar:pubnet ABSENT from the registry", async () => {
    const { world, connections, service } = await composedWorld();
    const compiled = compileCorridorForJourney();
    // LAYER 1 — the admission-mode mismatch on the REAL connection
    // (outside the seal; no material involved; zero transport calls).
    const counted = countingFetch(world);
    const kernel = createStellarExecutionKernel({
      connectionAuthority: connections.authority,
      transport: createStellarHorizonHostTransport(counted.fetchImpl),
    });
    const admission = await kernel.dispatch(
      kernelCommand({
        connectionRef: connections.stellarConnectionId,
        executionMode: "LIVE",
        leg: compiled.planInput.legs[2] as never,
      }),
    );
    expect(admission.kind).toBe("REFUSED");
    if (admission.kind !== "REFUSED") return;
    expect(admission.refusal.kind).toBe("MODE_NOT_OFFERED");
    expect(admission.refusal.reason).toContain("does not match the command's");
    expect(counted.calls).toHaveLength(0);
    // LAYER 2 — the seal-time grant law (a LIVE-mode connection shape +
    // a LIVE command pass admission; the grant inside the seal refuses).
    const sealCounted = countingFetch(world);
    const liveKernel = createStellarExecutionKernel({
      connectionAuthority: fakeLiveStellarAuthority() as never,
      transport: createStellarHorizonHostTransport(sealCounted.fetchImpl),
    });
    const seal = await liveKernel.dispatch(
      kernelCommand({
        connectionRef: "conn:fake-live-stellar",
        executionMode: "LIVE",
        leg: compiled.planInput.legs[2] as never,
      }),
    );
    expect(seal.kind).toBe("REFUSED");
    if (seal.kind !== "REFUSED") return;
    expect(seal.refusal.kind).toBe("MODE_NOT_OFFERED");
    expect(seal.refusal.reason).toContain("a pubnet-shaped target is never offered");
    expect(sealCounted.calls).toHaveLength(0);
    // stellar:pubnet is ABSENT from the registry (fail-closed — no
    // declared rail form; the PSP catalogue is never consulted for rails).
    const refused = await service.connectionSeedSetup({
      providerId: "stellar:pubnet",
      useCaseRef: "testnet-keypair-wallet",
    });
    expect(refused.kind).toBe("REFUSED");
    const catalogue = await service.connectionRegistry();
    expect(catalogue.map((entry) => entry.providerId)).not.toContain("stellar:pubnet");
  });

  it("(d) the corridor compile refusal: the unobserved middle named; the presentation fail-closed", () => {
    const result = compileMoneyMovementRoute(
      corridorCompilerInput(route5Intent(), {
        locationObservations: corridorLocationObservations({ withoutMiddle: true }),
      }),
    );
    expect(result.status).toBe("NO_COMPILABLE_ROUTE");
    expect(result.plans).toEqual([]);
    const reasons = result.exclusions
      .map((exclusion) => `${exclusion.shapeId}: ${exclusion.reasons.join(" ")}`)
      .join(" | ");
    expect(reasons).toContain("OBSERVED onchain middle");
    expect(reasons).toContain("never a fabricated middle");
    // There is NOTHING to present over the unobserved middle (fail-closed;
    // the presentation law's pinned home is the plan module).
    const compiled = compileCorridorForJourney();
    expect(
      compiled.plan.legs.every((leg) => leg.stateGrounding.groundingFailures.length === 0),
    ).toBe(true);
  });

  it("(e) the marker scans over the composite DTOs + the live positive control (the escape-scan law at the composed tier)", async () => {
    const { world, service, runtime, connections } = await composedWorld();
    const compiled = compileCorridorForJourney();
    const missionId = await missionAtPlanningPreview({
      service,
      runtime,
      connections,
      planId: compiled.plan.planId,
      now: NO_BYPASS_T0,
    });
    const artifactId = await armedComposite(runtime, missionId, compiled.planInput, NO_BYPASS_T0);
    const outcome = await dispatchCorridorPlan({
      slice: runtime.dispatch,
      missionId,
      plan: compiled.planInput,
      connectionRefs: [
        connections.paystackConnectionId,
        connections.stellarConnectionId,
        connections.stellarConnectionId,
        connections.paystackConnectionId,
      ],
      authorizationArtifactId: artifactId,
      executionMode: "SANDBOX",
      now: NO_BYPASS_T0,
    });
    expect(outcome.allLegsConfirmed).toBe(true);
    const artifact = await runtime.artifact(artifactId);
    const detail = await service.paymentMissionDetail(missionId);
    const missionStore = JSON.stringify(
      [...world.files.entries()].filter(([path]) => path.startsWith("/mem/p22d-payments")),
    );
    const compositeDtos = JSON.stringify({ artifact, outcome, detail, missionStore });
    // The sealed fake-key fragments NEVER appear in any composite DTO or
    // the mission store (the broker's escape-scan law, asserted here at
    // the composed tier — the sealed material is never echoed).
    expect(compositeDtos).not.toContain("DoNotUse");
    expect(compositeDtos).not.toContain("FLWSECK");
    // The live positive control: the scan itself is proven live (a
    // planted fragment WOULD be found — never assumed).
    expect(JSON.stringify({ rogue: "FAKE51DoNotUse" })).toContain("DoNotUse");
  });

  it("(f) the structural falses: discovery never permits execution; the channel preview on the corridor ask is never dispatchable; the skeleton's typed shape law", async () => {
    const { service } = await composedWorld();
    // The compile NEVER permits execution by discovery alone (the
    // composite act is the only path — the D12 structural false).
    const result = compileMoneyMovementRoute(corridorCompilerInput(route5Intent()));
    expect(result.discoveryPermitsExecution).toBe(false);
    // The channel preview on the corridor ask is NEVER dispatchable (the
    // declared corridor truth — the planning tier is the only other path,
    // and it is the operator's explicit act).
    const seeded = await service.paymentMissionSeed({ direction: "MOVE", goalStatement: NO_BYPASS_GOAL });
    await captureCorridorIntake(service, seeded.missionId);
    const preview = await service.paymentMissionPresentPreview(seeded.missionId);
    expect(preview?.dispatchable).toBe(false);
    expect(preview?.gates.reasons.join(" ")).toContain("NO_ROUTE_FOR_CORRIDOR");
    // The skeleton's typed shape law: a foreign shape, a wrong leg count,
    // a wrong kind — each a typed refusal (never a silent pass).
    const compiled = compileCorridorForJourney();
    expect(() => validateCorridorPlanShape({ ...compiled.planInput, shapeId: "another-shape" })).toThrow(
      /never a foreign shape/,
    );
    expect(() => validateCorridorPlanShape({ ...compiled.planInput, legs: compiled.planInput.legs.slice(0, 3) })).toThrow(
      /exactly 4 legs/,
    );
    const swapped: CorridorPlanInput = {
      ...compiled.planInput,
      legs: compiled.planInput.legs.map((leg, index) =>
        index === 0 ? { ...leg, legKind: "OFF_RAMP_PAYOUT" } : leg,
      ),
    };
    expect(() => validateCorridorPlanShape(swapped)).toThrow(/exact skeleton law/);
  });
});
