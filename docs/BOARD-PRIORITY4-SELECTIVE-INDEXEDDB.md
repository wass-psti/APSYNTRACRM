# APSYNTRA CRM — Priority 4 Selective IndexedDB preference persistence

## Approved persistence only

The only newly persisted data category is **per-board presentation layout**: tab keys, column keys, hidden-column keys, and bounded column widths. These are harmless identifiers already part of the existing UI-preference contract, not record values, labels, search queries, or backend state. **No domain datasets have been approved for local persistence.** Board items, workspace memberships, approval documents, TradeLink documents/drafts, attendance/GPS, profiles, email, sessions, tokens, role/permission grants, signed API responses, financial data, and attachments are never stored by this feature. No background synchronization, telemetry, IndexedDB permissions cache, or service-worker interaction is added.

## Format and lifecycle

- IndexedDB database `apsyntra-public-ui-preferences`, explicit version **1**, object store `board-layouts` keyed by `apsyntra.board-layout.v1:<signed-user-UUID>:<signed-workspace-UUID>:<board-UUID>`.
- Whitelist only four exact object fields: `tabs`, `columns`, `hidden`, and `widths`, with bounded, supported layout-key strings and numeric widths of **110–520 px**. Reject additional fields, free text, and oversized payloads. Maximum **4,096 characters per record**, **48 records total**, and **30-day expiry**. Records beyond limit and expired entries are pruned during writes; expired entries are removed on reads. Browser quota/storage failures degrade to memory-only preferences without changing login or server access.
- Hydrate **only after** a fresh signed server board-view decision and successful workspace verification; never use stored layout to infer access. In-memory data is cleared on signed identity/workspace changes, sign-out, session expiry, and workspace-access revocation. IndexedDB retains only harmless scoped layout until reset, expiry, or eviction so repeat visits can restore preferences.
- Existing synchronous layout functions use an ephemeral memory adapter for immediate UI responsiveness. A serialized asynchronous write queue prevents save/reset races within a tab. Reset removes the persisted board entry. Read-back after reload uses IndexedDB and still revalidates the available current tab/column set via existing layout normalization.
- Previously saved localStorage layouts migrate only after signed board authorization, strict validation and successful IndexedDB commit; migrated legacy values are then deleted. Invalid or unavailable storage is not trusted or used as an authorization source. No new localStorage writes are introduced.

## Evidence and acceptance

- Unit tests exercise allowed layout structure, rejection of embedded tokens/data fields, user/workspace isolation, invalid legacy migration, and signed view integration.
- Real ephemeral Chromium IndexedDB tests cover persistence between independent store instances, foreign user and workspace isolation, expiration, deletion, 48-record cap, valid legacy migration/removal, and reset durability. The test server binds only to loopback and serves invented UUIDs; it never contacts production APIs or opens the user's browser profile.
- Full frontend validation, isolated Chromium CI, merge checks, and GitHub Pages deployment/source-integrity verification are required before closure. Live signed repeat-visit preference restoration may be accepted separately; synthetic validation does **not** prove production speed gains or authorize local caching of any domain dataset.

## Recovery and evolution

Schema changes require an explicit IndexedDB version increment, reviewed migrations, and a reversible approach. A safe rollback restores the previous synchronous UI preference path; existing IDB entries remain limited to harmless layouts until their expiry. Clearing site data also removes the database. A storage quota failure does not block board access, render authoritative data, or clear the signed session.
