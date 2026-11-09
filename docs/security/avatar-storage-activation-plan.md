# APSYNTRA CRM — Profile Picture Storage and Security Record

**Current state:** The production database and private avatar bucket are activated. The frontend upload, save, replace, remove, and current-user image hydration paths are implemented. GitHub frontend validation passed 1,281 / 1,281 tests and GitHub Pages deployment succeeded on the latest avatar implementation commit. Genuine signed-user upload and cross-user denial acceptance is still pending.

**Project:** Existing WatchdogWorkspace (jtlusodorfnyzgyuewkz, Supabase project WatchdogWorkspace). No new Supabase project was created.

## Verified pre-migration inventory

- public.profiles contained identity, display-name, role, status, and timestamp fields but no avatar reference.
- public.update_own_profile(p_display_name text) was already the signed self-service display-name contract. It was preserved unchanged.
- No dedicated profile avatar bucket existed.
- Four fueltrans_crm_evidence_* Storage policies contained conditional ELSE true branches, but live catalog inspection confirmed all four are RESTRICTIVE policies. They do not grant access to other buckets. They were preserved unchanged; no unnecessary policy remediation was performed.

## Applied production migration

Migrations: cp_profile_avatar_storage_activation_20261109 and cp_profile_avatar_active_upload_guard_20261109

1. Added nullable public.profiles.avatar_path with a database check requiring the path to be <profile UUID>/<object UUID>.webp.
2. Created the private account-avatars bucket with a 400,000-byte limit and image/webp as the only allowed MIME type.
3. Added an authenticated insert policy limited to an active signed-in profile, the caller's own UUID folder, object owner, one-level path, and UUID WebP filename. The follow-up active-upload guard migration enforces the profile status at the Storage boundary.
4. Added an authenticated delete policy limited to objects owned by the caller in the caller's UUID folder. No object update/upsert policy exists.
5. Added a read policy restricted to authenticated object download / authenticated-info operations; object listing is not allowed by that policy. The owner and active users who share at least one active workspace may read the image. Anonymous access is not granted.
6. Added private.profile_avatar_can_read(uuid) as a fixed-search-path security-definer predicate for active same-workspace visibility.
7. Added public.set_own_profile_avatar(p_avatar_path text, p_expected_avatar_path text). It validates caller-owned object existence, path shape, active account status, and the expected prior path before updating only the caller's avatar reference and updated_at. The compare-and-swap condition prevents stale concurrent updates.
8. Extended public.wm_auth_access_context() to include only the signed caller's avatar_path, preserving the existing module assignment projection and workspace authority.

## Frontend implementation

- JPEG, PNG and WebP source images only; file signature is checked and source size is capped at 5 MB.
- Browser decode and square crop produce a 256×256 WebP image; source metadata is not copied into the generated image.
- Zoom and horizontal / vertical positioning are available in Account Settings.
- The client uploads a new immutable UUID object, updates the profile pointer through the authenticated RPC, then attempts to delete the previous object. If the pointer update fails, it attempts to remove the new orphan.
- Remove clears the profile reference through the same compare-and-swap RPC before attempting object deletion.
- Current-user avatar images in Account Settings and the APSYNTRA CRM topbar use short-lived signed URLs. Initials remain the fallback.
- No service-role key or privileged credential is shipped to the browser.

**Cleanup limitation:** If Storage deletion of an old or orphaned object fails after the profile reference has changed, the new profile state remains authoritative and the UI reports the cleanup failure. There is no background cleanup worker or persistent cleanup queue in this increment; no such automation is claimed.

## Live database verification performed

- Bucket configuration returned public=false, file_size_limit=400000, allowed_mime_types=['image/webp'].
- New bucket object count was zero immediately after migration.
- The three avatar Storage policies were present for authenticated INSERT, SELECT, and DELETE. No avatar UPDATE policy was added.
- The four FuelTrans cross-bucket policies remained RESTRICTIVE and unchanged.
- The signed access-context function includes avatar_path.
- The avatar setter has authenticated execute permission and no public/anon execute grant.

These checks verify database configuration and policy definitions. They do not substitute for real signed HTTP tests with two distinct users.

## Remaining signed-user acceptance

1. Sign in as an active user. Upload a supported photo, save, refresh, and verify it remains visible in Settings and the topbar.
2. Replace the image and remove it. Confirm the profile pointer and corresponding Storage object state.
3. Use a second active user in the same workspace to verify image retrieval succeeds. Use a user outside the workspace and an anonymous request to verify denial.
4. Verify wrong-owner folder uploads/deletes, listing, unsupported MIME, oversized objects, expired/revoked sessions, stale expected-path updates, and malformed paths are denied.
5. Reconfirm existing FuelTrans, FRT, Material Request Hub, Toolbox Issues, and Tool Traceability attachment operations remain unchanged.

The feature is not declared fully accepted until these real signed-user checks pass.
