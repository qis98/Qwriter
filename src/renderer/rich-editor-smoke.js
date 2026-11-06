(async()=>{
  await openArticle('smoke-edit');await openLocalEditor();
  const root=editorRoot(),doc=editorDoc();root.innerHTML='<p>可编辑正文</p>';
  const range=doc.createRange();range.selectNodeContents(root.firstChild);doc.getSelection().removeAllRanges();doc.getSelection().addRange(range);rememberEditorRange();
  $('editorSize').value='24';$('editorSize').onchange();
  const font=Array.from(root.querySelectorAll('*')).some(el=>getComputedStyle(el).fontSize==='24px');
  root.insertAdjacentHTML('beforeend','<p><img alt="测试配图" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGNkYPjPgA0wYRUdtBIAy0MBD1YkjLoAAAAASUVORK5CYII="></p>');
  chooseEditorImage(root.querySelector('img'));$('editorImageWidth').value='50%';$('editorImageWidth').onchange();editorChanged();
  await saveRichEditor();
  if(richSession)throw Error("编辑保存失败："+$("editorError").textContent);
  const stored=await call('article','smoke-edit');
  const persisted=!!stored.richHtml?.includes('24px')&&stored.richHtml.includes('width:50%')&&stored.richHtml.includes('qwriter-asset://')&&Object.keys(stored.images).some(k=>k.startsWith('inline/'));
  await openLocalEditor();const reopened=editorRoot().textContent.includes('可编辑正文')&&editorRoot().querySelector('img')?.src.startsWith('data:image/png;base64,');
  const original=editorRoot().querySelector('img');chooseEditorImage(original);$('editorDeleteImage').click();const deleted=!editorRoot().querySelector('img');
  closeRichEditor(true);
  setView('publishing');await inspectCloudDraft('review-draft');const accountRemoved=!$('publishReview').textContent.includes('发送公众号：');
  await openRichEditor({local:false,key:'review-draft:0',token:publicationReview.token,index:0,title:publicationReview.draft.news_item[0].title,html:publicationReview.draft.news_item[0].content});
  const cloudEditor=editorRoot().textContent.includes('隔离验证草稿')&&$('saveRichEditor').textContent==='保存到公众号草稿';
  closeRichEditor(true);await openArticle('smoke-edit');
  state.article=await call('save-layout','smoke-edit','wechat');renderArticle();await window.pendingBodyPreview;
  const restyleKeepsImages=!state.article.richHtml&&state.article.manualImages&&$('previewBody').querySelectorAll('img').length===1&&$('previewBody').querySelector('img').src.startsWith('data:image/png;base64,');
  await openLocalEditor();
  return {font,persisted,reopened,deleted,cloudEditor,accountRemoved,restyleKeepsImages};
})()
