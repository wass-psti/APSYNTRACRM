import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync('frontend/workspace-ui.js','utf8');
const css=readFileSync('frontend/soft-minimalist.css','utf8');
test('workspace picker and browser keep signed data sources and improve meaningful labels',()=>{
 assert.match(ui,/data-ws01-action="browse">Browse all workspaces/);
 assert.match(ui,/class="ws01-search-label" for="ws01-menu-search"/);
 assert.match(ui,/class="ws01-search-label" for="ws01-browser-search"/);
 assert.match(ui,/data-ws01-count/);
 assert.match(ui,/visibleWorkspaces\(read\(\),\{tab,query:input\.value\}\)/);
 assert.match(ui,/data-ws01-filter/);
 assert.match(ui,/aria-pressed/);
 assert.match(ui,/options\.lifecycle\.discover\(\)/);
 assert.match(ui,/requestSignedWorkspaceSwitch/);
 assert.match(ui,/workspaceDetailsFor\(/);
});
test('workspace cards visually separate verified labels and retain role restrictions',()=>{
 assert.match(ui,/ws01-entry-copy/);
 assert.match(ui,/ws01-entry-badge/);
 assert.match(ui,/workspaceEntryRoleBadge\(row,options\)/);
 assert.match(css,/\.ws01-entry-button\{\s*display:grid;grid-template-columns:42px minmax\(0,1fr\)/);
 assert.match(css,/\.ws01-entry-badge\{\s*grid-column:2;grid-row:2/);
 assert.match(css,/\.ws01-entry-copy\{\s*grid-column:2;grid-row:1/);
 assert.match(ui,/row\.verifiedScope==='SIGNED_MEMBER_RPC'/);
});
test('workspace creation and invitation retain fail-closed signed behavior',()=>{
 assert.match(ui,/ws01-create-intro/);
 assert.match(ui,/id="ws01-name"/);
 assert.match(ui,/name="privacy" value="closed" checked/);
 assert.match(ui,/submitWorkspaceCreation\(/);
 assert.match(ui,/workspaceCreatorUiAllowed\(/);
 assert.match(ui,/name="role" value="member"/);
 assert.match(ui,/validateDirectEmailInvitation\(/);
 assert.match(ui,/options\.sendInvitation\(/);
 assert.match(ui,/\(enabled\?'':'disabled '\)/);
 assert.match(css,/CP-WS-UX-04/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/@media\(max-width:420px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(css,/url\(\s*https?:|@import/);
});

test('workspace quick search uses a single explicit icon and disables the native search glyph',()=>{
 assert.equal((ui.match(/class="ws01-menu-search-icon"/g)||[]).length,1);
 assert.match(ui,/class="ws01-menu-search-field"/);
 assert.match(css,/#ws01-menu-search\{[\s\S]*?-webkit-appearance:none;appearance:none/);
 assert.match(css,/#ws01-menu-search::-webkit-search-decoration/);
 assert.match(css,/#ws01-menu-search::-webkit-search-results-button/);
});
