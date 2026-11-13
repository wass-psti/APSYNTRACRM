import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderRoleConfiguration} from '../role-configuration-ui.js';

const data={workspaceId:'example-workspace',roles:[],users:[],boards:[],assignments:[],proposals:[],audit:[]};
test('matrix proposes no new effective privileges and each action identifies its module and capability',()=>{
 const markup=renderRoleConfiguration({verified:true,data,tab:'matrix'});
 const names=[...markup.matchAll(/aria-label="Stage ([^"]+)"/g)].map(m=>m[1]);
 assert.equal(names.length,84);
 assert.equal(new Set(names).size,84);
 assert.ok(names.every(name=>name.includes('proposal for ')&&name.includes('no live permission change')));
 assert.equal((markup.match(/data-action="role-propose-permission"/g)||[]).length,84);
 assert.equal((markup.match(/title="Stage a proposal; no live change"/g)||[]).length,84);
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
