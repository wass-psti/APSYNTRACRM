-- CP-CRM-WORKSPACE-INVITE-PRODUCTION-ACTIVATION-01
-- Read-only inventory; intentionally no migrations, data/role/flag edits.
-- Execute through the existing Supabase read-only SQL interface before rollout.
WITH prerequisites AS (
 SELECT 'workspace membership model' AS dependency,
   to_regclass('public.profiles') IS NOT NULL
   AND to_regclass('public.workspaces') IS NOT NULL
   AND to_regclass('public.workspace_members') IS NOT NULL AS ready
 UNION ALL SELECT 'signed session verification',
   to_regprocedure('private.ws01_signed_actor_session()') IS NOT NULL
   AND to_regclass('auth.sessions') IS NOT NULL
 UNION ALL SELECT 'native workspace scope',
   to_regprocedure('public.current_workspace_id(uuid)') IS NOT NULL
 UNION ALL SELECT 'workspace owner roles',
   to_regclass('private.ws01_member_roles') IS NOT NULL
 UNION ALL SELECT 'digest extension',
   to_regprocedure('extensions.digest(bytea,text)') IS NOT NULL
 UNION ALL SELECT 'invitation schema and feature flag',
   to_regclass('private.ws02d_invitations') IS NOT NULL
   AND to_regclass('private.ws02d_invitation_flags') IS NOT NULL
 UNION ALL SELECT 'trusted issuance and acceptance',
   to_regprocedure('private.ws02d_issue(uuid,text,text,uuid)') IS NOT NULL
   AND to_regprocedure('private.ws02d_accept(text)') IS NOT NULL
 UNION ALL SELECT 'trusted invitation manager',
   to_regprocedure('private.ws11_list_invitations(uuid)') IS NOT NULL
   AND to_regprocedure('private.ws11_revoke_invitation(uuid,uuid)') IS NOT NULL
 UNION ALL SELECT 'provider delivery ledger',
   to_regclass('private.ws02d_invitation_delivery') IS NOT NULL
   AND to_regprocedure('private.ws02d_delivery_prepare(uuid,uuid,uuid)') IS NOT NULL
   AND to_regprocedure('private.ws02d_delivery_record(uuid,uuid,text,text)') IS NOT NULL
 UNION ALL SELECT 'native browser isolation',
   CASE WHEN to_regclass('private.ws02d_invitations') IS NULL THEN FALSE
     ELSE NOT COALESCE(has_table_privilege('authenticated',
       to_regclass('private.ws02d_invitations'),'SELECT'),FALSE) END
)
SELECT dependency,CASE WHEN ready THEN 'PRESENT' ELSE 'MISSING' END AS verified_state
FROM prerequisites ORDER BY dependency;
