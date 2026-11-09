/** Profile picture preparation for the existing WatchdogWorkspace identity.
 * No network calls. Authoritative storage and record updates require their
 * separate signed, per-user backend contract before activation.
 */
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
   ||bitmap.naturalWidth*bitmap.naturalHeight>36000000)
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
   throw new Error('The prepared profile picture is too large.');
  return blob;
 }finally{
  URL.revokeObjectURL(url);
 }
}

/** Presentation-only editor until a verified, user-scoped avatar Storage and
 * canonical profile-reference contract exists. No network or DB writes. */
export function avatarPreviewMarkup(initials){
 const fallback=String(initials||'U').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return '<section class="settings-avatar-editor" aria-labelledby="settings-avatar-heading">'+
  '<div class="settings-avatar-editor-head"><div><h4 id="settings-avatar-heading">Profile picture</h4>'+
  '<p>Preview and position your photo before secure avatar storage is activated.</p></div></div>'+
  '<div class="settings-avatar-layout"><div class="settings-avatar-preview" aria-label="Profile picture preview">'+
  '<span data-avatar-initials aria-hidden="true">'+fallback+'</span>'+
  '<img data-avatar-image alt="Selected profile picture preview" hidden /></div>'+
  '<div class="settings-avatar-controls"><label for="settings-avatar-file" class="settings-avatar-file-label">Choose a photo</label>'+
  '<input id="settings-avatar-file" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="settings-avatar-guidance"/>'+
  '<small id="settings-avatar-guidance">JPEG, PNG or WebP · Up to 5 MB · Cropped to a square.</small>'+
  '<div class="settings-avatar-crop" data-avatar-crop hidden>'+
  '<label for="settings-avatar-zoom">Zoom</label><input id="settings-avatar-zoom" type="range" min="100" max="300" value="100" step="10"/>'+
  '<label for="settings-avatar-pos-x">Horizontal position</label><input id="settings-avatar-pos-x" type="range" min="0" max="100" value="50" step="5"/>'+
  '<label for="settings-avatar-pos-y">Vertical position</label><input id="settings-avatar-pos-y" type="range" min="0" max="100" value="50" step="5"/>'+
  '</div><button type="button" class="secondary" data-avatar-clear hidden>Discard preview</button>'+
  '</div></div>'+
  '<p class="settings-avatar-status" data-avatar-status role="status" aria-live="polite"></p>'+
  '<p class="settings-avatar-gate">Photo saving and removal are not active yet. A private user-owned Storage bucket and server-verified profile reference are required first. No photo is uploaded by this preview.</p>'+
  '</section>';
}
let activePreviewUrl=null;
function releasePreview(){
 if(activePreviewUrl){URL.revokeObjectURL(activePreviewUrl);activePreviewUrl=null;}
}
export function mountAvatarPreview(container){
 releasePreview();
 const section=container?.querySelector('.settings-avatar-editor');
 if(!section)return;
 const input=section.querySelector('#settings-avatar-file');
 const image=section.querySelector('[data-avatar-image]');
 const initials=section.querySelector('[data-avatar-initials]');
 const status=section.querySelector('[data-avatar-status]');
 const crop=section.querySelector('[data-avatar-crop]');
 const clear=section.querySelector('[data-avatar-clear]');
 const sliders=[...crop.querySelectorAll('input[type="range"]')];
 let selected=null,sequence=0;
 const reset=()=>{
  sequence++;
  selected=null;releasePreview();
  input.value='';
  crop.hidden=true;clear.hidden=true;image.hidden=true;
  image.removeAttribute('src');initials.hidden=false;status.textContent='';
  for(const slider of sliders)slider.value=slider.id==='settings-avatar-zoom'?'100':'50';
 };
 const update=async()=>{
  const version=++sequence;
  if(!selected)return;
  status.textContent='Preparing local preview…';
  try{
   const blob=await prepareAvatarImage(selected,{
    zoom:Number(sliders[0].value)/100,
    positionX:Number(sliders[1].value),
    positionY:Number(sliders[2].value)
   });
   if(version!==sequence||!section.isConnected)return;
   const url=URL.createObjectURL(blob);
   releasePreview();
   activePreviewUrl=url;
   image.src=url;image.hidden=false;initials.hidden=true;
   crop.hidden=false;clear.hidden=false;
   status.textContent='Preview ready. Nothing has been uploaded or saved.';
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
}
