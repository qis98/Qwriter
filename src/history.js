const crypto=require('node:crypto');
function pageRows(rows,page=1,size=20){
  const total=rows.length,pages=Math.max(1,Math.ceil(total/size));
  page=Math.min(pages,Math.max(1,Number.isSafeInteger(page)?page:1));
  return {items:rows.slice((page-1)*size,page*size),page,pages,total};
}
function createHistory({file,read,atomic}){
  let queue=Promise.resolve();
  const mutate=fn=>{const next=queue.then(async()=>{const entries=await read(file,null);return fn(entries);});queue=next.catch(()=>{});return next;};
  return {
    seed:articles=>mutate(async entries=>{if(entries!==null){if(entries.some(r=>r.state==='running')){for(const r of entries)if(r.state==='running')r.state='failed';await atomic(file,entries);}return;}await atomic(file,articles.map(a=>({id:crypto.randomUUID(),articleId:a.id,title:a.title,kind:'history',state:['needs_attention','interrupted'].includes(a.status)?'failed':'completed',at:a.updatedAt||a.createdAt})));}),
    add:record=>mutate(async entries=>{const next={id:crypto.randomUUID(),at:new Date().toISOString(),...record};await atomic(file,[next,...entries||[]]);return next;}),
    finish:(id,record)=>mutate(async entries=>{const item=entries?.find(r=>r.id===id);if(item){Object.assign(item,record);await atomic(file,entries);}}),
    async list(page,running){await queue;const entries=(await read(file,[])||[]).filter(r=>!r.hidden&&r.id!==running?.recordId);if(running)entries.unshift(running);return pageRows(entries.sort((a,b)=>String(b.at).localeCompare(String(a.at))),page);},
    remove:id=>mutate(async entries=>{const item=entries?.find(r=>r.id===id);if(!item||item.state==='running')throw Error('记录不存在或任务仍在执行。');item.hidden=true;await atomic(file,entries);}),
    clear:()=>mutate(async entries=>{for(const item of entries||[])if(item.state==='completed')item.hidden=true;await atomic(file,entries||[]);})
  };
}
module.exports={pageRows,createHistory};
