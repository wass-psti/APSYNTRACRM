import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {chromium} from "playwright-core";
import Decimal from "decimal.js";
const database=process.env.MS_LOCAL_DATABASE;
assert.match(database??"",/^ms_cp02_test_\d+$/);
const sql=q=>execFileSync("docker",["exec","-i","supabase_db_material-sourcing-local","psql","-X","-U","postgres","-d",database,"-At","-v","ON_ERROR_STOP=1"],{input:q,encoding:"utf8"}).trim();
const url="http://127.0.0.1:4174",api=url+"/api/materials";
const get=async()=>{const r=await fetch(api);assert.equal(r.status,200);return r.json();};
const send=async(cmd,expected=200)=>{const r=await fetch(api,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(cmd)});const d=await r.json();if(expected!==null)assert.equal(r.status,expected,JSON.stringify(d).slice(0,220));return {status:r.status,...d};};
const check=async(name,fn)=>{await fn();console.log("PASS "+name);};
const initial=await get(),base=initial.records[0].material;
const make=(id,name="CP05 repeated part",patch={})=>({...base,id,name,group:"Engineering Services",description:"CP05 synthetic",brand:"QA",source:"Import",quantity:4,buyingPrice:120.36,currency:"USD",shipping:20,shipCurrency:"USD",tasks:[],activity:[],starred:false,expectedFxId:initial.reference.id,...patch});
const command=(action,items,extra={})=>({action,operationId:randomUUID(),items,...extra});
const revisions=records=>records.map(r=>({id:r.material.id,revision:r.revision}));
const find=async id=>(await get()).records.find(r=>r.material.id===id);
await check("mixed valid/invalid and duplicate identities are atomic",async()=>{
 const a=make("cp05-invalid-a"),b=make("cp05-invalid-b","Invalid",{quantity:0});
 await send(command("create",[a,b]),400);
 await send(command("create",[a,a]),400);
 await send(command("create",[a,make("cp05-invalid-date","Invalid date",{created:"2026-02-31"})]),400);
 assert.equal(await find(a.id),undefined);
 assert.equal(sql("select count(*) from material_sourcing.bulk_operation_receipts"),"0");
});
await check("concurrent identical imports and legitimate repeated part numbers",async()=>{
 const c=command("create",[make("cp05-a"),make("cp05-b")]);
 const results=await Promise.all([send(c),send(c)]);
 assert.equal(results.filter(r=>r.replayed).length,1);
 assert.equal((await get()).records.filter(r=>r.material.name==="CP05 repeated part").length,2);
 assert.equal(sql("select count(*) from material_sourcing.activity where material_id in ('cp05-a','cp05-b') and body='Material created'"),"2");
 await send({...c,items:[make("cp05-other")]},409);
 const other=command("create",[make("cp05-c")]);await send(other);
 assert.equal((await get()).records.filter(r=>r.material.name==="CP05 repeated part").length,3);
});
await check("overlapping bulk transactions conflict atomically and disjoint batches succeed",async()=>{
 const a=await find("cp05-a"),b=await find("cp05-b"),c=await find("cp05-c");
 const result=await Promise.all([send(command("bulkPatch",revisions([a,b]),{patch:{group:"Items for Quotation"}}),null),send(command("bulkPatch",revisions([b,c]),{patch:{source:"Local"}}),null)]);
 assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);
 const after=await get(),aa=after.records.find(r=>r.material.id==="cp05-a"),cc=after.records.find(r=>r.material.id==="cp05-c");
 if(result[0].status===200){assert.equal(aa.material.group,"Items for Quotation");assert.equal(cc.material.source,"Import");}
 else{assert.equal(aa.material.group,"Engineering Services");assert.equal(cc.material.source,"Local");}
 await Promise.all([send(command("bulkPatch",revisions([aa]),{patch:{source:"Local"}})),send(command("bulkPatch",revisions([cc]),{patch:{group:"Items for Quotation"}}))]);
});
await check("targeted patch preserves tasks, exact costs, FX, and revision atomicity",async()=>{
 const a=await find("cp05-a"),b=await find("cp05-b");
 await send({action:"collaborate",materialId:a.material.id,operationId:randomUUID(),change:{kind:"task.add",id:randomUUID(),title:"Keep this task"}});
 const historyBefore=Number(sql("select count(*) from material_sourcing.activity where material_id='cp05-a' and body like 'Bulk material updated:%'"));
 const patch=command("bulkPatch",revisions([a,b]),{patch:{source:"Local",group:"Items for Quotation"}});
 await send(patch);await send(patch);
 const aa=await find(a.material.id),bb=await find(b.material.id);
 assert.equal(aa.material.tasks[0].title,"Keep this task");
 assert.equal(aa.inputs.usd,a.inputs.usd);
 assert.equal(aa.costs.totalLanded,a.costs.totalLanded);
 assert.equal(aa.costs.selling,"11760.06");
 assert.equal(bb.material.source,"Local");
 await send(command("bulkPatch",revisions([aa,b]),{patch:{source:"Import"}}),409);
 assert.equal((await find(aa.material.id)).material.source,"Local");
 assert.equal(Number(sql("select count(*) from material_sourcing.activity where material_id='cp05-a' and body like 'Bulk material updated:%'")),historyBefore+1);
});
await check("archive and restore receipts preserve identities and original revisions",async()=>{
 const rows=await Promise.all(["cp05-a","cp05-b"].map(find));
 const c=command("archive",revisions(rows)),first=await send(c),repeat=await send(c);
 assert.deepEqual(repeat.archived,first.archived);assert.equal(repeat.replayed,true);
 assert.equal(await find("cp05-a"),undefined);
 const restore=command("restore",first.archived);
 await send(restore);assert.equal((await send(restore)).replayed,true);
 const a=await find("cp05-a");assert.equal(a.material.tasks[0].title,"Keep this task");
 assert.deepEqual(a.costs,rows[0].costs);
 assert.deepEqual((await send(c)).archived,first.archived);
 assert.ok(await find("cp05-a"),"old receipt must not rearchive");
 await send(command("restore",first.archived),409);
});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||"/Applications/Chromium.app/Contents/MacOS/Chromium",headless:true});
const ctx=await browser.newContext({viewport:{width:1630,height:930}});
const page=await ctx.newPage();page.setDefaultTimeout(10000);
const button=n=>page.getByRole("button",{name:n,exact:true});
const raw="CP05-UI-A\t\"Quoted\t description\"\tQA\tLocal\t2\t10.075\tPHP\t\t\t\nCP05-UI-B\tSwitch\tQA\tImport\t3\t10\tUSD";
const errors=[];page.on("pageerror",e=>errors.push(e.message));
try{
 await check("quoted TSV and unsent input recovery",async()=>{
  await page.goto(url+"/?mode=database");await button("Bulk Import").click();
  await page.getByLabel("Paste material rows").fill(raw);
  await page.reload();await button("Bulk Import").click();
  assert.equal(await page.getByLabel("Paste material rows").inputValue(),raw);
 });
 await check("lost import acknowledgement and reload retry creates exactly two rows",async()=>{
  await page.route("**/api/materials",async route=>{if(route.request().method()==="POST"){await route.fetch();await route.abort();}else await route.continue();});
  await button("Import 2 rows").click();
  await page.getByText("Import not confirmed. Input retained.",{exact:true}).waitFor();
  await page.unroute("**/api/materials");
  await page.reload();await button("Retry batch").click();
  await button("CP05-UI-A").waitFor();
  await button("Bulk Import").click();
  assert.equal(await page.getByLabel("Paste material rows").inputValue(),"");
  const data=await get();
  assert.equal(data.records.filter(r=>r.material.name.startsWith("CP05-UI-")).length,2);
  assert.equal(data.records.find(r=>r.material.name==="CP05-UI-A").costs.php,"10.08");
  assert.equal(data.records.find(r=>r.material.name==="CP05-UI-A").material.description,"Quoted\t description");
 });
 await check("invalid input retained, no partial import",async()=>{
  await page.getByLabel("Paste material rows").fill("CP05-UI-invalid\tRelay\tQA\tLocal\t1\t10\tPHP\nBad\tRelay\tQA\tLocal\t1\t0x10\tPHP");
  await button("Import 2 rows").click();await page.getByText("Row 2: Invalid decimal value.",{exact:true}).waitFor();
  assert.ok((await page.getByLabel("Paste material rows").inputValue()).includes("0x10"));
  assert.ok(!(await get()).records.some(r=>r.material.name==="CP05-UI-invalid"));
 });
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
await check("5,000 database-backed records and bulk financial reconciliation",async()=>{
 const rows=Array.from({length:5000},(_,i)=>make("cp05-load-"+String(i).padStart(5,"0"),"CP05 LOAD "+i,{quantity:1,buyingPrice:10.075,currency:"PHP",shipping:0,shipCurrency:"PHP"}));
 const start=performance.now(),created=await send(command("create",rows));
 console.log("METRIC import5000_ms="+Math.round(performance.now()-start));
 let records=created.records.filter(r=>r.material.id.startsWith("cp05-load-"));assert.equal(records.length,5000);
 const updateStart=performance.now();
 const patched=await send(command("bulkPatch",revisions(records),{patch:{source:"Local",group:"Items for Quotation"}}));
 console.log("METRIC patch5000_ms="+Math.round(performance.now()-updateStart));
 records=patched.records.filter(r=>r.material.id.startsWith("cp05-load-"));
 assert.equal(records.length,5000);assert.ok(records.every(r=>r.material.source==="Local"&&r.material.group==="Items for Quotation"&&r.costs.selling==="13.10"));
 const sum=records.reduce((t,r)=>t.plus(r.costs.totalLanded),new Decimal(0));
 assert.ok(sum.eq(sql("select sum(total_landed) from material_sourcing.material_costs where id like 'cp05-load-%'")));
 assert.equal(sql("select count(*) from material_sourcing.activity where material_id like 'cp05-load-%'"),"10000");
 const archiveStart=performance.now(),archived=await send(command("archive",revisions(records)));
 console.log("METRIC archive5000_ms="+Math.round(performance.now()-archiveStart));
 assert.equal(archived.archived.length,5000);assert.equal(archived.records.filter(r=>r.material.id.startsWith("cp05-load-")).length,0);
 const restoreStart=performance.now(),restored=await send(command("restore",archived.archived));
 console.log("METRIC restore5000_ms="+Math.round(performance.now()-restoreStart));
 assert.equal(restored.records.filter(r=>r.material.id.startsWith("cp05-load-")).length,5000);
 assert.equal(sql("select count(*) from material_sourcing.activity where material_id like 'cp05-load-%'"),"20000");
});
