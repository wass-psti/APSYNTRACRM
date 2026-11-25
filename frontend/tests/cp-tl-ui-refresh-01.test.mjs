import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {
  renderTradeLinkDraftWorkspace,
  initialTradeLinkDraftView
} from '../tradelink-draft-workspace.js';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';

const workspaceId='00000000-0000-4000-8000-000000000001';
const detail={
  board:{
    id:TRADELINK_BOARD_ID,
    workspace_id:workspaceId,
    name:'TradeLink',
    status:'active',
    description:'[APSYNTRA:MODULE:tradelink:v1]'
  },
  items:[],
  groups:[],
  columns:[]
};

function render(type='quotation'){
  return renderTradeLinkDraftWorkspace({
    detail,
    workspaceId,
    canManage:true,
    view:initialTradeLinkDraftView(type)
  });
}

test('all six document modules provide direct navigation to their real editor sections',()=>{
  const modules=['esi','packing','delivery','payment','quotation','po'];
  for(const type of modules){
    const html=render(type);
    assert.match(html,/class="tl-reference-section-nav"/,type);
    for(const id of ['document','client','items','notes','terms','approval']){
      assert.match(html,new RegExp('id="tl-section-'+id+'"'),type+':'+id);
      assert.match(html,new RegExp('data-target="tl-section-'+id+'"'),type+':'+id);
    }
    assert.equal(
      html.includes('id="tl-section-totals"'),
      ['esi','quotation','po'].includes(type),
      type+':totals'
    );
  }
});

test('priced line items expose visible field labels while retaining accessible labels and placeholders',()=>{
  const html=render('quotation');
  for(const label of ['Item 1 description','Quantity','Unit price (PHP)']){
    assert.ok(html.includes('class="tl-ref-item-label"'),label);
    assert.ok(html.includes(label),label);
  }
  assert.match(html,/class="sr-only">Item 1 description/);
  assert.match(html,/placeholder="Enter item description"/);
  assert.match(html,/placeholder="Enter quantity"/);
  assert.match(html,/placeholder="Enter unit price"/);
});

test('physical item rows retain unit and serial inputs in the shared responsive editor',()=>{
  const html=render('delivery');
  assert.match(html,/class="tl-ref-item-label" aria-hidden="true">Unit/);
  assert.match(html,/name="lineUnit"/);
  assert.match(html,/name="lineSerialNumber"/);
  assert.match(html,/placeholder="Enter unit"/);
});

test('refresh styles stay scoped, responsive, keyboard accessible and reduced-motion aware',()=>{
  const css=readFileSync('frontend/tradelink-ui-refresh.css','utf8');
  const manifest=readFileSync('scripts/priority5-style-manifest.mjs','utf8');
  const app=readFileSync('frontend/app.js','utf8');
  assert.ok(STYLE_SOURCES.includes('frontend/tradelink-reference-ui.css'));
  assert.ok(STYLE_SOURCES.includes('frontend/tradelink-ui-refresh.css'));
  assert.equal(STYLE_BUNDLE,'frontend/apsyntra-styles.bundle.css');
  assert.equal(
    STYLE_SOURCES.indexOf('frontend/tradelink-ui-refresh.css'),
    STYLE_SOURCES.length-1
  );
  assert.match(css,/CP-TL-UI-REFRESH-01/);
  assert.ok(css.includes('.tl-reference-portal .tl-reference-document-topcard{'));
  assert.ok(css.includes('.tl-reference-items .tl-reference-line-item>.tl-ref-item-description'));
  assert.ok(css.includes('.tl-reference-section-nav'));
  assert.ok(css.includes('.tl-reference-items .tl-reference-line-item .tl-draft-field>.tl-ref-item-label'));
  assert.ok(css.includes('.tl-reference-client [data-tl-commercial-choice]>label>span'));
  assert.ok(css.includes('scroll-margin-top:218px'));
  assert.ok(css.includes('@media(max-width:760px)'));
  assert.ok(css.includes('@media(max-width:620px)'));
  assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));
  assert.ok(css.includes(':has(.tl-ref-item-unit)'));
  assert.ok(css.includes('color-scheme:light'));
  assert.doesNotMatch(css,/data-aps-monday-theme|crm-native-|dark-mode/i);
  assert.match(app,/case 'tradelink-draft-section'/);
  assert.match(app,/section\.scrollIntoView/);
  assert.match(app,/prefers-reduced-motion: reduce/);
});
