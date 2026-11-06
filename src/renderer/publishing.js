let publicationReview=null,draftOffset=0,draftTotal=0,draftReviewEpoch=0;
const publicationStates={blocked:'已阻止·未发送',scheduled:'待定时执行',queued:'准备提交',submitting:'正在提交',submitted:'已提交微信·等待结果',success:'微信返回成功',failed:'微信返回失败',uncertain:'结果未确认·请到后台核对',missed:'已错过·未执行',account_changed:'公众号已切换·未执行',cancelled:'已取消'};
async function publishAction(fn){try{await fn();}catch(e){notice(e.message,true);}}
let jobsPage=1,jobsEpoch=0,cloudAccount='',cloudBytes=0,reviewChain=Promise.resolve();
const cloudCache=new Map(),pendingReviews=new Map();
function cloudKey(id){return (state.snapshot?.settings.appId||'')+':'+id;}
function cacheCloudDraft(id,draft){const key=cloudKey(id),size=JSON.stringify(draft).length*2;if(cloudCache.has(key))cloudBytes-=cloudCache.get(key).size;cloudCache.delete(key);cloudCache.set(key,{draft,size});cloudBytes+=size;while(cloudCache.size>40||cloudBytes>20*1024*1024){const first=cloudCache.keys().next().value;cloudBytes-=cloudCache.get(first).size;cloudCache.delete(first);}}
function checkCloudAccount(){const key=state.snapshot?.settings.appId||'';if(key!==cloudAccount){cloudAccount=key;cloudCache.clear();cloudBytes=0;draftOffset=0;++draftReviewEpoch;publicationReview=null;$('publishForm').hidden=true;$('editCloudDraft').disabled=true;}}
function readLatestDraft(id){const key=cloudKey(id);if(pendingReviews.has(key))return pendingReviews.get(key);const promise=reviewChain.catch(()=>{}).then(()=>call('publish-review',id));reviewChain=promise;pendingReviews.set(key,promise);promise.finally(()=>pendingReviews.delete(key)).catch(()=>{});return promise;}
window.refreshPublishing=async()=>publishAction(async()=>{
 const epoch=++jobsEpoch,result=await call('publish-page',{page:jobsPage,archived:$('showArchivedJobs').checked});if(epoch!==jobsEpoch)return;jobsPage=result.page;setListPager('jobs',result);$('publishJobs').replaceChildren();
 if(!result.items.length){$('publishJobs').textContent='暂无记录';return;}
 for(const job of result.items){const row=document.createElement('div');row.className='publish-job';row.innerHTML=`<div><strong>${esc(job.title)}</strong><p>${esc(job.account)} · ${job.kind==='mass'?'群发全部粉丝':'公开发表'} · ${esc(new Date(job.at).toLocaleString())}</p><p>${esc(publicationStates[job.state]||job.state)}${job.error?' · '+esc(job.error):''}</p></div>`;const actions=document.createElement('div');actions.className='job-actions';
 const b=document.createElement('button');b.className='secondary';if(job.state==='scheduled'){b.textContent='取消定时';b.onclick=()=>publishAction(async()=>{await call('publish-cancel',job.id);await refreshPublishing();});actions.append(b);}else if(job.remoteId){b.textContent='查询微信结果';b.onclick=()=>publishAction(async()=>{await call('publish-status',job.id);await refreshPublishing();});actions.append(b);}
 if(['success','failed','blocked','missed','account_changed','cancelled'].includes(job.state)){const archive=document.createElement('button');archive.className='secondary';archive.textContent=job.archived?'恢复':'归档';archive.onclick=()=>publishAction(async()=>{await call('publish-archive',{id:job.id,archived:!job.archived});await refreshPublishing();});actions.append(archive);}
 row.append(actions);$('publishJobs').append(row);}
});
async function syncCloudDrafts(){
  checkCloudAccount();++draftReviewEpoch;$('syncDrafts').disabled=true;publicationReview=null;$('editCloudDraft').disabled=true;$('publishForm').hidden=true;$('publishReview').textContent='先从左侧选择一份草稿。';
  try{const result=await call('publish-drafts',draftOffset);draftTotal=result.total_count||0;if(draftOffset>0&&draftOffset>=draftTotal){draftOffset=Math.max(0,Math.ceil(draftTotal/20)-1)*20;return await syncCloudDrafts();}$('cloudDrafts').replaceChildren();for(const item of result.item||[]){if(item.content?.news_item)cacheCloudDraft(item.media_id,item.content);const b=document.createElement('button');b.className='cloud-draft';b.dataset.mediaId=item.media_id;b.textContent=(item.content?.news_item||[]).map(x=>x.title).join(' / ')||'未命名草稿';b.onclick=()=>publishAction(()=>inspectCloudDraft(item.media_id));$('cloudDrafts').append(b);}if(!result.item?.length)$('cloudDrafts').textContent='本页没有草稿';$('draftPage').textContent=`第 ${draftOffset/20+1} / ${Math.max(1,Math.ceil(draftTotal/20))} 页`;$('draftPrevious').disabled=draftOffset===0;$('draftNext').disabled=draftOffset+20>=draftTotal;}finally{$('syncDrafts').disabled=false;}
}
function renderCloudDraft(r){
  $('publishReview').replaceChildren();
  $('cloudEditIndex').replaceChildren();$('cloudEditIndex').hidden=r.draft.news_item.length<2;for(const [i,item] of r.draft.news_item.entries()){const option=document.createElement('option');option.value=i;option.textContent=(i+1)+' · '+item.title;$('cloudEditIndex').append(option);}
  for(const [index,item] of r.draft.news_item.entries()){
    const article=document.createElement('article');article.className='cloud-article';article.dataset.index=index;
    const h=document.createElement('h3');h.textContent=item.title;article.append(h);
    const meta=document.createElement('p');meta.className='cloud-meta';meta.textContent='作者：'+(item.author||'未填写');article.append(meta);
    if(item.thumb_url){const cover=document.createElement('div');cover.className='cloud-cover';const label=document.createElement('span');label.textContent='封面';cover.append(label);const img=document.createElement('img');img.src=normalizeDraftImage(item.thumb_url)||'';img.alt='草稿封面';if(img.getAttribute('src')){wireDraftImage(img);cover.append(img);}article.append(cover);}
    const text=document.createElement('div');text.className='cloud-body';renderCloudBody(text,item.content||'');article.append(text);$('publishReview').append(article);
  }
}
async function inspectCloudDraft(id){
 checkCloudAccount();const epoch=++draftReviewEpoch,key=cloudKey(id),cached=cloudCache.get(key)?.draft;
 publicationReview=null;$('editCloudDraft').disabled=true;$('publishForm').hidden=true;$('retryDraftRead').hidden=true;$('draftRefreshState').textContent='检查更新…';
 document.querySelectorAll('.cloud-draft').forEach(b=>b.classList.toggle('selected',b.dataset.mediaId===id));
 if(cached)renderCloudDraft({draft:cached});else $('publishReview').textContent='正在读取草稿…';
 try{const r=await readLatestDraft(id);if(epoch!==draftReviewEpoch||key!==cloudKey(id))return;
  if(!cached||JSON.stringify(cached.news_item)!==JSON.stringify(r.draft.news_item))renderCloudDraft(r);cacheCloudDraft(id,r.draft);publicationReview=r;
  $('editCloudDraft').disabled=false;$('publishConfirm').checked=false;$('publishForm').hidden=false;$('draftRefreshState').textContent='';
 }catch(error){if(epoch!==draftReviewEpoch)return;$('draftRefreshState').textContent=cached?'更新失败':'读取失败';$('retryDraftRead').hidden=false;$('retryDraftRead').onclick=()=>inspectCloudDraft(id);$('retryDraftRead').title=error.message;if(!cached)$('publishReview').textContent=error.message;}
}
$('syncDrafts').onclick=()=>publishAction(syncCloudDrafts);
$('draftPrevious').onclick=()=>publishAction(async()=>{draftOffset=Math.max(0,draftOffset-20);await syncCloudDrafts();});
$('draftNext').onclick=()=>publishAction(async()=>{draftOffset+=20;await syncCloudDrafts();});
$('refreshPublishJobs').onclick=refreshPublishing;
$('publishWhen').onchange=()=>{$('publishTime').hidden=$('publishTimeLabel').hidden=$('publishWhen').value!=='later';$('publishTime').required=$('publishWhen').value==='later';$('publishConfirm').checked=false;};
$('publishKind').onchange=()=>{$('publishKindHint').textContent=$('publishKind').value==='mass'?'推送至全部粉丝，消耗账号群发额度':'不主动推送粉丝消息';$('publishConfirm').checked=false;$('publishSubmit').textContent=$('publishKind').value==='mass'?'确认群发给全部粉丝':'确认公开发表';};
$('publishTime').onchange=()=>{$('publishConfirm').checked=false;};
$('publishForm').onsubmit=event=>{event.preventDefault();publishAction(async()=>{if(!publicationReview)throw Error('请重新选择草稿。');const at=$('publishWhen').value==='later'?new Date($('publishTime').value).toISOString():null;const details={token:publicationReview.token,kind:$('publishKind').value,at,confirmed:$('publishConfirm').checked};$('publishSubmit').disabled=true;try{await call('publish-commit',details);publicationReview=null;$('editCloudDraft').disabled=true;$('editCloudDraft').disabled=true;$('publishForm').hidden=true;$('publishReview').textContent='已建立执行记录，请在发布记录中查询结果。';await refreshPublishing();}finally{$('publishSubmit').disabled=false;}});};
function publishTab(history){$('publishWorkspace').hidden=history;$('publishHistory').hidden=!history;for(const [id,on] of [['showCloudDrafts',!history],['showPublishHistory',history]]){$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',String(on));}if(history)refreshPublishing();}
$('showCloudDrafts').onclick=()=>publishTab(false);
$('showPublishHistory').onclick=()=>publishTab(true);

$("showArchivedJobs").onchange=()=>{jobsPage=1;refreshPublishing();};$("jobsPrev").onclick=()=>{--jobsPage;refreshPublishing();};$("jobsNext").onclick=()=>{++jobsPage;refreshPublishing();};
