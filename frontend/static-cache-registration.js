/** Best-effort, static-only service worker. Never blocks auth or app initialization. */
export function registerStaticCache({navigatorRef=globalThis.navigator,locationRef=globalThis.location,
 enabled=true,cacheStorage=globalThis.caches}={}){
 if(!navigatorRef?.serviceWorker||locationRef?.protocol!=='https:'||
  locationRef?.origin!=='https://wass-psti.github.io'||
  !locationRef?.pathname?.startsWith('/APSYNTRACRM/'))return Promise.resolve(false);
 // Retirement release: explicitly unregister the worker and purge only our
 // namespaced public static caches. Removing an HTML script alone is unsafe.
 if(!enabled)return (async()=>{
  try{
   const old=await navigatorRef.serviceWorker.getRegistration?.('/APSYNTRACRM/');
   if(old?.active?.scriptURL===locationRef.origin+'/APSYNTRACRM/service-worker.js')
    await old.unregister();
   if(cacheStorage){
    const keys=await cacheStorage.keys();
    await Promise.all(keys.filter(key=>key.startsWith('apsyntra-crm-public-static-'))
     .map(key=>cacheStorage.delete(key)));
   }
   return false;
  }catch{return false;}
 })();
 return navigatorRef.serviceWorker.register('/APSYNTRACRM/service-worker.js',{
  scope:'/APSYNTRACRM/',updateViaCache:'none'
 }).then(registration=>{
  // Check the worker script on each visit; failures are nonfatal.
  void registration.update().catch(()=>{});
  return true;
 }).catch(()=>false);
}
