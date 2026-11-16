import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const baseUrl=process.env.FRT_BROWSER_BASE_URL||'http://127.0.0.1:5173/';
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||
 '/Applications/Chromium.app/Contents/MacOS/Chromium';
const browser=await chromium.launch({headless:true,executablePath});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto(baseUrl,{waitUntil:'networkidle'});
 const result=await page.evaluate(async()=>{
  const ui=await import('/frontend/frt-voucher-document.js');
  const pdf=await import('/frontend/frt-voucher-pdf.js');
  const requestId='11111111-1111-4111-8111-111111111111';
  const items=Array.from({length:90},(_,index)=>({
   category:index%2?'Printing':'Office supplies',
   description:'Line '+(index+1)+' — supporting expense description for PDF pagination and repeated header verification.',
   amount:'100.00'
  }));
  const voucher={
   workspaceId:'00000000-0000-4000-8000-000000000001',requestId,
   company:{code:'WASS',name:'Watchdog Automation Sales & Services'},
   voucherNumber:'DV-WASS-202611-001',voucherDate:'2026-11-16T02:00:00Z',
   requestReference:{orderIntakeNo:'OI-2026-001',checkNo:'CHK-1001'},
   title:'Office supplies',department:'Operations',fundSource:'Operating Fund',
   payee:'Supplier & Sons',payeeBank:'Example Bank',dateNeeded:'2026-11-20',
   description:'Voucher generated from a signed persisted request fixture.',
   totalAmount:'9000.00',requestStatus:'DONE',liquidationStatus:'NOT_SUBMITTED',
   preparedBy:'Prepared User',preparedAt:'2026-11-16T02:00:00Z',
   financeApproval:{approvedBy:'Finance User',approvedAt:'2026-11-16T03:00:00Z'},
   gmVerification:{verifiedBy:'GM User',verifiedAt:'2026-11-16T04:00:00Z',reference:'GM-REF-01'},
   items,reconciliation:{itemsTotal:'9000.00',totalAmount:'9000.00',balanced:true},
   bankExecution:null,bankExecutionError:'No bank execution has been recorded.'
  };
  document.body.innerHTML='<div class="modal-backdrop"><section class="modal frt-collab-panel"><div class="frt-collab-panel-body">'+ui.renderFRTVoucherDocument(voucher)+'</div></section></div>';
  const output=await pdf.createFRTVoucherPdfBlob(voucher);
  const bytes=new Uint8Array(await output.arrayBuffer());
  const header=new TextDecoder('latin1').decode(bytes.slice(0,8));
  const pageCount=(new TextDecoder('latin1').decode(bytes).match(/\/Type\s*\/Page\b/g)||[]).length;
  const previewUrl=URL.createObjectURL(output);
  const previewHost=document.querySelector('[data-frt-voucher-pdf-preview]');
  previewHost.innerHTML='<iframe data-frt-voucher-pdf-frame title="Voucher PDF preview" src="'+previewUrl+'"></iframe>';
  document.querySelector('[data-frt-voucher-download]').addEventListener('click',()=>pdf.downloadFRTVoucherPdf(voucher));
  document.querySelector('[data-frt-voucher-print]').addEventListener('click',async()=>{
   const printWindow=window.open('about:blank','_blank');
   await pdf.printFRTVoucherPdf(voucher,printWindow);
  });
  document.querySelector('[data-frt-voucher-reprint]').addEventListener('click',async()=>{
   const printWindow=window.open('about:blank','_blank');
   await pdf.printFRTVoucherPdf({...voucher},printWindow);
  });
  const css={
   paperRadius:getComputedStyle(document.querySelector('.frt-voucher-paper')).borderRadius,
   subtotalRows:document.querySelectorAll('.frt-voucher-subtotal').length,
   actions:document.querySelectorAll('.frt-voucher-toolbar button').length,
   frameSrc:document.querySelector('[data-frt-voucher-pdf-frame]').src
  };
  return {header,pdfBytes:bytes.length,pageCount,css,previewUrl};
 });
 assert.equal(result.header,'%PDF-1.3');
 assert.ok(result.pdfBytes>12000);
 assert.ok(result.pageCount>=2);
 assert.equal(result.css.paperRadius,'12px');
 assert.equal(result.css.subtotalRows,2);
 assert.equal(result.css.actions,4);
 assert.match(result.css.frameSrc,/^blob:/);
 const downloadPromise=page.waitForEvent('download');
 await page.click('[data-frt-voucher-download]');
 const download=await downloadPromise;
 const downloadedPath=await download.path();
 const fs=await import('node:fs/promises');
 const downloaded=await fs.readFile(downloadedPath);
 assert.equal(downloaded.subarray(0,8).toString(),'%PDF-1.3');
 assert.match(download.suggestedFilename(),/DV-WASS-202611-001\.pdf$/);
 const printPromise=page.waitForEvent('popup');
 await page.click('[data-frt-voucher-print]');
 const printPopup=await printPromise;
 await printPopup.waitForLoadState('domcontentloaded');
 assert.match(printPopup.url(),/^blob:/);
 const reprintPromise=page.waitForEvent('popup');
 await page.click('[data-frt-voucher-reprint]');
 const reprintPopup=await reprintPromise;
 await reprintPopup.waitForLoadState('domcontentloaded');
 assert.match(reprintPopup.url(),/^blob:/);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({browser:'Chromium',pdfHeader:result.header,pdfBytes:result.pdfBytes,
  pageCount:result.pageCount,categorySubtotalRows:result.css.subtotalRows,
  actionControls:result.css.actions,pdfPreviewBlob:true,pdfDownload:true,
  printPopup:true,reprintPopup:true,cssLoaded:true,pageErrors:errors},null,2));
}finally{
 await browser.close();
}
