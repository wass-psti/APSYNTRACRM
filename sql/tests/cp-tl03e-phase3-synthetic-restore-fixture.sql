-- CP-TL-03E Phase 3: disposable synthetic recovery fixture; NOT production schema.
\set ON_ERROR_STOP on
SELECT CASE WHEN current_database() = 'cp_tl03e_recovery_source'
 THEN 'SOURCE_DATABASE_ISOLATED' ELSE 1/0::text END;
CREATE ROLE recovery_actor NOLOGIN;
CREATE TABLE recovery_memberships (
 actor_id uuid NOT NULL, workspace_id uuid NOT NULL,
 PRIMARY KEY(actor_id, workspace_id)
);
CREATE TABLE recovery_boards (
 item_id uuid PRIMARY KEY, workspace_id uuid NOT NULL,
 title text NOT NULL, revision integer NOT NULL CHECK (revision > 0)
);
CREATE TABLE recovery_attendance (
 event_id uuid PRIMARY KEY, workspace_id uuid NOT NULL,
 employee_ref text NOT NULL, minutes integer NOT NULL CHECK (minutes >= 0)
);
CREATE TABLE recovery_storage_manifest (
 object_key text PRIMARY KEY, workspace_id uuid NOT NULL,
 expected_sha256 text NOT NULL CHECK (length(expected_sha256)=64)
);
INSERT INTO recovery_memberships VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222');
INSERT INTO recovery_boards VALUES
 ('10000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Synthetic board A',1),
 ('10000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','Synthetic board B',2);
INSERT INTO recovery_attendance VALUES
 ('20000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','synthetic-A',480),
 ('20000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','synthetic-B',240);
INSERT INTO recovery_storage_manifest VALUES
 ('synthetic/fixture.txt','11111111-1111-4111-8111-111111111111',:'storage_sha');
GRANT SELECT ON recovery_memberships,recovery_boards,recovery_attendance,recovery_storage_manifest TO recovery_actor;
ALTER TABLE recovery_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_storage_manifest ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_self ON recovery_memberships FOR SELECT TO recovery_actor
 USING (actor_id::text = current_setting('app.synthetic_actor',true));
CREATE POLICY board_scope ON recovery_boards FOR SELECT TO recovery_actor
 USING (EXISTS (SELECT 1 FROM recovery_memberships m
   WHERE m.actor_id::text = current_setting('app.synthetic_actor',true)
     AND m.workspace_id=recovery_boards.workspace_id));
CREATE POLICY attendance_scope ON recovery_attendance FOR SELECT TO recovery_actor
 USING (EXISTS (SELECT 1 FROM recovery_memberships m
   WHERE m.actor_id::text = current_setting('app.synthetic_actor',true)
     AND m.workspace_id=recovery_attendance.workspace_id));
CREATE POLICY storage_scope ON recovery_storage_manifest FOR SELECT TO recovery_actor
 USING (EXISTS (SELECT 1 FROM recovery_memberships m
   WHERE m.actor_id::text = current_setting('app.synthetic_actor',true)
     AND m.workspace_id=recovery_storage_manifest.workspace_id));
