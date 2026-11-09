# APSYNTRA CRM — Avatar Storage Activation and Security Decision

**Status:** Frontend image selection, validation and crop preview implemented. Production avatar persistence is **BLOCKED** pending explicit authorization for database and Storage policy changes, isolated denial checks, and genuine signed-user acceptance.

**Existing project:** WatchdogWorkspace (`jtlusodorfnyzgyuewkz`). **No new Supabase project** is proposed.

## Verified current inventory (read-only, 2026-11-09)

- The canonical `public.profiles` table contains `id`, `email`, `display_name`, `platform_role`, `status`, and timestamps, **but no avatar path**.
- The deployed `public.update_own_profile(p_display_name text)` function supports signed, self-only name changes. Do not replace it or overload its authorization duties merely to add an avatar.
- There is no dedicated avatar bucket. Existing buckets contain restricted business attachments and must not store profile images.
- Four live Storage RLS policies—`fueltrans_crm_evidence_insert`, `fueltrans_crm_evidence_read`, `fueltrans_crm_evidence_update`, and `fueltrans_crm_evidence_delete`—contain a conditional branch returning **true for buckets other than `fueltrans-evidence`**. PostgreSQL permissive policies may combine with OR. These branches are a cross-bucket authorization risk for a newly added avatar bucket.

## Hold point

**DO NOT create the profile bucket or grant avatar upload/delete/read permissions yet.** Even narrow new policies could be overridden by a permissive existing policy. Production remediation of the four cross-bucket conditions affects access policy and requires separate approval and regression evidence against currently legitimate bucket operations.

## Proposed minimal backend contract (not deployed)

1. In an isolated review, inspect all existing `storage.objects` policies and grants. Prove that any existing cross-bucket allow branches are safely narrowed to their original business bucket without breaking currently authorized attachment workflows.
2. Add a nullable `avatar_path` reference to the existing `public.profiles` record (no duplicate profile table), with a path format restricted to `<auth.uid()>/<random-id>.webp`; ensure the authenticated user cannot change `id`, role, account status, email, or memberships through this contract.
3. Create a dedicated **private** `account-avatars` bucket, with upload limits at the bucket boundary (WebP only; e.g. 400 KB) in addition to client-side checks. File preparation re-encodes JPEG/PNG/WebP source to a square 256×256 WebP, stripping submitted metadata. The Storage backend must verify actual content types and reject malformed images.
4. Define narrowly scoped `storage.objects` policies. Inserts require a signed active user, `bucket_id='account-avatars'`, `owner_id=auth.uid()::text`, and a path beginning with the authenticated user's UUID; replacements are new immutable names, never cross-user upserts. DELETE is limited to objects actually owned by the caller and may be further restricted to superseded objects. Enforce read authorization based on the intended audience (self-only or currently authorized coworkers sharing a workspace), preferably without public URLs or unrestricted listing.
5. Use a signed self-only profile update contract with explicit ownership and path-validation rules; update only the user's avatar reference and timestamp. Require concurrency protection (revision or optimistic expected-old-reference) so delayed uploads cannot overwrite a later choice.
6. Upload a new object first; update the profile pointer only after upload success; clean up the newly uploaded orphan if the pointer update fails. After successful pointer update, remove the old avatar only when it is confirmed unreferenced, with a retryable cleanup path.
7. Provide a read contract suitable for app header, Settings, board assignments, member listings, and supported integrated apps; preserve fallback initials and avoid treating a remote avatar URL as executable HTML.
8. Keep all admin-managed permissions and workspaces separate from profile customization. Maintain any applicable existing audit requirements.

## Required acceptance before production activation

- Signed user can upload, crop, save, refresh, log out/in, replace, and remove their own avatar; correct database pointer and Storage object survive sessions.
- Foreign user cannot upload, replace, delete, or obtain a protected image outside allowed workspace visibility; anon access denied.
- A revoked/expired signed session cannot mutate avatar content or metadata.
- MIME spoofing, SVG, corrupt images, dimensions/size limits, malformed path, other-user path, stale revision, concurrent saves, and interrupted uploads fail safely.
- Existing FuelTrans, FRT, Material Request Hub, Toolbox, and Tool Traceability attachment operations remain authorized where expected and denied otherwise, before and after any Storage-policy change.
- Verify actual access using signed HTTP / Postgres acceptance evidence; frontend CI and Pages deployment alone do not satisfy backend acceptance.

## Current frontend safety boundary

`frontend/profile-avatar.js` provides local JPEG/PNG/WebP signature detection, a 5-MB input cap, image dimension checks, 256px square WebP encoding, zoom, positioning, and ephemeral preview using browser blob URLs. The Settings UI explicitly says the preview **does not upload or save**. No avatar upload endpoint, privileged key, or production Storage write is shipped.

## Approval exception

A separate explicit production authorization must identify the **Storage policy remediation + avatar bucket + canonical profile-reference migration** scope. In its absence, keep production schema/policies unchanged and this feature marked **IMPLEMENTED-UNVERIFIED (preview only) / BLOCKED (persistence)**.
