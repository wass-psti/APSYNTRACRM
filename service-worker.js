/* APSYNTRA CRM: public, immutable-by-content frontend resources only.
 * Network-first by design: a new Pages deployment is never pinned behind stale JS.
 * Bump this version on worker-policy changes; cached assets remain network-revalidated.
 */
const STATIC_CACHE='apsyntra-crm-public-static-v1-20261109';
const PREFIX=new URL('./',self.location.href).pathname;
const LOGO=PREFIX+'frontend/apsyntra-logo.webp';
const MAX_ENTRIES=96;
const MAX_BYTES=2*1024*1024;
const staticPath=path=>path===LOGO||(
 path.startsWith(PREFIX+'frontend/')&&
 /\.(?:js|css)$/.test(path)&&
 !path.slice(PREFIX.length).split('/').some(segment=>
  segment==='tests'||segment==='fixtures'||segment==='private'||segment==='documents')
);
function eligible(request){
 if(request.method!=='GET'||request.mode==='navigate'||request.cache==='no-store'||
  request.headers.has('Authorization')||request.headers.has('Cookie')||
  request.headers.has('Range'))return false;
 const url=new URL(request.url);
 return url.origin===self.location.origin&&url.search===''&&
  staticPath(url.pathname)&&request.destination!== 'document';
}
function cacheable(request,response){
 if(!response||!response.ok||response.type!=='basic'||response.redirected)return false;
 const headers=response.headers;
 if(/(?:no-store|private)/i.test(headers.get('Cache-Control')||'')||
  headers.has('Set-Cookie')||headers.has('Content-Disposition'))return false;
 const len=headers.get('Content-Length');
 if(len!==null&&(!/^\d+$/.test(len)||Number(len)>MAX_BYTES))return false;
 const type=(headers.get('Content-Type')||'').toLowerCase();
 const path=new URL(request.url).pathname;
 if(path.endsWith('.js'))return /(?:javascript|ecmascript)/.test(type);
 if(path.endsWith('.css'))return type.startsWith('text/css');
 return path===LOGO&&type.startsWith('image/webp');
}
async function save(request,response){
 try{
  // The byte limit also applies to chunked responses without Content-Length.
  const copy=response.clone();
  const bytes=await copy.arrayBuffer();
  if(bytes.byteLength>MAX_BYTES)return;
  const cache=await caches.open(STATIC_CACHE);
  await cache.put(request,response);
  const keys=await cache.keys();
  if(keys.length>MAX_ENTRIES){
   for(const key of keys.slice(0,keys.length-MAX_ENTRIES))await cache.delete(key);
  }
 }catch{/* Storage quota or cache errors never prevent live application fetches. */}
}
self.addEventListener('install',event=>{
 // No offline navigation shell and no fetch of signed resources during install.
 event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('apsyntra-crm-public-static-')&&
   key!==STATIC_CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(!eligible(request))return;
 event.respondWith((async()=>{
  try{
   const response=await fetch(request);
   if(cacheable(request,response))event.waitUntil(save(request,response.clone()));
   return response;
  }catch(error){
   const cache=await caches.open(STATIC_CACHE);
   const fallback=await cache.match(request);
   if(fallback)return fallback;
   throw error;
  }
 })());
});
