/**
 * @payswap/command — developer/external-agent API wire shapes (P7-W3).
 *
 * Developer and external-agent APIs are CONTRACTS: versioned,
 * deterministic, total-error (fail-closed), with EXPLICIT capability
 * disclosure (the work-order law). Wire shapes:
 *
 * - `DeveloperApiDescriptor`: a versioned API surface declaration composed
 *   of method descriptors (the registry vocabulary). The apiVersion is an
 *   explicit pin — there is no implicit/unversioned default;
 * - `DeveloperCapability`: one disclosed capability block (what the API
 *   can do, and which methods expose it) — the disclosure artifact
 *   external consumers render;
 * - `ExternalAgentApiView`: the agent-visible projection — ONLY methods
 *   with `agentCallable: true`, each carrying its REQUIRED authority
 *   declaration. An external agent never receives an unrestricted surface
 *   (INV-9; the authority-firewall law).
 *
 * Disclosure/projection/validation implementations: commit 2
 * (`describeDeveloperApi`, `projectExternalAgentApi`,
 * `validateDeveloperApi`).
 */

import type { MethodDescriptor } from './method-registry.ts';
import type { AuthorityScope } from './permission.ts';

/**
 * A versioned developer API surface: the methods, the pin, the title.
 * Validated deterministically by `validateDeveloperApi` (commit 2).
 */
export interface DeveloperApiDescriptor {
  /** Explicit API version pin (no implicit default; explicit-versioning law). */
  readonly apiVersion: string;
  readonly title: string;
  readonly methods: readonly MethodDescriptor[];
}

/** One disclosed capability block of the developer API surface. */
export interface DeveloperCapability {
  /** Stable capability id (e.g. `payments.proposals`). */
  readonly capability: string;
  readonly description: string;
  /** The methods that expose this capability (deterministic order). */
  readonly methods: readonly string[];
}

/**
 * The external-agent API projection: the agent-visible methods plus the
 * authority each REQUIRES (never granted by the view; declared so the
 * agent knows what must already be held out of band).
 */
export interface ExternalAgentApiView {
  readonly apiVersion: string;
  readonly agentCallableMethods: readonly MethodDescriptor[];
  /** methodName -> required authority (present for every agent-callable method). */
  readonly requiredAuthorityByMethod: Readonly<Record<string, AuthorityScope>>;
}

// ---------------------------------------------------------------------------
// Disclosure + projection + validation (deterministic, fail closed)
// ---------------------------------------------------------------------------

import { ValidationError, CommandError } from './errors.ts';
import { validateMethodDescriptor } from './method-registry.ts';
import { validateAuthorityScope } from './permission.ts';
import { assertSupportedApiVersion } from './version.ts';

/** Validate a developer API descriptor (the contract laws, fail closed):
 * - the apiVersion is an explicit, supported pin (no implicit default);
 * - the title is non-empty;
 * - every method descriptor passes the registry validation laws (unique
 *   names, no financial effect class, idempotency discipline, agent
 *   visibility requires declared authority).
 */
export function validateDeveloperApi(descriptor: DeveloperApiDescriptor): DeveloperApiDescriptor {
  if (typeof descriptor.title !== 'string' || descriptor.title.length === 0) {
    throw new ValidationError('developer API descriptor requires a non-empty title');
  }
  assertSupportedApiVersion(descriptor.apiVersion, 'developer API apiVersion');
  if (!Array.isArray(descriptor.methods)) {
    throw new ValidationError('developer API descriptor requires a methods array');
  }
  const seen = new Set<string>();
  for (const method of descriptor.methods) {
    validateMethodDescriptor(method);
    if (seen.has(method.methodName)) {
      throw new ValidationError(`duplicate method name in developer API: ${method.methodName}`);
    }
    seen.add(method.methodName);
  }
  return descriptor;
}

/**
 * EXPLICIT CAPABILITY DISCLOSURE (deterministic): one capability block per
 * domain of the method registry, methods in sorted order — the
 * machine-renderable "what can this API do" artifact. Pure: same
 * descriptor -> deep-equal output.
 */
export function describeDeveloperApi(
  descriptor: DeveloperApiDescriptor,
): readonly DeveloperCapability[] {
  validateDeveloperApi(descriptor);
  const byDomain = new Map<string, string[]>();
  for (const method of descriptor.methods) {
    const domain = method.methodName.split('.')[0] ?? 'general';
    const bucket = byDomain.get(domain) ?? [];
    bucket.push(method.methodName);
    byDomain.set(domain, bucket);
  }
  return Object.freeze(
    [...byDomain.keys()].sort().map((domain) => {
      const methods = (byDomain.get(domain) ?? []).sort();
      return Object.freeze({
        capability: `${domain}.surface`,
        description: `The ${domain} surface of the command API (explicit capability disclosure; effect classes on every method).`,
        methods: Object.freeze(methods),
      });
    }),
  );
}

/**
 * THE EXTERNAL-AGENT PROJECTION: ONLY `agentCallable` methods, each
 * carrying its REQUIRED authority declaration. An external agent never
 * receives an unrestricted surface (INV-9; the authority-firewall law —
 * the view DECLARES what must already be held out of band; it never
 * grants anything). Deterministic: methods in sorted order.
 */
export function projectExternalAgentApi(
  descriptor: DeveloperApiDescriptor,
): ExternalAgentApiView {
  validateDeveloperApi(descriptor);
  const agentCallableMethods = descriptor.methods
    .filter((method) => method.agentCallable)
    .sort((a, b) => (a.methodName < b.methodName ? -1 : a.methodName > b.methodName ? 1 : 0));
  const requiredAuthorityByMethod: Record<string, AuthorityScope> = {};
  for (const method of agentCallableMethods) {
    if (method.requiredAuthority === undefined) {
      // validateMethodDescriptor already enforces this; the projection
      // fails closed rather than skipping silently (total-error law).
      throw new CommandError({
        code: 'AGENT_METHOD_WITHOUT_AUTHORITY',
        category: 'INTERNAL',
        message: `agentCallable method ${method.methodName} lacks requiredAuthority — refusing to project an unrestricted agent tool`,
      });
    }
    requiredAuthorityByMethod[method.methodName] = validateAuthorityScope(
      method.requiredAuthority,
      `method ${method.methodName} requiredAuthority`,
    );
  }
  return Object.freeze({
    apiVersion: descriptor.apiVersion,
    agentCallableMethods: Object.freeze([...agentCallableMethods]),
    requiredAuthorityByMethod: Object.freeze({ ...requiredAuthorityByMethod }),
  });
}
