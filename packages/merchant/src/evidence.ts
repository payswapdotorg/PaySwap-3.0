/**
 * @payswap/merchant — journey evidence records (P5-W3, lane R3-W3;
 * PORT+ADAPT of old packages/merchant-checkout/src/evidence.ts @
 * 8a735bf: the kernel pipeline evidence log is replaced by the
 * wallet-payment PORT handoff evidence; digests re-based onto the
 * local canonical backbone).
 *
 * One evidence record per journey stage (merchant onboarding →
 * acceptance activation → checkout → wallet authorization (the port
 * handoff) → lifecycle → webhook updates → refund → settlement), each
 * carrying its references, lineage and evidence digests. Records are
 * DETERMINISTIC and REGENERABLE: the same pinned fixtures always
 * produce the same records (verified byte-identical across
 * regenerations by the evidence tests).
 *
 * Law marker (recorded in the file, asserted by the test):
 * `FIXTURE_PROVEN_TRUSTED_SURFACE_SIGNING_ONLY` — the wallet payment
 * flows through the INJECTED wallet-payment execution port whose only
 * method is `handoff`: this package never signs, never broadcasts and
 * never moves value.
 */

import { ValidationError } from "./errors.ts";
import { canonicalDigest, deepFreeze } from "./kernel.ts";
import type { MerchantProfile } from "./onboarding.ts";
import type { CryptoAcceptanceActivation } from "./activation.ts";
import type { CheckoutFlow } from "./checkout.ts";
import type { WalletAuthorizationLineage } from "./authorization.ts";
import type { CheckoutPaymentAttempt } from "./lifecycle.ts";
import type { WebhookInbox } from "./webhooks.ts";
import type { RefundRecord } from "./refunds.ts";
import type { MerchantSettlementRecord } from "./settlement-paths.ts";
import { assertNoSecretMaterial } from "./secrets.ts";

/** The law marker carried by every evidence file of this package. */
export const MERCHANT_EVIDENCE_LAW = "FIXTURE_PROVEN_TRUSTED_SURFACE_SIGNING_ONLY" as const;

/** The journey stages, in flow order. */
export const MERCHANT_JOURNEY_STAGES = [
  "MERCHANT_ONBOARDING",
  "ACCEPTANCE_ACTIVATION",
  "CHECKOUT_SESSION",
  "WALLET_AUTHORIZATION",
  "PAYMENT_LIFECYCLE",
  "WEBHOOK_UPDATES",
  "REFUND",
  "SETTLEMENT",
] as const;

export type MerchantJourneyStage = (typeof MERCHANT_JOURNEY_STAGES)[number];

/**
 * One entry of the port handoff evidence log (the wallet-authorization
 * stage carries the handoff's evidence references verbatim).
 */
export interface PortHandoffEvidenceEntry {
  readonly kind: "HANDOFF";
  readonly handoffId: string;
  readonly externalSubmissionRef: string;
  readonly evidenceRefs: readonly string[];
}

/** The per-stage reference bundle (only the ids/refs — records stay in state). */
export interface JourneyStageRefs {
  readonly stage: MerchantJourneyStage;
  readonly refs: readonly string[];
  /** Evidence lineage references (ids of evidence records backing the stage). */
  readonly evidenceRefs: readonly string[];
  /** Optional port handoff evidence (the wallet-authorization stage). */
  readonly portHandoff?: readonly PortHandoffEvidenceEntry[];
}

/** One journey evidence record. */
export interface MerchantJourneyRecord {
  readonly journeyId: string;
  readonly stage: MerchantJourneyStage;
  readonly refs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly portHandoff?: readonly PortHandoffEvidenceEntry[];
  /** The canonical digest over the canonical record projection. */
  readonly digest: string;
}

/** The evidence file shape. */
export interface MerchantJourneyEvidenceFile {
  readonly lawMarker: typeof MERCHANT_EVIDENCE_LAW;
  readonly packageName: string;
  readonly journeyId: string;
  readonly stages: readonly MerchantJourneyRecord[];
}

/** The pinned record types per stage (for building records from real state). */
export interface JourneyEvidenceInputs {
  readonly journeyId: string;
  readonly profile: MerchantProfile;
  readonly activation: CryptoAcceptanceActivation;
  readonly flow: CheckoutFlow;
  readonly authorization: WalletAuthorizationLineage;
  readonly portHandoff: readonly PortHandoffEvidenceEntry[];
  readonly attempt: CheckoutPaymentAttempt;
  readonly inbox: WebhookInbox;
  readonly refund: RefundRecord;
  readonly settlement: MerchantSettlementRecord;
}

/** Deterministic digest of one journey record (the canonical digest). */
export function journeyRecordDigest(
  record: Omit<MerchantJourneyRecord, "digest">,
): string {
  return canonicalDigest({
    journeyId: record.journeyId,
    stage: record.stage,
    refs: [...record.refs],
    evidenceRefs: [...record.evidenceRefs],
    ...(record.portHandoff !== undefined
      ? {
          portHandoff: record.portHandoff.map((entry) => ({
            kind: entry.kind,
            handoffId: entry.handoffId,
            externalSubmissionRef: entry.externalSubmissionRef,
            evidenceRefs: [...entry.evidenceRefs],
          })),
        }
      : {}),
  });
}

function requireStageRefs(stageRefs: readonly JourneyStageRefs[]): void {
  if (!Array.isArray(stageRefs) || stageRefs.length === 0) {
    throw new ValidationError(
      "journey evidence requires at least one stage record (one per stage, in flow order)",
    );
  }
  const seen = new Set<string>();
  for (const stage of stageRefs) {
    if (stage === null || typeof stage !== "object" || typeof stage.stage !== "string") {
      throw new ValidationError("each stage record must be a JourneyStageRefs");
    }
    if (seen.has(stage.stage)) {
      throw new ValidationError("journey stages must not repeat", { stage: stage.stage });
    }
    seen.add(stage.stage);
    if (
      !Array.isArray(stage.refs) ||
      stage.refs.length === 0 ||
      !stage.refs.every((ref: string) => typeof ref === "string" && ref.length > 0)
    ) {
      throw new ValidationError(`the ${stage.stage} stage requires non-empty refs (lineage)`);
    }
    if (
      !Array.isArray(stage.evidenceRefs) ||
      stage.evidenceRefs.length === 0 ||
      !stage.evidenceRefs.every((ref: string) => typeof ref === "string" && ref.length > 0)
    ) {
      throw new ValidationError(`the ${stage.stage} stage requires non-empty evidence refs`);
    }
  }
}

/**
 * Build the journey evidence records — one per stage, in flow order,
 * each digest-stable. Deterministic pure function of the stage inputs.
 */
export function buildJourneyEvidence(
  journeyId: string,
  stageRefs: readonly JourneyStageRefs[],
): readonly MerchantJourneyRecord[] {
  if (typeof journeyId !== "string" || journeyId.length === 0) {
    throw new ValidationError("a journey requires a journeyId");
  }
  requireStageRefs(stageRefs);
  const records = stageRefs.map((stage) => {
    const base: Omit<MerchantJourneyRecord, "digest"> = {
      journeyId,
      stage: stage.stage,
      refs: Object.freeze([...stage.refs]),
      evidenceRefs: Object.freeze([...stage.evidenceRefs]),
      ...(stage.portHandoff !== undefined
        ? { portHandoff: Object.freeze([...stage.portHandoff]) }
        : {}),
    };
    const record: MerchantJourneyRecord = Object.freeze({
      ...base,
      digest: journeyRecordDigest(base),
    });
    assertNoSecretMaterial(record, "journey evidence record");
    return record;
  });
  return Object.freeze(records);
}

/**
 * Derive the per-stage refs from the REAL journey state (the pinned
 * records). The wallet-authorization stage carries the port handoff
 * evidence log verbatim (the delegated money movement's evidence).
 */
export function journeyStagesFromState(
  inputs: JourneyEvidenceInputs,
): readonly JourneyStageRefs[] {
  if (inputs === null || typeof inputs !== "object") {
    throw new ValidationError("journeyStagesFromState requires the journey inputs");
  }
  const stages: JourneyStageRefs[] = [
    {
      stage: "MERCHANT_ONBOARDING",
      refs: [`merchant:${inputs.profile.id}`, `state:${inputs.profile.state}`],
      evidenceRefs: [
        `onboarding:${inputs.profile.id}`,
        ...(inputs.profile.verificationRef !== undefined
          ? [inputs.profile.verificationRef]
          : []),
        ...(inputs.profile.settlementDestination !== undefined
          ? [`destination:${inputs.profile.settlementDestination.id}`]
          : []),
      ],
    },
    {
      stage: "ACCEPTANCE_ACTIVATION",
      refs: [`activation:${inputs.activation.id}`, `policy:${inputs.activation.policy.id}`],
      evidenceRefs: [
        `activation:${inputs.activation.id}`,
        `composed-policy:${inputs.activation.policy.id}`,
        `base-policy:${inputs.activation.policy.basePolicyId}`,
      ],
    },
    {
      stage: "CHECKOUT_SESSION",
      refs: [
        `flow:${inputs.flow.id}`,
        `intent:${inputs.flow.intent.id}`,
        `session:${inputs.flow.session.id}`,
        `options:${inputs.flow.options.length}`,
      ],
      evidenceRefs: [
        `session:${inputs.flow.session.id}`,
        `intent:${inputs.flow.intent.id}`,
        ...inputs.flow.options.map((option) => `option:${option.optionId}`),
      ],
    },
    {
      stage: "WALLET_AUTHORIZATION",
      refs: [
        `authorization:${inputs.authorization.authorizationRequestHash}`,
        `write:${inputs.authorization.writeDigest}`,
        `handoff:${inputs.authorization.handoffId}`,
        `submission:${inputs.authorization.externalSubmissionRef}`,
      ],
      evidenceRefs: [...inputs.authorization.evidenceRefs],
      portHandoff: Object.freeze(
        inputs.portHandoff.map((entry) => Object.freeze({ ...entry })),
      ),
    },
    {
      stage: "PAYMENT_LIFECYCLE",
      refs: [
        `attempt:${inputs.attempt.attempt.id}`,
        `intent:${inputs.attempt.attempt.intentId}`,
        `state:${inputs.attempt.attempt.state}`,
        `authorization:${inputs.attempt.authorization.authorizationRequestHash}`,
      ],
      evidenceRefs: [...inputs.attempt.attempt.evidenceIds],
    },
    {
      stage: "WEBHOOK_UPDATES",
      refs: [
        `applied:${inputs.inbox.appliedEventIds.length}`,
        `rejected:${inputs.inbox.rejections.length}`,
        `duplicates:${inputs.inbox.duplicates.length}`,
      ],
      evidenceRefs: [
        ...inputs.inbox.appliedEventIds.map((id) => `webhook:${id}`),
        ...inputs.inbox.rejections.map((entry) => `webhook-rejected:${entry.eventId}`),
      ],
    },
    {
      stage: "REFUND",
      refs: [
        `refund:${inputs.refund.id}`,
        `original-attempt:${inputs.refund.originalAttemptId}`,
        `state:${inputs.refund.state}`,
      ],
      evidenceRefs: [...inputs.refund.evidenceIds],
    },
    {
      stage: "SETTLEMENT",
      refs: [
        `settlement:${inputs.settlement.settlementId}`,
        `attempt:${inputs.settlement.attemptId}`,
        `route-family:${inputs.settlement.routeFamily}`,
        `settlement-mode:${inputs.settlement.settlementMode}`,
      ],
      evidenceRefs: [...inputs.settlement.evidenceIds],
    },
  ];
  return Object.freeze(stages);
}

/** Build the full evidence file from the journey state. */
export function buildJourneyEvidenceFile(
  inputs: JourneyEvidenceInputs,
): MerchantJourneyEvidenceFile {
  const stages = buildJourneyEvidence(inputs.journeyId, journeyStagesFromState(inputs));
  const file: MerchantJourneyEvidenceFile = deepFreeze({
    lawMarker: MERCHANT_EVIDENCE_LAW,
    packageName: "@payswap/merchant",
    journeyId: inputs.journeyId,
    stages,
  });
  return file;
}

/** Re-digest every record of a file (verification twin of the builder). */
export function verifyJourneyEvidenceFile(
  file: MerchantJourneyEvidenceFile,
): boolean {
  if (file === null || typeof file !== "object") {
    throw new ValidationError("verifyJourneyEvidenceFile requires an evidence file");
  }
  if (file.lawMarker !== MERCHANT_EVIDENCE_LAW) {
    return false;
  }
  if (file.packageName !== "@payswap/merchant") {
    return false;
  }
  return file.stages.every((record) => record.digest === journeyRecordDigest(record));
}
