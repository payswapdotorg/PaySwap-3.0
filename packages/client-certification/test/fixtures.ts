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

import type {
  BrowserRunObservation,
  ClientCertificationSubject,
  SecretBoundaryProbes,
} from "../src/index.ts";
import { BROWSER_VERIFICATION_CHECKS, makeReferenceScrubber } from "../src/index.ts";

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

// ---------------------------------------------------------------------------
// The fully honest certification subject (the composed-run fixture)
// ---------------------------------------------------------------------------

/**
 * A subject that satisfies every hard law — the composed run's PASS
 * fixture. Every input is deterministic; secret-bearing scrubber probes
 * are assembled at runtime above.
 */
export function honestSubjectFixture(): ClientCertificationSubject {
  return {
    surfaceId: "web:payswap-app",
    surfaceKind: "web",
    consequentialStates: [
      {
        stateId: "payment.settled",
        label: "Payment settled",
        kind: "known-success",
        evidenceRefs: ["evidence:settlement-1"],
        renderTone: "ok",
        dataPath: "live",
      },
      {
        stateId: "payment.unknown",
        label: "Outcome not yet known",
        kind: "unknown",
        unknownReason: "The provider has not returned a terminal state",
        reconciliationRef: "reconciliation:case-1",
        renderTone: "unknown",
        dataPath: "live",
      },
    ],
    secretBoundary: {
      probes: cleanClientStateProbeFixture(),
      scrubber: makeReferenceScrubber(),
      scrubberProbes: [leakyClientStateFixture()],
    },
    deadAction: {
      actions: [
        {
          actionId: "payments.submit",
          area: "payments",
          label: "Send payment",
          contractRefs: ["contract:payment.execute"],
          acceptsInput: true,
          promisesOutcome: "success",
        },
      ],
      contracts: [
        { contractId: "contract:payment.execute", effectRefs: ["effect:settlement.dispatch"] },
      ],
      effects: [
        {
          effectId: "effect:settlement.dispatch",
          kind: "payment-execution",
          evidenceRefs: ["evidence:settlement-1"],
        },
      ],
    },
    recipientAuthorization: {
      authorization: {
        authorizationId: "auth:payment-1",
        boundRecipientId: "recipient:original",
        approvedQuoteRef: "quote:conditions-1",
        eligibilityObservationVersion: 3,
        quoteVersion: 5,
        status: "ACTIVE",
      },
      change: {
        changeId: "change:recipient-1",
        kind: "RECIPIENT_CHANGED",
        newRecipientId: "recipient:new",
        detectedAt: FIXTURE_NOW,
      },
      display: {
        carriesPriorAuthorization: false,
        eligibility: {
          observationVersion: 4,
          subjectRecipientId: "recipient:new",
          observedAt: "2026-10-20T12:05:00Z",
        },
        quote: {
          quoteVersion: 6,
          subjectRecipientId: "recipient:new",
          freshness: "VALID",
          issuedAt: "2026-10-20T12:06:00Z",
        },
      },
    },
    sandboxLive: {
      ambientModeInheritance: false,
      states: [
        {
          stateId: "live.checkout.settled",
          environment: "live",
          presentsAs: "live",
          declaresLiveFinality: true,
          credentialRefs: ["vault:live-credential-1"],
        },
      ],
      credentialBindings: [
        {
          credentialRef: "vault:live-credential-1",
          environment: "live",
          custody: "vault-only",
        },
      ],
    },
    accessibility: [
      {
        elementId: "payments.submit.button",
        role: "button",
        name: "Send payment",
        nameLineage: ["content:Send payment"],
        pointerPath: ["click"],
        keyboardPath: ["Enter", "Space"],
        stateChanging: true,
        announcesStateChanges: true,
        declaredContrastRatio: 4.5,
        textClass: "normal",
      },
    ],
    responsive: [
      {
        elementId: "payments.submit.button",
        interactive: true,
        perDeviceClass: [
          { deviceClass: "mobile", touchTargetPx: 48 },
          { deviceClass: "tablet", touchTargetPx: 48 },
          { deviceClass: "desktop", touchTargetPx: 44 },
        ],
      },
    ],
    browserVerification: honestBrowserRunFixture(),
  };
}

/** The clean four-probe boundary fixture (shared with the law-1 tests). */
export function cleanClientStateProbeFixture(): SecretBoundaryProbes {
  return {
    clientRenderableState: cleanClientStateFixture(),
    modelVisibleContext: { question: "what is the payment status?", refs: ["attempt:1"] },
    logs: [{ level: "info", message: "rendered payments view" }],
    artifacts: [
      {
        artifactId: "screenshot:payments",
        strength: "BROWSER_UNAUTHENTICATED_PROVENANCE",
      },
    ],
  };
}

/** An honest recorded browser run (the Gate D form, all six checks). */
export function honestBrowserRunFixture(): BrowserRunObservation {
  return {
    surfaceId: "web:payswap-app",
    codeIdentity: "f9392a3",
    performedChecks: [...BROWSER_VERIFICATION_CHECKS],
    areasObserved: [
      "overview",
      "payments",
      "accounts",
      "activity",
      "opportunities",
      "connections",
      "capabilities",
      "security",
      "reports",
      "developers",
      "settings",
    ],
    viewportsVerified: [
      { widthPx: 390, heightPx: 844 },
      { widthPx: 820, heightPx: 1180 },
      { widthPx: 1280, heightPx: 800 },
    ],
    consoleErrors: [
      {
        message: "CORS-blocked client-config fetch from localhost origin",
        classification: "environmental",
        documentedLimitation: true,
      },
    ],
    keyInteractions: [
      {
        interactionId: "submit-payment",
        description: "Submit the payment through the validated request envelope",
        expectedArea: "payments",
        correlatedProtocolId: "commandId",
      },
    ],
    screenshots: [
      {
        evidenceId: "screenshot:payments",
        strength: "BROWSER_UNAUTHENTICATED_PROVENANCE",
      },
    ],
    realWiringEvidenceRefs: ["evidence:api-wiring-1"],
  };
}
