import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const assets = [
  {name:'sales-logo',source:'frontend/assets/tradelink/watchdog-logo.png',logical:'profiles/v1/watchdog-sales-ac1c97ed05b379a20caaccdbc3e3f02be8aebf89.png',target:'frontend/assets/tradelink/profiles/v1/watchdog-sales-ac1c97ed05b379a20caaccdbc3e3f02be8aebf89.png',sha:'ac1c97ed05b379a20caaccdbc3e3f02be8aebf89'},
  {name:'sales-quotation-logo',source:'frontend/assets/tradelink/watchdog-sales-quotation.png',logical:'profiles/v1/watchdog-sales-quotation-ee2cb021cacdffd5c0240d8ede81ee58892db4b9.png',target:'frontend/assets/tradelink/profiles/v1/watchdog-sales-quotation-ee2cb021cacdffd5c0240d8ede81ee58892db4b9.png',sha:'ee2cb021cacdffd5c0240d8ede81ee58892db4b9'},
  {name:'opc-logo',source:'frontend/assets/tradelink/watchdog-opc-logo.png',logical:'profiles/v1/watchdog-opc-f55506ddd9b2569658f2eecac7f081cc08ba3a19.png',target:'frontend/assets/tradelink/profiles/v1/watchdog-opc-f55506ddd9b2569658f2eecac7f081cc08ba3a19.png',sha:'f55506ddd9b2569658f2eecac7f081cc08ba3a19'},
  {name:'opc-quotation-logo',source:'frontend/assets/tradelink/watchdog-opc-quotation.png',logical:'profiles/v1/watchdog-opc-quotation-6d43decfa6a476219c2cae149311c84bd7109c57.png',target:'frontend/assets/tradelink/profiles/v1/watchdog-opc-quotation-6d43decfa6a476219c2cae149311c84bd7109c57.png',sha:'6d43decfa6a476219c2cae149311c84bd7109c57'},
  {name:'plc-logo',source:'frontend/assets/tradelink/plc-systems-logo.png',logical:'profiles/v1/plc-systems-5636a6eafb8cb98994546dc2b7b55c9d0dd506e9.png',target:'frontend/assets/tradelink/profiles/v1/plc-systems-5636a6eafb8cb98994546dc2b7b55c9d0dd506e9.png',sha:'5636a6eafb8cb98994546dc2b7b55c9d0dd506e9'},
  {name:'plc-quotation-logo',source:'frontend/assets/tradelink/plc-systems-quotation.png',logical:'profiles/v1/plc-systems-quotation-62421d422191624fa335e1b6bfaf8fecbdb2cd50.png',target:'frontend/assets/tradelink/profiles/v1/plc-systems-quotation-62421d422191624fa335e1b6bfaf8fecbdb2cd50.png',sha:'62421d422191624fa335e1b6bfaf8fecbdb2cd50'},
  {name:'application-css',source:'frontend/tradelink-application.css',logical:'templates/tradelink-application-v1.42.0-fc3a9e2dd3626a4b7657ea72c105b042d8128287.css',target:'frontend/assets/tradelink/templates/tradelink-application-v1.42.0-fc3a9e2dd3626a4b7657ea72c105b042d8128287.css',sha:'fc3a9e2dd3626a4b7657ea72c105b042d8128287'},
  {name:'quotation-css',source:'frontend/tradelink-quotation-redesign.css',logical:'templates/tradelink-quotation-redesign-v1.42.0-866f644ed2f9a5fa569e799351feac19a90325fa.css',target:'frontend/assets/tradelink/templates/tradelink-quotation-redesign-v1.42.0-866f644ed2f9a5fa569e799351feac19a90325fa.css',sha:'866f644ed2f9a5fa569e799351feac19a90325fa'}
];

function gitBlobSha(bytes) {
  return createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
}

const migration = readFileSync(
  'supabase/migrations/20261127120000_cp_tl_opt_04_document_template_render_snapshots.sql',
  'utf8'
);

for (const asset of assets) {
  const source = readFileSync(asset.source);
  const published = readFileSync(asset.target);
  assert.deepEqual(published, source, asset.name + ' must be a byte-for-byte copy');
  assert.equal(gitBlobSha(source), asset.sha, asset.name + ' source Git blob hash');
  assert.equal(gitBlobSha(published), asset.sha, asset.name + ' published Git blob hash');
  assert.ok(migration.includes(asset.logical), asset.name + ' snapshot path');
  assert.ok(migration.includes(asset.sha), asset.name + ' snapshot hash');
  console.log('PASS', asset.name, asset.sha, source.length + ' bytes');
}
console.log('PASS: all eight immutable TradeLink template assets match their original source blobs.');
