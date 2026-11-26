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
 const bundle=read('../apsyntra-styles.bundle.css');

 assert.ok(index.includes('app.js?v='+version));
 const stylesheet=index.match(/apsyntra-styles\.bundle\.css\?v=([^"]+)/)?.[1];
 assert.ok(stylesheet?.includes(version));
 assert.equal((index.match(/<link rel="stylesheet"/g)||[]).length,1);
 assert.ok(index.includes('frontend/fueltrack-v3-all-requests-redesign.css'));
 assert.ok(bundle.endsWith(css.trimEnd()+'\n'));
 assert.equal(bundle.split(css.trim()).length-1,1);
 assert.ok(app.includes('fueltrack-v3-ui.js?v='+version));
 assert.ok(ui.includes('fueltrack-v3-application.js?v='+version));
 assert.ok(application.includes('fueltrack-v3-signed-views.js?v='+version));
 assert.ok(css.includes('.ft3-requests-hero'));
 assert.ok(css.includes('@media(max-width:760px)'));
});
