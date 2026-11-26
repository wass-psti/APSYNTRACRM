import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFuelTrackNewRequest,fuelTrackNewRequestPayload} from '../fueltrack-v3-new-request.js';
import {FUELTRACK_PLATE_OPTIONS,FUELTRACK_PERSON_OPTIONS} from '../fueltrack-v3-reference-options.js';

function makeForm(kind,values){
 return {querySelector(selector){
  if(selector==='[name="ft3-fuel-mode"]:checked')return {value:kind};
  const id=selector.slice(1);
  return Object.prototype.hasOwnProperty.call(values,id)?{value:values[id]}:null;
 }};
}

test('New Fuel Request presents both request types and preserves stable form contracts',()=>{
 const html=renderFuelTrackNewRequest({enabled:true});
 for(const field of ['ft3-new-request-form','ft3-mode-vehicle','ft3-mode-container','ft3-plate','ft3-owner','ft3-origin','ft3-destination','ft3-purpose','ft3-quantity','ft3-responsible','ft3-container-purpose'])assert.ok(html.includes(field),field);
 assert.match(html,/ft3-new-next-steps/);
 assert.match(html,/What happens next/);
 assert.match(html,/Receipt Photo/);
});

test('signed connection and busy states retain existing submit behavior',()=>{
 const disabled=renderFuelTrackNewRequest({enabled:false});
 assert.doesNotMatch(disabled,/<form id="ft3-new-request-form"/);
 assert.match(disabled,/ft3-new-retry/);
 const busy=renderFuelTrackNewRequest({enabled:true,busy:true});
 assert.match(busy,/<button type="submit" class="ft3-new-submit" disabled/);
 assert.match(busy,/Submitting…/);
});

test('vehicle payload preserves the existing schema and validates required fields',()=>{
 const payload=fuelTrackNewRequestPayload(makeForm('vehicle',{
  'ft3-plate':FUELTRACK_PLATE_OPTIONS[0],'ft3-owner':FUELTRACK_PERSON_OPTIONS[0],
  'ft3-origin':'Mandaue','ft3-destination':'Cebu City',
  'ft3-purpose':'Equipment delivery to project site','ft3-odometer':'12000','ft3-distance':'18.5'
 }));
 assert.deepEqual(payload,{kind:'vehicle',details:{
  plate:FUELTRACK_PLATE_OPTIONS[0],owner:FUELTRACK_PERSON_OPTIONS[0],
  origin:'Mandaue',destination:'Cebu City',purpose:'Equipment delivery to project site',
  odometer:12000,distance:18.5
 }});
 assert.throws(()=>fuelTrackNewRequestPayload(makeForm('vehicle',{
  'ft3-plate':FUELTRACK_PLATE_OPTIONS[0],'ft3-owner':FUELTRACK_PERSON_OPTIONS[0],
  'ft3-origin':'','ft3-destination':'Cebu City','ft3-purpose':'Too short'
 })),/Purpose must contain 10–500 characters/);
});

test('container payload supports fixed and custom counts without changing its contract',()=>{
 const fixed=fuelTrackNewRequestPayload(makeForm('container',{
  'ft3-quantity':'3','ft3-responsible':FUELTRACK_PERSON_OPTIONS[1],
  'ft3-container-purpose':'Workshop fuel storage'
 }));
 assert.deepEqual(fixed,{kind:'container',details:{
  containerCount:3,responsiblePerson:FUELTRACK_PERSON_OPTIONS[1],purpose:'Workshop fuel storage'
 }});
 const custom=fuelTrackNewRequestPayload(makeForm('container',{
  'ft3-quantity':'custom','ft3-custom-count':'12','ft3-responsible':FUELTRACK_PERSON_OPTIONS[2],
  'ft3-container-purpose':'Emergency site fuel reserve'
 }));
 assert.equal(custom.details.containerCount,12);
 assert.throws(()=>fuelTrackNewRequestPayload(makeForm('container',{
  'ft3-quantity':'custom','ft3-custom-count':'0','ft3-responsible':FUELTRACK_PERSON_OPTIONS[2],
  'ft3-container-purpose':'Emergency site fuel reserve'
 })),/valid container quantity/);
});

test('request form escapes backend messages and retains the LightFuels receipt route',()=>{
 const html=renderFuelTrackNewRequest({enabled:true,message:'<img src=x onerror=alert(1)>',receiptHref:'#/fueltrack/lightfuels'});
 assert.match(html,/&lt;img/);
 assert.match(html,/href="#\/fueltrack\/lightfuels"/);
 assert.doesNotMatch(html,/<img src=x/);
});
