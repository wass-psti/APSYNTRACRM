/** Best-effort, static-only service worker. Never blocks auth or app initialization. */
export function registerStaticCache({navigatorRef=globalThis.navigator,locationRef=globalThis.location}={}){
 if(!navigatorRef?.serviceWorker||locationRef?.protocol!=='https:'||
  locationRef?.origin!=='https://wass-psti.github.io'||
  !locationRef?.pathname?.startsWith('/APSYNTRACRM/'))return Promise.resolve(false);
 return navigatorRef.serviceWorker.register('/APSYNTRACRM/service-worker.js',{
  scope:'/APSYNTRACRM/',updateViaCache:'none'
 }).then(registration=>{
  // Check the worker script on each visit; failures are nonfatal.
  void registration.update().catch(()=>{});
  return true;
 }).catch(()=>false);
}
