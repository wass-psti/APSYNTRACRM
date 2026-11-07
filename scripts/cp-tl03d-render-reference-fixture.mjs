/** Synthetic-only TradeLink screenshot fixture for isolated browser geometry tests.
 * Never imports real auth, sessions, production data, or a domain RPC client.
 */
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {TRADELINK_BOARD_ID} from '../frontend/tradelink-board-items.js';
import {renderTradeLinkApplication} from '../frontend/tradelink-application.js';
import {initialTradeLinkDraftView} from '../frontend/tradelink-draft-workspace.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const type=args[0]||'quotation';
const output=resolve(args[1]||'/tmp/tradelink-reference-quotation.html');
const allowed=new Set(['esi','packing','delivery','payment','quotation','po']);
if(!allowed.has(type))throw Error('Invalid fixture module');
const workspaceId='00000000-0000-4000-8000-000000000001';
const detail={board:{
 id:TRADELINK_BOARD_ID,workspace_id:workspaceId,name:'TradeLink',
 status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},
 groups:[],items:[],columns:[]};
const view=initialTradeLinkDraftView(type);
const markup=renderTradeLinkApplication({
 detail,workspaceId,section:'drafts',draftView:view,canManage:true
});
const stylesheet=(name)=>pathToFileURL(resolve(root,'frontend',name)).href;
const html='<!doctype html><html lang="en"><head>'+
 '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>TradeLink synthetic reference fixture · '+type+'</title>'+
 '<link rel="stylesheet" href="'+stylesheet('tradelink-application.css')+'">'+
 '<link rel="stylesheet" href="'+stylesheet('tradelink-reference-ui.css')+'">'+
 '<style>html{box-sizing:border-box}*,*::before,*::after{box-sizing:inherit}'+
 'body{margin:0;padding:24px 28px;background:#f8fafc;color:#17191e;'+
 'font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}'+
 '@media(max-width:620px){body{padding:12px}}</style></head><body>'+
 '<main id="fixture-surface">'+markup+'</main>'+
 '<script>window.addEventListener("load",()=>{'+
 'const r=s=>{const x=document.querySelector(s);if(!x)return null;'+
 'const b=x.getBoundingClientRect();return {top:b.top,left:b.left,width:b.width,height:b.height,bottom:b.bottom}};'+
 'const h=document.documentElement;const overflow=Math.max(0,Math.ceil(h.scrollWidth-innerWidth));'+
 'const header=r(".tl-reference-topbar"),top=r(".tl-reference-document-topcard"),'+
 'editor=r(".tl-reference-editor-content"),tabs=r(".tl-reference-document-tabs");'+
 'const ordered=!!header&&!!top&&!!editor&&!!tabs&&top.top>=header.bottom&&editor.top>=top.bottom;'+
 'h.dataset.tlHorizontalOverflow=String(overflow);'+
 'h.dataset.tlGeometryValid=String(ordered&&header.width>=300&&top.width>=300&&editor.width>=300&&tabs.width>0);'+
 'h.dataset.tlViewport=String(innerWidth);'+
 '});</script></body></html>';
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,html,'utf8');
console.log(output);
