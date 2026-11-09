/** Demand-load the FuelTrans feature, never the signed CRM startup path.
 * Invalidated routes cannot mount after an asynchronous module import.
 * The underlying module owns auth, backend reads, listeners and teardown.
 */
export function createLazyFuelTransSync({load=()=>import('./fueltrans-native.js')}={}){
 let module=null,pending=null,revision=0;
 const sync=options=>{
  const request=++revision;
  const container=options?.container;
  if(!container){
   // Once the module has mounted, tear it down synchronously on route/session exit.
   module?.syncFuelTrans({container:null});
   return;
  }
  if(module){module.syncFuelTrans(options);return;}
  // One in-flight import shared between fast redraws; no speculative preload.
  if(!pending)pending=Promise.resolve().then(load).then(value=>{
   if(typeof value?.syncFuelTrans!=='function')throw Error('FuelTrans feature unavailable');
   module=value;return value;
  }).finally(()=>{pending=null;});
  void pending.then(loaded=>{
   if(request!==revision||!container.isConnected)return;
   loaded.syncFuelTrans(options);
  }).catch(()=>{
   if(request!==revision||!container.isConnected)return;
   // Do not expose module paths, credentials or unexpected error details.
   container.textContent='FuelTrans could not load. Reload the page to retry.';
   container.setAttribute('role','alert');
  });
 };
 return sync;
}
export const syncFuelTrans=createLazyFuelTransSync();
