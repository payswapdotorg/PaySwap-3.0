/**
 * @payswap/provider-runtime — the Stripe OpenAPI catalogue PIN (P24-0).
 *
 * ADR-0017 D2 (BINDING): the canonical Stripe operation inventory is
 * generated, at development time, from ONE version-pinned copy of Stripe's
 * official GA OpenAPI specification. The spec file is committed at
 * catalogue/spec/openapi.spec3.json; nothing fetches a mutable URL at
 * application runtime.
 *
 * THE PIN (source-verified 2026-10-31, station Task 177 / P24-0):
 * - Repository: github.com/stripe/openapi (public).
 * - Release tag: v2596 — the newest GA release at dispatch (GitHub API,
 *   PAT-authenticated; published 2026-10-29T18:10:21Z).
 * - Release commit: aab1dee849cf4105b221c90132797891312b7ab2
 *   ("Update OpenAPI specification for private preview").
 * - Source file: latest/openapi.spec3.json — per the repository's own
 *   latest/README.md this is the GA spec "matching the public Stripe API
 *   (v1 and v2 endpoints)" in one file. The sibling spec3.sdk.* files are
 *   "expanded … intended for Stripe-internal use" and are NOT the
 *   connector's canonical source (their extra v2 money-management surface
 *   is recorded as the SDK-family delta below, never silently exposed).
 * - Spec info.version: 2026-09-30.endive. THE HANDOFF RECONCILIATION (the
 *   honest correction, recorded in ADR-0017 D2): the handoff named
 *   "2026-10-28.endive" as the v2596 GA version — that version string
 *   belongs to the SDK-spec family (the release notes table pins
 *   openapi/spec3.sdk.* to 2026-10-28.endive). The PUBLIC GA spec at the
 *   same release is 2026-09-30.endive. The connector pins the public spec
 *   and its coherent version; adopting a newer request version is a
 *   migration decision, not a constant swap.
 * - SHA-256: 9119e72c7ff8ad142e94f7efa9cf49d8e6eec69df3592e17e8fba15099726ed7
 * - Observed shape at pin time: 454 paths (431 v1 + 23 v2), 644 operations
 *   (612 v1 + 32 v2), every operation carries an operationId.
 *
 * Migration law (handoff §5.2 + ADR-0008): the EXISTING adapter request
 * version STRIPE_API_VERSION ('2025-08-27.basil') is unchanged by this pin;
 * per-connection API-version state and the tested migration path to the
 * catalogue version are defined by ADR-0017 D2/D6. A new pin never rewrites
 * history: generate → diff → review → adopt.
 */

/** The pinned release identity (github.com/stripe/openapi). */
export const STRIPE_OPENAPI_PIN = Object.freeze({
  repository: 'https://github.com/stripe/openapi',
  releaseTag: 'v2596',
  releaseCommitSha: 'aab1dee849cf4105b221c90132797891312b7ab2',
  releasePublishedAt: '2026-10-29T18:10:21Z',
  sourcePath: 'latest/openapi.spec3.json',
  sourceUrl:
    'https://raw.githubusercontent.com/stripe/openapi/v2596/latest/openapi.spec3.json',
  specInfoVersion: '2026-09-30.endive',
  specSha256: '9119e72c7ff8ad142e94f7efa9cf49d8e6eec69df3592e17e8fba15099726ed7',
  /** The local committed copy (relative to this module). */
  specFilePath: './spec/openapi.spec3.json',
  /** The committed generated inventory (the generator's deterministic output). */
  inventoryPath: './operations.json',
  /** Generator identity recorded with the inventory for reproducibility. */
  generatorId: 'stripe-openapi-inventory-gen@1',
});

/**
 * The SDK-family delta recorded for honest disclosure (NOT exposed as GA):
 * the v2596 SDK specs (openapi.spec3.sdk.json, info.version
 * 2026-10-28.endive, SHA-256
 * 6d489f59cb1699bf11e131e557062675213ff44f387597e33424f636a2ae68a4) carry
 * 59 operations absent from the public spec — predominantly the v2
 * money-management / vault surface (financial accounts, addresses,
 * inbound/outbound transfers…) plus other Stripe-internal expansions, and
 * they DROP 53 deprecated-but-public legacy v1 operations. None of those
 * differences are reachable through this connector until a reviewed pin
 * change says so.
 */
export const STRIPE_OPENAPI_SDK_FAMILY_DELTA_NOTE =
  'The v2596 SDK-spec family (2026-10-28.endive) adds 59 Stripe-internal/v2 money-management operations and drops 53 deprecated public legacy v1 operations relative to the pinned public GA spec; it is recorded as disclosure only and is not part of the connector catalogue.' as const;

/** The observed counts at pin time (the census test re-verifies these). */
export const STRIPE_OPENAPI_PIN_COUNTS = Object.freeze({
  paths: 454,
  v1Paths: 431,
  v2Paths: 23,
  operations: 644,
  v1Operations: 612,
  v2Operations: 32,
});
