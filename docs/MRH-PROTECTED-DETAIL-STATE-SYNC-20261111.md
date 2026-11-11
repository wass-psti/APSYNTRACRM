# Material Request Hub — Protected Detail State and Drawer Synchronization

Date: 2026-11-11.

## Verified root cause
- The previous item drawer caught every exception from the protected-field read and replaced the details with identical “not available in the current item response” text. This inaccurately implied missing database data even when a signed role restriction or transient failure occurred.
- Production item 001 had five private sourcing cells at the read-only database inspection; item 000 had none. The existing server RPC remains the authoritative source.
- Tasks initially said integration was not activated despite the already-installed board-item task RPCs.

## Implemented
- Distinguish signed access refusal (Restricted), network/timeout/server failures (retryable Unavailable), and a successfully authorized but empty protected-field response (No protected values entered yet).
- Offer an immediate Retry loading details button only on unavailable/error states, through the existing signed RPC flow; no additional access checks, account changes or permissions.
- Retain real field values and revision-based editing after successful item-scoped reads.
- Do not report “Saved and reloaded” unless a fresh protected read completes after the write.
- Replace the stale Tasks initial notice with “Select Tasks to load this item’s current task list.”
- Preserve the Monday.com-style Pricing, Calculated Totals and Logistics presentation, public Details, and actual Tasks/Activity.

## Verification
- 1,698/1,698 full frontend tests PASS, Node syntax checks PASS, CSS bundle check PASS.
- Dedicated tests cover 401/403/42501, 408/429/5xx, authorized empty versus populated values, retry control, and post-save reload verification.
- No Supabase migrations, user role/permission changes, original board/group edits, or production data writes.
