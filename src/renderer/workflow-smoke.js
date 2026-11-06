(async()=>{
 const result={};setView('compose');$('words').value='custom';$('words').onchange?.();$('words').dispatchEvent(new Event('change'));$('customWords').value='';
 result.customWords=!$('customWords').hidden&&!$('customWords').disabled;
 const invalid=await window.studio.call('generate',{topic:'范围验证',words:12001});result.hiddenLimit=!invalid.ok&&invalid.error.includes('12000');
 $('words').value='300';$('words').dispatchEvent(new Event('change'));result.customRestores=$('customWords').hidden&&$('customWords').disabled;
 setView('library');await renderLists();const page=await call('article-page',{page:1});result.libraryPage=$('articlePage').textContent.includes('页')&&document.querySelectorAll('#articleList .record').length===page.items.length;
 setView('tasks');await renderLists();const tasks=await call('task-page',1),entry=tasks.items.find(t=>t.state==='completed');
 if(entry){await call('task-remove',entry.id);const article=await call('article',entry.articleId);result.taskKeepsArticle=!!article.id;}else result.taskKeepsArticle=false;
 await call('task-clear');await renderLists();result.taskClear=(await call('task-page',1)).items.every(t=>t.state!=='completed');
 setView('publishing');await syncCloudDrafts();
 const original=call;let release,calls=0;const gate=new Promise(r=>release=r);
 try{
  call=async(name,...args)=>{if(name==='publish-review'){++calls;await gate;}return original(name,...args);};
  const first=inspectCloudDraft('review-draft'),second=inspectCloudDraft('review-draft');
  result.instantPreview=$('publishReview').querySelector('.cloud-body')?.shadowRoot.textContent.includes('隔离验证草稿')&&$('publishForm').hidden;
  await new Promise(r=>setTimeout(r,30));result.coalesced=calls===1;release();await Promise.all([first,second]);
 }finally{call=original;}
 try{call=async(name,...args)=>{if(name==='publish-review')throw Error('隔离网络失败');return original(name,...args);};await inspectCloudDraft('review-draft');result.previewSurvivesFailure=$('publishReview').querySelector('.cloud-body')?.shadowRoot.textContent.includes('隔离验证草稿')&&!$('retryDraftRead').hidden&&$('publishForm').hidden;}finally{call=original;}
 await inspectCloudDraft('review-draft');result.reviewRecovers=!$('publishForm').hidden&&!$('editCloudDraft').disabled;
 result.accountLabelRemoved=!$('publishAccount');result.gradient=getComputedStyle(document.body).backgroundImage.includes('gradient');setView('compose');return result;
})()
