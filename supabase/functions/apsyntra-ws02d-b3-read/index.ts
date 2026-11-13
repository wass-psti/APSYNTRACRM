/**
 * CP-WS-02D/B3 — PROPOSED, NOT DEPLOYED.
 * Read-only Edge Function for the existing WatchdogWorkspace project.
 * Do not deploy before independent host/route authorization. Default is OFF.
 * Required platform setting at approved deployment: verify_jwt = true.
 * No service-role key, private PostgreSQL credential, writes or provider calls.
 *
 * The signed B2 wm_ws01_list() RPC verifies current auth.sessions and
 * membership under the CALLER'S JWT without new DB privileges.
 */
import {createB3EdgeSignedReadStaging}
 from '../../../server/ws02d-b3-edge-signed-read.mjs';

const projectUrl='https://jtlusodorfnyzgyuewkz.supabase.co/';
let publishableKey='';
try{
 const keys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')??'{}');
 if(typeof keys?.default==='string')publishableKey=keys.default;
}catch{ /* fail closed */ }

// This flag is a deployment control only, not a substitute for approval.
const enabled=Deno.env.get('WS02D_B3_EDGE_READ_APPROVED')==='true';
const read=createB3EdgeSignedReadStaging({
 enabled,projectUrl,publishableKey
});
Deno.serve((request:Request)=>read(request));
