/**
 * @payswap/command — the command method registry wire shapes (P7-W3).
 *
 * The typed METHOD REGISTRY contract: the deterministic table of methods
 * every command-surface consumer (Web, Desktop, Extension, SDK, external
 * agent) dispatches through. Adapted from the old repository's REST route
 * table + MCP tool descriptors, unified as ONE registry vocabulary with:
 *
 * - an EXPLICIT effect-class vocabulary: `NO_EFFECT | OBSERVATION |
 *   PROPOSAL`. THE LAW: the vocabulary contains NO financial-execute
 *   member — a method descriptor CANNOT express "executes", "settles",
 *   "transfers" or "signs" money. A method that changes state is a
 *   PROPOSAL (the proposal still requires the trust lane's authorization;
 *   the authority-firewall law). Machine-checked;
 * - idempotency discipline at the contract level: every effect-bearing
 *   method (OBSERVATION with side effects or PROPOSAL) must declare
 *   `idempotencyRelevant: true` (INV-6);
 * - permission scoping: effect-bearing methods declare the Extension
 *   permission they require (typed vocabulary);
 * - capability disclosure: input/output JSON schemas and a description on
 *   every method — the registry IS the disclosure artifact;
 * - agent visibility is EXPLICIT: `agentCallable: true` requires a
 *   declared `requiredAuthority` (never an unrestricted agent tool).
 */

import type { AuthorityScope, ExtensionPermission } from './permission.ts';
import type { JsonSchema } from './agent-interaction.ts';
import type { RequestAuth } from './transport.ts';

/**
 * THE effect-class vocabulary (pinned wire vocabulary). Structurally
 * contains NO financial-execute member: the command surface never carries
 * financial authorization. NO_EFFECT = read-only/pure; OBSERVATION =
 * observes external state (evidence, never authorization); PROPOSAL =
 * submits a typed proposal input (authorization happens out of band on
 * the trust lane).
 */
export const METHOD_EFFECT_CLASSES = ['NO_EFFECT', 'OBSERVATION', 'PROPOSAL'] as const;

export type MethodEffectClass = (typeof METHOD_EFFECT_CLASSES)[number];

/** Narrow an unknown value to a MethodEffectClass. */
export function isMethodEffectClass(value: unknown): value is MethodEffectClass {
  return typeof value === 'string' && (METHOD_EFFECT_CLASSES as readonly string[]).includes(value);
}

/**
 * One method of the command surface. The disclosure artifact: name,
 * description, input/output JSON schemas, effect class, idempotency
 * relevance, required permission, accepted auth schemes and explicit
 * agent visibility.
 */
export interface MethodDescriptor {
  /** Registry-unique method name (e.g. `payments.intent.propose`). */
  readonly methodName: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly outputSchema: JsonSchema;
  readonly effectClass: MethodEffectClass;
  /**
   * REQUIRED true on effect-bearing methods (INV-6 discipline at the
   * contract level): one idempotency key maps to one authoritative result.
   */
  readonly idempotencyRelevant: boolean;
  /** Required Extension permission for effect-bearing methods (absent = none). */
  readonly requiredPermission?: ExtensionPermission;
  /** Auth schemes this method accepts (non-empty). */
  readonly authSchemes: readonly RequestAuth['scheme'][];
  /** Explicit: may an external agent call this method? */
  readonly agentCallable: boolean;
  /** REQUIRED when agentCallable (never an unrestricted agent tool; INV-9). */
  readonly requiredAuthority?: AuthorityScope;
}

/** A frozen, validated method registry: the deterministic dispatch table. */
export interface CommandMethodRegistry {
  /** The API version the registry is pinned to. */
  readonly apiVersion: string;
  /** Method names in deterministic sorted order. */
  readonly methodNames: readonly string[];
  /** Look up one descriptor (undefined when absent — callers fail closed). */
  lookup(methodName: string): MethodDescriptor | undefined;
  /** Every descriptor in deterministic sorted order (capability disclosure). */
  listMethods(): readonly MethodDescriptor[];
}

// ---------------------------------------------------------------------------
// Registry construction + validation (deterministic, fail closed)
// ---------------------------------------------------------------------------

import { ValidationError, CommandError } from './errors.ts';
import { validateAuthorityScope, isExtensionPermission } from './permission.ts';
import { assertSupportedApiVersion } from './version.ts';

const METHOD_NAME_PATTERN = /^[a-z0-9]+(?:\.[a-z0-9_-]+)+$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireSchema(value: unknown, subject: string): JsonSchema {
  if (!isObject(value) || Object.keys(value).length === 0) {
    throw new ValidationError(`${subject} must be a non-empty JSON schema object (capability disclosure)`);
  }
  return value;
}

/**
 * Validate one method descriptor against the registry laws (fail closed):
 * - registry-unique, dotted-lowercase method name;
 * - effectClass from the pinned vocabulary (which structurally contains NO
 *   financial-execute member — a method cannot express money execution);
 * - effect-bearing methods (OBSERVATION/PROPOSAL) MUST declare
 *   `idempotencyRelevant: true` (INV-6 discipline at the contract level);
 * - effect-bearing methods MUST declare a required Extension permission
 *   from the typed vocabulary (no ambient authority);
 * - non-empty auth schemes;
 * - `agentCallable: true` REQUIRES a declared `requiredAuthority` (an
 *   external agent never receives an unrestricted tool — INV-9).
 */
export function validateMethodDescriptor(descriptor: MethodDescriptor): MethodDescriptor {
  if (typeof descriptor.methodName !== 'string' || !METHOD_NAME_PATTERN.test(descriptor.methodName)) {
    throw new ValidationError(
      'methodName must be a dotted lowercase path (e.g. payments.intent.propose)',
      { methodName: descriptor.methodName },
    );
  }
  if (typeof descriptor.description !== 'string' || descriptor.description.length === 0) {
    throw new ValidationError(`method ${descriptor.methodName} requires a description (capability disclosure)`);
  }
  requireSchema(descriptor.inputSchema, `method ${descriptor.methodName} inputSchema`);
  requireSchema(descriptor.outputSchema, `method ${descriptor.methodName} outputSchema`);
  if (!isMethodEffectClass(descriptor.effectClass)) {
    throw new ValidationError(
      `method ${descriptor.methodName} declares foreign effectClass '${String(descriptor.effectClass)}' — the pinned vocabulary is ${METHOD_EFFECT_CLASSES.join(' | ')} (there is NO financial-execute member; the command surface never carries financial authority)`,
      { effectClass: descriptor.effectClass },
    );
  }
  const effectBearing = descriptor.effectClass !== 'NO_EFFECT';
  if (effectBearing && descriptor.idempotencyRelevant !== true) {
    throw new ValidationError(
      `method ${descriptor.methodName} is effect-bearing (${descriptor.effectClass}) and must declare idempotencyRelevant: true (INV-6: state-changing commands are idempotent and replay-safe)`,
    );
  }
  if (effectBearing && descriptor.requiredPermission === undefined) {
    throw new ValidationError(
      `method ${descriptor.methodName} is effect-bearing (${descriptor.effectClass}) and must declare a requiredPermission from the Extension permission vocabulary (no ambient authority)`,
    );
  }
  if (
    descriptor.requiredPermission !== undefined &&
    !isExtensionPermission(descriptor.requiredPermission)
  ) {
    throw new ValidationError(
      `method ${descriptor.methodName} declares a foreign requiredPermission '${String(descriptor.requiredPermission)}'`,
    );
  }
  if (!Array.isArray(descriptor.authSchemes) || descriptor.authSchemes.length === 0) {
    throw new ValidationError(`method ${descriptor.methodName} must accept at least one auth scheme`);
  }
  if (descriptor.agentCallable) {
    if (descriptor.requiredAuthority === undefined) {
      throw new ValidationError(
        `method ${descriptor.methodName} is agentCallable and MUST declare requiredAuthority (never an unrestricted agent tool; INV-9)`,
      );
    }
    validateAuthorityScope(descriptor.requiredAuthority, `method ${descriptor.methodName} requiredAuthority`);
  }
  return descriptor;
}

/**
 * Build the deterministic command method registry: validates every
 * descriptor, rejects duplicate method names, pins the API version
 * (explicit-versioning law) and exposes sorted-order disclosure.
 */
export function buildMethodRegistry(
  descriptors: readonly MethodDescriptor[],
  options: { readonly apiVersion: string },
): CommandMethodRegistry {
  assertSupportedApiVersion(options.apiVersion, 'registry apiVersion');
  const byName = new Map<string, MethodDescriptor>();
  for (const descriptor of descriptors) {
    validateMethodDescriptor(descriptor);
    if (byName.has(descriptor.methodName)) {
      throw new ValidationError(
        `duplicate method name in registry: ${descriptor.methodName} (registry names are unique)`,
      );
    }
    byName.set(descriptor.methodName, Object.freeze({ ...descriptor }));
  }
  const methodNames = Object.freeze([...byName.keys()].sort());
  return Object.freeze({
    apiVersion: options.apiVersion,
    methodNames,
    lookup(methodName: string): MethodDescriptor | undefined {
      return byName.get(methodName);
    },
    listMethods(): readonly MethodDescriptor[] {
      return methodNames.map((name) => byName.get(name) as MethodDescriptor);
    },
  });
}

/**
 * Fail-closed registry lookup: an absent method throws
 * `MethodNotFoundError` (total-error law — never a silent null dispatch).
 */
export function requireMethod(registry: CommandMethodRegistry, methodName: string): MethodDescriptor {
  const descriptor = registry.lookup(methodName);
  if (descriptor === undefined) {
    throw new CommandError({
      code: 'METHOD_NOT_FOUND',
      category: 'NOT_FOUND',
      message: `no method '${methodName}' in the command method registry (apiVersion ${registry.apiVersion})`,
      details: { methodName, apiVersion: registry.apiVersion },
    });
  }
  return descriptor;
}

/**
 * The deterministic capability-disclosure listing: every method name in
 * sorted order with its effect class — the machine-renderable "what can
 * this surface do" artifact. Pure: same registry -> deep-equal output.
 */
export function describeRegistryMethods(
  registry: CommandMethodRegistry,
): readonly { readonly methodName: string; readonly effectClass: MethodEffectClass }[] {
  return registry.listMethods().map((descriptor) =>
    Object.freeze({ methodName: descriptor.methodName, effectClass: descriptor.effectClass }),
  );
}
