const {isIP}=require('node:net');
function configurationUrl(appId=''){
  if(!appId)return 'https://developers.weixin.qq.com/platform/login';
  if(!/^wx[0-9a-fA-F]{16}$/.test(appId))throw Error('AppID 格式不正确');
  return `https://developers.weixin.qq.com/console/product/mp/${appId}?tab1=basicInfo&tab2=dev`;
}
function identify(url,visibleAppId){
  const u=new URL(url);const match=u.pathname.match(/^\/console\/product\/mp\/(wx[0-9a-fA-F]{16})\/?$/);
  if(u.origin!=='https://developers.weixin.qq.com'||!match||match[1]!==visibleAppId)throw Error('请扫码并选择公众号的基础信息页');
  return {appId:match[1]};
}
function mergeWhitelist(existing,ip){
  if(!isIP(ip))throw Error('IP 无效，请重新检查连接');
  const entries=String(existing).split(/[\s,，;；]+/).filter(Boolean);
  if(entries.some(x=>!isIP(x)))throw Error('白名单格式未识别，请使用复制 IP 手动追加');
  const added=!entries.includes(ip);return {text:[...entries,...(added?[ip]:[])].join('\n'),added,count:entries.length+Number(added)};
}
function copiedSecret(value){const text=String(value).trim();if(!/^[0-9a-fA-F]{32}$/.test(text))throw Error('请先复制完整 AppSecret');return text;}
// Runs inside the official page. Returns only the visible AppID, never secrets.
function visibleIdentity(){const text=document.body?.innerText||'';return (text.match(/AppID\s*[:：]?\s*(wx[0-9a-fA-F]{16})\b/)||[])[1]||'';}
function advanceOfficialAccount(categoryAlreadyClicked=false){
  const visible=el=>el.getClientRects().length>0;
  const paths=[...new Set([...document.querySelectorAll('a[href],[data-appid],[data-app-id]')].filter(visible).map(el=>{
    const id=el.getAttribute('data-appid')||el.getAttribute('data-app-id');if(/^wx[0-9a-fA-F]{16}$/.test(id||''))return '/console/product/mp/'+id;
    try{const u=new URL(el.href);return u.origin===location.origin&&/^\/console\/product\/mp\/wx[0-9a-fA-F]{16}\/?$/.test(u.pathname)?u.pathname:null;}catch{return null;}
  }).filter(Boolean))];
  if(paths.length===1)return {path:paths[0],stage:'single'};
  if(paths.length>1)return {stage:'multiple'};
  if(!categoryAlreadyClicked){
    const candidates=[...document.querySelectorAll('a,button,[role=tab],[role=button],span,div,li')].filter(el=>visible(el)&&/^公众号\s*(?:[（(]?\s*\d+\s*[）)]?)?$/.test(el.textContent.trim()));
    const leaves=candidates.filter(el=>!candidates.some(other=>other!==el&&el.contains(other)));
    if(leaves.length===1){leaves[0].click();return {stage:'category'};}
  }
  return {stage:'waiting'};
}
module.exports={configurationUrl,identify,mergeWhitelist,copiedSecret,visibleIdentity,advanceOfficialAccount};
