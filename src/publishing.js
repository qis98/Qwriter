const crypto=require('node:crypto');

function due(job,now,appId){
  if(job.state!=='scheduled'||Date.parse(job.at)>now)return null;
  if(job.appId!==appId)return 'account_changed';
  if(now-Date.parse(job.at)>90000)return 'missed';
  return 'run';
}

function createPublishing({file,read,atomic,worker,credentials,busy,begin,notify,disabled=false}){
  const reviews=new Map();let ticking=false;
  const list=()=>read(file,[]);
  async function update(job){const jobs=await list();const i=jobs.findIndex(x=>x.id===job.id);if(i<0)jobs.unshift(job);else jobs[i]=job;await atomic(file,jobs);notify();}
  async function invoke(operation,extra={}){const wechat=await credentials();if(!wechat.appId||!wechat.secret)throw Error('请先保存公众号配置并检查连接。');if(extra.expectedAppId&&extra.expectedAppId!==wechat.appId)throw Error('公众号已切换，请重新确认。');return worker('publishing',{operation,wechat,...extra});}
  async function execute(job){
    const c=await credentials();if(c.appId!==job.appId){job.state='account_changed';await update(job);return;}
    job.state='submitting';job.startedAt=new Date().toISOString();await update(job);
    try{
      const result=await invoke('submit',{kind:job.kind,mediaId:job.mediaId,hash:job.hash,expectedAppId:job.appId});
      if(['blocked','rejected'].includes(result.outcome)){job.state='blocked';job.error=result.message;await update(job);return;}
      job.remoteId=job.kind==='publish'?result.publish_id:result.msg_id;
      if(!job.remoteId)throw Error('未收到任务编号');
      job.state='submitted';job.error=null;
    }catch{job.state='uncertain';job.error='提交结果未确认，请在公众号后台核对；软件不会自动重发。';}
    await update(job);
  }
  return {
    list,
    async archive(id,archived=true){const job=(await list()).find(j=>j.id===id);if(!job||!['success','failed','blocked','missed','account_changed','cancelled'].includes(job.state))throw Error('请先取消待执行任务，或查询并确认执行结果。');job.archived=archived!==false;await update(job);},
    drafts:offset=>invoke('list',{offset}),
    async review(mediaId){
      if(typeof mediaId!=='string'||!mediaId||mediaId.length>512)throw Error('草稿编号无效');
      const c=await credentials();const data=await invoke('inspect',{mediaId,expectedAppId:c.appId});
      const token=crypto.randomUUID();const value={token,mediaId,appId:c.appId,account:c.name||c.appId,hash:data.hash,draft:data.draft,expires:Date.now()+10*60000};
      reviews.clear();reviews.set(token,value);return value;
    },
    async edit({token,index,title,html,cover}){
      if(disabled)throw Error('隔离验证禁止修改真实公众号草稿');
      const r=reviews.get(token);if(!r||r.expires<Date.now())throw Error('编辑页已过期，请重新同步草稿。');
      if((await credentials()).appId!==r.appId)throw Error('公众号已切换，请重新同步。');
      if(!Number.isInteger(index)||index<0||index>=r.draft.news_item.length)throw Error('图文序号无效。');
      const {cleanRichHtml}=require('./rich-content');
      if(typeof title!=='string'||!title.trim()||title.length>64)throw Error('标题需为1至64字。');
      const content=cleanRichHtml(html);
      if(cover&&(typeof cover!=='string'||cover.length>12*1024*1024||!/^data:image\/(png|jpeg|webp);base64,/.test(cover)))throw Error('封面图片无效。');
      reviews.delete(token);
      const data=await invoke('edit',{mediaId:r.mediaId,hash:r.hash,index,title:title.trim(),html:content,cover,expectedAppId:r.appId});
      const next={...r,token:crypto.randomUUID(),hash:data.hash,draft:data.draft,expires:Date.now()+10*60000};reviews.set(next.token,next);return next;
    },
    async commit({token,kind,at,confirmed}){
      if(disabled)throw Error('隔离验证禁止真实发布');
      const r=reviews.get(token);if(!r||r.expires<Date.now())throw Error('确认页已过期，请重新查看草稿。');
      if(confirmed!==true||!['publish','mass'].includes(kind))throw Error('请确认发送方式和内容。');
      if((await credentials()).appId!==r.appId)throw Error('公众号已切换，请重新确认。');
      if(at&&(!Number.isFinite(Date.parse(at))||Date.parse(at)<Date.now()+60000))throw Error('定时时间应至少晚于当前时间一分钟。');
      const jobs=await list();if(jobs.some(j=>j.appId===r.appId&&j.hash===r.hash&&j.kind===kind&&!['cancelled','blocked'].includes(j.state)))throw Error('已有相同内容的发送记录，请先核对任务，避免重复。');
      const job={id:crypto.randomUUID(),appId:r.appId,account:r.account,mediaId:r.mediaId,hash:r.hash,kind,title:r.draft.news_item.map(x=>x.title).join(' / '),at:at||new Date().toISOString(),state:at?'scheduled':'queued',createdAt:new Date().toISOString()};
      await update(job);reviews.delete(token);if(!at)await execute(job);return job;
    },
    async cancel(id){const job=(await list()).find(x=>x.id===id);if(!job||job.state!=='scheduled')throw Error('仅待执行的定时任务可以取消。');job.state='cancelled';await update(job);},
    async status(id){const job=(await list()).find(x=>x.id===id);if(!job?.remoteId)throw Error('该任务没有可查询的微信任务编号，请在后台核对。');if((await credentials()).appId!==job.appId)throw Error('请切回任务所属公众号。');const result=await invoke('status',{kind:job.kind,remoteId:job.remoteId,expectedAppId:job.appId});job.result=result;job.checkedAt=new Date().toISOString();if(job.kind==='publish')job.state=result.publish_status===0?'success':result.publish_status===1?'submitted':'failed';else job.state=result.msg_status==='SEND_SUCCESS'?'success':result.msg_status==='SENDING'?'submitted':'failed';await update(job);return job;},
    async tick(){if(disabled||ticking||busy())return;ticking=true;try{const pending=await list();if(!pending.some(j=>['queued','submitting'].includes(j.state)||(j.state==='scheduled'&&Date.parse(j.at)<=Date.now())))return;await begin('scheduled-publish',async()=>{const jobs=await list();const c=await credentials();for(const job of jobs){if(['queued','submitting'].includes(job.state)){job.state='uncertain';job.error='上次提交中断，请在公众号后台核对，禁止自动重发。';await update(job);continue;}const next=due(job,Date.now(),c.appId);if(next==='run')await execute(job);else if(next){job.state=next;await update(job);}}});}finally{ticking=false;}}
  };
}
module.exports={createPublishing,due};
