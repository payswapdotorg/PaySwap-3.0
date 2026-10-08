# PaySwap 3.0 Security Model

## Deterministic gate

ALLOW | ALLOW_WITH_CONSTRAINTS | REQUIRE_CONFIRMATION | BLOCK | UNKNOWN.

Adversarial agents are advisory. They may add evidence and proposed restrictions but cannot downgrade BLOCK.

## Credential boundary

Private keys, seed phrases, wallet passwords, protected OAuth secrets, API keys, MFA secrets, browser cookies and equivalent authentication material never enter model context, normal logs or ordinary artifacts.

## Onchain threats

Cover malicious approvals/permits, unexpected spenders, fake tokens, transfer restrictions, proxy/admin/upgrade changes, oracle manipulation, bridge compromise, MEV/sandwich exposure, chain/address confusion, replay/signature-domain issues, unexpected balance/state deltas, stale simulation and reorg/finality anomalies.

## Cross-rail security

The same deterministic posture applies to fiat providers: stale authorization, changed beneficiaries, state transitions requiring customer action, changed limits, duplicates, provider incidents and asynchronous ambiguity.