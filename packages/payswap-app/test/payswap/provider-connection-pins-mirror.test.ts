/**
 * @payswap/app — the PROVIDER-CONNECTION PINS mirror verification (P12
 * Lane C, NET-NEW).
 *
 * Same law as onchain-pins-mirror.test.ts: the connection vocabulary the
 * connections area renders is pinned STRUCTURALLY
 * (src/pins/provider-connection-pins.ts); THIS test imports the accepted
 * @payswap/provider-runtime source directly (test-only) and asserts the
 * pins match the sources — same literals, same order. Drift fails here.
 */
import { describe, expect, it } from "vitest";
import {
  CONNECTION_FORMS,
  CREDENTIAL_KINDS,
} from "../../../provider-runtime/src/connection-forms.ts";
import {
  EFFECT_CLASSES,
  OPERATION_CLASSES,
} from "../../../provider-runtime/src/connection-scope.ts";
import {
  CONNECTION_LIFECYCLE_STATES,
  CONNECTION_TRANSITION_CAUSES,
} from "../../../provider-runtime/src/connection-lifecycle.ts";

import {
  CONNECTION_FORM_CATALOGUE_PIN,
  CONNECTION_FORMS_PIN,
  CONNECTION_LIFECYCLE_STATES_PIN,
  CONNECTION_TRANSITION_CAUSES_PIN,
  CREDENTIAL_KINDS_PIN,
  EFFECT_CLASSES_PIN,
  EXECUTION_MODES_PIN,
  OPERATION_CLASSES_PIN,
} from "../../src/pins/provider-connection-pins.js";
import { foldConnectionsSetup } from "../../src/lib/connections-catalogue.js";

describe("the provider-connection pins mirror the accepted provider-runtime source", () => {
  it("the connection forms + credential kinds match (same literals, same order)", () => {
    expect(CONNECTION_FORMS_PIN).toEqual(CONNECTION_FORMS);
    expect(CREDENTIAL_KINDS_PIN).toEqual(CREDENTIAL_KINDS);
  });

  it("the catalogue covers every declared form exactly once", () => {
    expect(CONNECTION_FORM_CATALOGUE_PIN.map((row) => row.form)).toEqual(CONNECTION_FORMS);
  });

  it("the scope, lifecycle and execution-mode vocabularies match", () => {
    expect(OPERATION_CLASSES_PIN).toEqual(OPERATION_CLASSES);
    expect(EFFECT_CLASSES_PIN).toEqual(EFFECT_CLASSES);
    expect(CONNECTION_LIFECYCLE_STATES_PIN).toEqual(CONNECTION_LIFECYCLE_STATES);
    expect(CONNECTION_TRANSITION_CAUSES_PIN).toEqual(CONNECTION_TRANSITION_CAUSES);
    expect(EXECUTION_MODES_PIN).toEqual(["SANDBOX", "LIVE"]);
  });
});

describe("the connections setup fold is honest by construction (C4 laws)", () => {
  const setup = foldConnectionsSetup();

  it("providerCount is honestly 0 (the catalogue is never a connection)", () => {
    expect(setup.connectedCount).toBe(0);
  });

  it("the setup flow carries all eight C4 steps in flow order", () => {
    expect(setup.steps.map((step) => step.id)).toEqual([
      "catalogue",
      "corridors",
      "connect",
      "scopes",
      "validate",
      "health",
      "environments",
      "lifecycle",
    ]);
  });

  it("the connect step states its typed prerequisite — never a dead button", () => {
    const connect = setup.steps.find((step) => step.id === "connect");
    expect(connect?.state).toBe("BLOCKED_UNWIRED");
    expect(connect?.line).toContain("Connect requires the provider connection plane");
    expect(connect?.line).toContain("refuses to fabricate");
  });

  it("the health step is honestly empty at zero connections", () => {
    const health = setup.steps.find((step) => step.id === "health");
    expect(health?.state).toBe("EMPTY_HONEST");
    expect(health?.line).toContain("No connection health to observe");
  });

  it("the sandbox/live step renders the structural distinction", () => {
    const environments = setup.steps.find((step) => step.id === "environments");
    expect(environments?.state).toBe("READY_DECLARED");
    expect(environments?.line).toContain("never proof of live behavior");
    expect(setup.executionModes).toEqual(["SANDBOX", "LIVE"]);
  });

  it("the lifecycle step names reconnect/disable/disconnect as lawful transitions over zero connections", () => {
    const lifecycle = setup.steps.find((step) => step.id === "lifecycle");
    expect(lifecycle?.line).toContain("nothing to reconnect, disable or disconnect");
    expect(setup.lifecycleStates).toContain("DISCONNECTED");
  });
});
