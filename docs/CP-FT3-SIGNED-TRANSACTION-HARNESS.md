# CP-FT3 — Same-session signed acceptance preflight

Status: **IMPLEMENTED-UNVERIFIED in production**. This is a read-only
prerequisite, not transaction or release acceptance.

## Use

Open the FuelTrack+ v3 application in the **existing authenticated APSYNTRA CRM
session** and select **Verify signed FuelTrack access (read-only)**. The command
uses the existing `DomainApi`, `Auth` and active workspace; it does not ask for,
copy, log or export an access token.

The command checks:
- Signed FuelTrack `fueltrack_v3_read` response contract and Board/workspace.
- Signed `fueltrack_v3_analytics` response scope.
- Admin signed audit read **or** User audit read **denial**.
- Wrong Board `fueltrack_v3_read` **denial**.

The report includes only the module role and check labels or an error. A failure
must be treated as blocked. Navigation, route/session/workspace changes discard
the report. This command performs **zero production mutations**. It is not a
substitute for separate Admin and User sessions and does not test revoked-session
behavior.

## Required separate transaction acceptance

Using authorized Admin and User sessions, and only after separately approved
production test-data writes (or a nonproduction environment with equivalent
authorization), verify:
1. Request submit and duplicate idempotency key; signed re-read and Board item
   identity/persistence after refresh.
2. Admin approval, refueling, and completion transitions with expected revision,
   stale-revision and denied-actor checks; audit parity.
3. Private receipt image upload, registration, signed retrieval and improper
   workspace/actor/bucket/path/size/MIME denials.
4. Distinct standard User visibility, foreign workspace/wrong-Board denial,
   revoked/expired session rejection and logout persistence.
5. Protected PR checks, approved merge, GitHub Pages deployed asset hashes, and
   authenticated browser regression.

Nothing in this report constitutes proof of steps 1–5 or authorizes a protected
merge. The UI is on feature branch PR #185 until the actual release.
