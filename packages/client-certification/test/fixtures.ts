/**
 * Shared deterministic fixtures (P8-W2). PURE DATA + pure builders —
 * no randomness, no ambient clock, no network.
 *
 * THE SECRET-FREE LAW (hard constraint 6): every secret-shaped VALUE in
 * this file is ASSEMBLED AT RUNTIME from non-secret fragments — no
 * literal in this tree matches a secret-shape pattern (raw 32-byte key,
 * 12/24-word mnemonic, PEM block, provider token). The full shapes exist
 * only in test-run memory, exactly like the production fixtures the
 * secret-boundary gate feeds its scrubber.
 */

// ---------------------------------------------------------------------------
// Secret-shaped value builders (runtime assembly from fragments)
// ---------------------------------------------------------------------------

/** 16 hex characters — a fragment, never a full key shape in source. */
const HEX_FRAGMENT = "0f1e2d3c4b5a6978";

/** A raw 32-byte key shape (0x + 64 hex) — assembled at runtime. */
export function rawKeyFixture(): string {
  return `0x${HEX_FRAGMENT}${HEX_FRAGMENT}${HEX_FRAGMENT}${HEX_FRAGMENT}`;
}

/** A 64-hex key shape without the 0x prefix — assembled at runtime. */
export function bareKeyFixture(): string {
  return `${HEX_FRAGMENT}${HEX_FRAGMENT}${HEX_FRAGMENT}${HEX_FRAGMENT}`;
}

/** Six common words — a fragment, never a full mnemonic shape in source. */
const WORDS_A = "ripple castle oxygen wisdom";
const WORDS_B = "puzzle silver settle afford";
const WORDS_C = "harbor render island voice";

/** A 12-word mnemonic shape — assembled at runtime from three fragments. */
export function mnemonic12Fixture(): string {
  return [WORDS_A, WORDS_B, WORDS_C].join(" ");
}

/** A 24-word mnemonic shape — assembled at runtime. */
export function mnemonic24Fixture(): string {
  return [
    mnemonic12Fixture(),
    "lantern pattern marble impulse",
    "temple gravity meadow orbit",
    "signal cobra velvet ridge",
  ].join(" ");
}

const PEM_HEAD_A = "-----BEGIN";
const PEM_HEAD_B = "PRIVATE KEY-----";

/** A PEM private-key block head — assembled at runtime. */
export function pemBlockFixture(): string {
  return `${PEM_HEAD_A} ${PEM_HEAD_B}\n${bareKeyFixture().slice(0, 32)}\n-----END PRIVATE KEY-----\n`;
}

const TOKEN_PREFIX = "sk-";
const TOKEN_BODY = "certification" + "fixture" + "0001" + "abcd";

/** A provider token shape (sk- + long body) — assembled at runtime. */
export function providerTokenFixture(): string {
  return `${TOKEN_PREFIX}${TOKEN_BODY}${TOKEN_BODY}`;
}

// ---------------------------------------------------------------------------
// Surface fixture builders (deterministic, secret-free)
// ---------------------------------------------------------------------------

/** A benign client-renderable state tree (no secret material anywhere). */
export function cleanClientStateFixture(): Record<string, unknown> {
  return {
    view: "payments",
    outcomeAction: "pay",
    areas: ["overview", "payments"],
    status: "processing",
    evidenceRefs: ["evidence:run-1", "evidence:run-2"],
    vaultRef: "vault:opaque-credential-1",
  };
}

/** A state tree carrying secret-shaped material under forbidden keys. */
export function leakyClientStateFixture(): Record<string, unknown> {
  return {
    view: "settings",
    apiKey: rawKeyFixture(),
    nested: {
      clientSecret: providerTokenFixture(),
      note: "connect a provider",
    },
    recovery: mnemonic12Fixture(),
  };
}

/** A log line fixture whose field VALUE is a secret-shaped key (verbatim). */
export function leakyLogFixture(): Record<string, unknown> {
  return {
    level: "debug",
    keyMaterial: bareKeyFixture(),
  };
}

/** The deterministic instant every freshness fixture uses (explicit). */
export const FIXTURE_NOW = "2026-10-20T12:00:00Z" as const;
