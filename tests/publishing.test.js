const {test}=require('node:test');const assert=require('node:assert/strict');
const {due,createPublishing}=require('../src/publishing');
test('scheduled execution binds account and refuses missed times',()=>{const now=Date.now(),job={state:'scheduled',appId:'a',at:new Date(now-1000).toISOString()};assert.equal(due(job,now,'a'),'run');assert.equal(due(job,now,'b'),'account_changed');assert.equal(due(job,now+100000,'a'),'missed');assert.equal(due({...job,state:'uncertain'},now,'a'),null);});
function setup(){let jobs=[],count=0;const p=createPublishing({file:'test',read:async()=>structuredClone(jobs),atomic:async(_,value)=>{jobs=structuredClone(value);},worker:async(_,r)=>{if(r.operation==='inspect')return {hash:'hash',draft:{news_item:[{title:'Test'}]}};if(r.operation==='submit'){count++;throw Error('timeout');}},credentials:async()=>({appId:'wx1',secret:'test',name:'Test'}),busy:()=>false,begin:async(_,fn)=>fn(),notify:()=>{}});return {p,count:()=>count};}
test('ambiguous public submission is journaled and never automatically resent',async()=>{const {p,count}=setup();const r=await p.review('draft');await p.commit({token:r.token,kind:'mass',confirmed:true});assert.equal((await p.list())[0].state,'uncertain');await p.tick();assert.equal(count(),1);const r2=await p.review('draft');await assert.rejects(p.commit({token:r2.token,kind:'mass',confirmed:true}),/相同内容/);});
test('review needs explicit confirmation and schedule supports cancellation',async()=>{const {p,count}=setup();const r=await p.review('draft');await assert.rejects(p.commit({token:r.token,kind:'publish'}),/确认/);const job=await p.commit({token:r.token,kind:'publish',confirmed:true,at:new Date(Date.now()+120000).toISOString()});assert.equal(count(),0);await p.cancel(job.id);assert.equal((await p.list())[0].state,'cancelled');});

test('editing cloud drafts sanitizes HTML and invalidates the old send confirmation',async()=>{
  let edited;
  const draft={news_item:[{title:'Original',content:'<p>Original</p>'}]};
  const p=createPublishing({file:'test',read:async()=>[],atomic:async()=>{},worker:async(_,r)=>{
    if(r.operation==='inspect')return {hash:'old',draft};
    if(r.operation==='edit'){edited=r;return {hash:'new',draft:{news_item:[{title:r.title,content:r.html}]}};}
    throw Error('Unexpected operation');
  },credentials:async()=>({appId:'wx1',secret:'local',name:'Test'}),busy:()=>false,begin:async(_,fn)=>fn(),notify:()=>{}});
  const before=await p.review('draft');const after=await p.edit({token:before.token,index:0,title:'Edited',html:'<p style="font-size:24px">Text<script>alert(1)</script></p>'});
  assert.notEqual(after.token,before.token);assert.match(edited.html,/24px/);assert.doesNotMatch(edited.html,/script/);
  await assert.rejects(p.commit({token:before.token,kind:'publish',confirmed:true}),/过期/);
  assert.equal(after.hash,'new');
});

test('archiving preserves send deduplication and active jobs cannot be archived',async()=>{
 let jobs=[{id:'finished',state:'success',appId:'wx1',hash:'hash',kind:'publish'}];
 const p=createPublishing({file:'fixture',read:async()=>structuredClone(jobs),atomic:async(_,value)=>{jobs=structuredClone(value);},worker:async()=>({hash:'hash',draft:{news_item:[{title:'Test'}]}}),credentials:async()=>({appId:'wx1',secret:'fixture'}),busy:()=>false,begin:async(_,fn)=>fn(),notify:()=>{}});
 await p.archive('finished');assert.equal(jobs[0].archived,true);const review=await p.review('draft');await assert.rejects(p.commit({token:review.token,kind:'publish',confirmed:true}),/相同内容/);
 await p.archive('finished',false);assert.equal(jobs[0].archived,false);jobs[0].state='scheduled';await assert.rejects(p.archive('finished'),/取消/);
});
