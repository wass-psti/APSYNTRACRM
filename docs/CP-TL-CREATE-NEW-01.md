# CP-TL-CREATE-NEW-01 — TradeLink Native Create New

**Date:** 2026-11-19  
**Status:** IMPLEMENTED — backend applied; frontend deployment and genuine signed-user write acceptance pending.  
**Repository:** wass-psti/APSYNTRACRM  
**Supabase:** existing project jtlusodorfnyzgyuewkz only.

## Scope

Enable the existing TradeLink module role User to create and maintain its own Draft documents through the current TradeLink domain API, without granting generic Board edit/manage access or changing roles, assignments, memberships, or unrelated applications.

## Implemented

- The signed native TradeLink context is retained in the application state and the exact existing User module role enables Create New.
- All six source-defined editors remain available: Electronic SI, Quotation, Packing List, Delivery Receipt, Payment AR, and PO to Suppliers.
- The domain client accepts the signed native User context for creator-owned list, page, read, revision-bundle, create and own-Draft update operations. Other module roles without the existing Board-manager path remain denied.
- The backend private.tl03_can_create_draft helper verifies the canonical TradeLink board, active signed session, active current workspace membership, active profile, existing module access and exact User module role.
- private.tl03_save allows create and creator-owned Draft update only. It checks the actor's document ownership before acquiring the row lock, then rechecks Draft state and revision/idempotent replay after locking.
- The existing private.tl03_can_manage path remains unchanged for Board managers and all manager-only operations.
- Existing list/page/read/revision/projection RPCs now return or resolve creator-owned documents; All Documents merges them with separately assigned reviewer documents by immutable document ID.
- The existing tl03_docs_read manager predicate is preserved and the owner branch is consolidated into the same policy to avoid two permissive SELECT policies.

## Production migrations

1. 20261119073346_tradelink_user_draft_creation
2. 20261119073608_tradelink_document_read_policy_consolidation

Both migrations were first executed inside rollback-only transactions against the existing project schema. They were then applied and recorded in supabase_migrations.schema_migrations. Read-only catalog verification confirmed both helper functions, authenticated-only helper execution, creator read policy, unchanged manager predicate, creator-only document list/page fields, and owner read/projection/revision paths.

## Verification

- Focused TradeLink tests cover User-role Create New, all six document types, own-Draft update boundaries, creator/reviewer list merging, immutable-ID deduplication, reviewer action preservation, and manager-only operation denial.
- Full frontend test suite: **2,825 passed, 0 failed**.
- Production build: PASS.
- JavaScript syntax: PASS.
- ESLint on changed JavaScript and tests: PASS.
- git diff --check: PASS.
- Supabase transactional migration dry-runs: PASS.
- Supabase catalog verification: PASS.
- Migration-source manifest: PASS (222 recovered baseline migrations and 34 forward migrations, including both new files).\n- Supabase performance advisor no longer reports multiple permissive SELECT policies for public.tradelink_documents. Remaining global advisor findings are existing unrelated project findings; no unrelated policy or function was changed.

## Explicitly not claimed

- Frontend production deployment is not yet verified.
- Genuine signed-user Draft creation, refresh persistence, reopening, and Board/All Documents readback remain pending.
- No production TradeLink document or Board item has been created by this checkpoint.
- No approval, submit, archive, restore, attachment, or generic Board permission behavior was changed.
