/* Cloud drafts are already typeset HTML. Display a sanitized copy, never rewrite
 * the source draft or apply a creation theme during readback. */
function normalizeDraftImage(value){
  try{const url=new URL(String(value||'').replace(/^\/\//,'https://'));
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port)return null;
    if(!/(^|\.)(qpic|qlogo)\.cn$/i.test(url.hostname))return null;
    url.protocol='https:';return url.href;
  }catch{return null;}
}
function wireDraftImage(img){
  img.referrerPolicy='no-referrer';img.decoding='async';
  const status=document.createElement('span');status.className='draft-image-status';status.hidden=true;
  const message=document.createElement('span');const retry=document.createElement('button');retry.type='button';retry.textContent='重试';
  status.append(message,retry);
  img.addEventListener('error',()=>{img.hidden=true;message.textContent='图片加载失败 ';status.hidden=false;});
  img.addEventListener('load',()=>{img.hidden=false;status.hidden=true;});
  retry.onclick=()=>{status.hidden=true;img.hidden=false;const src=img.getAttribute('src');img.removeAttribute('src');img.src=src;};
  // Insert after attachment so this works for both document fragments and covers.
  queueMicrotask(()=>img.after(status));
}
function renderCloudBody(host,html){
  const root=host.attachShadow({mode:'open'});
  const style=document.createElement('style');
  style.textContent=`:host{display:block;max-width:100%;color:#202b30;font:15px/1.85 "Microsoft YaHei","Segoe UI",sans-serif;white-space:normal}*{box-sizing:border-box;max-width:100%}img{height:auto!important;max-height:none!important;object-fit:contain}img[hidden],[hidden]{display:none!important}table{max-width:100%;border-collapse:collapse}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:inherit;text-decoration:underline}video,audio{display:none}.draft-image-status{display:block;margin:12px 0;padding:12px;background:#edf6f9;color:#5e6d74;font:13px/1.7 "Microsoft YaHei",sans-serif}.draft-image-status button{margin-left:8px;border:1px solid #dbe6eb;border-radius:6px;background:#fafdfe;color:#006b80;padding:4px 12px;cursor:pointer}`;
  root.append(style);
  const fragment=DOMPurify.sanitize(html,{RETURN_DOM_FRAGMENT:true,ALLOWED_TAGS:['section','div','p','span','br','h1','h2','h3','h4','h5','h6','strong','b','em','i','u','s','del','blockquote','ul','ol','li','table','thead','tbody','tfoot','tr','th','td','pre','code','hr','img','a','sup','sub','figure','figcaption'],ALLOWED_ATTR:['style','src','data-src','alt','title','width','height','colspan','rowspan','start'],ALLOW_DATA_ATTR:false});
  // Retain typography and layout, but reject CSS URLs and positioning that could
  // escape the reading area. Shadow DOM also prevents draft CSS affecting app UI.
  const properties=/^(color|background-color|font(-family|-size|-weight|-style|-variant)?|line-height|letter-spacing|text-(align|decoration|indent|transform|shadow)|word-(break|spacing)|overflow-wrap|white-space|margin(-(top|right|bottom|left))?|padding(-(top|right|bottom|left))?|border(-(top|right|bottom|left|color|style|width|radius))?|width|max-width|min-width|height|max-height|vertical-align|display|list-style-type|list-style-position|border-collapse|border-spacing|table-layout|box-sizing|opacity|float|clear|gap|flex(-direction|-wrap|-grow|-shrink|-basis)?|align-items|justify-content)$/;
  for(const node of fragment.querySelectorAll('*')){
    node.removeAttribute('class');
    for(const property of Array.from(node.style)){
      const value=node.style.getPropertyValue(property);
      if(!properties.test(property)||/url\s*\(|expression\s*\(|var\s*\(|-webkit-/i.test(value))node.style.removeProperty(property);
    }
  }
  for(const img of fragment.querySelectorAll('img')){
    const src=normalizeDraftImage(img.getAttribute('data-src'))||normalizeDraftImage(img.getAttribute('src'));
    img.removeAttribute('data-src');
    if(src){img.src=src;wireDraftImage(img);}
    else{const missing=document.createElement('span');missing.className='draft-image-status';missing.textContent='图片地址暂不支持预览';img.replaceWith(missing);}
  }
  root.append(fragment);
}
