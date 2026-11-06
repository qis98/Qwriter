// Offline public-page navigation contract. No private APIs or remote changes.
const {advanceOfficialAccount}=require('./configuration');
module.exports=async function verifyConfigurationDom(BrowserWindow){
  const w=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  try{
    await w.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<button id="mp">公众号 1</button><section id="cards"></section>'));
    await w.webContents.executeJavaScript("window.clicked=0;document.getElementById('mp').onclick=()=>{window.clicked++;document.getElementById('cards').innerHTML='<div data-appid=wx0000000000000000>公众号示例</div>';};true;");
    const run=clicked=>w.webContents.executeJavaScript('('+advanceOfficialAccount.toString()+')('+JSON.stringify(clicked)+')');
    const category=await run(false);if(category.stage!=='category')throw Error('公众号分类未点击');
    const single=await run(true);if(single.path!=='/console/product/mp/wx0000000000000000')throw Error('唯一公众号未定位');
    await w.webContents.executeJavaScript("document.getElementById('cards').innerHTML+='<div data-appid=wx1111111111111111>另一公众号</div>';true;");
    if((await run(true)).stage!=='multiple')throw Error('多个公众号不应猜选');
    await w.webContents.executeJavaScript("document.getElementById('cards').innerHTML='';true;");
    if((await run(true)).stage!=='waiting')throw Error('重复分类点击未停止');
    if((await w.webContents.executeJavaScript('window.clicked'))!==1)throw Error('分类重复点击');
    return {categoryClick:true,singleAccount:true,multipleAccounts:true,noPrivateRequests:true,selectionStops:true};
  }finally{w.destroy();}
};
