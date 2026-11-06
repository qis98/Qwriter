const $=id=>document.getElementById(id);
const state={snapshot:null,article:null,busy:false,editing:false,jobId:null,loginTimer:null,view:'compose'};
let editBuffers={};try{editBuffers=JSON.parse(localStorage.getItem('article-edit-buffers')||'{}');}catch{}
function persistBuffers(){try{localStorage.setItem('article-edit-buffers',JSON.stringify(editBuffers));}catch{notice('编辑缓存空间不足，请及时保存修改。',true);}}
const labels={ready:'待存草稿',saved:'已存草稿',saved_unverified:'已存草稿·图片待核对',generating:'生成中',needs_attention:'需要处理',interrupted:'任务中断'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function call(name,...args){const result=await window.studio.call(name,...args);if(!result.ok)throw Error(result.error);return result.data;}
function notice(message,error=false){if(/Script failed to execute|Check the renderer console/i.test(message||''))message='微信页面暂未就绪，请刷新后重试；也可手动填写配置。';$('notice').textContent=message||'';$('notice').hidden=true;if(message)window.studio.call('notify',{message,error}).catch(()=>{});}

function badge(status){return `<span class="badge ${status==='saved'?'good':['needs_attention','interrupted','saved_unverified'].includes(status)?'warn':status==='generating'?'busy':''}">${labels[status]||'待处理'}</span>`;}
function date(value){if(!value)return '—';const d=new Date(value);return Number.isNaN(+d)?'—':d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}
function setView(name){if(name!=='guide')window.hideConfigWeb?.().catch(()=>{});state.view=name;document.querySelector('.shell').classList.toggle('list-mode',['library','tasks'].includes(name));document.querySelector('.shell').classList.toggle('publishing-mode',name==='publishing');document.querySelector('.shell').classList.toggle('compose-mode',name==='compose');document.querySelector('.shell').classList.toggle('settings-mode',name==='settings');document.querySelector('.shell').scrollTo(0,0);if(name==='guide'){fillGuide();window.enterGuideWorkspace?.();}if(name==='publishing'&&window.refreshPublishing)window.refreshPublishing();document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===name));document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===name));if(name==='library'||name==='tasks')renderLists();}
function setBusy(value){state.busy=value;document.querySelector('.compose-panel').classList.toggle('is-busy',value);$('composeForm').querySelectorAll('input,textarea,select,button').forEach(x=>x.disabled=value);$('newArticle').disabled=value;$('libraryNew').disabled=value;$('taskDot').hidden=!value;$('progressPanel').hidden=!value;$('generateButton').innerHTML=value?'任务执行中…':'生成文章<svg><use href="#i-arrow"/></svg>';
  for(const id of ['loginModel','refreshConnection','diagnoseWechat','logoutModel','disconnectWechat','chooseData','checkinNow','autoCheckinToggle','autoSaveToggle'])$(id).disabled=value;
  $('customWords').disabled=value||$('words').value!=='custom';renderArticle();renderLists();
}
function modelUI(model){const ok=!!model.connected;$('modelDot').className='dot '+(ok?'good':'bad');$('modelLabel').textContent=ok?'DeepSeek · 使用本人账号额度':'请先登录 WorkBuddy';$('modelStatus').textContent=ok?'模型账号已连接':'模型账号未连接';$('modelStatus').className='connection-state '+(ok?'good':'warn');$('creditsValue').textContent=ok?`${model.credits.toLocaleString()} 积分`:'登录后显示';}

async function refresh(fillSettings=false){state.snapshot=await call('snapshot');const s=state.snapshot.settings;modelUI(state.snapshot.model);$('articleCount').textContent=state.snapshot.articles.length;$('wechatStatus').textContent=s.hasSecret&&s.appId?(s.accountName||s.appId)+' · 已配置':'尚未配置公众号';$('wechatStatus').className='connection-state '+(s.hasSecret&&s.appId?'':'warn');$('dataPath').textContent=state.snapshot.dataDir;$('defaultDataPath').textContent=state.snapshot.defaultDataDir;$('storageMessage').textContent=state.snapshot.storageNotice||'';$('storageMessage').hidden=!state.snapshot.storageNotice;$('logoutModel').disabled=state.busy||!state.snapshot.model.accounts;$('disconnectWechat').disabled=state.busy||!s.hasSecret&&!s.appId;$('appVersion').textContent='v'+state.snapshot.version;
  if(fillSettings){$('wechatName').value=s.accountName;$('author').value=s.author;$('appId').value=s.appId;$('appSecret').placeholder=s.hasSecret?'已加密保存；重新输入可替换':'请输入公众号开发者密码';}
  for(const [id,key] of [['autoSaveToggle','autoSave'],['autoCheckinToggle','autoCheckin']]){$(id).setAttribute('aria-checked',String(s[key]));$(id).title=s[key]?'已开启':'已关闭';$(id).disabled=state.busy;}
  $('checkinStatus').textContent=state.snapshot.checkin.message;$('checkinNow').disabled=state.busy||!state.snapshot.model.accounts;
  renderLists();if(s.startupError)notice(s.startupError,true);
}
let articlePage=1,taskPage=1,listEpoch=0;
function setListPager(prefix,result){$(prefix+'Page').textContent=`第 ${result.page} / ${result.pages} 页 · ${result.total} 条`;$(prefix+'Prev').disabled=result.page<=1;$(prefix+'Next').disabled=result.page>=result.pages;}
async function renderLists(){
 const view=state.view;if(!['library','tasks'].includes(view))return;const epoch=++listEpoch;
 try{
  if(view==='library'){
   const result=await call('article-page',{page:articlePage,query:$('search').value.trim(),status:$('statusFilter').value});if(epoch!==listEpoch||state.view!==view)return;articlePage=result.page;
   $('listTitle').textContent=`全部文章 · ${result.total}`;
   $('articleList').innerHTML=result.items.length?result.items.map(a=>`<button class="record" data-article="${esc(a.id)}"><span><strong>${esc(a.title)}</strong><small>${esc(a.accountName||'本地文章')}</small></span><span class="count">${a.wordCount} 字</span>${badge(a.status)}<time>${date(a.updatedAt)}</time><svg><use href="#i-arrow"/></svg></button>`).join(''):'<div class="list-empty">暂无文章</div>';setListPager('article',result);
  }else{
   const result=await call('task-page',taskPage);if(epoch!==listEpoch||state.view!==view)return;taskPage=result.page;
   const kinds={history:'历史记录',generate:'生成文章',send:'保存草稿',images:'生成配图',humanize:'文章润色',structure:'整理章节'},states={completed:'已完成',failed:'未完成',cancelled:'已取消',running:'执行中'};
   $('taskList').innerHTML=result.items.length?result.items.map(t=>`<div class="task-record"><button data-article="${esc(t.articleId)}"><strong>${esc(t.title)}</strong><small>${esc(kinds[t.kind]||'文章任务')} · ${esc(states[t.state]||t.state)} · ${date(t.at)}</small></button><button class="secondary" data-remove-task="${esc(t.id)}" ${t.state==='running'?'disabled':''}>移除</button></div>`).join(''):'<div class="list-empty">暂无任务记录</div>';setListPager('task',result);
   $('taskSummary').textContent=state.busy?'任务正在执行，已完成的记录可单独清理。':'清理任务记录会保留文章。';
   document.querySelectorAll('[data-remove-task]').forEach(b=>b.onclick=async()=>{try{await call('task-remove',b.dataset.removeTask);await renderLists();}catch(e){notice(e.message,true);}});
  }
  document.querySelectorAll('[data-article]').forEach(button=>button.onclick=()=>openArticle(button.dataset.article));
 }catch(error){notice(error.message,true);}
}
async function openArticle(id){if(state.busy){notice('请等待当前任务结束。');return;}try{state.article=await call('article',id);state.editing=false;renderArticle();setView('compose');notice('');}catch(e){notice(e.message,true);}}
function renderArticle(){const a=state.article,exists=!!a;$('previewEmpty').hidden=exists;document.querySelector('.preview-heading .article-meta').hidden=!exists;$('articlePreview').hidden=!exists;$('editToggle').disabled=!exists||state.busy||a?.importedSaved;$('exportArticle').disabled=!exists||state.busy;
 $('sendDraft').disabled=!exists||state.busy||state.editing||state.editorOpen||!!editBuffers[a?.id]||!!a?.importedSaved||!!a?.imageRequestPending||!a?.paragraphs?.length;
 $('sendDraft').textContent=['saved','saved_unverified'].includes(a?.status)?'重新核验草稿':'保存公众号草稿';
 if(!exists){$('draftHint').textContent='';syncArticleTools();return;}
 $('articleStatus').textContent=labels[a.status]||'待处理';$('articleStatus').className='badge '+(a.status==='saved'?'good':['needs_attention','interrupted','saved_unverified'].includes(a.status)?'warn':'');$('articleWords').textContent=`${a.wordCount||0} 字`;
 const textCredit=a.usage?.credit??a.usage?.cost_credits;const imageCredit=Object.values(a.aiImages||{}).reduce((n,x)=>n+(Number(x.credit)||0),0);
 $('articleCost').textContent=[textCredit!=null?`文字 ${textCredit} 积分`:'',imageCredit?`图片 ${imageCredit.toFixed(2)} 积分`:''].filter(Boolean).join(' · ');
 $('previewTitle').textContent=a.title;$('previewAuthor').textContent=[state.snapshot?.settings.author,a.accountName||state.snapshot?.settings.accountName].filter(Boolean).join(' · ');
 $('coverImage').hidden=!a.images?.['cover.png'];if(a.images?.['cover.png'])$('coverImage').src=a.images['cover.png'];
 $('previewBody').innerHTML=(a.paragraphs||[]).map((p,i)=>`<p class="body-paragraph">${esc(p)}</p>`+(i===1&&a.images?.['body.png']?`<img class="body-image" alt="AI主题插图" src="${a.images['body.png']}">`:'')).join('');
 const warning=a.importedSaved?'已存入公众号的历史验证稿，只读展示，不会重复上传。':editBuffers[a.id]?'有未保存的修改，已在本机暂存。点击编辑继续，保存后再上传。':a.error||a.warning||(a.imageRequestPending?'上次生图结果待核对。请先检查平台用量，或用本地图片替换后继续。':'');$('articleWarning').textContent=warning;$('articleWarning').hidden=!warning;
 $('retryImages').hidden=!(a.imageCount&&!a.imageRequestPending&&Object.keys(a.aiImages||{}).length<a.imageCount);$('retryImages').disabled=state.busy;
 $('draftHint').textContent=a.status==='saved'?`已核验 · ${date(a.draft?.verifiedAt||a.draft?.verified_at)}`:a.status==='saved_unverified'?'已有草稿，图片待核对':state.editing?'请先保存修改':'';syncArticleTools();if(rewrite)showRewrite();else queueBodyPreview(a);
}
function newArticle(){if(state.busy)return;state.article=null;state.editing=false;setView('compose');renderArticle();notice('');$('topic').focus();}
function progress(event){if(event.configPage){if(configWebVisible)$('configWebStatus').textContent=event.configPage.message||'微信官方页面';return;}if(event.publishing){if(state.view==='publishing')window.refreshPublishing?.();return;}if(event.checkin){refresh().catch(()=>{});return;}if(event.id)state.jobId=event.id;if(event.finished)return;const stages={text:'生成正文',image:'生成配图',upload:'上传素材',draft:'保存草稿',verify:'读回核验'};const order=['text','image','upload','verify'];$('progressLabel').textContent=stages[event.stage]||'正在执行';$('progressMessage').textContent=event.message||'';const current=order.indexOf(event.stage==='draft'?'upload':event.stage);document.querySelectorAll('#steps li').forEach(x=>{const index=order.indexOf(x.dataset.step);x.classList.toggle('current',index===current);x.classList.toggle('done',index<current);});}
async function task(fn){notice('');state.jobId=null;setBusy(true);try{const a=await fn();if(a){state.article=a;state.editing=false;}await refresh();notice(a?.status==='saved'?'草稿已保存并核验':a?.status==='saved_unverified'?a.warning:'文章已生成');}catch(e){notice(e.message,true);await refresh();if(state.jobId){try{state.article=await call('article',state.jobId);}catch{}}}finally{setBusy(false);}}
function listen(id,event,fn){$(id).addEventListener(event,async e=>{try{await fn(e);}catch(error){notice(error.message,true);}});}
document.querySelectorAll('[data-view]').forEach(x=>x.addEventListener('click',()=>setView(x.dataset.view)));
listen('newArticle','click',newArticle);listen('libraryNew','click',newArticle);listen('modelSettings','click',()=>setView('settings'));
listen('topic','input',()=>$('topicCount').textContent=`${$('topic').value.length} / 200`);
document.querySelectorAll('input[name=images]').forEach(x=>x.addEventListener('change',()=>{$('imageNote').textContent=x.value==='0'?'':`AI 配图 · 使用账号积分`;}));
listen('composeForm','submit',async e=>{e.preventDefault();const spec={topic:$('topic').value.trim(),words:$('words').value==='custom'?Number($('customWords').value||300):Number($('words').value),tone:$('tone').value,imageCount:Number(document.querySelector('input[name=images]:checked').value),autoSave:state.snapshot.settings.autoSave};if(!spec.topic)throw Error('请先填写文章主题。');await task(()=>call('generate',spec));});
listen('sendDraft','click',()=>task(()=>call('send',state.article.id)));
listen('retryImages','click',()=>task(()=>call('retry-images',state.article.id)));
listen('cancelTask','click',async()=>{await call('cancel');$('progressMessage').textContent='正在取消，已有内容将保留…';});
listen('editToggle','click',()=>openLocalEditor());
listen('exportArticle','click',async()=>{if(await call('export',state.article.id))notice('文章已导出。');});
listen('words','change',()=>{$('customWords').hidden=$('words').value!=='custom';$('customWords').disabled=state.busy||$('words').value!=='custom';});
listen('statusFilter','change',()=>{articlePage=1;renderLists();});listen('search','input',()=>{articlePage=1;if($('search').value)setView('library');renderLists();});
async function saveWechat(){const s=await call('save-settings',{accountName:$('wechatName').value.trim(),author:$('author').value.trim(),appId:$('appId').value.trim(),secret:$('appSecret').value.trim()});$('appSecret').value='';guideVerified=false;await refresh(true);return s;}
listen('wechatForm','submit',async e=>{e.preventDefault();await saveWechat();notice('公众号配置已加密保存，请检查凭据与IP。');});
listen('diagnoseWechat','click',async()=>{const s=await saveWechat();if(!s.appId||!s.hasSecret)throw Error('请填写公众号AppID和AppSecret。');$('wechatMessage').hidden=false;$('wechatMessage').className='connection-message';$('wechatMessage').textContent='正在检查…';$('diagnoseWechat').disabled=true;try{const result=await call('diagnose');$('wechatMessage').textContent='';$('wechatMessage').hidden=true;$('wechatStatus').textContent='公众号连接正常';$('wechatStatus').className='connection-state good';}catch(e){$('wechatMessage').hidden=true;$('wechatStatus').textContent='公众号连接失败';$('wechatStatus').className='connection-state warn';notice(e.message,true);}finally{$('diagnoseWechat').disabled=false;}});
listen('loginModel','click',async()=>{clearInterval(state.loginTimer);const result=await call('login-start');$('loginMessage').hidden=false;$('loginMessage').textContent='已打开浏览器，请在平台页面自行完成登录授权。软件正在等待结果…';$('loginModel').disabled=true;let attempts=0,polling=false;state.loginTimer=setInterval(async()=>{if(polling)return;polling=true;try{const resultPoll=await call('login-poll',result.state);if(resultPoll.success){clearInterval(state.loginTimer);$('loginMessage').hidden=true;$('loginMessage').textContent='';$('loginModel').disabled=false;await refresh();}else if(++attempts>60){clearInterval(state.loginTimer);$('loginMessage').hidden=false;$('loginMessage').textContent='授权等待已结束，可以再次点击登录。';$('loginModel').disabled=false;}}catch(e){clearInterval(state.loginTimer);$('loginModel').disabled=false;$('loginMessage').hidden=false;$('loginMessage').textContent=e.message;}finally{polling=false;}},3000);});
listen('refreshConnection','click',async()=>{await refresh();notice('');});
listen('logoutModel','click',async()=>{clearInterval(state.loginTimer);$('logoutModel').disabled=true;try{await call('logout-model');$('loginMessage').hidden=true;$('loginMessage').textContent='';}finally{$('loginModel').disabled=state.busy;await refresh();guideStatus();}});
listen('disconnectWechat','click',async()=>{await call('disconnect-wechat');$('appSecret').value='';$('guideSecret').value='';guideVerified=false;await refresh(true);fillGuide();$('wechatMessage').hidden=true;$('wechatMessage').textContent='';});
listen('chooseData','click',async()=>{$('chooseData').disabled=true;try{const result=await call('choose-data');if(result){await refresh();$('storageMessage').hidden=false;$('storageMessage').textContent='目录已切换，原目录保留。';}}finally{$('chooseData').disabled=state.busy;}});
for(const [id,key] of [['autoSaveToggle','autoSave'],['autoCheckinToggle','autoCheckin']])listen(id,'click',async()=>{$(id).disabled=true;try{await call('save-behavior',{[key]:!state.snapshot.settings[key]});await refresh();}finally{$(id).disabled=state.busy;}});
listen('checkinNow','click',async()=>{$('checkinNow').disabled=true;$('checkinStatus').textContent='正在签到…';try{const result=await call('checkin-now');await refresh();$('checkinStatus').textContent=result.message;}catch(e){$('checkinStatus').textContent=e.message;}finally{$('checkinNow').disabled=state.busy||!state.snapshot.model.accounts;}});
listen('openData','click',()=>call('open-data'));listen('backupData','click',async()=>{const target=await call('backup');if(target)notice('备份已保存至：'+target);});
document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='n'){e.preventDefault();newArticle();}if(e.ctrlKey&&e.key==='s'&&state.editorOpen){e.preventDefault();saveRichEditor();}});
window.studio.onProgress(progress);
document.addEventListener('DOMContentLoaded',()=>{refresh(true).then(()=>{renderArticle();fillGuide();if((!state.snapshot.settings.appId||!state.snapshot.settings.hasSecret)&&!localStorage.getItem('qwriter-guide-seen'))setView('guide');}).catch(e=>notice(e.message,true));});



for(const [id,delta] of [["articlePrev",-1],["articleNext",1]])listen(id,"click",()=>{articlePage+=delta;return renderLists();});
for(const [id,delta] of [["taskPrev",-1],["taskNext",1]])listen(id,"click",()=>{taskPage+=delta;return renderLists();});
listen("clearTasks","click",async()=>{await call("task-clear");taskPage=1;await renderLists();});
