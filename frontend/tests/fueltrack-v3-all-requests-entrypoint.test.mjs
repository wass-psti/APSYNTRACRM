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

 assert.match(index,new RegExp('app\\\\.js\\\\?v='+version));
 assert.match(index,new RegExp('fueltrack-v3-all-requests-redesign\\\\.css\\\\?v='+version));
 assert.match(app,new RegExp('fueltrack-v3-ui\\\\.js\\\\?v='+version));
 assert.match(ui,new RegExp('fueltrack-v3-application\\\\.js\\\\?v='+version));
 assert.match(application,new RegExp('fueltrack-v3-signed-views\\\\.js\\\\?v='+version));
 assert.match(css,/\\.ft3-requests-hero/);
 assert.match(css,/@media\\(max-width:760px\\)/);
});
