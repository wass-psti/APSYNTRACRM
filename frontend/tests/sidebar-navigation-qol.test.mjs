import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync('frontend/app.js','utf8');
const css=readFileSync('frontend/sidebar-experience.css','utf8');
const workspace=readFileSync('frontend/workspace-ui.js','utf8');

test('sidebar exposes accessible reversible icon rail and no navigation routes removed',()=>{
 const nav=app.slice(app.indexOf('function sidebarNav('),
  app.indexOf('/** Signed session-local basemap opt-in.'));
 assert.match(nav,/data-action="sidebar-toggle"/);
 assert.match(nav,/aria-controls="sidebar-navigation-content"/);
 assert.match(nav,/class="sidebar-nav-scroll" id="sidebar-navigation-content"/);
 assert.match(nav,/sidebarIcon\('chevron'\)/);
 assert.match(nav,/' aria-current="page"'/);
 for(const path of ['#/overview','#/boards','#/role-configuration',
  '#/user-role-management','#/settings'])
  assert.ok(nav.includes(path),path);
 assert.match(nav,/state\.adminVerified===true/);
 assert.match(nav,/state\.roleVerified===true/);
 assert.match(nav,/Account<\/div>/);
 assert.match(nav,/renderWorkspaceSwitcher\(/);
 assert.match(nav,/renderWorkspaceInviteLaunch\(/);
 assert.match(nav,/data-action="logout"/);
});
test('presentation controls change only session-local layout, not authorization or persisted access',()=>{
 const start=app.indexOf("case 'sidebar-toggle':{");
 const block=app.slice(start,app.indexOf("case 'retry-startup':{",start));
 assert.ok(start>0);
 assert.match(block,/!state\.context\|\|!auth\.isSignedIn/);
 assert.match(block,/sidebarMobileOpen=!sidebarMobileOpen/);
 assert.match(block,/sidebarManualCollapsed=!sidebarManualCollapsed/);
 assert.match(block,/syncSidebarLayout\(\)/);
 assert.doesNotMatch(block,/roleVerified|adminVerified|setItem|userRoleManager|\.mutate\(/);
 const helper=app.slice(app.indexOf('function syncSidebarLayout(){'),
  app.indexOf('function sidebar(){'));
 assert.match(helper,/aria-expanded/);
 assert.match(helper,/sidebar-user-collapsed/);
 assert.match(helper,/sidebar-mobile-open/);
 assert.doesNotMatch(helper,/fetch\(|localStorage|sessionStorage|db\./);
 assert.match(workspace,/data-action="ws01-open"/);
 assert.match(workspace,/data-action="ws02-open-invites"/);
});
test('mobile icon rail hides full-width controls and can reveal them in overlay',()=>{
 assert.match(css,/@media\(max-width:810px\)/);
 assert.match(css,/\.aps-sidebar \.ws01-context-relation,\s*#app \.aps-sidebar \.ws02-sidebar-action\{display:none\}/);
 assert.match(css,/\.shell\.sidebar-mobile-open \.aps-sidebar/);
 assert.match(css,/position:fixed;top:0;left:0;z-index:50/);
 assert.match(css,/\.shell\.sidebar-mobile-open>\.main\{\s*grid-column:2/);
 assert.match(css,/\.sidebar-layout-toggle:focus-visible/);
 assert.match(css,/\.nav-link:focus-visible/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(css,/@import|url\(\s*https?:|animation:.*infinite/);
});
test('route, logout, Escape and shell re-render maintain layout lifecycle',()=>{
 assert.match(app,/sidebarMobileOpen=false;\s*const hash=location\.hash\|\|routeHome/);
 assert.match(app,/sidebarMobileOpen=false;sidebarManualCollapsed=false/);
 assert.match(app,/window\.addEventListener\('resize',syncSidebarLayout\)/);
 assert.match(app,/event\.key==='Escape'&&sidebarMobileOpen/);
 assert.match(app,/syncSidebarLayout\(\);\s*const previousRoute=shellRoute/);
 assert.match(app,/shellSidebarSignature!==sidebarSignature/);
});
