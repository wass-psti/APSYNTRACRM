import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderRoleConfiguration} from '../role-configuration-ui.js';

const data={workspaceId:'example-workspace',roles:[],users:[],boards:[],assignments:[],proposals:[],audit:[]};
test('deprecated global matrix cannot stage app permissions or members',()=>{
 const markup=renderRoleConfiguration({verified:true,data,tab:'roles'});
 assert.doesNotMatch(markup,/data-action="role-propose-permission"|data-action="role-propose-assign"/);
 assert.doesNotMatch(markup,/Permission matrix|Module permission proposal matrix/);
 const source=readFileSync('frontend/role-configuration-ui.js','utf8');
 assert.doesNotMatch(source,/function matrix\(/);
});
test('role configuration tables expose scrollable accessible regions without disclosing denied data',()=>{
 const allowed=renderRoleConfiguration({verified:true,data,tab:'roles'});
 assert.match(allowed,/tabindex="0" role="region" aria-label="CRM platform role reference, scroll horizontally for more columns"/);
 const denied=renderRoleConfiguration({verified:false,data:{...data,users:[{email:'hidden@example.invalid'}]}});
 assert.doesNotMatch(denied,/hidden@example.invalid|role-table-scroll/);
 const css=readFileSync('frontend/role-configuration-experience.css','utf8');
 assert.match(css,/role-table-scroll:focus-visible/);
 assert.match(css,/role-config-tabs \.role-tab-button\{[\s\S]*min-height:44px/);
});
