import { describe, expect, it } from "vitest";
import {
  ProviderEnvironmentError,
  defineProviderEnvironment,
} from "../src/provider-environment.js";
import { ProviderActivationError } from "../src/provider-activation.js";
import {
  ACTIVATION_EVIDENCE_VERDICTS,
  PROVIDER_ACTIVATION_STATUSES,
  appendProviderActivationRecord,
  currentProviderActivationRecords,
  defineProviderActivationRecord,
  emptyProviderActivationLedger,
  resolveProviderEnablement,
} from "../src/provider-activation.js";

function probeEvidence(probedAt = "2026-10-19T08:00:00Z") {
  return {
    evidencePath: "spec/development-state/provider-probes.json",
    probedAt,
    verdict: "VERIFIED" as const,
    summary: "sandbox credential probe: authorization + eligibility verified",
  };
}

function activatedRecord(recordId = "rec-1", providerName = "wise") {
  return defineProviderActivationRecord({
    recordId,
    providerName,
    status: "ACTIVATED",
    probeEvidence: probeEvidence(),
    connectedInstanceId: "connected-instance/wise/001",
    limitations: ["test-mode keys"],
    recordedAt: "2026-10-19T09:00:00Z",
    recordedBy: "tl-station",
  });
}

describe("the exact provider environment (hard law 6)", () => {
  it("assembles with every field and a deterministic digest", () => {
    const record = defineProviderEnvironment({
      providerName: "wise",
      tier: "production",
      executionMode: "LIVE",
      transportClass: "PRODUCTION_HTTP",
      credentialConfigKey: "PROVIDER_WISE_CREDENTIAL_REF",
      credentialHandle: "vault://payswap/production/wise",
    });
    expect(record.digest).toMatch(/^fnv1a64:/);
    const same = defineProviderEnvironment({
      providerName: "wise",
      tier: "production",
      executionMode: "LIVE",
      transportClass: "PRODUCTION_HTTP",
      credentialConfigKey: "PROVIDER_WISE_CREDENTIAL_REF",
      credentialHandle: "vault://payswap/production/wise",
    });
    expect(same.digest).toBe(record.digest);
  });

  it("sandbox/live separation is structural: LIVE outside production throws", () => {
    expect(() =>
      defineProviderEnvironment({
        providerName: "wise",
        tier: "staging",
        executionMode: "LIVE",
        transportClass: "PRODUCTION_HTTP",
        credentialConfigKey: "PROVIDER_WISE_CREDENTIAL_REF",
        credentialHandle: "vault://payswap/staging/wise",
      }),
    ).toThrow(/sandbox\/live separation is structural/);
  });

  it("a FAKE_DETERMINISTIC transport can never serve live behavior", () => {
    expect(() =>
      defineProviderEnvironment({
        providerName: "wise",
        tier: "production",
        executionMode: "LIVE",
        transportClass: "FAKE_DETERMINISTIC",
        credentialConfigKey: "PROVIDER_WISE_CREDENTIAL_REF",
        credentialHandle: "vault://payswap/production/wise",
      }),
    ).toThrow(/a fake transport can never serve live behavior/);
    const sandbox = defineProviderEnvironment({
      providerName: "wise",
      tier: "preview",
      executionMode: "SANDBOX",
      transportClass: "FAKE_DETERMINISTIC",
      credentialConfigKey: "PROVIDER_WISE_CREDENTIAL_REF",
      credentialHandle: "vault://payswap/preview/wise",
    });
    expect(sandbox.executionMode).toBe("SANDBOX");
  });

  it("the credential binding is handle-only (config key template + handle shape)", () => {
    expect(() =>
      defineProviderEnvironment({
        providerName: "wise",
        tier: "preview",
        executionMode: "SANDBOX",
        transportClass: "PRODUCTION_HTTP",
        credentialConfigKey: "WISE_API_KEY",
        credentialHandle: "vault://payswap/preview/wise",
      }),
    ).toThrow(/PROVIDER_<NAME>_CREDENTIAL_REF/);
    expect(() =>
      defineProviderEnvironment({
        providerName: "wise",
        tier: "preview",
        executionMode: "SANDBOX",
        transportClass: "PRODUCTION_HTTP",
        credentialConfigKey: "PROVIDER_WISE_CREDENTIAL_REF",
        credentialHandle: "definitely-a-secret-value-not-a-handle",
      }),
    ).toThrow(/never a value/);
    const runtimeHandle = defineProviderEnvironment({
      providerName: "wise",
      tier: "local",
      executionMode: "SANDBOX",
      transportClass: "FAKE_DETERMINISTIC",
      credentialConfigKey: "PROVIDER_WISE_CREDENTIAL_REF",
      credentialHandle: "cred:7",
    });
    expect(runtimeHandle.credentialHandle).toBe("cred:7");
  });
});

describe("activation records (versioned, immutable, evidence-gated)", () => {
  it("ACTIVATED requires live probe evidence + a connected instance", () => {
    expect([...PROVIDER_ACTIVATION_STATUSES]).toEqual([
      "ACTIVATED",
      "BLOCKED",
      "REVOKED",
      "SUPERSEDED",
    ]);
    expect([...ACTIVATION_EVIDENCE_VERDICTS]).toEqual([
      "VERIFIED",
      "ELIGIBLE",
      "READY",
    ]);
    expect(() =>
      defineProviderActivationRecord({
        recordId: "rec-bad",
        providerName: "wise",
        status: "ACTIVATED",
        probeEvidence: probeEvidence(),
        recordedAt: "2026-10-19T09:00:00Z",
        recordedBy: "tl-station",
      }),
    ).toThrow(/connected instance/);
    expect(() =>
      defineProviderActivationRecord({
        recordId: "rec-bad",
        providerName: "wise",
        status: "BLOCKED",
        probeEvidence: probeEvidence(),
        connectedInstanceId: "connected-instance/wise/001",
        recordedAt: "2026-10-19T09:00:00Z",
        recordedBy: "tl-station",
      }),
    ).toThrow(/only an ACTIVATED record may carry/);
    expect(() =>
      defineProviderActivationRecord({
        recordId: "rec-bad",
        providerName: "wise",
        status: "ACTIVATED",
        probeEvidence: { ...probeEvidence(), verdict: "GUT_FEELING" as never },
        connectedInstanceId: "connected-instance/wise/001",
        recordedAt: "2026-10-19T09:00:00Z",
        recordedBy: "tl-station",
      }),
    ).toThrow(/live probe evidence/);
  });

  it("the ledger is append-only with linear supersedes chains", () => {
    const ledger = appendProviderActivationRecord(
      emptyProviderActivationLedger(),
      activatedRecord(),
    );
    expect(() =>
      appendProviderActivationRecord(ledger, activatedRecord()),
    ).toThrow(/append-only/);
    expect(() =>
      appendProviderActivationRecord(
        ledger,
        defineProviderActivationRecord({
          recordId: "rec-2",
          providerName: "wise",
          status: "REVOKED",
          probeEvidence: probeEvidence(),
          supersedes: "rec-does-not-exist",
          recordedAt: "2026-10-20T09:00:00Z",
          recordedBy: "tl-station",
        }),
      ),
    ).toThrow(/does not resolve/);
    expect(() =>
      appendProviderActivationRecord(
        ledger,
        defineProviderActivationRecord({
          recordId: "rec-2",
          providerName: "stripe",
          status: "REVOKED",
          probeEvidence: probeEvidence(),
          supersedes: "rec-1",
          recordedAt: "2026-10-20T09:00:00Z",
          recordedBy: "tl-station",
        }),
      ),
    ).toThrow(/crosses providers/);

    const revoked = appendProviderActivationRecord(
      ledger,
      defineProviderActivationRecord({
        recordId: "rec-2",
        providerName: "wise",
        status: "REVOKED",
        probeEvidence: probeEvidence(),
        supersedes: "rec-1",
        recordedAt: "2026-10-20T09:00:00Z",
        recordedBy: "tl-station",
      }),
    );
    expect(() =>
      appendProviderActivationRecord(
        revoked,
        defineProviderActivationRecord({
          recordId: "rec-3",
          providerName: "wise",
          status: "REVOKED",
          probeEvidence: probeEvidence(),
          supersedes: "rec-1",
          recordedAt: "2026-10-21T09:00:00Z",
          recordedBy: "tl-station",
        }),
      ),
    ).toThrow(/already superseded/);
    expect(revoked.records).toHaveLength(2);
  });

  it("current records exclude superseded ones", () => {
    const ledger = appendProviderActivationRecord(
      appendProviderActivationRecord(
        emptyProviderActivationLedger(),
        activatedRecord(),
      ),
      defineProviderActivationRecord({
        recordId: "rec-2",
        providerName: "wise",
        status: "REVOKED",
        probeEvidence: probeEvidence(),
        supersedes: "rec-1",
        recordedAt: "2026-10-20T09:00:00Z",
        recordedBy: "tl-station",
      }),
    );
    expect(currentProviderActivationRecords(ledger).map((r) => r.recordId)).toEqual([
      "rec-2",
    ]);
  });

  it("enablement is fail-closed data: only current ACTIVATED enables; overrides only disable", () => {
    const ledger = appendProviderActivationRecord(
      emptyProviderActivationLedger(),
      activatedRecord(),
    );
    expect(resolveProviderEnablement(ledger)[0]?.enabled).toBe(true);

    const withOverride = resolveProviderEnablement(ledger, [
      {
        providerName: "wise",
        enabled: false,
        reason: "operator hold pending investigation",
        decidedAt: "2026-10-20T10:00:00Z",
      },
    ]);
    expect(withOverride[0]?.enabled).toBe(false);
    expect(withOverride[0]?.reason).toContain("operator override");

    const revokedLedger = appendProviderActivationRecord(
      ledger,
      defineProviderActivationRecord({
        recordId: "rec-2",
        providerName: "wise",
        status: "REVOKED",
        probeEvidence: probeEvidence(),
        supersedes: "rec-1",
        recordedAt: "2026-10-20T09:00:00Z",
        recordedBy: "tl-station",
      }),
    );
    const afterRevocation = resolveProviderEnablement(revokedLedger, [
      {
        providerName: "wise",
        enabled: true,
        reason: "an override cannot manufacture enablement",
        decidedAt: "2026-10-20T11:00:00Z",
      },
    ]);
    expect(afterRevocation[0]?.enabled).toBe(false);
    expect(afterRevocation[0]?.reason).toContain("REVOKED");
  });

  it("secret-shaped material in records fails closed", () => {
    const assembled = "sk_live_" + "a".repeat(20);
    expect(() =>
      defineProviderActivationRecord({
        recordId: "rec-secret",
        providerName: "wise",
        status: "BLOCKED",
        probeEvidence: { ...probeEvidence(), summary: `probe saw ${assembled}` },
        recordedAt: "2026-10-19T09:00:00Z",
        recordedBy: "tl-station",
      }),
    ).toThrow(ProviderActivationError);
  });
});
