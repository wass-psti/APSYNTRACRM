-- Disposable PostgreSQL-only committed setup for two concurrent real connections.
\set ON_ERROR_STOP on
BEGIN;
UPDATE auth.users SET email='aacsenagan@watchdogautomation.com.ph',
 email_confirmed_at=now() WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
UPDATE public.work_board_members SET role='viewer'
 WHERE user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
INSERT INTO public.work_board_items(id,board_id,group_id,title,created_by,updated_by)
 VALUES('55555555-5555-4555-8555-555555555556',
 '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
 '867aeecd-ea67-4e2f-aec7-1207e2ebe20f','Q-PDF04-RACE',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO public.tradelink_documents
(id,board_id,workspace_id,board_item_id,document_type,document_number,
 workflow_state,revision,content,created_by,updated_by)
VALUES('66666666-6666-4666-8666-666666666667',
 '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
 '00000000-0000-4000-8000-000000000001',
 '55555555-5555-4555-8555-555555555556','quotation',
 'Q-PDF04-RACE','submitted',3,
 '{"documentType":"quotation","documentNumber":"Q-PDF04-RACE",
 "verifiedByEmail":"aacsenagan@watchdogautomation.com.ph",
 "approvedByEmail":"asenagan@watchdogautomation.com.ph"}'::jsonb,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
COMMIT;
