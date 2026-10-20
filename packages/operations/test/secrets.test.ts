import { describe, expect, it } from "vitest";
import {
  DeclarativeSecretResolver,
  FORBIDDEN_SECRET_KEY_FRAGMENTS,
  SECRET_SHAPED_PATTERNS,
  checkSecretReferenceHygiene,
  collectSecretShapedStrings,
  isSecretShaped,
  scrubSecretShapedValues,
} from "../src/secrets.js";
import {
  SECRET_ROTATION_PROCEDURES,
  rotationProcedureFor,
} from "../src/secrets-rotation.js";

/** Runtime-assembled fixture (never a secret-shaped LITERAL in source). */
function liveSecretFixture(): string {
  return "sk_live_" + "abcdefghij".repeat(3);
}
function privateKeyFixture(): string {
  const begin = ["-----BEGIN", "RSA", "PRIVATE", "KEY-----"].join(" ");
  const end = ["-----END", "RSA", "PRIVATE", "KEY-----"].join(" ");
  return `${begin}${"MIIabc".repeat(4)}${end}`;
}

describe("the fail-closed scanner (shared by every record checker)", () => {
  it("detects every secret-shaped value class", () => {
    expect(isSecretShaped(liveSecretFixture())).toBe(true);
    expect(isSecretShaped(privateKeyFixture())).toBe(true);
    expect(isSecretShaped("ghp_" + "a".repeat(30))).toBe(true);
    expect(isSecretShaped("AKIA" + "A".repeat(16))).toBe(true);
    expect(isSecretShaped("password=hunter2")).toBe(true);
    expect(isSecretShaped("vault://payswap/production/wise")).toBe(false);
    expect(isSecretShaped("cred:7")).toBe(false);
    expect(isSecretShaped("normal configuration text")).toBe(false);
  });

  it("collects secret-shaped strings with field paths", () => {
    const hits = collectSecretShapedStrings({
      ok: "fine",
      nested: { bad: liveSecretFixture() },
      list: [privateKeyFixture()],
    });
    expect(hits).toContain("value.nested.bad");
    expect(hits).toContain("value.list[0]");
  });

  it("the pattern set is the declared closed list", () => {
    expect(SECRET_SHAPED_PATTERNS.length).toBe(9);
    expect(FORBIDDEN_SECRET_KEY_FRAGMENTS).toContain("SIGNING_SECRET");
  });
});

describe("the hygiene gate (handles not values)", () => {
  it("clean reference-only config passes", () => {
    const report = checkSecretReferenceHygiene([
      {
        artifactId: "env-preview",
        config: {
          DATABASE_URL: "vault://payswap/preview/database",
          VAULT_REF: "vault://payswap/preview",
          PROVIDER_WISE_CREDENTIAL_REF: "vault://payswap/preview/wise",
          WEBHOOK_SIGNING_SECRET_REF: "vault://payswap/preview/webhook",
        },
      },
    ]);
    expect(report.passed).toBe(true);
  });

  it("direct secret keys and embedded values fail", () => {
    const report = checkSecretReferenceHygiene([
      {
        artifactId: "env-bad",
        config: {
          WISE_API_KEY: "some-key",
          WEBHOOK_SIGNING_SECRET: liveSecretFixture(),
          CLEAN_KEY: "fine",
        },
      },
    ]);
    expect(report.passed).toBe(false);
    const artifact = report.artifacts[0];
    if (artifact === undefined) throw new Error("artifact report exists");
    expect(artifact.forbiddenKeys).toEqual([
      "WEBHOOK_SIGNING_SECRET",
      "WISE_API_KEY",
    ]);
    expect(artifact.embeddedValues.map((v) => v.key)).toContain(
      "WEBHOOK_SIGNING_SECRET",
    );
  });
});

describe("the scrubber contract", () => {
  it("produces a deterministic redacted copy", () => {
    const input = `config: token=${liveSecretFixture()} and ${privateKeyFixture()}`;
    const once = scrubSecretShapedValues(input);
    const twice = scrubSecretShapedValues(input);
    expect(once.scrubbed).toBe(twice.scrubbed);
    expect(once.findings).toEqual(twice.findings);
    expect(once.scrubbed).not.toContain("sk_live_");
    expect(once.scrubbed).toContain("[REDACTED:live-secret-key]");
    expect(once.scrubbed).toContain("[REDACTED:private-key-block]");
    expect(once.findings.length).toBe(2);
  });

  it("clean text scrubs to itself", () => {
    const result = scrubSecretShapedValues("vault://payswap/x cred:3 plain text");
    expect(result.scrubbed).toBe("vault://payswap/x cred:3 plain text");
    expect(result.findings).toEqual([]);
  });
});

describe("the runtime resolution boundary", () => {
  it("a resolver returns KEY IDS, never values", () => {
    const resolver = new DeclarativeSecretResolver({
      "vault://payswap/preview/wise": ["key-2026-a", "key-2026-b"],
    });
    const resolution = resolver.resolve("vault://payswap/preview/wise");
    expect(resolution.status).toBe("RESOLVED");
    if (resolution.status !== "RESOLVED") throw new Error("narrowed");
    expect(resolution.keyId).toBe("key:vault://payswap/preview/wise:key-2026-a");
    expect(JSON.stringify(resolution)).not.toContain("value");
    expect(resolver.activeKeyIds("vault://payswap/preview/wise")).toEqual([
      "key-2026-a",
      "key-2026-b",
    ]);

    const unresolved = resolver.resolve("vault://payswap/nowhere");
    expect(unresolved.status).toBe("UNRESOLVED");
  });
});

describe("rotation procedures (data, with overlap windows)", () => {
  it("every required family has a procedure", () => {
    for (const configKey of [
      "VAULT_REF",
      "DATABASE_URL",
      "PROVIDER_CREDENTIAL_REF",
      "WEBHOOK_SIGNING_SECRET_REF",
    ]) {
      expect(rotationProcedureFor(configKey)).toBeDefined();
    }
    expect(rotationProcedureFor("NO_SUCH_KEY")).toBeUndefined();
  });

  it("authorization-sensitive rotation requires the epoch bump", () => {
    const webhook = rotationProcedureFor("WEBHOOK_SIGNING_SECRET_REF");
    if (webhook === undefined) throw new Error("procedure exists");
    expect(webhook.requiredOperatorActions).toContain("bump-security-epoch");
    expect(webhook.overlapWindowDays).toBe(7);
    expect(
      SECRET_ROTATION_PROCEDURES.every(
        (procedure) =>
          procedure.steps.length >= 3 && procedure.maxAgeDays > 0,
      ),
    ).toBe(true);
  });
});
