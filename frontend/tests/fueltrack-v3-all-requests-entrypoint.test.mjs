import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const version='cp-ft-all-requests-redesign-02-20261126';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('published entrypoint cache-busts the full FuelTrack All Requests render path',()=>{
 const index=read('../../index.html');
 const app=read('../app.js');
 const ui=read('../fueltrack-v3-ui.js');
 const application=read('../fueltrack-v3-application.js');
 const css=read('../fueltrack-v3-all-requests-redesign.css');

 assert.ok(index.includes('app.js?v='+version));
 assert.ok(index.includes('fueltrack-v3-all-requests-redesign.css?v='+version));
 assert.ok(app.includes('fueltrack-v3-ui.js?v='+version));
 assert.ok(ui.includes('fueltrack-v3-application.js?v='+version));
 assert.ok(application.includes('fueltrack-v3-signed-views.js?v='+version));
 assert.ok(css.includes('.ft3-requests-hero'));
 assert.ok(css.includes('@media(max-width:760px)'));
});
