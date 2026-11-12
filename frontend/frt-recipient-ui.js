/** Enhance the existing FRT Recipient wizard step with verified signed saves. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const friendlyError=error=>{
 const code=Number(error?.status);
 if(code===404||code===428)return 'Saved recipient service is not activated in this workspace.';
 return code===403?'Signed recipient access is unavailable.':
  'Could not verify recipient operation. Refresh saved accounts before retrying.';
};
export async function mountFRTRecipientUI(view,{client,scope}={}){
 if(!view?.querySelector('[data-frt-saved-recipient]')||!client||typeof scope!=='function')return null;
 const select=view.querySelector('[data-frt-saved-recipient]');
 const status=view.querySelector('[data-frt-recipient-status]');
 const save=view.querySelector('[data-frt-save-recipient]');
 const qrInput=view.querySelector('[data-frt-qr-file]');
 const upload=view.querySelector('[data-frt-upload-qr]');
 const preview=view.querySelector('[data-frt-preview-qr]');
 const company=view.querySelector('[name=companyCode]');
 const fields={recipientName:view.querySelector('[name=recipientName]'),
  accountName:view.querySelector('[name=recipientAccountName]'),
  bankName:view.querySelector('[name=recipientBank]'),
  accountNumber:view.querySelector('[name=recipientAccount]')};
 let items=[],activeId=null,generation=0,ready=false,busy=false;
 const active=()=>view.isConnected&&company.value===scope().companyCode;
 const update=message=>{if(view.isConnected)status.textContent=message;};
 const enable=()=>{
  if(!view.isConnected)return;
  save.disabled=!ready||busy;
  select.disabled=!ready||busy;
  qrInput.disabled=!ready||busy||!uuid.test(activeId||'');
  upload.disabled=!ready||busy||!uuid.test(activeId||'')||!qrInput.files?.length;
  preview.disabled=!ready||busy||!items.some(r=>r.id===activeId&&r.qrPath);
 };
 const clear=()=>{
  items=[];activeId=null;ready=false;
  select.replaceChildren(new Option('Loading saved recipients…',''));
  qrInput.value='';enable();
 };
 const fill=r=>{
  for(const [name,field] of Object.entries(fields))field.value=r?.[name]||'';
  activeId=r?.id||null;qrInput.value='';enable();
 };
 const load=async()=>{
  const serial=++generation;clear();
  try{
   const context=scope();
   const result=await client.list(context);
   if(serial!==generation||!active())return;
   items=result;ready=true;
   select.replaceChildren(new Option('Choose a saved account',''));
   for(const item of items){
    const option=new Option(item.recipientName+' — '+item.bankName,item.id);
    select.add(option);
   }
   update(items.length?items.length+' saved accounts ready.':'No saved accounts yet.');enable();
  }catch(error){
   if(serial!==generation||!view.isConnected)return;
   update(friendlyError(error));
   select.replaceChildren(new Option('Saved accounts unavailable',''));
   enable();
  }
 };
 company.addEventListener('change',()=>{generation++;clear();fill(null);void load();});
 select.addEventListener('change',()=>fill(items.find(r=>r.id===select.value)||null));
 save.addEventListener('click',async()=>{
  if(!ready||busy||!active())return;
  busy=true;enable();
  const snapshot=scope(),serial=generation;
  try{
   const result=await client.save({...snapshot,...Object.fromEntries(
    Object.entries(fields).map(([key,node])=>[key,node.value]))});
   if(serial!==generation||!active())return;
   // Reload after the single-shot save. Never auto-resubmit on ambiguous errors.
   await load();
   if(items.some(r=>r.id===result.id)){
    select.value=result.id;fill(items.find(r=>r.id===result.id));
    update('Recipient saved and verified.');
   }else update('Recipient save needs a refresh to verify.');
  }catch(error){if(serial===generation){
    if(error?.recipientOutcomeUncertain)ready=false;
    update(error?.recipientOutcomeUncertain?'Recipient save outcome uncertain. Close and refresh before saving again.':friendlyError(error));
   }}
  finally{busy=false;enable();}
 });
 qrInput.addEventListener('change',enable);
 upload.addEventListener('click',async()=>{
  if(!ready||busy||!active()||!uuid.test(activeId||'')||!qrInput.files?.length)return;
  const snapshot=scope(),recipientId=activeId,file=qrInput.files[0],
   record=items.find(r=>r.id===recipientId),serial=generation;
  busy=true;enable();update('Uploading private QR…');
  try{
   await client.uploadQR({...snapshot,recipientId,file,expectedPath:record?.qrPath||null});
   if(serial!==generation||!active())return;
   await load();
   const saved=items.find(r=>r.id===recipientId);
   if(saved){select.value=recipientId;fill(saved);}
   update(saved?.qrPath?'Private QR saved and verified.':'QR reference needs a refresh to verify.');
  }catch(error){if(serial===generation)update(friendlyError(error));}
  finally{busy=false;enable();}
 });
 preview.addEventListener('click',async()=>{
  if(!ready||busy||!active()||!uuid.test(activeId||''))return;
  const recipient=items.find(r=>r.id===activeId);
  if(!recipient?.qrPath)return;
  const serial=generation;busy=true;enable();
  try{
   const url=await client.signedQRUrl({...scope(),recipientId:activeId,qrPath:recipient.qrPath});
   if(serial!==generation||!active())return;
   // A temporary signed URL is opened only upon explicit user interaction.
   const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';
   link.click();update('Private QR opened with a short-lived link.');
  }catch(error){if(serial===generation)update(friendlyError(error));}
  finally{busy=false;enable();}
 });
 await load();
 return {reload:load};
}
