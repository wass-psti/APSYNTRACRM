import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync('frontend/tradelink-reference-ui.css','utf8');
const app=readFileSync('frontend/tradelink-application.js','utf8');
const client=readFileSync('frontend/tradelink-domain-client.js','utf8');

test('rebuilt TradeLink shell is scoped, flat, and does not alter security contracts',()=>{
 assert.match(css,/CP-TL-REBUILD-01: front-end-first enterprise shell/);
 assert.match(css,/\.aps-tradelink-app\.tl-reference-portal\{/);
 assert.match(css,/\.tl-reference-portal \.tl-app-layout\{\s*display:grid;grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.tl-reference-portal \.tl-app-nav\{[\s\S]*?border-radius:0;background:transparent;box-shadow:none/);
 assert.match(css,/\.tl-reference-portal \.tl-reference-portal-links :is\(a,summary\):focus-visible/);
 assert.match(css,/@media\(max-width:850px\)/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(app,/renderTradeLinkDraftWorkspace\(\{detail,workspaceId,view:draftView,canManage,actorName\}\)/);
 assert.match(app,/renderTradeLinkDocumentRepository\(\{detail,workspaceId,view:draftView,canManage\}\)/);
 assert.match(client,/TL03_DOMAIN_WRITES_ENABLED/);
});
