/** CP-TL-03D reference-led UI acceptance: presentation-only, never API activation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {renderTradeLinkApplication,TRADELINK_SOURCE_MODULES} from '../tradelink-application.js';
import {renderTradeLinkDraftWorkspace,initialTradeLinkDraftView,parseTradeLinkDraftForm} from '../tradelink-draft-workspace.js';
import {TL03_DOMAIN_READS_ENABLED,TL03_DOMAIN_WRITES_ENABLED} from '../tradelink-domain-client.js';
const signedWorkspace='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:signedWorkspace,
 name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},
 groups:[],items:[],columns:[]};
const draft=(type,values=null)=>renderTradeLinkDraftWorkspace({
 detail,workspaceId:signedWorkspace,canManage:true,
 view:{...initialTradeLinkDraftView(type),
  ...(values?{formValues:{documentType:type,...values}}:{})}
});

test('reference portal is scoped to the genuine signed TradeLink board and uses working routes',()=>{
 const html=renderTradeLinkApplication({
  detail,workspaceId:signedWorkspace,section:'drafts',
  draftView:initialTradeLinkDraftView('quotation'),canManage:true
 });
 assert.match(html,/class="aps-tradelink-app tl-reference-portal"/);
 assert.match(html,/class="tl-reference-topbar"/);
 assert.match(html,/TradeLink<\/strong><small>PORTAL<\/small>/);
 assert.match(html,/aria-label="TradeLink actions"/);
 assert.match(html,/Create New/);
 assert.match(html,/All Documents/);
 assert.match(html,/href="#\/boards\/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88\/tradelink\/documents"/);
 assert.match(html,/class="tl-reference-manual"/);
 assert.match(html,/Disaster Recovery<\/span>/);
 assert.match(html,/aria-disabled="true"/);
 assert.match(html,/Signed workspace/);
 assert.doesNotMatch(html,/(?:Save successful|Draft saved \d|PDF generated)/);
 const foreign=renderTradeLinkApplication({detail,
  workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',section:'drafts'});
 assert.match(foreign,/signed workspace access is unavailable/);
 assert.doesNotMatch(foreign,/data-tradelink-draft-form/);
});

test('all six modules use screenshot-led document cards, accessible tabs and no false write actions',()=>{
 assert.equal(TRADELINK_SOURCE_MODULES.length,6);
 const titles={
  esi:'Electronic Sales Invoice',packing:'Packing List',
  delivery:'Delivery Receipt',
  payment:'Electronic Payment Acknowledgement Receipt',
  quotation:'Quotation',po:'Purchase Order to Suppliers'
 };
 for(const module of TRADELINK_SOURCE_MODULES){
  const html=draft(module.key);
  assert.ok(html.includes(titles[module.key]),module.key);
  assert.ok(html.includes('<option value="'+module.key+'" selected>'),module.key);
  assert.match(html,/class="tl-reference-document-topcard"/);
  assert.match(html,/class="tl-reference-document-tabs"/);
  assert.equal((html.match(/href="#\/boards\/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88\/tradelink\/drafts\//g)||[]).length,6);
  assert.match(html,/aria-current="page"/);
  assert.match(html,/Document Information/);
  assert.match(html,/Client Information/);
  assert.match(html,/Terms &amp; Conditions/);
  assert.match(html,/name="documentNumber"/);
  assert.match(html,/data-action="tradelink-draft-preview"/);
  assert.match(html,/data-action="tradelink-draft-clear"/);
  assert.match(html,/Generate PDF<\/button>/);
  assert.match(html,/title="PDF generation requires an authorized workflow"/);
  assert.match(html,/type="submit" class="primary" disabled/);
  assert.match(html,/No PDF, approval or document is generated/);
  assert.equal(TL03_DOMAIN_READS_ENABLED,false);
  assert.equal(TL03_DOMAIN_WRITES_ENABLED,false);
 }
});

test('reference items, financial previews and workflow fields preserve module-specific requirements',()=>{
 const expected={
  esi:['lineDescription','customerTin','verifiedBy','approvedBy'],
  packing:['lineDescription','referenceNumber','lineQuantity'],
  delivery:['lineSerialNumber','checkedBy','deliveredBy'],
  payment:['cashAmount','chequeAmount','receivedBy','verifiedBy'],
  quotation:['validity','deliveryCommitment','paymentTerms','approvedBy'],
  po:['targetDeliveryDate','paymentTerms','verifiedBy','approvedBy']
 };
 for(const [type,fields] of Object.entries(expected)){
  const html=draft(type);
  for(const key of fields)assert.ok(html.includes('name="'+key+'"'),type+':'+key);
  assert.equal(html.includes('data-tradelink-draft-finance'),['esi','quotation','po'].includes(type));
  assert.equal(html.includes('class="tl-draft-lines tl-reference-items"'),type!=='payment');
 }
});

test('disabled signed listing follows main editor and must not display synthetic rows',()=>{
 const html=draft('quotation');
 assert.ok(html.indexOf('tl-reference-document-topcard')<html.indexOf('tl-reference-list-details'));
 assert.match(html,/Controlled dark launch/);
 assert.match(html,/data-action="tradelink-draft-refresh" disabled/);
 assert.match(html,/No persisted TradeLink Draft records are displayed/);
 assert.match(html,/current signed, authorized response \(maximum 50 records\)/);
});

test('untrusted local fields are escaped and existing draft parser remains authoritative',()=>{
 const html=draft('quotation',{customerName:'"><img src=x onerror=alert(1)>',
  remarks:'<script>alert(1)</script>'});
 assert.doesNotMatch(html,/<img src=x|<script>alert/);
 assert.match(html,/&lt;img/);
 assert.match(html,/&lt;script&gt;/);
 const fields=new Map([
  ['documentType','packing'],['documentNumber','PL-LOCAL-01'],
  ['customerName','Consignee'],['referenceNumber','REF-12'],
  ['lineDescription','Packed equipment'],['lineQuantity','2']
 ]);
 const envelope=parseTradeLinkDraftForm({get:key=>fields.get(key)||''},{lineId:()=> 'line1'});
 assert.equal(envelope.documentType,'packing');
 assert.equal(envelope.items.length,1);
 assert.equal(envelope.customerName,'Consignee');
});

test('CSS scope, responsive rules and reduced-motion behavior are bounded to TradeLink',()=>{
 const css=readFileSync('frontend/tradelink-reference-ui.css','utf8');
 const index=readFileSync('index.html','utf8');
 const app=readFileSync('frontend/tradelink-application.js','utf8');
 const draftSource=readFileSync('frontend/tradelink-draft-workspace.js','utf8');
 assert.match(index,/tradelink-application\.css"\/>[\s\S]*tradelink-reference-ui\.css"\/>/);
 assert.match(css,/\.aps-tradelink-app\.tl-reference-portal/);
 assert.match(css,/\.tl-reference-portal \.tl-reference-topbar/);
 assert.match(css,/\.tl-reference-portal \.tl-reference-document-tabs a\.active/);
 assert.match(css,/@media\(max-width:1200px\)/);
 assert.match(css,/@media\(max-width:850px\)/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/summary:focus-visible/);
 assert.match(app,/aria-disabled="true"/);
 assert.doesNotMatch(draftSource,/localStorage|sessionStorage|indexedDB|service_role|sb_secret|fetch\(/);
 assert.doesNotMatch(app,/TL03_DOMAIN_(?:READS|WRITES)_ENABLED\s*=\s*true/);
});
