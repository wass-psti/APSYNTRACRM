/** Profile picture selection, crop preview and signed persistence UI. */
export const AVATAR_MAX_SOURCE_BYTES=5*1024*1024;
export const AVATAR_OUTPUT_SIZE=256;
const types=Object.freeze({
 'image/jpeg':'jpeg',
 'image/png':'png',
 'image/webp':'webp'
});
function mimeFromHeader(bytes){
 if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
 if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'
  &&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
 return null;
}
export async function inspectAvatarFile(file){
 if(!(file instanceof Blob)||!types[file.type])
  throw new Error('Choose a JPEG, PNG or WebP photo.');
 if(file.size===0||file.size>AVATAR_MAX_SOURCE_BYTES)
  throw new Error('Choose an image smaller than 5 MB.');
 const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());
 if(mimeFromHeader(bytes)!==file.type)
  throw new Error('Image content does not match its file type.');
 return file.type;
}
/** Decode browser-side; crop into square WebP to remove original metadata. */
export async function prepareAvatarImage(file,{positionX=50,positionY=50,zoom=1}={}){
 await inspectAvatarFile(file);
 if(![positionX,positionY,zoom].every(Number.isFinite)
  ||positionX<0||positionX>100||positionY<0||positionY>100||zoom<1||zoom>3)
  throw new Error('Invalid photo positioning.');
 const url=URL.createObjectURL(file);
 let bitmap;
 try{
  bitmap=await new Promise((resolve,reject)=>{
   const image=new Image();
   image.onload=()=>resolve(image);
   image.onerror=()=>reject(new Error('The selected image cannot be decoded.'));
   image.src=url;
  });
  if(!bitmap.naturalWidth||!bitmap.naturalHeight
   ||bitmap.naturalWidth>8192||bitmap.naturalHeight>8192
   ||bitmap.naturalWidth*bitmap.naturalHeight>16000000)
   throw new Error('Image dimensions exceed the supported limit.');
  const canvas=document.createElement('canvas');
  canvas.width=AVATAR_OUTPUT_SIZE;canvas.height=AVATAR_OUTPUT_SIZE;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('Image cropping is not available in this browser.');
  const side=Math.min(bitmap.naturalWidth,bitmap.naturalHeight)/zoom;
  const cropX=(bitmap.naturalWidth-side)*positionX/100;
  const cropY=(bitmap.naturalHeight-side)*positionY/100;
  ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,AVATAR_OUTPUT_SIZE,AVATAR_OUTPUT_SIZE);
  ctx.drawImage(bitmap,cropX,cropY,side,side,0,0,AVATAR_OUTPUT_SIZE,AVATAR_OUTPUT_SIZE);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(
   value=>value?.type==='image/webp'?resolve(value):reject(new Error('WebP image export is not supported.')),
   'image/webp',.86
  ));
  if(blob.size===0||blob.size>400000)
   throw new Error('The prepared profile picture exceeds the 400 KB limit.');
  return blob;
 }finally{URL.revokeObjectURL(url);}
}

function escapeHtml(value){
 return String(value??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[c]));
}
let activePreviewUrl=null;
let hydrationSequence=0;
function releasePreview(){
 if(activePreviewUrl){URL.revokeObjectURL(activePreviewUrl);activePreviewUrl=null;}
}
export function stopAvatarPreview(){releasePreview();}
export async function mountAvatarImages(container,client,path,userId){
 const sequence=++hydrationSequence;
 const nodes=[...(container?.querySelectorAll?.('img[data-avatar-current]')||[])];
 for(const img of nodes){
  img.hidden=true;
  img.removeAttribute('src');
  const fallback=img.parentElement?.querySelector('[data-avatar-initials]');
  if(fallback)fallback.hidden=false;
 }
 if(!path||!client||!userId)return;
 try{
  const url=await client.signedUrl(path,userId);
  if(sequence!==hydrationSequence||!container?.isConnected)return;
  for(const img of nodes){
   if(!img.isConnected)continue;
   img.src=url;img.referrerPolicy='no-referrer';img.hidden=false;
   const fallback=img.parentElement?.querySelector('[data-avatar-initials]');
   if(fallback)fallback.hidden=true;
  }
 }catch{
  // Keep the initials fallback; avatar availability must not block the CRM.
 }
}
export function avatarPreviewMarkup(initials){
 const fallback=escapeHtml(initials||'U');
 return '<section class="settings-avatar-editor" aria-labelledby="settings-avatar-heading">'+
  '<div class="settings-avatar-editor-head"><div><h4 id="settings-avatar-heading">Profile picture</h4>'+
  '<p>Choose a photo, adjust its crop, and save it to your account.</p></div></div>'+
  '<div class="settings-avatar-layout"><div class="settings-avatar-preview" aria-label="Profile picture preview">'+
  '<span data-avatar-initials aria-hidden="true">'+fallback+'</span>'+
  '<img data-avatar-current alt="" hidden />'+
  '<img data-avatar-image alt="Selected profile picture preview" hidden /></div>'+
  '<div class="settings-avatar-controls"><label for="settings-avatar-file" class="settings-avatar-file-label">Choose a photo</label>'+
  '<input id="settings-avatar-file" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="settings-avatar-guidance"/>'+
  '<small id="settings-avatar-guidance">JPEG, PNG or WebP · Up to 5 MB · Saved as a 256 × 256 WebP image.</small>'+
  '<div class="settings-avatar-crop" data-avatar-crop hidden>'+
  '<label for="settings-avatar-zoom">Zoom</label><input id="settings-avatar-zoom" type="range" min="100" max="300" value="100" step="10"/>'+
  '<label for="settings-avatar-pos-x">Horizontal position</label><input id="settings-avatar-pos-x" type="range" min="0" max="100" value="50" step="5"/>'+
  '<label for="settings-avatar-pos-y">Vertical position</label><input id="settings-avatar-pos-y" type="range" min="0" max="100" value="50" step="5"/>'+
  '</div><div class="settings-avatar-actions">'+
  '<button type="button" class="primary" data-avatar-save disabled>Save profile picture</button>'+
  '<button type="button" class="secondary" data-avatar-clear hidden>Discard preview</button>'+
  '<button type="button" class="secondary" data-avatar-remove hidden>Remove photo</button>'+
  '</div></div></div>'+
  '<p class="settings-avatar-status" data-avatar-status role="status" aria-live="polite"></p>'+
  '<p class="settings-avatar-gate">Photos are private. Only you and active members of a shared workspace can view your profile picture. Profile changes remain separate from account roles and permissions.</p>'+
  '</section>';
}
export function mountAvatarPreview(container,{client,userId,currentPath,onSaved}={}){
 releasePreview();
 const section=container?.querySelector('.settings-avatar-editor');
 if(!section)return;
 const input=section.querySelector('#settings-avatar-file');
 const image=section.querySelector('[data-avatar-image]');
 const currentImage=section.querySelector('[data-avatar-current]');
 const initials=section.querySelector('[data-avatar-initials]');
 const status=section.querySelector('[data-avatar-status]');
 const crop=section.querySelector('[data-avatar-crop]');
 const clear=section.querySelector('[data-avatar-clear]');
 const save=section.querySelector('[data-avatar-save]');
 const remove=section.querySelector('[data-avatar-remove]');
 const sliders=[...crop.querySelectorAll('input[type="range"]')];
 let selected=null,sequence=0,busy=false,previewReady=false;
 remove.hidden=!currentPath;
 const setBusy=value=>{
  busy=value;
  for(const control of [input,clear,save,remove,...sliders])if(control)control.disabled=value;
  section.setAttribute('aria-busy',value?'true':'false');
 };
 const restoreCurrent=()=>{
  image.hidden=true;image.removeAttribute('src');
  if(currentImage&&!currentImage.hidden)initials.hidden=true;
  else initials.hidden=false;
 };
 const reset=()=>{
  sequence++;selected=null;previewReady=false;releasePreview();
  input.value='';crop.hidden=true;clear.hidden=true;save.disabled=true;
  restoreCurrent();status.textContent='';
  for(const slider of sliders)slider.value=slider.id==='settings-avatar-zoom'?'100':'50';
 };
 const update=async()=>{
  const version=++sequence;
  if(!selected)return;
  previewReady=false;save.disabled=true;
  releasePreview();image.hidden=true;image.removeAttribute('src');
  if(currentImage&&!currentImage.hidden)initials.hidden=true;
  else initials.hidden=false;
  status.textContent='Preparing local preview…';
  try{
   const blob=await prepareAvatarImage(selected,{
    zoom:Number(sliders[0].value)/100,
    positionX:Number(sliders[1].value),
    positionY:Number(sliders[2].value)
   });
   if(version!==sequence||!section.isConnected)return;
   const url=URL.createObjectURL(blob);releasePreview();activePreviewUrl=url;
   image.src=url;image.hidden=false;currentImage.hidden=true;initials.hidden=true;
   crop.hidden=false;clear.hidden=false;save.disabled=false;previewReady=true;
   status.textContent='Preview ready. Save to apply this picture to your account.';
  }catch(error){
   if(version!==sequence||!section.isConnected)return;
   status.textContent=error?.message||'Unable to preview this picture.';
  }
 };
 input.addEventListener('change',()=>{
  selected=input.files?.[0]||null;
  if(!selected){reset();return;}
  void update();
 });
 for(const slider of sliders)slider.addEventListener('change',()=>void update());
 clear.addEventListener('click',()=>{reset();input.focus();});
 save.addEventListener('click',async()=>{
  if(busy||!previewReady||!selected||!client||!userId)return;
  setBusy(true);status.textContent='Uploading and saving your profile picture…';
  try{
   const blob=await prepareAvatarImage(selected,{
    zoom:Number(sliders[0].value)/100,
    positionX:Number(sliders[1].value),
    positionY:Number(sliders[2].value)
   });
   const result=await client.save(blob,userId,currentPath||null);
   currentPath=result.path;
   if(typeof onSaved==='function')onSaved({path:result.path,cleanupPending:result.cleanupPending});
   status.textContent=result.cleanupPending?
    'Profile picture saved. The previous image could not be deleted.':
    'Profile picture saved.';
   reset();
  }catch(error){
   status.textContent=error?.message||'Unable to save the profile picture.';
  }finally{if(section.isConnected)setBusy(false);}
 });
 remove.addEventListener('click',async()=>{
  if(busy||!currentPath||!client||!userId)return;
  if(!globalThis.confirm?.('Remove your current profile picture?'))return;
  setBusy(true);status.textContent='Removing your profile picture…';
  try{
   const result=await client.remove(userId,currentPath);
   currentPath=null;remove.hidden=true;
   if(typeof onSaved==='function')onSaved({path:null,cleanupPending:result.cleanupPending});
   reset();
   status.textContent=result.cleanupPending?
    'Profile picture removed from your account, but the old image could not be deleted.':
    'Profile picture removed.';
  }catch(error){
   status.textContent=error?.message||'Unable to remove the profile picture.';
  }finally{if(section.isConnected)setBusy(false);}
 });
}
