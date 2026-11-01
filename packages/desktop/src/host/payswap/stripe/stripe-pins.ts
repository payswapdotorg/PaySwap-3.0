/**
 * PaySwap Desktop (P24-2, ADR-0017 D2/D5/D7) — the host-side Stripe
 * PINS: the by-value mirrors of the provider-runtime Stripe facts the
 * host action/event planes need (the provider-pins.ts precedent — the
 * desktop host tsconfig EMITS and therefore cannot import the
 * provider-runtime source; the mirror battery in
 * test/payswap/stripe-p242-mirrors.test.ts asserts field-for-field
 * fidelity against the REAL package).
 *
 * PINNED HERE (mirrors, never re-derived):
 * - the LEGACY request pin '2025-08-27.basil' (declaration.ts
 *   STRIPE_API_VERSION — ADR-0017 D2: NOT changed by P24);
 * - the catalogue release pin (spec-pin.ts STRIPE_OPENAPI_PIN);
 * - the Stripe server-key SHAPE vocabulary (capabilities.ts prefixes,
 *   extended with pk_/sk_org_/whsec_ structural recognition — handoff
 *   §2.3 + §13.2) — shape checks only, NEVER key validation (the probe
 *   does that);
 * - the census/effect/approval vocabularies (overlay.ts) for typed
 *   validation of injected census views.
 *
 * THE SECRET-SHAPE SCAN (handoff §9.11/§13.2): no credential-shaped
 * value may persist in any host record. `assertNoStripeSecretShapes`
 * scans serialized structures for FULL key shapes (prefix + payload
 * length) — nested and stringified — and THROWS (fail-closed, never
 * sanitized).
 */

/** Mirrors declaration.ts STRIPE_API_VERSION (the legacy request pin — unchanged by P24). */
export const PINNED_STRIPE_LEGACY_REQUEST_API_VERSION = "2025-08-27.basil" as const;

/** Mirrors spec-pin.ts STRIPE_OPENAPI_PIN (the pinned catalogue release). */
export const PINNED_STRIPE_CATALOGUE_PIN = Object.freeze({
  repository: "https://github.com/stripe/openapi",
  releaseTag: "v2596",
  releaseCommitSha: "aab1dee849cf4105b221c90132797891312b7ab2",
  releasePublishedAt: "2026-10-29T18:10:21Z",
  sourcePath: "latest/openapi.spec3.json",
  specInfoVersion: "2026-09-30.endive",
  specSha256: "9119e72c7ff8ad142e94f7efa9cf49d8e6eec69df3592e17e8fba15099726ed7",
  generatorId: "stripe-openapi-inventory-gen@1",
  /** The pinned operation counts (the census test re-verifies these). */
  operations: 644,
  v1Operations: 612,
  v2Operations: 32,
});

/** Mirrors capabilities.ts STRIPE_TEST_KEY_PREFIXES / STRIPE_LIVE_KEY_PREFIXES. */
export const PINNED_STRIPE_TEST_KEY_PREFIXES = ["rk_test_", "sk_test_"] as const;
export const PINNED_STRIPE_LIVE_KEY_PREFIXES = ["rk_live_", "sk_live_"] as const;

/**
 * The server-key SHAPE classes the host structurally recognizes
 * (handoff §2.3 + §13.2). Shape recognition is PREFIX-ONLY and never
 * validates a key: actual validation is ALWAYS the verification probe.
 */
export type StripeServerKeyShape =
  | "RESTRICTED_KEY"
  | "FULL_SECRET_KEY"
  | "ORGANIZATION_KEY"
  | "PUBLISHABLE_KEY"
  | "WEBHOOK_SIGNING_SECRET"
  | "UNKNOWN";

/** Structural key-shape classification (prefix only — never validation). */
export function stripeServerKeyShape(value: string): StripeServerKeyShape {
  if (typeof value !== "string" || value.length === 0) {
    return "UNKNOWN";
  }
  if (value.startsWith("sk_org_")) {
    return "ORGANIZATION_KEY";
  }
  if (value.startsWith("whsec_")) {
    return "WEBHOOK_SIGNING_SECRET";
  }
  if (value.startsWith("pk_test_") || value.startsWith("pk_live_")) {
    return "PUBLISHABLE_KEY";
  }
  if (value.startsWith("rk_test_") || value.startsWith("rk_live_")) {
    return "RESTRICTED_KEY";
  }
  if (value.startsWith("sk_test_") || value.startsWith("sk_live_")) {
    return "FULL_SECRET_KEY";
  }
  return "UNKNOWN";
}

/** The execution mode a key shape's prefix selects (mirrors stripeKeyMode). */
export function pinnedStripeKeyModeOf(value: string): "test" | "live" | null {
  if (value.startsWith("rk_test_") || value.startsWith("sk_test_")) {
    return "test";
  }
  if (value.startsWith("rk_live_") || value.startsWith("sk_live_")) {
    return "live";
  }
  return null;
}

/** Mirrors overlay.ts STRIPE_EFFECT_CLASSES. */
export const PINNED_STRIPE_EFFECT_CLASSES = [
  "READ_ONLY",
  "STRIPE_CONFIGURATION_WRITE",
  "CUSTOMER_COMMUNICATION",
  "FINANCIAL_CREATE",
  "FINANCIAL_IRREVERSIBLE_OR_REVERSAL",
  "PERMISSION_OR_CREDENTIAL_ADMIN",
] as const;
export type PinnedStripeEffectClass = (typeof PINNED_STRIPE_EFFECT_CLASSES)[number];

/** Mirrors overlay.ts STRIPE_APPROVAL_TIERS. */
export const PINNED_STRIPE_APPROVAL_TIERS = ["NONE", "CONFIRM", "STRONG_CONFIRM", "REAUTH"] as const;
export type PinnedStripeApprovalTier = (typeof PINNED_STRIPE_APPROVAL_TIERS)[number];

/** Mirrors overlay.ts STRIPE_SUPPORT_STATES. */
export const PINNED_STRIPE_SUPPORT_STATES = [
  "IMPLEMENTED",
  "IMPLEMENTED_WITH_LIMITS",
  "PLANNED_P24_INITIAL_RELEASE",
  "ACCOUNT_GATED",
  "OPERATOR_CONFIG_REQUIRED",
  "SANDBOX_TEST_HELPER_ONLY",
  "MANUAL_PROVIDER_UI_ONLY",
  "NOT_SUPPORTED_WITH_REASON",
  "DEPRECATED_OR_REMOVED",
] as const;
export type PinnedStripeSupportState = (typeof PINNED_STRIPE_SUPPORT_STATES)[number];

/** The IMPLEMENTED-class support states (mirrors stripeOverlayDispatchAllowed). */
export const PINNED_STRIPE_DISPATCHABLE_SUPPORT_STATES: readonly PinnedStripeSupportState[] =
  Object.freeze(["IMPLEMENTED", "IMPLEMENTED_WITH_LIMITS"]);

/** Mirrors webhook-signature.ts tolerance constants (the pinned scheme). */
export const PINNED_STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300 as const;
export const PINNED_STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS = 5 as const;
export const PINNED_STRIPE_WEBHOOK_VERIFIER_ID = "stripe-whsec-hmac-sha256-v1" as const;

/**
 * The RAK permission-string grammar the overlay's requiredPermissionRule
 * uses (mirror of overlay.ts permissionRuleOf): "<resource>: Read" or
 * "<resource>: Write" where the resource is the path-derived family in
 * camelCase — lowercase-first ('customers', 'paymentIntents') EXCEPT the
 * reviewed 'Account' special case. The grammar accepts ANY first-letter
 * case (the real overlay emits both forms); eligibility is an EXACT
 * string match against the census rule either way.
 */
const STRIPE_PERMISSION_PATTERN = /^[A-Za-z][A-Za-z0-9]*: (Read|Write)$/;

/** One parsed Stripe RAK permission (resource + access level). */
export interface ParsedStripePermission {
  readonly resource: string;
  readonly access: "Read" | "Write";
}

/** Parse one Stripe permission string (exact grammar — anything else is null). */
export function parsePinnedStripePermission(value: string): ParsedStripePermission | null {
  if (typeof value !== "string" || !STRIPE_PERMISSION_PATTERN.test(value)) {
    return null;
  }
  const colonAt = value.indexOf(":");
  return {
    resource: value.slice(0, colonAt),
    access: value.endsWith("Write") ? "Write" : "Read",
  };
}

/** The credential-shaped patterns the secret scan refuses (prefix + payload). */
const SECRET_SHAPE_PATTERNS: readonly RegExp[] = [
  /(?:^|[^A-Za-z0-9_])(?:rk|sk)_(?:test|live)_[A-Za-z0-9]{16,}/,
  /(?:^|[^A-Za-z0-9_])sk_org_[A-Za-z0-9]{16,}/,
  /(?:^|[^A-Za-z0-9_])whsec_[A-Za-z0-9]{16,}/,
  /(?:^|[^A-Za-z0-9_])pk_(?:test|live)_[A-Za-z0-9]{16,}/,
];

/** Does ONE string carry a full credential shape (embedded included)? */
export function carriesStripeSecretShape(value: string): boolean {
  return SECRET_SHAPE_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * The escape-scan gate for host records (fail-closed): serialize the
 * candidate (tolerating bigint + cycles, bounded), then scan EVERY
 * string leaf AND the serialized text for credential shapes — nested
 * serialized structures and key prefixes included (handoff §13.2). A
 * leak THROWS; it is never silently sanitized.
 */
export function assertNoStripeSecretShapes(value: unknown, context: string): void {
  const text = safeStringify(value);
  if (SECRET_SHAPE_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new Error(
      `a credential-shaped value leaked into ${context} (secret-scan refusal — the record is refused, never sanitized)`,
    );
  }
}

/** JSON stringify that tolerates bigint + cycles (bounded for the scan). */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, item) => {
      if (typeof item === "bigint") {
        return item.toString();
      }
      if (item !== null && typeof item === "object") {
        if (seen.has(item)) {
          return "[circular]";
        }
        seen.add(item);
      }
      return item;
    }) ?? "null";
  } catch {
    return "[unstringifiable]";
  }
}
