let guideStep=0,guideVerified=false,guideSettingsKey=null;
function showGuideStep(n){guideStep=Math.max(0,Math.min(3,n));document.querySelectorAll('[data-guide-panel]').forEach(x=>x.hidden=Number(x.dataset.guidePanel)!==guideStep);document.querySelectorAll('[data-guide]').forEach(x=>{x.classList.toggle('active',Number(x.dataset.guide)===guideStep);x.setAttribute('aria-current',Number(x.dataset.guide)===guideStep?'step':'false');});$('guideBack').disabled=guideStep===0;$('guideNext').hidden=guideStep===3;$('guideStepCount').textContent=`第 ${guideStep+1} / 4 步`;guideStatus();if(n===1)guidePageClosed=false;if(n>=1&&!guidePageClosed&&window.enterGuideWorkspace)window.enterGuideWorkspace();document.querySelector('.shell').scrollTo(0,0);if(state.view==='guide'){const heading=document.querySelector(`[data-guide-panel="${guideStep}"] h2`);heading.tabIndex=-1;heading.focus({preventScroll:true});}}
function guideStatus(){const connected=state.snapshot?.model?.connected;$('guideModelStatus').textContent=connected?'模型已连接':($('loginMessage').textContent||'等待登录');$('guideReady').textContent=connected&&guideVerified?'连接完成，可前往创作工作台':'请先连接模型并检查公众号';}
function fillGuide(){if(!state.snapshot)return;const s=state.snapshot.settings;const hasKey=s.hasSecret;const key=JSON.stringify([s.appId,s.accountName,s.hasSecret]);if(key===guideSettingsKey){guideStatus();return;}if(guideSettingsKey!==null){guideVerified=false;notice('配置已更新');}$('guideSecret').value='';guideSettingsKey=key;$('guideName').value=s.accountName;$('guideAppId').value=s.appId;$('guideSecret').placeholder=hasKey?'已保存；留空保留':'粘贴 AppSecret';$('guideSecretHint').textContent=hasKey?'密钥已加密保存':'仅在本机加密保存';guideStatus();}
document.querySelectorAll('[data-guide]').forEach(x=>x.addEventListener('click',()=>showGuideStep(Number(x.dataset.guide))));
document.querySelectorAll('[data-help]').forEach(x=>x.addEventListener('click',async()=>{try{await call('open-help',x.dataset.help);}catch(e){notice(e.message,true);}}));
listen('guideBack','click',()=>showGuideStep(guideStep-1));listen('guideNext','click',()=>{if(guideStep===1)$('guideWechatForm').requestSubmit();else showGuideStep(guideStep+1);});

listen('guideLogin','click',()=>{$('loginModel').click();});
listen('guideRefresh','click',async()=>{await refresh();guideStatus();});
new MutationObserver(guideStatus).observe($('loginMessage'),{childList:true,characterData:true,subtree:true});
new MutationObserver(guideStatus).observe($('modelStatus'),{childList:true,characterData:true,subtree:true});
listen('guideWechatForm','submit',async e=>{e.preventDefault();if(!$('guideAppId').value.trim())throw Error('请填写 AppID（第 2 步）');await call('save-settings',{accountName:$('guideName').value.trim(),appId:$('guideAppId').value.trim(),secret:$('guideSecret').value.trim(),author:state.snapshot.settings.author});$('guideSecret').value='';guideVerified=false;await refresh(true);fillGuide();showGuideStep(2);await diagnoseGuide();});
async function diagnoseGuide(){const s=state.snapshot.settings;$('guideIpBox').hidden=true;guideVerified=false;$('guideDiagnosis').className='connection-message';if(!s.appId||!s.hasSecret){$('guideDiagnosis').textContent='请返回第 2 步填写 AppID 和密钥';return;}$('guideDiagnose').disabled=true;$('guideDiagnosis').textContent='正在检查…';try{const result=await call('diagnose');guideVerified=true;$('guideDiagnosis').textContent='公众号连接成功';}catch(e){$('guideDiagnosis').textContent=e.message;$('guideDiagnosis').className='connection-message error';const ip=e.message.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);if(ip&&e.message.includes('白名单')){$('guideIp').value=ip[0];$('guideIpBox').hidden=false;}}finally{$('guideDiagnose').disabled=false;guideStatus();}}
listen('guideDiagnose','click',diagnoseGuide);listen('guideIp','click',()=>$('guideIp').select());

async function setupAction(id,fn){const button=$(id);button.disabled=true;try{await fn();}catch(e){notice(e.message,true);}finally{button.disabled=false;}}
$('configAssistant').onclick=()=>{setView('guide');showGuideStep(1);notice('');};
let configWebVisible=false,configWebExpanded=false,guidePageClosed=false,openingConfig=false,guideOpenEpoch=0;
async function updateConfigBounds(){if(!configWebVisible||state.view!=='guide')return;const r=$('configWebCanvas').getBoundingClientRect();if(r.width>0&&r.height>0)await call('config-bounds',{x:r.x,y:r.y,width:r.width,height:r.height});}
window.hideConfigWeb=async function(){guideOpenEpoch++;configWebVisible=false;configWebExpanded=false;document.querySelector('.shell').classList.remove('setup-web-open','setup-web-expanded');$('configWebPanel').hidden=true;$('configExpand').textContent='放大网页';await call('config-hide');};
window.enterGuideWorkspace=function(){
  document.querySelector('.shell').classList.add('setup-web-open');$('configWebPanel').hidden=false;
  if(guideStep>=1&&!guidePageClosed&&!configWebVisible&&!openingConfig)openConfigWeb(false,false,true).catch(e=>notice(e.message,true));
};
window.openConfigWeb=async function(navigate=false,login=false,keepStep=true){
  const epoch=guideOpenEpoch;while(openingConfig)await new Promise(r=>setTimeout(r,25));if(epoch!==guideOpenEpoch)return;openingConfig=true;
  try{
    if(state.view!=='guide')setView('guide');
    guidePageClosed=false;configWebVisible=true;$('configCloseWeb').disabled=false;document.querySelector('.web-placeholder').textContent='正在加载微信配置页…';$('configWebPanel').hidden=false;document.querySelector('.shell').classList.add('setup-web-open');
    const appId=login?'':$('guideAppId').value.trim();
    const opening=call('config-open',{appId,navigate,login});await new Promise(r=>setTimeout(r,30));await updateConfigBounds();await opening;await updateConfigBounds();
  }finally{openingConfig=false;}
};
$('configLogin').onclick=()=>setupAction('configLogin',()=>openConfigWeb(true,true));
$('configTarget').onclick=()=>setupAction('configTarget',()=>openConfigWeb(true));
$('configReload').onclick=()=>setupAction('configReload',()=>call('config-refresh'));
$('configExpand').onclick=()=>{configWebExpanded=!configWebExpanded;document.querySelector('.shell').classList.toggle('setup-web-expanded',configWebExpanded);$('configExpand').textContent=configWebExpanded?'返回填写':'放大网页';updateConfigBounds().catch(()=>{});};
new ResizeObserver(()=>updateConfigBounds().catch(()=>{})).observe($('configWebCanvas'));window.addEventListener('resize',()=>updateConfigBounds().catch(()=>{}));
$('configCopyIp').onclick=()=>setupAction('configCopyIp',async()=>{await call('config-copy-ip',$('guideIp').value);$('configIpResult').textContent='已复制，请追加到 API IP白名单 中';});
$('configRecheck').onclick=()=>setupAction('configRecheck',diagnoseGuide);

$('guideAppId').addEventListener('input',()=>{guideVerified=false;});

showGuideStep(0);

window.closeConfigWeb=async function(){guideOpenEpoch++;guidePageClosed=true;configWebVisible=false;await call('config-close');configWebExpanded=false;document.querySelector('.shell').classList.remove('setup-web-expanded');$('configExpand').textContent='放大网页';$('configCloseWeb').disabled=true;$('configWebStatus').textContent='微信配置页已关闭';document.querySelector('.web-placeholder').textContent='微信配置页已关闭，点击扫码登录可重新打开';};
$('configCloseWeb').onclick=()=>closeConfigWeb().catch(e=>notice(e.message,true));
