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
