// Demand-load the DDA screen only after the host enters its native route.
export function createDdaHostSync({load=()=>import('./apps/DailyDepartmentActivity/activity-runtime.js?v=cp-dda-ui-02-20261126')}={}){
  let active=null,module=null,pending=null;
  function dispose(){
    const previous=active;
    active=null;
    previous?.mounted?.dispose();
  }
  function sync({container=null,auth,api,workspaceId,userId,storage}={}){
    if(!container||!auth?.isSignedIn||auth.userId!==userId||!workspaceId){
      dispose();
      return Promise.resolve(false);
    }
    if(active?.container===container&&active.userId===userId&&active.workspaceId===workspaceId&&active.auth===auth&&active.api===api){
      return active.ready;
    }
    dispose();
    const current={container,userId,workspaceId,auth,api,mounted:null,ready:null};
    active=current;
    container.textContent='Loading Daily Department Activity…';
    if(!module&&!pending){
      pending=Promise.resolve().then(load).then(value=>{
        if(typeof value?.mountActivityRuntime!=='function')throw Error('DDA feature unavailable');
        module=value;
        return value;
      }).finally(()=>{pending=null;});
    }
    const stillCurrent=()=>active===current&&container.isConnected&&auth.isSignedIn&&auth.userId===userId;
    current.ready=(module?Promise.resolve(module):pending).then(async loaded=>{
      if(!stillCurrent())return false;
      current.mounted=loaded.mountActivityRuntime(container,{auth,api,workspaceId,userId,storage});
      await current.mounted.ready;
      return stillCurrent();
    }).catch(()=>{
      if(!stillCurrent())return false;
      current.mounted?.dispose();
      active=null;
      container.textContent='Daily Department Activity could not load. Reopen the application to retry.';
      return false;
    });
    return current.ready;
  }
  return sync;
}
export const syncDda=createDdaHostSync();
