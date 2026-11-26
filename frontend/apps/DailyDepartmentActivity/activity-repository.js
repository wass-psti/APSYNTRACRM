import {validateSnapshot} from './activity-controller.js';
import {readActivityDraft,clearActivityDraft} from './activity-drafts.js';

const actions = ['save-activity','delete-activity','save-category','save-department','save-person'];
const text = value => String(value ?? '').trim();

export function matchesActivityDraft(fields,record) {
  return ['title','details','status','categoryId'].every(key=>text(fields?.[key])===text(record?.[key]));
}

// These RPC names are the proposed host contract. The SQL candidate remains
// internal; no public RPC is exposed by this module.
export function createActivityRepository({auth,api,workspaceId,storage}) {
  const userId=auth?.userId;
  if (!auth?.isSignedIn || !userId || !workspaceId || typeof api?.rpc!=='function' || !storage) {
    throw new Error('DDA requires an active signed session and durable recovery storage');
  }
  const prefix='aps.dda.pending.v1:'+JSON.stringify([workspaceId,userId])+':';
  function checkSession() {
    if(!auth.isSignedIn||auth.userId!==userId)throw new Error('DDA session changed');
  }
  async function rpc(name,args) {
    checkSession();
    const result=await api.rpc(name,args);
    checkSession();
    return result;
  }
  function validateCommand(command) {
    if(!command || command.workspaceId!==workspaceId || typeof command.requestId!=='string' || !command.requestId ||
        !Number.isSafeInteger(command.expectedRevision)||command.expectedRevision<0||!actions.includes(command.action)||
        !command.record||typeof command.record.id!=='string'||!command.record.id)throw new Error('Invalid DDA pending command');
    return command;
  }
  function journalEntries() {
    const keys=[];
    for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(prefix))keys.push(key);}
    return keys.sort().map(key=>{
      const raw=storage.getItem(key);
      if(raw===null)return null;
      const entry=JSON.parse(raw);
      validateCommand(entry.command);
      if(key!==prefix+entry.command.requestId)throw new Error('Invalid DDA recovery key');
      if(entry.draftScope&&(entry.draftScope.workspaceId!==workspaceId||entry.draftScope.userId!==userId))throw new Error('Invalid DDA recovery scope');
      return {key,entry};
    }).filter(Boolean);
  }
  async function settle(key,entry) {
    const {command,draftScope}=entry;
    const result=validateSnapshot(await rpc('dda_submit_v1',{
      p_workspace_id:workspaceId,p_request_id:command.requestId,p_expected_revision:command.expectedRevision,
      p_action:command.action,p_record:command.record
    }),workspaceId);
    const accepted=result.acknowledgedRequestId===command.requestId&&
      result.acknowledgedRevision===command.expectedRevision+1&&result.revision>=result.acknowledgedRevision&&
      result.rejectedRequestId==null;
    const rejected=result.rejectedRequestId===command.requestId&&typeof result.rejectionReason==='string'&&
      Boolean(result.rejectionReason)&&result.acknowledgedRequestId==null&&result.revision>=command.expectedRevision;
    if(!accepted&&!rejected)throw new Error('DDA server did not confirm the pending request');
    let warning=null;
    try {
      if(accepted&&draftScope) {
        const draft=readActivityDraft(storage,draftScope);
        // A newer draft must survive acknowledgement of the earlier submission.
        if(draft&&matchesActivityDraft(draft,command.record))clearActivityDraft(storage,draftScope);
      }
      storage.removeItem(key);
    } catch {
      warning='Server outcome confirmed; local recovery cleanup is pending. Refresh before another change.';
    }
    return {snapshot:result,recovery:{outcome:accepted?'committed':'rejected',scope:draftScope??null,
      record:command.record,action:command.action,reason:rejected?result.rejectionReason:null,warning}};
  }
  return {
    managesDraftRecovery:true,
    async load(id) {
      checkSession();
      if(id!==workspaceId)throw new Error('DDA workspace changed');
      const recoveries=[];
      let snapshot;
      for(const {key,entry} of journalEntries()){
        const settled=await settle(key,entry);
        snapshot=settled.snapshot;
        recoveries.push(settled.recovery);
      }
      if(!snapshot)snapshot=validateSnapshot(await rpc('dda_snapshot_v1',{p_workspace_id:workspaceId}),workspaceId);
      return {...snapshot,recoveries};
    },
    async mutate(command,{draftScope=null}={}) {
      checkSession();
      validateCommand(command);
      if(journalEntries().length)throw new Error('Refresh DDA to reconcile the previous request first');
      if(draftScope&&(draftScope.workspaceId!==workspaceId||draftScope.userId!==userId))throw new Error('Invalid DDA draft scope');
      const key=prefix+command.requestId;
      const entry={command,draftScope};
      // Persist the exact envelope before network dispatch. No silent fallback.
      const raw=JSON.stringify(entry);
      storage.setItem(key,raw);
      if(storage.getItem(key)!==raw)throw new Error('Could not preserve DDA request for recovery');
      const {snapshot,recovery}=await settle(key,entry);
      if(recovery.outcome==='rejected')throw new Error(recovery.reason+(recovery.warning?' '+recovery.warning:''));
      return {...snapshot,draftWarning:recovery.warning};
    }
  };
}
