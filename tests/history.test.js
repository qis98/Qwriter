const {test}=require('node:test'),assert=require('node:assert/strict');
const {pageRows,createHistory}=require('../src/history');
test('paging clamps after deletions and returns only the requested page',()=>{const rows=Array.from({length:45},(_,i)=>i);assert.deepEqual(pageRows(rows,2).items,rows.slice(20,40));assert.equal(pageRows(rows,99).page,3);assert.equal(pageRows([],9).pages,1);});
test('task cleanup affects records only and cannot remove running tasks',async()=>{
  let stored=null;const original=[{id:'article1',title:'Original',status:'ready',updatedAt:'2026-11-07'}];
  const history=createHistory({file:'history',read:async(_,fallback)=>stored===null?fallback:structuredClone(stored),atomic:async(_,value)=>{stored=structuredClone(value);}});
  await history.seed(original);await history.seed(original);assert.equal(stored.length,1);
  await history.remove(stored[0].id);assert.equal((await history.list(1)).total,0);assert.equal(original.length,1);
  await history.add({articleId:'article1',title:'Completed',state:'completed'});await history.add({articleId:'article1',title:'Failed',state:'failed'});await history.clear();
  const result=await history.list(1,{id:'running',state:'running',at:'2099'});assert.equal(result.total,2);await assert.rejects(history.remove('running'),/执行/);
});
test('running task records survive restart and become failed after interruption',async()=>{
 let stored=[];const history=createHistory({file:'fixture',read:async()=>structuredClone(stored),atomic:async(_,value)=>{stored=structuredClone(value);}});
 const task=await history.add({state:'running',articleId:'kept',title:'Task'});await assert.rejects(history.remove(task.id),/执行/);
 await history.seed([]);assert.equal((await history.list(1)).items[0].state,'failed');await history.finish(task.id,{state:'completed'});assert.equal((await history.list(1)).items[0].state,'completed');
});
