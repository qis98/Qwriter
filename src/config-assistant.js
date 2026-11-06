const {WebContentsView,clipboard,session}=require('electron');
const {configurationUrl,advanceOfficialAccount,mergeWhitelist}=require('./configuration');
function createAssistant(parent,onStatus=()=>{},options={}){
  let view,attached=false,targetId='',targetLoaded=false,disposed=false,categoryClicked=false,routing=false,routeTimer,routeAttempts=0;
  const allowed=value=>{try{const u=new URL(value);return u.protocol==='https:'&&['developers.weixin.qq.com','mp.weixin.qq.com','open.weixin.qq.com','res.wx.qq.com'].includes(u.hostname);}catch{return false;}};
  const wc=()=>{if(!view||view.webContents.isDestroyed())throw Error('请先打开微信页面');return view.webContents;};
  async function script(fn,args=[]){
    try{const result=await wc().executeJavaScript('(()=>{try{return {ok:true,value:('+fn.toString()+')('+args.map(x=>JSON.stringify(x??null)).join(',')+')}}catch(e){return {ok:false,error:String(e.message).slice(0,160)}}})()');if(!result?.ok)throw Error(result?.error||'网页暂未就绪，请稍后重试');return result.value;}
    catch(error){if(/Script failed|ERR_|destroyed|disposed|render frame/i.test(error.message))throw Error('网页暂未就绪，请刷新后重试；也可复制 IP 手动追加');throw error;}
  }
  async function routeAfterLogin(){
    if(options.fixture||targetLoaded||disposed||routing||!view)return;
    const u=new URL(wc().getURL());
    if(u.hostname!=='developers.weixin.qq.com'||!u.pathname.startsWith('/console')&&!/^\/platform\/?$/.test(u.pathname)||/^\/console\/product\/mp\/wx/.test(u.pathname))return;
    routing=true;try{
      if(targetId){targetLoaded=true;await wc().loadURL(configurationUrl(targetId));return;}
      const next=await script(advanceOfficialAccount,[categoryClicked]);
      if(next.path){targetLoaded=true;await wc().loadURL('https://developers.weixin.qq.com'+next.path+'?tab1=basicInfo&tab2=dev');return;}
      if(next.stage==='category')categoryClicked=true;
      onStatus({message:next.stage==='multiple'?'请选择要配置的公众号':'正在查找公众号；也可填写 AppID 后直达'});
      if(next.stage!=='multiple'&&routeAttempts++<6){clearTimeout(routeTimer);routeTimer=setTimeout(()=>routeAfterLogin().catch(()=>{}),500);}
    }finally{routing=false;}
  }
  function ensure(){
    if(view)return;
    view=new WebContentsView({webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,partition:'qwriter-config-session'}});
    view.setBackgroundColor('#ffffff');
    wc().setWindowOpenHandler(({url})=>{if(allowed(url))wc().loadURL(url).catch(()=>onStatus({message:'页面未打开，请刷新重试'}));return {action:'deny'};});
    for(const name of ['will-navigate','will-redirect'])wc().on(name,(event,url)=>{if(!allowed(url)){event.preventDefault();onStatus({message:'仅支持微信官方页面'});}});
    wc().on('did-start-loading',()=>onStatus({message:'正在加载…'}));
    wc().on('did-finish-load',()=>{onStatus({message:'微信官方页面 · 扫码后选择公众号'});routeAfterLogin().catch(()=>onStatus({message:'请选择公众号；也可填写 AppID 后直达'}));});
    wc().on('did-navigate-in-page',()=>routeAfterLogin().catch(()=>{}));
    wc().on('did-fail-load',(_,code,description,url,isMainFrame)=>{if(isMainFrame&&code!==-3)onStatus({message:'页面未加载，请刷新或在浏览器打开'});});
    parent().once('closed',()=>{disposed=true;clearTimeout(routeTimer);view?.webContents.close();view=null;attached=false;});
  }
  function show(){ensure();if(!attached){parent().contentView.addChildView(view);attached=true;}view.setVisible(true);}
  function hide(){if(view&&attached){parent().contentView.removeChildView(view);attached=false;}if(view)view.setVisible(false);}
  async function open(appId='',navigate=false){
    configurationUrl(appId);disposed=false;ensure();show();
    if(navigate||!wc().getURL()||wc().getURL()==='about:blank'){targetId=appId;targetLoaded=false;categoryClicked=false;routeAttempts=0;try{await wc().loadURL(options.fixture?options.fixture:configurationUrl(appId));}catch{onStatus({message:'页面未加载，请刷新重试'});}}
    return {embedded:true};
  }
  function bounds(rect){if(!view||!attached)return;const [width,height]=parent().getContentSize();const x=Math.max(0,Math.min(width-1,Math.round(rect.x||0))),y=Math.max(0,Math.min(height-1,Math.round(rect.y||0)));const w=Math.max(1,Math.min(width-x,Math.round(rect.width||1))),h=Math.max(1,Math.min(height-y,Math.round(rect.height||1)));view.setBounds({x,y,width:w,height:h});wc().setZoomFactor(Math.min(1,Math.max(.3,w/1120)));}
  function release(){clearTimeout(routeTimer);hide();if(view&&!view.webContents.isDestroyed())view.webContents.close();view=null;targetLoaded=false;categoryClicked=false;routeAttempts=0;}
  return {open,hide,bounds,
    refresh:()=>{categoryClicked=false;routeAttempts=0;targetLoaded=false;wc().reload();return true;},
    release,
    copyIp(value){mergeWhitelist('',value);clipboard.writeText(value);},
    async logout(){release();await session.fromPartition('qwriter-config-session').clearStorageData();},
    close(){release();disposed=true;},
    state:()=>({embedded:!!view,visible:attached,bounds:view?.getBounds()||null})
  };
}
module.exports={createAssistant};
