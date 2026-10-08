# ZCode Platform Baseline

PaySwap 3.0 inherits the ZCode platform substrate unless PaySwap 3.0 architecture explicitly supersedes it.

Upstream baseline: zai-org/ZCode @ 29628c9acdb81b703bbd4080c207a0e7ce5e276e.
Tooling baseline from the upstream package: Node >=24.0.0 and pnpm 10.33.2.

Keep the inherited platform discipline around:
- package boundaries and public entrypoints;
- no circular or deep imports;
- controlled UI -> service/hook access;
- platform dependency injection between Web/Desktop/native environments;
- shared protocol/runtime schemas with strict validation;
- session owner/lease and remote connection semantics;
- explicit stream/replayable transport distinctions;
- logger discipline and secret/data redaction;
- actual package scripts for typecheck, lint, format, architecture checks and build.

PaySwap 3.0 adds stronger economic rules on top. Where ZCode and PaySwap rules conflict, PaySwap 3.0 wins for economic/product semantics, while the inherited rule remains binding for unrelated platform mechanics.

Do not remove an inherited platform safeguard merely because PaySwap no longer looks like a coding product. Prove the replacement boundary, migrate callers, test the behavior, then retire the old path through an explicit Work Order/ADR.