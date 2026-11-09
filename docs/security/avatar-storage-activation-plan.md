# APSYNTRA CRM — Avatar Storage Activation and Security Decision

**Status:** Frontend image selection, validation and crop preview implemented. Production avatar persistence is **BLOCKED** pending explicit authorization for database and Storage policy changes, isolated denial checks, and genuine signed-user acceptance.

**Existing project:** WatchdogWorkspace (`jtlusodorfnyzgyuewkz`). **No new Supabase project** is proposed.

## Verified current inventory (read-only, 2026-11-09)

- The canonical `public.profiles` table contains `id`, `email`, `display_name`, `platform_role`, `status`, and timestamps, **but no avatar path**.
- The deployed `public.update_own_profile(p_display_name text)` function supports signed, self-only name changes. Do not replace it or overload its authorization duties merely to add an avatar.
- There is no dedicated avatar bucket. Existing buckets contain restricted business attachments and must not store profile images.
- Four live `fueltrans_crm_evidence_*` policies contain conditional `ELSE true` branches for buckets other than `fueltrans-evidence`, but catalog inspection confirms all four are **RESTRICTIVE**, not permissive. They combine with applicable permissive policies using AND and therefore do not grant cross-bucket access. Preserve them unchanged.

## Hold point

The user authorized avatar activation. The four restrictive FuelTrans policies are preserved unchanged. A dedicated avatar bucket and bucket-specific permissive policies are being added; existing permissive policies remain bucket-scoped. No broad Storage policy is introduced.

## Proposed minimal backend contract (not deployed)

1. Inspect all existing `storage.objects` policies and grants. Preserve the four restrictive FuelTrans policies; verify the new avatar policy is the only permissive policy matching the new bucket.
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

## Authorization and activation record

The user explicitly authorized controlled remediation and avatar activation in the existing WatchdogWorkspace project. Read-only catalog inspection showed the four suspected FuelTrans policies are restrictive, so they were not modified. The additive migration `cp_profile_avatar_storage_activation_20261109` has been applied: it adds the self-owned profile reference, private bucket, bucket-specific Storage policies, shared-active-workspace read helper, compare-and-swap profile RPC, and avatar path in the signed access-context RPC. The frontend upload/save/remove integration and genuine signed-user acceptance remain in progress.
