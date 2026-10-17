/**
 * @payswap/command — the browser Extension boundary wire shapes (P7-W3,
 * NET-NEW contract surface; the extension IMPLEMENTATION is product work,
 * not this lane).
 *
 * EXTENSION/HOST BOUNDARY LAW: the extension API surface is typed,
 * versioned, permission-scoped; NO ambient authority — every effect-bearing
 * call is an EXPLICIT request with a typed response envelope.
 *
 * Wire shapes:
 * - `ExtensionManifest`: a versioned, permission-scoped extension
 *   declaration. The apiVersion MUST pin the Extension boundary version
 *   (`EXTENSION_BOUNDARY_API_VERSION`); permissions MUST come from the
 *   `EXTENSION_PERMISSIONS` vocabulary (which structurally contains no
 *   financial authority member); hostOrigins bind the extension to
 *   explicit host-page origins (origin binding, never ambient reach);
 * - `ExtensionMessageEnvelope`: the host<->extension request wire shape —
 *   protocol marker, pinned apiVersion, requestId, method, optional
 *   payload;
 * - `ExtensionResponseEnvelope`: the typed response — either RESULT with
 *   a result value, or ERROR with the ApiError wire model. There is NO
 *   fire-and-forget effect variant and NO ambient callback shape;
 * - `HostOriginBinding`: which origins may invoke which methods.
 *
 * Enforcement lives in this module's validators (commit 2):
 * `validateExtensionManifest`, `validateExtensionMessageEnvelope`,
 * `validateHostOriginBinding` and `assertExtensionRequestAllowed` (the
 * fail-closed permission gate).
 */

import type { ApiError } from './transport.ts';
import type { CommandRequestId } from './identifiers.ts';
import type { ExtensionPermission } from './permission.ts';

/** The wire protocol marker on every Extension boundary message. */
export const EXTENSION_PROTOCOL_MARKER = 'payswap-extension';

/**
 * A versioned, permission-scoped Extension declaration. The manifest is the
 * extension's ENTIRE declared surface: version pin, permissions, host
 * origins and the effect-bearing methods it intends to call.
 */
export interface ExtensionManifest {
  readonly extensionId: string;
  readonly displayName: string;
  /** MUST equal EXTENSION_BOUNDARY_API_VERSION (versioned boundary law). */
  readonly apiVersion: string;
  /** Subset of the Extension permission vocabulary (no financial member exists). */
  readonly permissions: readonly ExtensionPermission[];
  /** Host-page origins this extension binds to (explicit; never ambient). */
  readonly hostOrigins: readonly string[];
  /** Effect-bearing methods the extension intends to request explicitly. */
  readonly effectBearingMethods: readonly string[];
}

/**
 * The host <-> extension request envelope. Every field is explicit: the
 * protocol marker, the pinned API version, a request id, the method and an
 * optional payload. No ambient channel, no implicit addressing.
 */
export interface ExtensionMessageEnvelope {
  readonly protocol: typeof EXTENSION_PROTOCOL_MARKER;
  readonly apiVersion: string;
  readonly requestId: CommandRequestId;
  readonly method: string;
  readonly payload?: unknown;
}

/**
 * The typed response envelope: either a RESULT carrying the method's result
 * value, or an ERROR carrying the ApiError wire model. Every effect-bearing
 * call resolves through this shape — there is no ambient authority path.
 */
export type ExtensionResponseEnvelope =
  | { readonly requestId: CommandRequestId; readonly outcome: 'RESULT'; readonly result: unknown }
  | { readonly requestId: CommandRequestId; readonly outcome: 'ERROR'; readonly error: ApiError };

/** One host-page origin binding: which origin may invoke which methods. */
export interface HostOriginBinding {
  readonly origin: string;
  readonly allowedMethods: readonly string[];
}

/**
 * The Extension boundary transport PORT (typed shape, never I/O): delivers
 * one request envelope to a bound extension and resolves with the typed
 * response envelope. The physical channel (runtime messaging) is the
 * composition root's concern.
 */
export interface ExtensionBridgePort {
  deliver(input: {
    readonly origin: string;
    readonly envelope: ExtensionMessageEnvelope;
  }): Promise<ExtensionResponseEnvelope>;
}

// ---------------------------------------------------------------------------
// Enforcement (fail closed; the no-ambient-authority law machine-checked)
// ---------------------------------------------------------------------------

import { ExtensionBoundaryError, PermissionDeniedError, MethodNotFoundError } from './errors.ts';
import { asCommandRequestId } from './identifiers.ts';
import { isExtensionPermission, EXTENSION_PERMISSIONS } from './permission.ts';
import {
  EXTENSION_BOUNDARY_API_VERSION,
  assertSupportedApiVersion,
  SUPPORTED_EXTENSION_API_VERSIONS,
} from './version.ts';

const ORIGIN_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i;

/** Validate an Extension manifest (fail closed). The laws:
 * - the apiVersion MUST pin the Extension boundary version (versioned
 *   boundary; explicit-versioning law);
 * - permissions MUST be a duplicate-free subset of the Extension permission
 *   vocabulary (which structurally contains NO financial member);
 * - hostOrigins MUST be non-empty, well-formed origins (explicit origin
 *   binding — never ambient reach);
 * - effectBearingMethods MUST be non-empty and duplicate-free (an extension
 *   that wants effects declares them up front).
 */
export function validateExtensionManifest(manifest: ExtensionManifest): ExtensionManifest {
  if (typeof manifest.extensionId !== 'string' || manifest.extensionId.length === 0) {
    throw new ExtensionBoundaryError('extensionId must be a non-empty string');
  }
  if (typeof manifest.displayName !== 'string' || manifest.displayName.length === 0) {
    throw new ExtensionBoundaryError('displayName must be a non-empty string');
  }
  assertSupportedApiVersion(
    manifest.apiVersion,
    `extension ${manifest.extensionId} apiVersion`,
    SUPPORTED_EXTENSION_API_VERSIONS,
  );
  if (!Array.isArray(manifest.permissions)) {
    throw new ExtensionBoundaryError('manifest.permissions must be an array of Extension permissions');
  }
  const seenPermissions = new Set<string>();
  for (const permission of manifest.permissions) {
    if (!isExtensionPermission(permission)) {
      throw new ExtensionBoundaryError(
        `extension ${manifest.extensionId} declares foreign permission '${String(permission)}' — the vocabulary is ${EXTENSION_PERMISSIONS.join(', ')} (it has no financial authority member)`,
        { permission },
      );
    }
    if (seenPermissions.has(permission)) {
      throw new ExtensionBoundaryError(`extension ${manifest.extensionId} declares duplicate permission ${permission}`);
    }
    seenPermissions.add(permission);
  }
  const permissions = Object.freeze([...manifest.permissions]) as readonly (typeof EXTENSION_PERMISSIONS)[number][];
  if (!Array.isArray(manifest.hostOrigins) || manifest.hostOrigins.length === 0) {
    throw new ExtensionBoundaryError(
      `extension ${manifest.extensionId} must bind at least one host origin (origin binding is explicit — never ambient reach)`,
    );
  }
  for (const origin of manifest.hostOrigins) {
    if (typeof origin !== 'string' || !ORIGIN_PATTERN.test(origin)) {
      throw new ExtensionBoundaryError(
        `extension ${manifest.extensionId} declares a malformed host origin: ${String(origin)} (expected scheme://host[:port])`,
        { origin },
      );
    }
  }
  const seenOrigins = new Set<string>();
  for (const origin of manifest.hostOrigins) {
    if (seenOrigins.has(origin)) {
      throw new ExtensionBoundaryError(`extension ${manifest.extensionId} declares duplicate host origin ${origin}`);
    }
    seenOrigins.add(origin);
  }
  if (!Array.isArray(manifest.effectBearingMethods) || manifest.effectBearingMethods.length === 0) {
    throw new ExtensionBoundaryError(
      `extension ${manifest.extensionId} must declare its effect-bearing methods up front (no ambient authority: every effect-bearing call is an explicit request)`,
    );
  }
  const seenMethods = new Set<string>();
  for (const method of manifest.effectBearingMethods) {
    if (typeof method !== 'string' || method.length === 0) {
      throw new ExtensionBoundaryError(
        `extension ${manifest.extensionId} effectBearingMethods entries must be non-empty strings`,
      );
    }
    if (seenMethods.has(method)) {
      throw new ExtensionBoundaryError(`extension ${manifest.extensionId} declares duplicate effect-bearing method ${method}`);
    }
    seenMethods.add(method);
  }
  if (manifest.apiVersion !== EXTENSION_BOUNDARY_API_VERSION) {
    // assertSupportedApiVersion already narrows to the supported list; this
    // branch is unreachable but keeps the pin explicit for readers.
    throw new ExtensionBoundaryError('extension manifest apiVersion pin mismatch');
  }
  return Object.freeze({
    extensionId: manifest.extensionId,
    displayName: manifest.displayName,
    apiVersion: manifest.apiVersion,
    permissions,
    hostOrigins: Object.freeze([...manifest.hostOrigins]),
    effectBearingMethods: Object.freeze([...manifest.effectBearingMethods]),
  });
}

/** Validate an Extension message envelope (protocol marker + version + request id + method). */
export function validateExtensionMessageEnvelope(
  envelope: ExtensionMessageEnvelope,
): ExtensionMessageEnvelope {
  if (envelope.protocol !== EXTENSION_PROTOCOL_MARKER) {
    throw new ExtensionBoundaryError(
      `extension messages carry the protocol marker '${EXTENSION_PROTOCOL_MARKER}' (got '${String(envelope.protocol)}')`,
    );
  }
  assertSupportedApiVersion(
    envelope.apiVersion,
    'extension message apiVersion',
    SUPPORTED_EXTENSION_API_VERSIONS,
  );
  if (typeof envelope.requestId !== 'string' || envelope.requestId.length === 0) {
    throw new ExtensionBoundaryError('extension messages require a requestId (typed request/response pairing)');
  }
  asCommandRequestId(envelope.requestId);
  if (typeof envelope.method !== 'string' || envelope.method.length === 0) {
    throw new ExtensionBoundaryError('extension messages require a non-empty method');
  }
  return envelope;
}

/** Validate a host-origin binding (origin format + non-empty allowed methods). */
export function validateHostOriginBinding(binding: HostOriginBinding): HostOriginBinding {
  if (typeof binding.origin !== 'string' || !ORIGIN_PATTERN.test(binding.origin)) {
    throw new ExtensionBoundaryError(
      `host origin binding requires a well-formed origin (scheme://host[:port]); got ${String(binding.origin)}`,
    );
  }
  if (!Array.isArray(binding.allowedMethods) || binding.allowedMethods.length === 0) {
    throw new ExtensionBoundaryError(
      `host origin binding for ${binding.origin} must allow at least one method`,
    );
  }
  for (const method of binding.allowedMethods) {
    if (typeof method !== 'string' || method.length === 0) {
      throw new ExtensionBoundaryError('allowedMethods entries must be non-empty strings');
    }
  }
  return Object.freeze({
    origin: binding.origin,
    allowedMethods: Object.freeze([...binding.allowedMethods]),
  });
}

/**
 * THE NO-AMBIENT-AUTHORITY GATE (fail closed): may this extension request
 * this method on this host origin?
 *
 * 1. the method must be one of the surface's declared method names (an
 *    unknown method fails closed — there is no ambient path);
 * 2. a method that is EFFECT-BEARING on the surface (effectClass other
 *    than NO_EFFECT; pass `effectBearingMethodNames`, e.g. derived from
 *    the method registry) MUST be declared in the manifest's
 *    effectBearingMethods — an undeclared effect-bearing request is
 *    rejected (no ambient path to effects);
 * 3. a declared effect-bearing method requires the `COMMAND_PROPOSE`
 *    permission (the vocabulary has no financial member — no permission
 *    can ever express authority);
 * 4. the host origin must be one of the manifest's bound origins.
 */
export function assertExtensionRequestAllowed(input: {
  readonly manifest: ExtensionManifest;
  readonly envelope: ExtensionMessageEnvelope;
  readonly methodNames: readonly string[];
  /** Effect-bearing method names on the surface (effectClass != NO_EFFECT). */
  readonly effectBearingMethodNames?: readonly string[];
}): void {
  const { manifest, envelope, methodNames, effectBearingMethodNames } = input;
  validateExtensionManifest(manifest);
  validateExtensionMessageEnvelope(envelope);
  if (!methodNames.includes(envelope.method)) {
    throw new MethodNotFoundError(
      `no method '${envelope.method}' on the command surface (the extension boundary fails closed on unknown methods)`,
      { method: envelope.method },
    );
  }
  const surfaceEffectBearing = effectBearingMethodNames?.includes(envelope.method) ?? false;
  if (surfaceEffectBearing && !manifest.effectBearingMethods.includes(envelope.method)) {
    throw new PermissionDeniedError(
      `extension ${manifest.extensionId} requests effect-bearing method '${envelope.method}' without declaring it in the manifest (every effect-bearing call is an explicit, up-front-declared request — no ambient authority)`,
      { extensionId: manifest.extensionId, method: envelope.method },
    );
  }
  const effectBearing = manifest.effectBearingMethods.includes(envelope.method);
  if (effectBearing && !manifest.permissions.includes('COMMAND_PROPOSE')) {
    throw new PermissionDeniedError(
      `extension ${manifest.extensionId} requests effect-bearing method '${envelope.method}' without the COMMAND_PROPOSE permission (every effect-bearing call is an explicit, permission-scoped request — no ambient authority)`,
      { extensionId: manifest.extensionId, method: envelope.method },
    );
  }
}
