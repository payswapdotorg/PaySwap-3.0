# PaySwap 3.0 Reference Context

## ZCode substrate
Repository: zai-org/ZCode
Pinned baseline: 29628c9acdb81b703bbd4080c207a0e7ce5e276e
Version: 3.14.3

## PaySwap financial reference
Repository: payswapdotorg/payswap.org
Reviewed reference commit: 8a735bf1639198c43115087a2992555166a9acf9

The old repository contains the previously implemented universal-money/onchain architecture and is retained as reference evidence. Its source does not override PaySwap 3.0 architecture.

## Wise operating-model research
Advisory blueprint: spec/research/WISE-OPERATING-MODEL.md
Research cut-off: 2026-10-11
Sources: Wise Group plc FY2026 Form 20-F, Wise Platform API/transfer guides, and Wise Help Centre safeguarding explanation.

The Wise materials provide evidence for corridor-aware routing, bounded quote terms, endpoint-specific idempotency, asynchronous provider-state handling, operational exception paths and the investment required for network access. They do not disclose Wise's private implementation. Provider-specific statuses, time locks, safeguarding arrangements and performance figures must not be copied as PaySwap-wide contracts or targets. The research supplements the existing Work Orders and does not change the frozen architecture lock, non-custody law or active frontier.

## External research provenance
When external provider or standards behavior influences implementation, record source URL, retrieval date, relevant section, relied-upon behavior, implementation consequence, and whether the behavior is contractual or observational.
Do not keep important external requirements only in chat.