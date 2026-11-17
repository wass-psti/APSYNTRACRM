import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('CP-TT-FLOW-01F disposable acceptance isolates both real PostgreSQL suites without production connectivity',()=>{
 const script=readFileSync('scripts/cp-tt-flow01f-disposable-acceptance.sh','utf8');
 assert.match(script,/docker run --detach --rm --network none/);
 assert.match(script,/\-v "\$root:\/repo:ro"/);
 assert.doesNotMatch(script,/\-\-publish|\-p [0-9]|SUPABASE_SERVICE_ROLE|PGHOST=[^\n]*supabase/i);
 assert.match(script,/start_disposable ot/);
 assert.match(script,/start_disposable clock/);
 assert.match(script,/cp-tt-ot02-disposable-acceptance\.sql/);
 assert.match(script,/cp-tt-gps01-disposable-acceptance\.sql/);
 assert.match(script,/cp-tt-attendance-concurrency\.sh/);
 assert.match(script,/trap cleanup EXIT INT TERM/);
 assert.match(script,/CP_TT_FLOW01F_DISPOSABLE_ACCEPTANCE_PASS/);
});
