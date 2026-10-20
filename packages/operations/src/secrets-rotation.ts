/**
 * @payswap/operations — secret rotation procedures, as data (P8-W3,
 * hard law 7).
 *
 * Every vault-backed secret family has a procedure: dual-key (bounded
 * overlap windows so in-flight signed artifacts stay verifiable),
 * evidence-carrying, and — for keys that authorize sensitive actions —
 * accompanied by the security-epoch bump operator action so stale
 * authorizations are refused after rotation.
 *
 * Deterministic only: data; no vault I/O.
 */


export interface RotationStep {
  readonly stepId: string;
  readonly description: string;
}

export interface SecretRotationProcedure {
  readonly procedureId: string;
  readonly configKey: string;
  /**
   * Additional config keys rotated by the SAME procedure (credential
   * pairs rotate together).
   */
  readonly alsoRotates?: readonly string[];
  readonly name: string;
  readonly steps: readonly RotationStep[];
  /** Maximum key age before rotation is required (days). */
  readonly maxAgeDays: number;
  /** Overlap window where BOTH old and new keys are accepted (days). */
  readonly overlapWindowDays: number;
  /**
   * Operator actions that must be evidenced alongside this rotation —
   * the epoch bump for authorization-sensitive keys.
   */
  readonly requiredOperatorActions: readonly string[];
}

/**
 * The rotation procedures for the vault-backed secret families. Every
 * procedure is dual-key (overlap window) and evidence-carrying; keys
 * that authorize sensitive actions additionally require the epoch bump
 * so stale authorizations are refused.
 */
export const SECRET_ROTATION_PROCEDURES: readonly SecretRotationProcedure[] =
  Object.freeze([
    {
      procedureId: "rotate-vault-root",
      configKey: "VAULT_REF",
      name: "Rotate the vault mount root reference",
      steps: [
        {
          stepId: "mint-new-root",
          description:
            "Mint the new vault root reference alongside the existing one — both resolve during the overlap interval.",
        },
        {
          stepId: "re-resolve-planes",
          description:
            "Roll each plane to resolve through the new root reference (the operations plane last).",
        },
        {
          stepId: "revoke-old-root",
          description:
            "Revoke the old root only after every plane resolved the new one; record the revocation evidence.",
        },
      ],
      maxAgeDays: 365,
      overlapWindowDays: 1,
      requiredOperatorActions: [],
    },
    {
      procedureId: "rotate-database-credentials",
      configKey: "DATABASE_URL",
      name: "Rotate system-of-record credentials",
      steps: [
        {
          stepId: "create-dual-role",
          description:
            "Create the new role with identical grants alongside the current one.",
        },
        {
          stepId: "roll-connection-strings",
          description:
            "Update the vault-held connection secret; planes re-read on reconnect.",
        },
        {
          stepId: "verify-system-of-record",
          description:
            "Verify journal writes and outbox drains continue — committed mutations must not lose events.",
        },
        {
          stepId: "drop-old-role",
          description:
            "Drop the old role after the retention window; record evidence.",
        },
      ],
      maxAgeDays: 90,
      overlapWindowDays: 0,
      requiredOperatorActions: [],
    },
    {
      procedureId: "rotate-provider-credentials",
      configKey: "PROVIDER_CREDENTIAL_REF",
      name: "Rotate a per-provider rail credential (PROVIDER_<NAME>_CREDENTIAL_REF)",
      steps: [
        {
          stepId: "drain-or-reconcile",
          description:
            "Confirm in-flight attempts for the provider are drained or reconciled; UNKNOWN outcomes must not be blindly retried.",
        },
        {
          stepId: "swap-reference",
          description:
            "Point PROVIDER_<NAME>_CREDENTIAL_REF at the new vault entry; adapter planes re-resolve per execution.",
        },
        {
          stepId: "verify-connected-instance",
          description:
            "Verify the connected instance still matches actual account authorization/entitlement.",
        },
        {
          stepId: "revoke-old-key",
          description:
            "Revoke the old credential at the provider; preserve provider-side evidence of the revocation.",
        },
      ],
      maxAgeDays: 90,
      overlapWindowDays: 1,
      requiredOperatorActions: [],
    },
    {
      procedureId: "rotate-webhook-signing-key",
      configKey: "WEBHOOK_SIGNING_SECRET_REF",
      name: "Rotate the inbound-webhook signing key",
      steps: [
        {
          stepId: "mint-dual-keys",
          description:
            "Mint the new signing key; during the overlap window consumers accept signatures from BOTH keys.",
        },
        {
          stepId: "sign-with-new-key",
          description:
            "Switch the command plane to verify with the new key; consumers hold the dual-key set.",
        },
        {
          stepId: "bump-security-epoch",
          description:
            "The signing key authorizes trusted-surface delivery — execute the epoch-bump operator action with evidence so authorizations under the old key epoch are refused afterwards.",
        },
        {
          stepId: "retire-old-key",
          description:
            "Retire the old key after the overlap window closes; keep the revocation evidence immutable.",
        },
      ],
      maxAgeDays: 90,
      overlapWindowDays: 7,
      requiredOperatorActions: ["bump-security-epoch"],
    },
  ]);

/** Every required secret family has a rotation procedure. */
export function rotationProcedureFor(
  configKey: string,
): SecretRotationProcedure | undefined {
  return (
    SECRET_ROTATION_PROCEDURES.find(
      (procedure) =>
        procedure.configKey === configKey ||
        procedure.alsoRotates?.includes(configKey),
    ) ?? undefined
  );
}
