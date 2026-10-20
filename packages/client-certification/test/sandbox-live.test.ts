import { describe, expect, it } from "vitest";
import {
  CREDENTIAL_CUSTODY_KINDS,
  runSandboxLiveSeparationGate,
} from "../src/index.ts";
import type {
  CredentialBinding,
  ModePinnedSurfaceState,
  SandboxLiveSeparationInput,
} from "../src/index.ts";

/**
 * Hard law 6 — sandbox/live structural separation: a sandbox surface
 * can never present as live; live credentials never leak into sandbox
 * paths; mode is pinned per surface state, never per ambient flag.
 */
function separatedInputFixture(): SandboxLiveSeparationInput {
  const bindings: CredentialBinding[] = [
    { credentialRef: "vault:test-credential-1", environment: "test", custody: "vault-only" },
    { credentialRef: "vault:live-credential-1", environment: "live", custody: "vault-only" },
  ];
  const states: ModePinnedSurfaceState[] = [
    {
      stateId: "sandbox.checkout.preview",
      environment: "test",
      presentsAs: "test",
      declaresLiveFinality: false,
      credentialRefs: ["vault:test-credential-1"],
    },
    {
      stateId: "live.checkout.settled",
      environment: "live",
      presentsAs: "live",
      declaresLiveFinality: true,
      credentialRefs: ["vault:live-credential-1"],
    },
  ];
  return { ambientModeInheritance: false, states, credentialBindings: bindings };
}

describe("hard law 6: sandbox/live structural separation", () => {
  it("a properly separated surface passes (test presents as test; live presents as live)", () => {
    const result = runSandboxLiveSeparationGate(separatedInputFixture());
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.law).toBe("sandbox-live-separation");
    expect(result.checked).toBe(2);
    expect(result.digest).toBe(
      runSandboxLiveSeparationGate(separatedInputFixture()).digest,
    );
  });

  it("a sandbox state PRESENTING AS LIVE is a structural violation", () => {
    const base = separatedInputFixture();
    const [sandbox, live] = base.states as [ModePinnedSurfaceState, ModePinnedSurfaceState];
    const result = runSandboxLiveSeparationGate({
      ...base,
      states: [{ ...sandbox, presentsAs: "live" }, live],
    });
    expect(result.passed).toBe(false);
    expect(
      result.violations.some(
        (violation) => violation.code === "sandbox_presenting_as_live",
      ),
    ).toBe(true);
  });

  it("a test state DECLARING LIVE FINALITY is a violation (test is an inverted-stone mark)", () => {
    const base = separatedInputFixture();
    const [sandbox, live] = base.states as [ModePinnedSurfaceState, ModePinnedSurfaceState];
    const result = runSandboxLiveSeparationGate({
      ...base,
      states: [{ ...sandbox, declaresLiveFinality: true }, live],
    });
    expect(result.passed).toBe(false);
    expect(
      result.violations.some(
        (violation) => violation.code === "test_state_declares_live_finality",
      ),
    ).toBe(true);
  });

  it("a LIVE credential referenced from a test-pinned state is a leak into a sandbox path", () => {
    const base = separatedInputFixture();
    const [sandbox, live] = base.states as [ModePinnedSurfaceState, ModePinnedSurfaceState];
    const result = runSandboxLiveSeparationGate({
      ...base,
      states: [{ ...sandbox, credentialRefs: ["vault:live-credential-1"] }, live],
    });
    expect(result.passed).toBe(false);
    expect(
      result.violations.some(
        (violation) => violation.code === "live_credential_in_test_path",
      ),
    ).toBe(true);
  });

  it("ambient mode inheritance is a violation — mode is pinned per surface state, not per ambient flag", () => {
    const result = runSandboxLiveSeparationGate({
      ...separatedInputFixture(),
      ambientModeInheritance: true,
    });
    expect(result.passed).toBe(false);
    expect(
      result.violations.some(
        (violation) => violation.code === "ambient_mode_dependency",
      ),
    ).toBe(true);
  });

  it("unbound credential references and non-vault custody fail closed", () => {
    const unbound = runSandboxLiveSeparationGate({
      ...separatedInputFixture(),
      states: [
        {
          stateId: "live.checkout.settled",
          environment: "live",
          presentsAs: "live",
          declaresLiveFinality: true,
          credentialRefs: ["vault:never-declared"],
        },
      ],
    });
    expect(unbound.passed).toBe(false);
    expect(
      unbound.violations.some(
        (violation) => violation.code === "unbound_credential_reference",
      ),
    ).toBe(true);

    const inline = runSandboxLiveSeparationGate({
      ...separatedInputFixture(),
      credentialBindings: [
        {
          credentialRef: "vault:live-credential-1",
          environment: "live",
          custody: "inline",
        },
      ],
    });
    expect(inline.passed).toBe(false);
    expect(
      inline.violations.some(
        (violation) => violation.code === "credential_not_vault_custody",
      ),
    ).toBe(true);
    expect([...CREDENTIAL_CUSTODY_KINDS]).toEqual(["vault-only", "inline"]);
  });
});
