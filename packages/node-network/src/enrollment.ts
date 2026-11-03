/**
 * @payswap/node-network — accountable node enrollment (P27-D, ADR-0020 D5).
 *
 * A PaySwap network node is a VERSIONED IDENTITY BOUND TO AN ACCOUNTABLE
 * LEGAL PRINCIPAL with a declared jurisdiction and EXPLICIT role (never
 * inferred), bound to REAL connected provider instances, and explicit
 * about custody (D8: a node that takes or transmits custody of funds
 * declares it and carries its licence/programme evidence references).
 *
 * THE D11 LAW: no fake ACTIVE node ships as a default. The registry
 * starts EMPTY (registry.ts); an enrollment of a real node is
 * OPERATOR_ENROLLED, and a test fixture is marked FIXTURE and can NEVER
 * be promoted — `assertOperatorEnrolled` is the gate every offer
 * admission consults (a fixture node's offers are test-tier only).
 *
 * The record is DATA (validated fail-closed); the signature machinery
 * lives in attestation.ts (the node key signs the enrollment facts).
 */

import { NodeEnrollmentError } from "./errors.ts";
import {
  LIMITS,
  deepFreeze,
  isNonEmptyString,
  isNonEmptyStringArray,
  isRecord,
  isStrictIsoUtcTimestamp,
  requireBoundedString,
  requireCountryCode,
  requireIsoUtcTimestamp,
} from "./canonical.ts";

/** The enrollment record vocabulary version. */
export const NODE_ENROLLMENT_VERSION = "1.0.0" as const;

/**
 * VALUE PIN — the explicit node roles (ADR-0020 D5: "technical router,
 * payment facilitator, merchant of record, custodian, agent, payout
 * originator, regulated payment institution — the role is explicit,
 * never inferred").
 */
export const NODE_ROLES = Object.freeze([
  "TECHNICAL_ROUTER",
  "PAYMENT_FACILITATOR",
  "MERCHANT_OF_RECORD",
  "CUSTODIAN",
  "AGENT",
  "PAYOUT_ORIGINATOR",
  "REGULATED_PAYMENT_INSTITUTION",
] as const);

export type NodeRole = (typeof NODE_ROLES)[number];

/** The enrollment modes (the D11 fixture law). */
export const NODE_ENROLLMENT_MODES = Object.freeze(["OPERATOR_ENROLLED", "FIXTURE"] as const);

export type NodeEnrollmentMode = (typeof NODE_ENROLLMENT_MODES)[number];

/** The accountable legal principal behind a node (D5). */
export interface LegalPrincipal {
  readonly legalName: string;
  readonly registrationRefs: readonly string[];
  readonly jurisdiction: string;
}

/**
 * The mirror of the capability plane's connector authorization status for
 * ONE bound instance (authority: @payswap/capability connected-instance.ts
 * `ConnectorAuthorizationState["status"]` — a VALUE PIN, byte-identical;
 * the accepting authority revalidates against its OWN evidence, D5).
 */
export const INSTANCE_AUTHORIZATION_STATUSES = Object.freeze([
  "ACTIVE",
  "PENDING",
  "REVOKED",
  "EXPIRED",
  "UNKNOWN",
] as const);

export type InstanceAuthorizationStatus = (typeof INSTANCE_AUTHORIZATION_STATUSES)[number];

/** One binding of a node to a REAL connected provider instance (D5). */
export interface NodeInstanceBinding {
  readonly instanceId: string;
  readonly providerName: string;
  readonly authorizationStatus: InstanceAuthorizationStatus;
}

/** The explicit custody declaration (D8 — custody legs are regulated activity). */
export interface CustodyDeclaration {
  readonly takesCustody: boolean;
  /** Licence/programme approval references (REQUIRED when takesCustody). */
  readonly licenceProgrammeRefs: readonly string[];
}

/** The accountable node enrollment record (layer: intelligence; DATA only). */
export interface NodeEnrollmentRecord {
  readonly enrollmentVersion: string;
  readonly nodeId: string;
  readonly enrollmentMode: NodeEnrollmentMode;
  readonly principal: LegalPrincipal;
  readonly jurisdiction: string;
  readonly roles: readonly NodeRole[];
  readonly instanceBindings: readonly NodeInstanceBinding[];
  readonly custody: CustodyDeclaration;
  readonly enrolledAt: string;
  /** The node's Ed25519 PUBLIC key (SPKI PEM) — verification only, never secret material. */
  readonly nodePublicKeyPem: string;
  readonly enrollmentEvidenceRefs: readonly string[];
}

/** True iff the value is a member of the closed role vocabulary. */
export function isNodeRole(value: unknown): value is NodeRole {
  return typeof value === "string" && (NODE_ROLES as readonly unknown[]).includes(value);
}

function validateRoles(candidate: unknown, subject: string): readonly NodeRole[] {
  if (!isNonEmptyStringArray(candidate)) {
    throw new NodeEnrollmentError(`${subject} must be a non-empty array of explicit node roles`);
  }
  for (const role of candidate) {
    if (!isNodeRole(role)) {
      throw new NodeEnrollmentError(
        `${subject} contains '${String(role)}' which is not a member of the closed role vocabulary — the role is explicit, never inferred (D5)`,
      );
    }
  }
  const unique: NodeRole[] = [];
  for (const role of candidate) {
    if (!unique.includes(role as NodeRole)) {
      unique.push(role as NodeRole);
    }
  }
  if (unique.length !== candidate.length) {
    throw new NodeEnrollmentError(`${subject} must not repeat a role`);
  }
  return Object.freeze(unique);
}

function validateInstanceBindings(
  candidate: unknown,
  subject: string,
): readonly NodeInstanceBinding[] {
  if (!Array.isArray(candidate)) {
    throw new NodeEnrollmentError(`${subject} must be an array of instance bindings`);
  }
  if (candidate.length > LIMITS.maxInstanceBindings) {
    throw new NodeEnrollmentError(
      `${subject} must carry at most ${LIMITS.maxInstanceBindings} bindings`,
    );
  }
  const bindings: NodeInstanceBinding[] = [];
  for (const entry of candidate) {
    if (!isRecord(entry)) {
      throw new NodeEnrollmentError(`${subject} entries must be objects`);
    }
    const instanceId = requireBoundedString(
      entry["instanceId"],
      `${subject}.instanceId`,
      LIMITS.refMaxLength,
    );
    const providerName = requireBoundedString(
      entry["providerName"],
      `${subject}.providerName`,
      LIMITS.refMaxLength,
    );
    const status = entry["authorizationStatus"];
    if (!(INSTANCE_AUTHORIZATION_STATUSES as readonly unknown[]).includes(status)) {
      throw new NodeEnrollmentError(
        `${subject}.authorizationStatus must be a member of the connector status vocabulary (the capability plane's mirror)`,
      );
    }
    bindings.push(
      deepFreeze({
        instanceId,
        providerName,
        authorizationStatus: status as InstanceAuthorizationStatus,
      }),
    );
  }
  return Object.freeze(bindings);
}

/**
 * Fail-closed validation of a node enrollment record: version, identity,
 * principal, jurisdiction, explicit roles, instance bindings, the custody
 * declaration (a custodian without licence evidence is refused), the
 * public verification key and the evidence references.
 */
export function validateNodeEnrollmentRecord(candidate: unknown): NodeEnrollmentRecord {
  const record = isRecord(candidate) ? candidate : null;
  if (record === null) {
    throw new NodeEnrollmentError("a node enrollment record must be an object");
  }
  if (record["enrollmentVersion"] !== NODE_ENROLLMENT_VERSION) {
    throw new NodeEnrollmentError(
      `enrollment.enrollmentVersion must be '${NODE_ENROLLMENT_VERSION}' (stale or foreign input is refused)`,
    );
  }
  const nodeId = requireBoundedString(record["nodeId"], "enrollment.nodeId", LIMITS.refMaxLength);
  const mode = record["enrollmentMode"];
  if (!(NODE_ENROLLMENT_MODES as readonly unknown[]).includes(mode)) {
    throw new NodeEnrollmentError(
      "enrollment.enrollmentMode must be OPERATOR_ENROLLED or FIXTURE (the D11 law: a fixture is clearly a fixture)",
    );
  }
  const principal = record["principal"];
  if (!isRecord(principal)) {
    throw new NodeEnrollmentError("enrollment.principal must be the accountable legal principal");
  }
  const registrationRefs = principal["registrationRefs"];
  if (!isNonEmptyStringArray(registrationRefs)) {
    throw new NodeEnrollmentError(
      "enrollment.principal.registrationRefs must be a non-empty array (an accountable principal is registered, never anonymous)",
    );
  }
  const jurisdiction = requireCountryCode(record["jurisdiction"], "enrollment.jurisdiction");
  if (jurisdiction !== principal["jurisdiction"]) {
    throw new NodeEnrollmentError(
      "enrollment.principal.jurisdiction must match enrollment.jurisdiction (the declared jurisdiction is the principal's)",
    );
  }
  const roles = validateRoles(record["roles"], "enrollment.roles");
  const instanceBindings = validateInstanceBindings(
    record["instanceBindings"],
    "enrollment.instanceBindings",
  );
  if (
    instanceBindings.length === 0 &&
    !roles.every((role) => role === "TECHNICAL_ROUTER" || role === "AGENT")
  ) {
    throw new NodeEnrollmentError(
      "a node holding provider-facing roles must bind at least one REAL connected instance (D5: offers are bound to ACTIVE instances; only TECHNICAL_ROUTER/AGENT may enroll without one)",
    );
  }
  const custody = record["custody"];
  if (!isRecord(custody) || typeof custody["takesCustody"] !== "boolean") {
    throw new NodeEnrollmentError(
      "enrollment.custody must declare takesCustody explicitly (D8: custody is never inferred)",
    );
  }
  const licenceRefs = custody["licenceProgrammeRefs"];
  if (!Array.isArray(licenceRefs) || licenceRefs.some((ref) => !isNonEmptyString(ref))) {
    throw new NodeEnrollmentError(
      "enrollment.custody.licenceProgrammeRefs must be an array of references",
    );
  }
  const takesCustody = custody["takesCustody"] as boolean;
  if (takesCustody && (licenceRefs as string[]).length === 0) {
    throw new NodeEnrollmentError(
      "a node that takes custody of, or transmits, funds must carry its licence/programme evidence references (ADR-0020 D8: a custody-bearing leg is eligible only on that evidence)",
    );
  }
  if (!takesCustody && (licenceRefs as string[]).length > 0) {
    throw new NodeEnrollmentError(
      "enrollment.custody declares takesCustody=false but carries licence references — the declaration must be honest",
    );
  }
  const custodyRoles = roles.filter((role) => role === "CUSTODIAN" || role === "PAYMENT_FACILITATOR" || role === "REGULATED_PAYMENT_INSTITUTION");
  if (custodyRoles.length > 0 && !takesCustody) {
    throw new NodeEnrollmentError(
      `the role(s) ${custodyRoles.join(", ")} take custody by definition — the custody declaration must say so`,
    );
  }
  const enrolledAt = requireIsoUtcTimestamp(record["enrolledAt"], "enrollment.enrolledAt");
  const nodePublicKeyPem = record["nodePublicKeyPem"];
  if (
    !isNonEmptyString(nodePublicKeyPem) ||
    !nodePublicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----")
  ) {
    throw new NodeEnrollmentError(
      "enrollment.nodePublicKeyPem must be an SPKI PEM public key (verification key only — secret material never appears on an enrollment, INV-19)",
    );
  }
  const evidenceRefs = record["enrollmentEvidenceRefs"];
  if (!Array.isArray(evidenceRefs) || evidenceRefs.some((ref) => !isNonEmptyString(ref))) {
    throw new NodeEnrollmentError(
      "enrollment.enrollmentEvidenceRefs must be an array of evidence references",
    );
  }
  return deepFreeze({
    enrollmentVersion: NODE_ENROLLMENT_VERSION,
    nodeId,
    enrollmentMode: mode as NodeEnrollmentMode,
    principal: deepFreeze({
      legalName: requireBoundedString(
        principal["legalName"],
        "enrollment.principal.legalName",
        LIMITS.descriptionMaxLength,
      ),
      registrationRefs: Object.freeze([...(registrationRefs as readonly string[])]),
      jurisdiction,
    }),
    jurisdiction,
    roles,
    instanceBindings,
    custody: deepFreeze({
      takesCustody,
      licenceProgrammeRefs: Object.freeze([...(licenceRefs as readonly string[])]),
    }),
    enrolledAt,
    nodePublicKeyPem,
    enrollmentEvidenceRefs: Object.freeze([...(evidenceRefs as readonly string[])]),
  });
}

/**
 * THE D11 GATE: assert the enrollment is OPERATOR_ENROLLED. A FIXTURE
 * enrollment is a clearly-marked test fixture and can NEVER be promoted —
 * any offer-admission path outside the test tier consults this gate.
 */
export function assertOperatorEnrolled(record: NodeEnrollmentRecord): NodeEnrollmentRecord {
  if (record.enrollmentMode !== "OPERATOR_ENROLLED") {
    throw new NodeEnrollmentError(
      `node '${record.nodeId}' is enrolled as '${record.enrollmentMode}' — a fixture enrollment is a fixture and is never promotable (ADR-0020 D11); operator enrollment is required before any offer is admitted`,
      { nodeId: record.nodeId, enrollmentMode: record.enrollmentMode },
    );
  }
  return record;
}

/** True iff the node's enrollment binds at least one ACTIVE instance (D5). */
export function enrollmentHasActiveInstance(record: NodeEnrollmentRecord): boolean {
  return record.instanceBindings.some((binding) => binding.authorizationStatus === "ACTIVE");
}

/** True iff the timestamp is a strict ISO-8601 UTC string (shape export for tests). */
export function isEnrollmentTimestamp(value: unknown): boolean {
  return isStrictIsoUtcTimestamp(value);
}
