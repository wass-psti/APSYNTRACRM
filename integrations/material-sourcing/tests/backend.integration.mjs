import assert from "node:assert/strict";
import { Client } from "pg";
import { createMaterialRepository } from "../server/materialRepository.ts";
import { calculate } from "../src/utils/material.ts";
import { demoItems } from "../src/data/demo.ts";

// Dedicated local Supabase CLI database only; no remote URL or production credentials.
const db = new Client({host:"127.0.0.1",port:55322,user:"postgres",password:"postgres",database:"postgres",connectionTimeoutMillis:5000});
const check = async (name,fn)=>{await fn();console.log("PASS "+name);};
try {
  await db.connect();
  const identity=await db.query("select to_regclass('material_sourcing.materials') as relation, exists(select 1 from material_sourcing.fx_snapshots where id='demo-rates' and is_demo) as demo");
  assert.equal(identity.rows[0].relation,"material_sourcing.materials");
  assert.equal(identity.rows[0].demo,true);
  const repository=createMaterialRepository(db);
  await check("full material contract and seven-fixture pricing parity",async()=>{
    const page=await repository.list({actorRef:"demo-actor",limit:100});
    assert.equal(page.records.length,7);
    assert.equal(page.nextOffset,null);
    const samples=demoItems();
    for(const {material,costs} of page.records){
      const original=samples.find(i=>i.id===material.id);
      assert.ok(original);
      // Local fixture has a stable seed date, unlike the dynamically dated browser sample.
      assert.deepEqual({...material,created:original.created},original);
      for(const [name,value] of Object.entries(calculate(material))){
        assert.equal(costs[name]===null?null:Number(costs[name]),value,material.id+" "+name);
      }
    }
  });
  await check("stable pagination without duplicate records",async()=>{
    let offset=0; const ids=[];
    while(offset!==null){
      const page=await repository.list({actorRef:"demo-actor",limit:2,offset});
      ids.push(...page.records.map(r=>r.material.id));
      offset=page.nextOffset;
    }
    assert.equal(ids.length,7);assert.equal(new Set(ids).size,7);
    const page=await repository.list({actorRef:"demo-actor",limit:2,offset:7});
    assert.equal(page.records.length,0);assert.equal(page.nextOffset,null);
  });
  await check("literal case-insensitive search, injection-shaped input and bounds",async()=>{
    const search=async search=>(await repository.list({actorRef:"demo-actor",search})).records.map(r=>r.material.id);
    assert.deepEqual(await search("me300"),["demo-0"]);
    assert.deepEqual(await search("VFD4A8ME23ANNAA"),["demo-0"]);
    assert.equal((await search("hytech")).length,3);
    assert.deepEqual(await search("%' OR 1=1 --"),[]);
    assert.deepEqual(await search("%"),[]);
    await assert.rejects(repository.list({actorRef:"demo-actor",limit:0}),RangeError);
    await assert.rejects(repository.list({actorRef:"demo-actor",offset:-1}),RangeError);
  });
  await check("nested tasks, comments, actor-specific stars and archive exclusion",async()=>{
    await db.query("begin");
    try{
      await db.query("insert into material_sourcing.tasks(id,material_id,title,status,position) values ('contract-task','demo-0','QA task','Done',0)");
      await db.query("insert into material_sourcing.activity(id,material_id,kind,body,mentions) values ('contract-root','demo-0','comment','QA root',array['Procurement team'])");
      await db.query("insert into material_sourcing.activity(id,material_id,kind,body,parent_id,edited_at) values ('contract-reply','demo-0','comment','QA reply','contract-root',now())");
      await db.query("insert into material_sourcing.starred_materials(actor_ref,material_id) values ('contract-actor','demo-0')");
      await db.query("update material_sourcing.materials set archived_at=now() where id='demo-1'");
      const page=await repository.list({actorRef:"contract-actor"});
      assert.equal(page.records.length,6);
      const {material}=page.records.find(r=>r.material.id==="demo-0");
      assert.equal(material.starred,true);
      assert.deepEqual(material.tasks,[{id:"contract-task",title:"QA task",status:"Done"}]);
      const reply=material.activity.find(a=>a.id==="contract-reply");
      assert.equal(reply.parentId,"contract-root");
      assert.ok(reply.editedAt);
      assert.equal(reply.text,"Comment: QA reply");
      assert.deepEqual(material.activity.find(a=>a.id==="contract-root").mentions,["Procurement team"]);
      const other=await repository.list({actorRef:"other-actor",search:"ME300"});
      assert.equal(other.records[0].material.starred,false);
    }finally{await db.query("rollback");}
  });
  await check("decimal half-cent boundary parity",async()=>{
    await db.query("begin");
    try {
      await db.query("update material_sourcing.materials set buying_price=10.075,currency='PHP',shipping_cost=0,shipping_currency='PHP',source_type='Local' where id='demo-0'");
      const {material,costs}=(await repository.list({actorRef:"demo-actor",search:"ME300"})).records[0];
      assert.equal(costs.php,"10.08");
      assert.equal(calculate(material).php,10.08);
      for(const [name,value] of Object.entries(calculate(material))) assert.equal(costs[name]===null?null:Number(costs[name]),value,name);
    }finally{await db.query("rollback");}
  });
  assert.equal(Number((await db.query("select count(*) from material_sourcing.materials")).rows[0].count),7);
  console.log("PASS test mutations rolled back");
}finally{await db.end();}
