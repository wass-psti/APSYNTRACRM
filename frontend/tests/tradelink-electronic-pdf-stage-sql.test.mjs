import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('sql/tradelink-electronic-pdf-approval-stage-candidate.sql','utf8');
test('signed PDF stage candidate stays source-only and has locked revision/account/stage checks',()=>{
 for(const pattern of [
  /NON-DEPLOYED/,/DO NOT/i,/BEGIN;/,/COMMIT;/,
  /ENABLE ROW LEVEL SECURITY/,/tl03_pdf_approval_append_only/,/private\.tl03_deny_event_change/,/REVOKE ALL ON private\.tradelink_pdf_approval_events/,
  /private\.tl03_can_pdf_approve\(p_board_id\)/,/private\.wm_board_config_session_active\(\)/,/public\.work_board_access\(p_board_id,'view'\)/,/public\.module_role_for\('tradelink',actor\)/,/auth\.uid\(\)/,
  /email_confirmed_at IS NOT NULL/,/FOR UPDATE/,
  /d\.revision IS DISTINCT FROM p_expected_revision/,
  /d\.workspace_id IS DISTINCT FROM public\.current_workspace_id\(actor\)/,
  /projection\.title IS DISTINCT FROM d\.document_number/,
  /verified_email IS DISTINCT FROM nominated/,
  /Primary review required before secondary verification/,
  /UNIQUE\(document_id,document_revision,stage\)/,
  /pg_catalog\.clock_timestamp\(\)/,
  /SECURITY INVOKER SET search_path=''/,
  /REVOKE ALL ON FUNCTION public\.tl03_record_pdf_approval_stage/,
  /FROM PUBLIC,anon,authenticated/
 ])assert.match(sql,pattern);
 assert.doesNotMatch(sql,/\bGRANT\s+(?:INSERT|UPDATE|DELETE)\s+ON\s+(?:TABLE\s+)?private\.tradelink_pdf_approval_events/);
 assert.doesNotMatch(sql,/\bservice_role\b|\buser_metadata\b/);
});
test('all non-packing modules have two independent assigned actor stages',()=>{
 for(const type of ['quotation','esi','po','delivery','payment'])
  assert.match(sql,new RegExp("WHEN '"+type+"' THEN"));
 assert.match(sql,/p_stage='secondary'/);
 assert.match(sql,/stage='primary'/);
 assert.match(sql,/document_type NOT IN \('esi','quotation','po','delivery','payment'\)/);
 assert.match(sql,/aacsenagan@watchdogautomation\.com\.ph/);
 assert.match(sql,/amsenagan@watchdogautomation\.com\.ph/);
});

test('signed read never returns previous revisions or another workspace',()=>{
 assert.match(sql,/CREATE FUNCTION private\.tl03_pdf_approval_stages/);
 assert.match(sql,/e\.document_revision=d\.revision/);
 assert.match(sql,/d\.workspace_id IS DISTINCT FROM public\.current_workspace_id\(actor\)/);
 assert.match(sql,/SECURITY INVOKER SET search_path='' AS \$read_rpc\$/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.tl03_pdf_approval_stages/);
 assert.doesNotMatch(sql,/\bGRANT\s+SELECT\s+ON\s+private\.tradelink_pdf_approval_events/);
});
test('client does not call an absent stage endpoint before authorized activation',async()=>{
 const {TradeLinkDomainClient,TL03_PDF_STAGE_ENABLED}=await import('../tradelink-domain-client.js');
 assert.equal(TL03_PDF_STAGE_ENABLED,false);
 let called=false;
 const client=new TradeLinkDomainClient({auth:{getVerifiedUser:async()=>{called=true;}},api:{rpc:async()=>{called=true;}}});
 await assert.rejects(()=>client.recordPdfStage({documentId:'invalid',stage:'primary'}),/awaits signed backend activation/);
 await assert.rejects(()=>client.pdfStages({documentId:'invalid'}),/await signed backend activation/);
 assert.equal(called,false);
});
