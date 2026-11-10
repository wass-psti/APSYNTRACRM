# CP-FT3 Functional Access Simplification — 2026-11-11

## Decision

FuelTrack domain workflows use the existing signed workspace identity and FuelTrack module role. They no longer require generic Board edit permission as a second, unrelated gate.

- A signed FuelTrack User with access to view the FuelTrack Board can submit and read their own requests.
- A signed FuelTrack Admin with access to view the FuelTrack Board can perform approval, refueling, and receipt workflows.
- Generic Board editing, column/group changes, and ordinary item mutations continue to require the existing Board edit permission.
- Foreign workspaces, missing/expired sessions, inactive profiles, missing module access, unsupported module roles, and users without Board view remain denied.
- Receipt upload remains Admin-only, private, limited to an eligible linked request after refueling, restricted to the request's Board/item path, image MIME/extension, and 5 MiB. Only unregistered orphan uploads may be cleaned up by their uploader; registered receipts remain protected by the existing deletion policy.

## Implementation

The forward-only migration 20261111001400_fueltrack_v3_module_scoped_workflows.sql:

1. Changes the internal FuelTrack guard to require Board view, not generic Board edit, while retaining module role checks and Admin-only operations.
2. Adds private, non-callable-by-clients helpers for creating the FuelTrack Board projection and registering its receipt file metadata. These preserve Board position/status defaults, Board event logging, workspace scope, request linkage, and transactional behavior without granting generic Board edit rights.
3. Replaces FuelTrack submit/receipt RPC internals to use those helpers.
4. Adds narrow Storage insert and orphan-cleanup policies for eligible FuelTrack Admin receipt paths. The shared bucket remains private; existing generic Board attachment policies remain unchanged.

Frontend controls now derive FuelTrack operations from the verified signed FuelTrack snapshot role. Generic Board UI still uses the original Board edit permission.

## Verification

Run ./scripts/fueltrack-v3-backend-disposable.sh and the frontend Node test suite. Disposable PostgreSQL coverage includes Board-view-only User submission, Board-view-only Admin approval/refueling/receipt upload, generic Board edit denial, direct helper denial, Storage MIME/size/path restrictions, orphan cleanup, registered-receipt deletion denial, idempotency, Board synchronization, and legacy migration preflight.

## Production status

This is a source-controlled forward migration. It has NOT been applied to the production Supabase project in this implementation increment. Production activation and signed live acceptance remain separate release evidence; do not infer them from disposable PostgreSQL tests.
