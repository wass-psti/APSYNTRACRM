\set ON_ERROR_STOP on
DO $tests$
DECLARE
 w uuid:='11111111-1111-4111-8111-111111111111';
 other uuid:='22222222-2222-4222-8222-222222222222';
 active_user uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 disabled_user uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 inactive_user uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
BEGIN
 -- Workspace-owned FRT membership must override conflicting legacy + generic roles.
 IF public.apsyntra_scoped_module_role('fund-released-tracker',active_user,w) IS DISTINCT FROM 'REQUESTOR' THEN
  RAISE EXCEPTION 'Active workspace Fund Tracker REQUESTOR was not projected'; END IF;
 -- A disabled FRT membership must explicitly block fallback to stale legacy access.
 IF public.apsyntra_scoped_module_role('fund-released-tracker',disabled_user,w) IS NOT NULL THEN
  RAISE EXCEPTION 'Disabled FRT membership leaked legacy role'; END IF;
 IF public.apsyntra_scoped_module_role('fund-released-tracker',inactive_user,w) IS NOT NULL THEN
  RAISE EXCEPTION 'Inactive user or workspace leaked FRT role'; END IF;
 -- The same user in another workspace must not inherit the first workspace FRT role.
 IF public.apsyntra_scoped_module_role('fund-released-tracker',active_user,other) IS DISTINCT FROM 'GENERAL_MANAGER' THEN
  RAISE EXCEPTION 'Legacy role fallback missing when no local membership'; END IF;
 -- Other native applications retain their existing scoped/global resolution.
 IF public.apsyntra_scoped_module_role('time-tracker',active_user,w) IS DISTINCT FROM 'Employee' THEN
  RAISE EXCEPTION 'TimeTracker role regression'; END IF;
 IF public.apsyntra_scoped_module_role('tradelink',active_user,w) IS DISTINCT FROM 'User' THEN
  RAISE EXCEPTION 'TradeLink scoped role regression'; END IF;
 -- Disabled membership can be reactivated without creating a duplicate registration.
 UPDATE public.frt_memberships SET enabled=true,status='active' WHERE workspace_id=w AND user_id=disabled_user;
 IF public.apsyntra_scoped_module_role('fund-released-tracker',disabled_user,w) IS DISTINCT FROM 'FINANCE_MANAGER' THEN
  RAISE EXCEPTION 'Reactivated FRT membership was not resolved'; END IF;
 RAISE NOTICE 'PASS: Fund Tracker role source parity, workspace isolation, disabled precedence, legacy fallback, other native applications';
END;
$tests$;
