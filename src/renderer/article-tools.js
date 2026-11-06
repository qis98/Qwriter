let rewrite=null,showingRewrite=true;
let bodyPreviewEpoch=0;
window.pendingBodyPreview=Promise.resolve();
function queueBodyPreview(article){
  if(!article||state.editing)return;
  if(article.richHtml&&!rewrite){++bodyPreviewEpoch;$('previewBody').innerHTML=DOMPurify.sanitize(article.richHtml.replace(/qwriter-asset:\/\/([a-f0-9]{64}\.png)/g,(_,name)=>state.article.images?.['inline/'+name]||''));window.pendingBodyPreview=Promise.resolve();return;}
  const epoch=++bodyPreviewEpoch,id=state.article.id;
  const layout=rewrite?.candidate.kind==='structure'&&showingRewrite?'reading':state.article.layout||'simple';
  window.pendingBodyPreview=call('render-preview',{id,paragraphs:article.paragraphs,layout,manualImages:!!state.article.manualImages,layoutRevision:rewrite?.candidate.kind==='structure'&&showingRewrite?3:state.article.layoutRevision||2}).then(html=>{
    if(epoch!==bodyPreviewEpoch||state.article?.id!==id||state.editing)return;
    $('previewBody').innerHTML=html.replaceAll('src="qwriter-local://body"','src="'+(state.article.images?.['body.png']||'data:,')+'"').replace(/qwriter-asset:\/\/([a-f0-9]{64}\.png)/g,(_,name)=>state.article.images?.['inline/'+name]||'');
  }).catch(error=>{if(epoch===bodyPreviewEpoch)notice('本地排版未完成：'+error.message,true);});
}
function syncArticleTools(){
  const a=state.article,dirty=!!(a&&editBuffers[a.id]);
  if(a?.pendingRewrite){rewrite={articleId:a.id,candidate:a.pendingRewrite.candidate};}else if(rewrite&&rewrite.articleId!==a?.id)rewrite=null;
  $('humanizeArticle').disabled=!a||state.busy||state.editing||dirty||a.importedSaved||!!rewrite||!!a.richHtml;
  $('structureArticle').disabled=$('humanizeArticle').disabled;
  $('layoutSelect').disabled=!a||state.busy||state.editing||dirty||a.importedSaved||!!rewrite;
  $('manualLayout').hidden=!a?.richHtml;$('layoutSelect').value=a?.richHtml?'manual':a?.layout||'simple';$('readPane').dataset.layout=a?.layout||'simple';
  $('rewriteReview').hidden=!rewrite;if(rewrite){for(const id of ['editToggle','exportArticle','sendDraft','retryImages'])$(id).disabled=true;$('draftHint').textContent='请先采用或放弃润色稿';}
  $('proposalHeading').textContent=rewrite?.candidate.kind==='structure'?'章节排版预览':'润色预览';
  for(const id of ['applyRewrite','discardRewrite','rewriteOriginal','rewriteCandidate'])$(id).disabled=state.busy;
}
function showRewrite(){if(!rewrite)return;const a=showingRewrite?rewrite.candidate:state.article;$('previewBody').innerHTML=a.paragraphs.map(p=>`<p class="body-paragraph">${esc(p)}</p>`).join('');$('previewTitle').textContent=a.title;$('rewriteCandidate').disabled=state.busy||showingRewrite;$('rewriteOriginal').disabled=state.busy||!showingRewrite;queueBodyPreview(a);}
listen('humanizeArticle','click',async()=>{notice('');setBusy(true);try{const articleId=state.article.id,candidate=await call('humanize',articleId);state.article=await call('article',articleId);rewrite={articleId,candidate};showingRewrite=true;state.editing=false;renderArticle();showRewrite();$('articlePreview').scrollTop=0;}finally{setBusy(false);if(rewrite)showRewrite();}});
listen('structureArticle','click',async()=>{notice('');setBusy(true);try{const articleId=state.article.id,candidate=await call('structure',articleId);state.article=await call('article',articleId);rewrite={articleId,candidate};showingRewrite=true;state.editing=false;renderArticle();showRewrite();$('articlePreview').scrollTop=0;}finally{setBusy(false);if(rewrite)showRewrite();}});
listen('rewriteOriginal','click',()=>{showingRewrite=false;showRewrite();});listen('rewriteCandidate','click',()=>{showingRewrite=true;showRewrite();});
listen('discardRewrite','click',async()=>{state.article=await call('discard-rewrite',{id:rewrite.articleId,proposalId:rewrite.candidate.proposalId});rewrite=null;renderArticle();});
listen('applyRewrite','click',async()=>{setBusy(true);try{state.article=await call('apply-rewrite',{id:rewrite.articleId,proposalId:rewrite.candidate.proposalId});rewrite=null;await refresh();renderArticle();}finally{setBusy(false);}});
listen('layoutSelect','change',async()=>{const layout=$('layoutSelect').value;if(state.article?.richHtml&&!confirm('重新套用主题会替换手动字号和样式，是否继续？')){syncArticleTools();return;}try{state.article=await call('save-layout',state.article.id,layout);renderArticle();await refresh();if(rewrite)showRewrite();}catch(e){renderArticle();throw e;}});
