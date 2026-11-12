# CP-BIMP-18 — Extended-reference production activation and genuine signed round-trip

**Date:** 2026-11-12, Asia/Manila. **Status:** Production storage activated, signed extended URL import and post-refresh retrieval VERIFIED. Existing module permissions, identity, workspace controls, and the m143-v1 writer unchanged.

## Authorization and exact deployment

The project owner explicitly instructed: "begin the Next solid implementation CP-BIMP-18 — Controlled Extended-Reference Storage Activation, Genuine Signed Large-Reference Round-Trip, and Final Database Reconciliation." This is scope-specific authorization for the production storage activation, not an authorization for unrelated schema, access, or operational data changes.

Applied through the existing Supabase project's migration interface using the migration name **`cp_bimp18_extended_reference_storage_activation`** and the exact previously CI-verified source file `sql/bimp14-extended-references-DISPOSABLE-CANDIDATE.sql` (SHA-256 `3667a7f187bb1ecc34d045a1e34579079cfc2b78510c63ece9c316c1ce71f542`). Migration response: `success:true`. The source remains in the repo so the deployed SQL can be audited; **do not apply the candidate a second time as a new migration**. No new Supabase project was created.

This is an additive installation of `public.work_board_import_extended_refs`, its signed board-scoped read RPC, the m143-v2 atomic writer, and an existing-cell-write cleanup trigger. The pre-existing m143-v1 writer was retained.

## Live database security and capability verification

After installation, an independent SQL query confirmed:

- Table, read RPC, extended writer, original writer: **all present**.
- Extended table RLS: **enabled**.
- `anon` and `authenticated` direct table SELECT: **both denied**.
- `anon` execution of the new read and writer RPCs: **both denied**.
- `authenticated` EXECUTE for the two new signed RPCs: **granted**, both functions still check the active signed board session and board-scoped view/edit access internally.
- Ordinary board-cell-write cleanup trigger: **one installed**.
- No preexisting extended-reference rows existed before first test import.

Post-migration Supabase security advisors report `rls_enabled_no_policy` (INFO) for this intentionally RPC-only, direct-table-denied store and `authenticated_security_definer_function_executable` (WARN) for the two explicitly signed board-scoped RPCs. These are expected in the existing RPC-centric board architecture. **Do not add permissive direct table policies or revoke the intended signed RPC access simply to silence these advisories.** They are documented, not claimed absent.

## Genuine signed-user QA import — VERIFIED

Environment: existing authorized Chromium browser with genuine signed session; only the ordinary **`CP-BIMP-11 Import QA`** test board (`e1071df3-1b0d-43c0-8aa0-732c09032df4`). No operational board, user account, protected workspace, or document data touched.

1. Initial already-open browser wizard still used cached m143-v1 detection and correctly rejected the source 7,234-character URL during preflight. It made **no write**. Browser refresh re-established the signed session and discovered the new backend read capability.
2. Uploaded an in-memory synthetic **CSV** with Item `CP-BIMP-18 QA Extended URL` and URL `https://example.invalid/cp-bimp18/` followed by 7,200 `R` characters. Selected the already-existing Main group and a new `Datasheet URL` typed URL column on the **QA board only**.
3. The signed UI displayed `1 new / 0 updates / 0 skipped / 1 new column / 1 row`; signed `Import Now` returned **`1 created · 0 updated · 0 skipped · 1 columns created · 0 groups created`** and **`Verified 1 of 1 rows across 1 of 1 batches`**.
4. Independent read-only production SQL confirmed QA item `aad6b185-27b9-46f4-8ee7-b9582b1256ea`, URL column `ce83d855-9599-4e59-aa0f-b0acb9af40ff` (type URL), **7,234 stored characters**, and `md5(r.content) = md5(expected complete synthetic URL)` **true**. No duplicate standard cell exists for the same item and column; exactly one auxiliary reference row persists.
5. Reloaded the authenticated CRM browser. The QA item and the `Datasheet URL` column remained visible. The rendered cell contained the **complete exact 7,234-character URL**, excluding only the normal UI edit-glyph markup. Thus database persistence, authenticated read, and refresh synchronization are genuinely confirmed.
6. The board now has **13 QA records and 1 extended reference**, reflecting 12 preexisting synthetic QA records plus this single import. No other board was mutated.

## Regression and limitations

- Existing earlier CP-BIMP-16 signed CSV/XLSX imports, typed values, refresh persistence and m143-v1 writer were already verified, and the m143-v1 RPC remains present after the activation.
- Disposable PostgreSQL signed-claim tests previously PASS: 7,200+ character round-trip, read denial to a foreign board, no editor write from a viewer/revoked session, ordinary cell edits clearing superseded extended content, and >65,536-character atomic rejection. The ordinary-edit cleanup and denial scenarios were **not re-executed against operational production data**; no such claim is made.
- A currently open browser session may require reload to refresh the m143-v2 capability flag after backend activation. Do not automatically replay an import with an uncertain result.
- The m143-v2 limit is **65,536 characters for supported text, long_text and URL references**. This does not imply arbitrary binary file upload or access to external files.
- No unrelated frontend rewrite, user permissions, RLS changes on existing tables, credential changes, role grants, new project, production cleanup, or broad monitoring was undertaken.

## Delivery acceptance

**CP-BIMP-18 scoped acceptance is VERIFIED:** controlled production activation; signed import of an extended reference; exact authoritative PostgreSQL match; signed browser post-refresh full-value retrieval; unchanged existing permission boundaries. No further implementation is required for this priority unless a new reproducible defect appears.
