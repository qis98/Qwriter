let richSession=null,editorRange=null,selectedEditorImage=null;
const cloudEditBuffers=new Map();
function editorDoc(){return $('editorFrame').contentDocument;}
function editorRoot(){return editorDoc()?.getElementById('editorCanvas');}
function editorChanged(){
  if(!richSession||richSession.loading)return;
  const root=editorRoot();if(!root)return;
  richSession.dirty=true;$('richEditorState').textContent='未保存';
  const copy=root.cloneNode(true),originalNodes=root.querySelectorAll('*'),copyNodes=copy.querySelectorAll('*');
  // Freeze the editor's visible typography as inline styles. New headings and
  // paragraphs must not inherit different app/WeChat defaults after saving.
  originalNodes.forEach((node,index)=>{if(/^(P|DIV|SECTION|SPAN|H[1-6]|LI|TH|TD|BLOCKQUOTE|STRONG|B|EM|I|U|CODE|PRE)$/.test(node.tagName)){const computed=$('editorFrame').contentWindow.getComputedStyle(node);for(const property of ['font-family','font-size','font-weight','font-style','line-height','color','text-align'])copyNodes[index].style.setProperty(property,computed.getPropertyValue(property));}});
  copy.querySelectorAll('img').forEach(img=>{img.style.removeProperty('outline');img.removeAttribute('data-selected');});
  const value={title:$('richTitle').value,richHtml:copy.innerHTML,cover:richSession.cover||null};
  if(richSession.local){editBuffers[richSession.id]=value;try{const data=JSON.stringify(editBuffers);if(data.length<1500000)localStorage.setItem('article-edit-buffers',data);}catch{}}
  else cloudEditBuffers.set(richSession.key,value);
}
function rememberEditorRange(){
  const selection=editorDoc()?.getSelection();if(selection?.rangeCount&&editorRoot()?.contains(selection.anchorNode))editorRange=selection.getRangeAt(0).cloneRange();
}
function restoreEditorRange(){
  const doc=editorDoc();$('editorFrame').contentWindow.focus();
  if(editorRange){const selection=doc.getSelection();try{selection.removeAllRanges();selection.addRange(editorRange);}catch{editorRange=null;}}
}
function editorCommand(command,value=null){restoreEditorRange();editorDoc().execCommand('styleWithCSS',false,true);editorDoc().execCommand(command,false,value);rememberEditorRange();editorChanged();}
function chooseEditorImage(img){
  if(selectedEditorImage)selectedEditorImage.style.removeProperty('outline');
  selectedEditorImage=img;
  if(img){img.style.outline='2px solid #006b80';const range=editorDoc().createRange();range.selectNode(img);editorRange=range;}
  for(const id of ['editorReplaceImage','editorDeleteImage','editorImageWidth'])$(id).disabled=!img;
}
async function openRichEditor(spec){
  await window.hideConfigWeb?.();
  richSession={...spec,dirty:false,loading:true};editorRange=null;selectedEditorImage=null;
  const buffer=spec.local?editBuffers[spec.id]:cloudEditBuffers.get(spec.key);
  $('richTitle').value=buffer?.title??spec.title;
  richSession.cover=buffer?.cover||null;
  const cover=buffer?.cover||spec.coverPreview;
  $('editorCoverPreview').hidden=!cover;if(cover)$('editorCoverPreview').src=cover;
  $('richEditorHeading').textContent=spec.local?'编辑文章':'编辑公众号草稿';
  $('saveRichEditor').textContent=spec.local?'保存修改':'保存到公众号草稿';
  $('editorError').textContent='';$('richEditorState').textContent=buffer?'有暂存修改':'';
  chooseEditorImage(null);$('richEditor').showModal();
  let content=buffer?.richHtml||spec.html;
  if(buffer?.body&&!buffer.richHtml)content=buffer.body.split('\n\n').map(p=>'<p>'+esc(p)+'</p>').join('');
  let clean=DOMPurify.sanitize(content,{FORBID_TAGS:['script','style','iframe','object','embed','form','input','button','svg','math'],FORBID_ATTR:['contenteditable','id']});
  const template=document.createElement('template');template.innerHTML=clean;
  template.content.querySelectorAll('img').forEach(img=>{const src=normalizeDraftImage(img.getAttribute('data-src'))||normalizeDraftImage(img.getAttribute('src'));if(src)img.src=src;img.removeAttribute('data-src');img.removeAttribute('srcset');img.referrerPolicy='no-referrer';});clean=template.innerHTML;
  await new Promise(resolve=>{
    $('editorFrame').onload=resolve;
    $('editorFrame').srcdoc='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: https://*.qpic.cn https://*.qlogo.cn http://*.qpic.cn http://*.qlogo.cn; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><style>html{background:#edf6f9}body{margin:0;padding:20px;font:16px/1.85 "Microsoft YaHei",sans-serif;color:#202b30}#editorCanvas{max-width:677px;min-height:calc(100vh - 40px);margin:0 auto;padding:24px;background:white;outline:none;overflow-wrap:anywhere}img{max-width:100%;height:auto;cursor:pointer}table{max-width:100%;border-collapse:collapse}::selection{background:#cce8ee}a{color:#006b80}p{min-height:1em}pre{white-space:pre-wrap}</style><body><main id="editorCanvas" contenteditable="true" role="textbox" aria-label="文章正文" aria-multiline="true">'+clean+'</main></body></html>';
  });
  const doc=editorDoc(),root=editorRoot();
  doc.addEventListener('selectionchange',rememberEditorRange);
  root.addEventListener('input',editorChanged);
  root.addEventListener('click',event=>{if(event.target.closest('a'))event.preventDefault();chooseEditorImage(event.target.closest('img'));});
  root.addEventListener('paste',event=>{event.preventDefault();const text=event.clipboardData.getData('text/plain');editorCommand('insertText',text);});
  root.addEventListener('drop',event=>event.preventDefault());
  doc.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeRichEditor();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();saveRichEditor();}});
  root.focus();const range=doc.createRange();range.selectNodeContents(root);range.collapse(false);editorRange=range;
  richSession.loading=false;state.editorOpen=true;$('sendDraft').disabled=true;
}
async function openLocalEditor(){
  if(!state.article||state.busy||rewrite)return;
  await window.pendingBodyPreview;
  const a=state.article;
  return openRichEditor({local:true,id:a.id,title:a.title,html:$('previewBody').innerHTML,coverPreview:a.images?.['cover.png']});
}
function closeRichEditor(discard=false){
  if(!richSession||richSession.saving)return;
  if(discard){if(richSession.local){delete editBuffers[richSession.id];persistBuffers();}else cloudEditBuffers.delete(richSession.key);}
  const local=richSession.local;richSession=null;state.editorOpen=false;editorRange=null;selectedEditorImage=null;
  $('richEditor').close();$('editorFrame').srcdoc='';if(local)renderArticle();
}
async function saveRichEditor(){
  if(!richSession||richSession.saving)return;
  editorChanged();const session=richSession;session.saving=true;
  document.querySelectorAll('#richEditor button,#richEditor input,#richEditor select').forEach(el=>el.disabled=true);editorRoot().contentEditable='false';$('editorError').textContent='正在保存…';
  try{
    const buffer=session.local?editBuffers[session.id]:cloudEditBuffers.get(session.key);
    if(session.local){state.article=await call('save-rich',{id:session.id,title:buffer.title,html:buffer.richHtml,cover:buffer.cover});delete editBuffers[session.id];persistBuffers();}
    else{
      const r=await call('publish-edit',{token:session.token,index:session.index,title:buffer.title,html:buffer.richHtml,cover:buffer.cover});
      cloudEditBuffers.delete(session.key);publicationReview=r;cacheCloudDraft(r.mediaId,r.draft);
      await inspectCloudDraft(r.mediaId);$('publishConfirm').checked=false;
    }
    session.saving=false;closeRichEditor();if(session.local){await refresh();renderArticle();}
    notice(session.local?'修改已保存':'公众号草稿已更新');
  }catch(error){$('editorError').textContent=error.message;}
  finally{document.querySelectorAll('#richEditor button,#richEditor input,#richEditor select').forEach(el=>el.disabled=false);if(richSession){richSession.saving=false;editorRoot().contentEditable='true';chooseEditorImage(selectedEditorImage);}}
}
document.querySelectorAll('[data-command]').forEach(button=>{button.onmousedown=event=>event.preventDefault();button.onclick=()=>editorCommand(button.dataset.command);});
$('richTitle').oninput=editorChanged;
$('editorBlock').onchange=()=>editorCommand('formatBlock',$('editorBlock').value);
$('editorFont').onchange=()=>editorCommand('fontName',$('editorFont').value);
$('editorColor').oninput=()=>editorCommand('foreColor',$('editorColor').value);
$('editorSize').onchange=()=>{editorCommand('fontSize','7');editorRoot().querySelectorAll('font[size="7"],span[style*="xxx-large"]').forEach(node=>{node.removeAttribute('size');node.style.fontSize=$('editorSize').value+'px';node.style.lineHeight='1.85';});editorChanged();};
$('editorInsertImage').onclick=async()=>{try{const session=richSession,src=await call('editor-image');if(src&&session===richSession){if(selectedEditorImage){const range=editorDoc().createRange();range.setStartAfter(selectedEditorImage);range.collapse(true);editorRange=range;chooseEditorImage(null);}editorCommand('insertHTML','<p><img src="'+src+'" alt="正文配图" style="display:block;max-width:100%;height:auto;margin:20px auto;"></p>');}}catch(error){$('editorError').textContent=error.message;}};
$('editorReplaceImage').onclick=async()=>{try{const src=await call('editor-image');if(src&&selectedEditorImage){selectedEditorImage.src=src;editorChanged();}}catch(error){$('editorError').textContent=error.message;}};
$('editorDeleteImage').onclick=()=>{if(selectedEditorImage){const range=editorDoc().createRange();range.selectNode(selectedEditorImage);editorRange=range;editorCommand('delete');chooseEditorImage(null);editorChanged();}};
$('editorImageWidth').onchange=()=>{if(selectedEditorImage){selectedEditorImage.style.width=$('editorImageWidth').value;selectedEditorImage.style.height='auto';editorChanged();}};
$('editorCover').onclick=async()=>{try{const src=await call('editor-image');if(src){richSession.cover=src;$('editorCoverPreview').src=src;$('editorCoverPreview').hidden=false;editorChanged();}}catch(error){$('editorError').textContent=error.message;}};
$('closeRichEditor').onclick=()=>closeRichEditor();$('discardRichEditor').onclick=()=>closeRichEditor(true);$('saveRichEditor').onclick=saveRichEditor;
$('richEditor').addEventListener('cancel',event=>{event.preventDefault();closeRichEditor();});
$('editCloudDraft').onclick=()=>{if(!publicationReview)return;const index=Number($('cloudEditIndex')?.value||0),item=publicationReview.draft.news_item[index];openRichEditor({local:false,key:publicationReview.mediaId+':'+index,token:publicationReview.token,index,title:item.title,html:item.content,coverPreview:item.thumb_url});};
