import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const component = readFileSync('frontend/apps/Paseo/source/src/admin/staging/ManagedQrMethodCard.tsx','utf8');
const styles = readFileSync('frontend/apps/Paseo/source/src/styles/pdl-live-admin.css','utf8');
const browser = readFileSync('scripts/pdl-aps-native-browser.mjs','utf8');

test('broken remote QR images use an accessible fallback instead of raw browser alt text',()=>{
 assert.match(component,/onError=\{\(\) => setImageState\('error'\)\}/);
 assert.match(component,/imageState !== 'error'/);
 assert.match(component,/QR image unavailable/);
 assert.match(component,/role="status"/);
 assert.match(styles,/managed-qr-image-loading/);
 assert.match(styles,/opacity:0/);
 assert.match(browser,/PASS saved QR broken-image fallback and replacement preview/);
});
test('new file preview and saved image share a contained responsive media frame',()=>{
 assert.match(component,/const activeUrl = previewUrl \|\| storedUrl/);
 assert.match(component,/Preview only — save to update the stored image/);
 assert.match(styles,/managed-qr-media img/);
 assert.match(styles,/object-fit:contain/);
 assert.match(styles,/managed-qr-grid \{ align-items:stretch/);
});
test('image presentation does not alter existing upload or readback persistence',()=>{
 assert.match(component,/validateQrImageSignature\(candidate\)/);
 assert.match(component,/backendAdminFetch\(`\/v1\/admin\/payment-methods\/\$\{method\}`/);
 assert.match(component,/const updated = await onSaved\(\)/);
 assert.match(component,/saved\.recipient !== recipient\.trim\(\)/);
 assert.match(component,/!saved\.imageUrl/);
});
