const sanitize=require('sanitize-html');
function imageSource(src){
  if(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src)||/^qwriter-asset:\/\/[a-f0-9]{64}\.png$/.test(src))return true;
  try{const u=new URL(src);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.port&&/(^|\.)(qpic|qlogo)\.cn$/i.test(u.hostname);}catch{return false;}
}
function cleanRichHtml(html){
  if(typeof html!=='string'||Buffer.byteLength(html)>24*1024*1024)throw Error('正文过大，请减少图片或压缩后重试。');
  const value=/^(?!.*(?:url|expression|var)\s*\()[\p{L}\p{N}#(),.%\-\s"'/]+$/u;
  const properties=['color','background','background-color','font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-decoration','text-indent','white-space','word-break','overflow-wrap','margin','margin-top','margin-bottom','margin-left','margin-right','padding','padding-top','padding-bottom','padding-left','padding-right','border','border-top','border-bottom','border-left','border-right','border-color','border-width','border-style','border-radius','width','max-width','height','display','vertical-align','list-style-type','list-style-position','border-collapse','border-spacing','table-layout','box-sizing'];
  return sanitize(html,{allowedTags:['section','div','p','span','br','h1','h2','h3','h4','h5','h6','strong','b','em','i','u','s','del','blockquote','ul','ol','li','table','thead','tbody','tfoot','tr','th','td','pre','code','hr','img','a','sup','sub','figure','figcaption'],allowedAttributes:{'*':['style','leaf'],'img':['src','alt','width','height'],'a':['href','title'],'ol':['start'],'td':['colspan','rowspan'],'th':['colspan','rowspan']},allowedSchemes:['https','http','data','qwriter-asset'],allowedSchemesByTag:{a:['https','http']},allowedStyles:{'*':Object.fromEntries(properties.map(p=>[p,[value]]))},transformTags:{img:(_tag,attrs)=>({tagName:'img',attribs:{...attrs,src:imageSource(attrs.src||'')?attrs.src:'',style:(attrs.style||'')+';max-width:100%;height:auto;'}})},exclusiveFilter:frame=>frame.tag==='img'&&!frame.attribs.src});
}
function richToMarkdown(html){const Turndown=require('turndown');const service=new Turndown({headingStyle:'atx',codeBlockStyle:'fenced'});service.use(require('turndown-plugin-gfm').gfm);return service.turndown(cleanRichHtml(html));}
module.exports={cleanRichHtml,imageSource,richToMarkdown};
