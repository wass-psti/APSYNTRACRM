/** CP-BRAND-01: uploaded APSYNTRA icon is the only first-party CRM mark. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const logoPath='frontend/apsyntra-logo.webp';
const bytes=readFileSync(logoPath);
const app=readFileSync('frontend/app.js','utf8');
const login=readFileSync('frontend/auth-markup.js','utf8');
const html=readFileSync('index.html','utf8');
const css=readFileSync('frontend/styles.css','utf8');
const loadingCss=readFileSync('frontend/initialization-core.css','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');

test('uploaded brand asset is a small, valid WebP image',()=>{
 assert.equal(bytes.toString('ascii',0,4),'RIFF');
 assert.equal(bytes.toString('ascii',8,12),'WEBP');
 assert.ok(bytes.length>=1000&&bytes.length<12000,'Brand icon must be optimized');
 assert.equal(bytes.readUInt32LE(4)+8,bytes.length,'RIFF length matches file');
});

test('sidebar, login, access denied and browser favicon retain uploaded branding',()=>{
 const ref='src="./frontend/apsyntra-logo.webp"';
 assert.equal(((app+login).match(/src="\.\/frontend\/apsyntra-logo\.webp"/g)||[]).length,3);
 assert.doesNotMatch(app,/<span class="brand-mark(?: csp-u059)?"[^>]*>A<\/span>/);
 assert.match(app,/class="brand-mark" src="\.\/frontend\/apsyntra-logo\.webp" alt=""/);
 assert.match(login,/class="brand-mark" src="\.\/frontend\/apsyntra-logo\.webp" alt=""/);
 assert.match(app,/class="brand-mark csp-u059" src="\.\/frontend\/apsyntra-logo\.webp" alt=""/);
 assert.doesNotMatch(html,/aps-init-brand-icon/);
 assert.doesNotMatch(loadingCss,/aps-init-brand-icon/);
 assert.match(html,/id="apsyntra-init"/);
 assert.match(html,/class="aps-init-name"/);
 assert.match(html,/<link rel="icon" href="\.\/frontend\/apsyntra-logo\.webp" type="image\/webp"\/>/);
 assert.ok(css.includes('.brand-mark{display:block;'));
 assert.ok(app.includes(ref));
});

test('live Pages smoke verifies the new same-origin brand asset and WebP content type',()=>{
 assert.ok(smoke.includes("'frontend/apsyntra-logo.webp'"));
 assert.match(smoke,/suffix==='webp'\?type\.includes\('image\/webp'\)/);
 assert.doesNotMatch(html,/https?:\/\/[^"]*logo\.(?:png|webp)/);
});
