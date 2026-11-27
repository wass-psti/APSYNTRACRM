# CP-TL-OPT-04B — Snapshot and Asset Foundation

## Scope
- Correct the v1.42.0 PostgreSQL semantic-version check.
- Require company and template rows to share the same profile version.
- Preserve the existing immutable profile, template, revision and rendering-snapshot model.
- Publish byte-for-byte, Git-blob-addressed copies of six company logos and two TradeLink stylesheets under the exact logical asset paths referenced by the migration.
- Extend disposable PostgreSQL acceptance to cover version pairing, unpaired versions, semantic-version validation and historical snapshot immutability.

## Immutable asset layout
- `frontend/assets/tradelink/profiles/v1/` contains the six versioned PNG assets.
- `frontend/assets/tradelink/templates/` contains the two v1.42.0 CSS assets.
- Each published file must have the same Git blob SHA-1 and bytes as its existing source file.
- The existing source assets remain unchanged.

## Database acceptance
- PostgreSQL 17 disposable instance only.
- 63 historical revision snapshots: 47 legacy-derived and 16 legacy-defaulted.
- New revision capture and signed historical RPC readback.
- New company/template profile version 2 resolves only to matching template profile version 2.
- A profile without a matching template version fails rather than silently combining versions.
- Existing v1.42.0 historical snapshots remain unchanged after adding v1.43.0 fixtures.
- Malformed semantic template versions are rejected.

## Production activation gate
Production migration `20261127120000` remains unapplied until this workflow passes. The production migration will then be applied once, followed by read-only verification of the 63-row backfill and RPC availability.

## Next integration
After the database and asset foundation is accepted, CP-TL-OPT-04B frontend work connects the exact revision snapshot to the existing TradeLink Print PDF action and runs all 18 module/company PDF combinations in Chromium and PDFKit.
