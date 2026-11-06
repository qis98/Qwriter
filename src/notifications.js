const {BrowserWindow,ipcMain,screen}=require('electron');
const path=require('node:path');
function createNotifications(owner,{disabled=false}={}){
  let popup,timer,lastAt=0;const recent=new Map();
  function close(){clearTimeout(timer);if(popup&&!popup.isDestroyed())popup.close();popup=null;}
  ipcMain.on('dismiss-notification',event=>{if(popup&&event.sender===popup.webContents)close();});
  owner.on('minimize',close);owner.once('closed',close);
  return {close,async show({message,error=false}){
    const text=String(message||'').slice(0,700);if(!text)return {shown:false};const now=Date.now();
    if(now-(recent.get(text)||0)<10000||now-lastAt<800)return {shown:false};
    recent.set(text,now);if(recent.size>40)recent.delete(recent.keys().next().value);lastAt=now;
    if(disabled)return {shown:true};close();
    const rect=owner.getContentBounds(),work=screen.getDisplayMatching(rect).workArea;
    const width=Math.min(340,rect.width-24),height=Math.min(158,86+Math.floor(text.length/24)*16);
    popup=new BrowserWindow({parent:owner,width,height,x:Math.max(work.x,Math.min(work.x+work.width-width,rect.x+rect.width-width-16)),y:Math.max(work.y,Math.min(work.y+work.height-height,rect.y+62)),frame:false,resizable:false,minimizable:false,maximizable:false,skipTaskbar:true,focusable:false,show:false,backgroundColor:'#ffffff',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,preload:path.join(__dirname,'notification-preload.js')}});
    const current=popup;current.removeMenu();current.webContents.setWindowOpenHandler(()=>({action:'deny'}));current.webContents.on('will-navigate',e=>e.preventDefault());
    await current.loadFile(path.join(__dirname,'renderer','notification.html'));if(popup!==current||current.isDestroyed())return {shown:false};
    await current.webContents.executeJavaScript('document.getElementById("message").textContent='+JSON.stringify(text)+';document.getElementById("title").textContent='+JSON.stringify(error?'操作未完成':'提示')+';true;');
    if(owner.isMinimized()){close();return {shown:false};}current.showInactive();timer=setTimeout(close,error?6000:4000);return {shown:true};
  }};
}
module.exports={createNotifications};
