-- Synthetic pre-migration TradeLink document for baseline snapshot acceptance.
\set ON_ERROR_STOP on
UPDATE auth.users SET email='revision-manager@example.test',email_confirmed_at=pg_catalog.clock_timestamp()
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE auth.users SET email='revision-primary@example.test',email_confirmed_at=pg_catalog.clock_timestamp()
 WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
UPDATE auth.users SET email='revision-secondary@example.test',email_confirmed_at=pg_catalog.clock_timestamp()
 WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
INSERT INTO public.work_board_items(id,board_id,group_id,title,created_by,updated_by,updated_at)
VALUES('99999999-9999-4999-8999-999999999991',
 '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','867aeecd-ea67-4e2f-aec7-1207e2ebe20f',
 'Q-REV-HISTORY-001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-11-16T08:00:00Z');
INSERT INTO public.tradelink_documents(
 id,board_id,workspace_id,board_item_id,document_type,document_number,workflow_state,
 revision,content,created_by,updated_by,created_at,updated_at
) VALUES(
 '99999999-9999-4999-8999-999999999992',
 '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','00000000-0000-4000-8000-000000000001',
 '99999999-9999-4999-8999-999999999991','quotation','Q-REV-HISTORY-001','for-approval',1,
 jsonb_build_object('documentType','quotation','documentNumber','Q-REV-HISTORY-001',
  'verifiedByEmail','revision-primary@example.test','approvedByEmail','revision-secondary@example.test',
  'vendorId','watchdog-sales','templateId','watchdog-sales-v1','currency','PHP',
  'customerName','Revision history QA','items',jsonb_build_array(
   jsonb_build_object('kind','item','description','Initial revision','quantity',1,'unitPrice',100))),
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '2026-11-16T08:00:00Z','2026-11-16T08:00:00Z');
