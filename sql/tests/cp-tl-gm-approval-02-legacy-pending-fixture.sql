-- Synthetic pending GM quotation created before the new policy is installed.
\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',false);
SELECT public.tl03_document_create('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
 '88888888-8888-4888-8888-888888888881',
 '{"documentType":"quotation","documentNumber":"","date":"2026-11-25","customerName":"Synthetic legacy pending GM","verifiedBy":"Sales Supervisor","verifiedByEmail":"aacsenagan@watchdogautomation.com.ph","approvedBy":"Management","approvedByEmail":"asenagan@watchdogautomation.com.ph"}',
 'for-approval');
RESET ROLE;
