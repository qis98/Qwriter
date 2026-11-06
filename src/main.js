const {app,BrowserWindow,ipcMain,shell,dialog,safeStorage,clipboard}=require('electron');
const fs=require('node:fs'); const fsp=require('node:fs/promises'); const path=require('node:path'); const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {validateId,publicSettings,escapeHtml,normalizeArticle}=require('./shared');
const {defaultWorkspace,migrateWorkspace,savePreferences,contains}=require('./workspace');
const {logoutModel,disconnectedWechat}=require('./connections');
const {chinaDay,accountKey,isComplete,checkinSummary,eligibleAccounts}=require('./checkin');
// Keep v0.1.0 data and installer identity when changing the visible brand.
app.setPath('userData',process.argv.some(x=>['--smoke','--capture-review','--first-run-check'].includes(x))?path.join(app.getPath('temp'),'Qwriter-ui-check-'+process.pid):path.join(app.getPath('appData'),'wechat-article-studio'));
app.setName('Qwriter');
if(!app.requestSingleInstanceLock())app.exit(0);
let win,root,runtime,gatewayConfig,gatewayChild,active=null,settings={};
let preferencesFile,defaultDataDir,installDirectory,storageNotice='';
let publishing,publishTimer,configAssistant,configurationIp=null,notifications;
let smokeDiagnoses=0;
let checkinState={},checkinTimer,checkinNextTryAt=0;
const checkinFile=()=>path.join(app.getPath('userData'),'checkin-state.json');
const previewCache=new Map(),wechatTokens=new Map(),articleMetadata=new Map();
let taskHistory;
const textHash=a=>crypto.createHash('sha256').update(JSON.stringify([a.title,a.paragraphs])).digest('hex');
const base='http://127.0.0.1:17865';
const smoke=process.argv.includes('--smoke');
const captureReview=process.argv.includes('--capture-review');
let smokeAccounts=[{filename:'isolated-smoke.json',credits:0}];
const asset=(name)=>path.join(app.isPackaged?process.resourcesPath:path.join(__dirname,'..'),'runtime',name);
async function atomic(file,value){const tmp=file+'.tmp';await fsp.writeFile(tmp,JSON.stringify(value,null,2));await fsp.rename(tmp,file);}
async function read(file,fallback=null){try{return JSON.parse(await fsp.readFile(file,'utf8'));}catch{return fallback;}}
const articleDir=(id)=>{validateId(id);return path.join(root,'articles',id);};
async function secret(){if(!settings.secret)return '';return safeStorage.decryptString(Buffer.from(settings.secret,'base64'));}
async function credentials(){return {appId:settings.appId||'',secret:await secret(),name:settings.accountName||'',author:settings.author||''};}
async function gateway(pathname,body){if(smoke||captureReview){if(pathname==='/ui/data')return {accounts:smokeAccounts};if(pathname==='/ui/action/delete'){smokeAccounts=smokeAccounts.filter(x=>x.filename!==body.filename);return {success:true};}throw Error('Smoke mode blocks external operations');}const cfg=await read(gatewayConfig);const response=await fetch(base+pathname,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.api_key},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});const data=await response.json();if(!response.ok)throw Error('模型连接失败，请检查本机网关和账号。');return data;}
async function ensureGateway(){
  runtime=path.join(app.getPath('userData'),'model-runtime');
  const legacyRuntime=path.join(root,'model-runtime');
  if(!fs.existsSync(runtime)&&fs.existsSync(legacyRuntime))await fsp.cp(legacyRuntime,runtime,{recursive:true});
  await fsp.mkdir(runtime,{recursive:true});gatewayConfig=path.join(runtime,'config.json');
  const systemProxy=await new Promise(resolve=>{const child=spawn('pwsh.exe',['-NoProfile','-Command',"$p=Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'; if($p.ProxyEnable -eq 1){$p.ProxyServer}"],{windowsHide:true});let out='';child.stdout.on('data',c=>out+=c);child.on('error',()=>resolve(''));child.on('close',()=>{const value=out.trim();resolve(/^(?:127\.0\.0\.1|localhost):\d+$/.test(value)?'http://'+value:'');});});
  if(!fs.existsSync(gatewayConfig))await atomic(gatewayConfig,{
    listen:'127.0.0.1:17865',api_key:crypto.randomBytes(32).toString('hex'),web_password:'',auth_dir:path.join(runtime,'auths'),state_file:path.join(runtime,'data','state.json'),
    global:{enabled:false},admin:{enabled:false},schedule:Object.fromEntries(['checkin','travel','activity','keepalive','school','cat'].map(x=>[x+'_enabled',false])),
    upstream:{proxy:systemProxy,timeout_seconds:90,header_timeout_seconds:90,idle_timeout_seconds:90},features:{sanitize_blacklist_fingerprints:false},pool:{max_in_flight:1,cost_explore_interval:'0'},auto_free_enabled:false,alert:{enabled:false},upstash:{url:'',token:''}
  });
  const cfg=await read(gatewayConfig),ownAuth=path.join(runtime,'auths');
  // Import legacy credentials into Qwriter's own store; logout must not alter another tool's files.
  const oldAuth=cfg.auth_dir;
  if(oldAuth&&path.resolve(oldAuth)!==path.resolve(ownAuth)&&fs.existsSync(oldAuth)){await fsp.mkdir(ownAuth,{recursive:true});for(const name of await fsp.readdir(oldAuth)){if(name.endsWith('.json'))await fsp.copyFile(path.join(oldAuth,name),path.join(ownAuth,name),fs.constants.COPYFILE_EXCL).catch(e=>{if(e.code!=='EEXIST')throw e;});}}
  cfg.auth_dir=ownAuth;cfg.state_file=path.join(runtime,'data','state.json');await atomic(gatewayConfig,cfg);
  let occupied=false;try{const response=await fetch(base+'/healthz',{signal:AbortSignal.timeout(1500)});occupied=(await response.json()).service==='workbuddy2api';}catch{}
  if(occupied)throw Error('模型服务端口已被其他实例占用，请退出旧版 Qwriter 后重新打开。');
  const exe=asset('workbuddy2api.exe');if(!fs.existsSync(exe))throw Error('缺少模型运行组件，请重新安装软件。');
  const log=fs.openSync(path.join(runtime,'desktop-service.log'),'a');
  gatewayChild=spawn(exe,['-headless','-config',gatewayConfig],{windowsHide:true,stdio:['ignore',log,log]});
  gatewayChild.on('error',()=>{});gatewayChild.on('exit',()=>{gatewayChild=null;});
  for(let i=0;i<25;i++){await new Promise(r=>setTimeout(r,200));try{const response=await fetch(base+'/healthz',{signal:AbortSignal.timeout(1000)});if((await response.json()).service==='workbuddy2api')return;}catch{}}
  throw Error('本机模型服务启动失败，请关闭占用17865端口的其他程序后重试。');
}
async function modelStatus(){if(settings.startupError)return {connected:false,accounts:0,credits:0};try{const data=await gateway('/ui/data');return {connected:data.accounts?.some(x=>!x.disabled&&!x.cooling)||false,accounts:data.accounts?.length||0,credits:data.accounts?.reduce((n,x)=>n+(Number(x.credits)||0),0)||0};}catch{return {connected:false,accounts:0,error:'模型服务尚未连接'};}}
function progress(data){if(win&&!win.isDestroyed())win.webContents.send('progress',data);}
async function runWorker(command,extra={}){
  const readonly=command==='render'||command==='publishing'&&['list','inspect','status'].includes(extra.operation);
  if(active&&!readonly&&extra.id){active.id=extra.id;if(taskHistory&&!active.historyId&&['generate','send','images','humanize','structure'].includes(active.kind)){const a=await read(path.join(articleDir(extra.id),'article.json'));const entry=await taskHistory.add({articleId:extra.id,title:a?.title||extra.spec?.topic||'文章任务',kind:active.kind,state:'running',at:active.at});active.historyId=entry.id;}if(active.cancelled)throw Error('任务已取消。');}
  const tokenKey=extra.wechat?crypto.createHash('sha256').update(extra.wechat.appId+'|'+extra.wechat.secret).digest('hex'):null;
  if(tokenKey&&wechatTokens.get(tokenKey)?.expiresAt>Date.now()/1000+90)extra={...extra,wechat:{...extra.wechat,_token:wechatTokens.get(tokenKey)}};
  if((smoke||captureReview)&&command==='publishing'){
    const draft={news_item:[{title:'为什么年轻人这么累',author:'预览示例',content:'<h2>忙碌之外</h2><p>这是一份隔离验证草稿，只用于检查界面，不连接真实公众号。</p>',thumb_media_id:'review-cover'}]};
    if(extra.operation==='list')return {total_count:1,item:[{media_id:'review-draft',content:draft}]};
    if(extra.operation==='inspect')return {hash:'isolated-review',draft};
    throw Error('隔离验证禁止外部发布');
  }
  if(smoke&&command==='diagnose'){if(smokeDiagnoses++===0)throw Error('公众号IP白名单未配置。请追加微信识别的IP：192.0.2.42');return {connected:true,message:'连接成功'};}
  if(smoke&&!['render','rich-edit'].includes(command)){if(command==='checkin')return {items:extra.accountFiles.map(file=>({key:accountKey(file),status:'CLAIMED',credit:10}))};if(command==='structure'){const a=await read(path.join(articleDir(extra.id),'article.json'));return {title:a.title,paragraphs:['## 开始',...a.paragraphs],kind:'structure',usage:{}};}if(command!=='humanize')throw Error('隔离验证禁止外部操作');const a=await read(path.join(articleDir(extra.id),'article.json'));return {title:a.title,paragraphs:a.paragraphs.map(p=>p+'（润色预览示例）'),usage:{}};}
  const exe=asset('article-worker.exe');if(!fs.existsSync(exe))throw Error('缺少文章执行组件，请重新安装软件。');
  return new Promise(async(resolve,reject)=>{
    const child=spawn(exe,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});let buffer='',result=null,stderr='';
    if(active&&!readonly)active.child=child;
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',chunk=>{buffer+=chunk;let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);try{const item=JSON.parse(line);if(item.type==='progress')progress({id:extra.id,...item});if(item.type==='result'){result=item;if(tokenKey&&item._wechatToken){if(item._wechatToken.invalid)wechatTokens.delete(tokenKey);else{if(wechatTokens.size>=4)wechatTokens.clear();wechatTokens.set(tokenKey,item._wechatToken);}}}}catch{}}});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-500);});
    child.on('error',()=>reject(Error('文章执行器无法启动，请重新安装。')));
    child.on('close',()=>{if(active?.cancelled&&command!=='render')return reject(Error('任务已取消，已有内容已保留。'));if(result?.ok)resolve(result.data);else reject(Error(result?.error||'任务中断。已有内容已保留，请检查连接后重试。'));});
    try{child.stdin.end(JSON.stringify({command,root,gatewayConfig,gatewayBase:base,...extra}));}catch{child.kill();reject(Error('无法发送任务。'));}
  });
}
async function articles(){const folder=path.join(root,'articles');let dirs=[];try{dirs=await fsp.readdir(folder,{withFileTypes:true});}catch{}const values=await Promise.all(dirs.filter(x=>x.isDirectory()).map(async x=>{const file=path.join(folder,x.name,'article.json');try{const stat=await fsp.stat(file),stamp=stat.mtimeMs+':'+stat.size;const cached=articleMetadata.get(file);if(cached?.stamp===stamp)return cached.value;const a=normalizeArticle(await read(file));if(!a)return null;const value={id:a.id,title:a.title,wordCount:a.wordCount||0,status:a.status,stage:a.stage,createdAt:a.createdAt,updatedAt:a.updatedAt,usage:a.usage,aiImages:a.aiImages,accountName:a.accountName};articleMetadata.set(file,{stamp,value});return value;}catch{return null;}}));return values.filter(Boolean).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));}
async function fullArticle(id){const dir=articleDir(id);const a=await read(path.join(dir,'article.json'));if(!a)throw Error('文章不存在。');const images={};for(const name of ['cover.png','body.png']){try{images[name]='data:image/png;base64,'+(await fsp.readFile(path.join(dir,name))).toString('base64');}catch{}}if(a.richHtml||a.manualImages){for(const name of new Set((a.richHtml||a.paragraphs.join('\n')).match(/[a-f0-9]{64}\.png/g)||[])){try{images['inline/'+name]='data:image/png;base64,'+(await fsp.readFile(path.join(dir,'inline',name))).toString('base64');}catch{}}}return {...normalizeArticle(a),images,pendingRewrite:await read(path.join(dir,'rewrite-pending.json'))};}
async function failArticle(id,message){const p=path.join(articleDir(id),'article.json'),a=await read(p);if(a){a.status=active?.cancelled?'interrupted':'needs_attention';a.error=message;a.updatedAt=new Date().toISOString();await atomic(p,a);}}
async function sendArticle(id){if(fs.existsSync(path.join(articleDir(id),'rewrite-pending.json')))throw Error('请先采用或放弃润色稿，再保存公众号草稿。');if(!settings.appId||!settings.secret)throw Error('请先在设置中配置公众号。');const a=await read(path.join(articleDir(id),'article.json'));if(a?.importedSaved)throw Error('这是已保存的历史验证稿，不重复上传。请新建文章验证。');return runWorker('send',{id,wechat:await credentials()});}
async function begin(kind,fn){if(active)throw Error('已有任务正在执行，请等待完成或取消。');active={kind,cancelled:false,at:new Date().toISOString()};let failure;try{return await fn();}catch(error){failure=error;throw error;}finally{const task=active;active=null;if(taskHistory&&task?.id&&['generate','send','images','humanize','structure'].includes(kind)){try{const a=await read(path.join(articleDir(task.id),'article.json'));const record={articleId:task.id,title:a?.title||'文章任务',kind,state:task.cancelled?'cancelled':failure?'failed':'completed',at:task.at};if(task.historyId)await taskHistory.finish(task.historyId,record);else await taskHistory.add(record);}catch{}}progress({finished:true});}}
async function performCheckin(manual=false){
  if(active){if(manual)throw Error('请等待当前任务结束再签到。');return;}
  if(settings.startupError){if(manual)throw Error(settings.startupError);return;}
  if(!manual&&(settings.autoCheckin===false||Date.now()<checkinNextTryAt))return;
  return begin('checkin',async()=>{
    const day=chinaDay(),data=await gateway('/ui/data');
    const accounts=eligibleAccounts(data.accounts||[]);
    if(!accounts.length){if(manual)throw Error('请先登录 WorkBuddy 国内账号。');return;}
    const files=accounts.map(a=>a.filename);if(files.some(f=>typeof f!=='string'||!f||path.win32.basename(f)!==f||path.posix.basename(f)!==f))throw Error('签到账号文件无效。');
    const previous=checkinState.day===day?checkinState.items||[]:[];
    const completed=previous.filter(isComplete).map(x=>x.key);
    if(!manual&&files.every(f=>completed.includes(accountKey(f))))return;
    const result=await runWorker('checkin',{accountFiles:files,completedKeys:manual?[]:completed});
    const items=result.items.map(item=>item.status==='CACHED'?previous.find(p=>p.key===item.key)||item:item);
    checkinState={day,items,updatedAt:new Date().toISOString()};await atomic(checkinFile(),checkinState);
    checkinNextTryAt=items.every(isComplete)?0:Date.now()+30*60*1000;
    progress({checkin:true});return {...checkinState,message:checkinSummary(checkinState)};
  });
}
async function importPoc(){if(app.isPackaged||settings.pocImported)return;
  const poc=path.join(__dirname,'..','poc','gateway','articles','20261105-young-people-tired');
  const a=await read(path.join(poc,'article.json'));const receipt=await read(path.join(poc,'wechat-state.json'));
  if(a&&receipt?.status==='saved'){
    const id='imported-poc-young-people';const dir=articleDir(id);if(!fs.existsSync(dir)){
      await fsp.mkdir(dir,{recursive:true});await fsp.copyFile(path.join(poc,'cover.png'),path.join(dir,'cover.png'));
      await atomic(path.join(dir,'article.json'),{...a,id,topic:a.title,status:'saved',stage:'complete',wordCount:264,createdAt:receipt.verified_at,updatedAt:receipt.verified_at,draft:receipt,importedSaved:true,usage:{},aiImages:{},accountName:'SMT设备销售日记'});
    }
  }
  settings.pocImported=true;await atomic(path.join(root,'settings.json'),settings);
}
async function migrateCredentials(){if((settings.secret&&!settings.accountName?.includes('\ufffd'))||app.isPackaged)return;
  const file=path.join(process.env.LOCALAPPDATA||'','WeChatArticleGenerator','wechat-poc','credentials.xml');if(!fs.existsSync(file))return;
  const script=`[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $OutputEncoding=[Console]::OutputEncoding; $c=Import-Clixml -LiteralPath '${file.replace(/'/g,"''")}'; @{appId=$c.AppId;secret=[System.Net.NetworkCredential]::new('', $c.AppSecret).Password;name=$c.AccountName}|ConvertTo-Json -Compress`;
  const result=await new Promise(resolve=>{const child=spawn('pwsh.exe',['-NoProfile','-Command',script],{windowsHide:true});let out='';child.stdout.on('data',c=>out+=c);child.on('error',()=>resolve(null));child.on('close',code=>{try{resolve(code===0?JSON.parse(out):null);}catch{resolve(null);}});});
  if(result?.secret&&safeStorage.isEncryptionAvailable()){settings.appId=result.appId;settings.secret=safeStorage.encryptString(result.secret).toString('base64');settings.accountName=result.name;settings.author='SMTIndex';await atomic(path.join(root,'settings.json'),settings);}
}
async function register(){
  const handle=(name,fn)=>ipcMain.handle(name,async(event,...args)=>{if(event.sender!==win.webContents)throw Error('无效窗口');try{return {ok:true,data:await fn(...args)};}catch(error){return {ok:false,error:error.message};}});
  publishing=require('./publishing').createPublishing({file:path.join(app.getPath('userData'),'publishing-jobs.json'),read:async(file,fallback)=>{try{const jobs=JSON.parse(await fsp.readFile(file,'utf8'));if(!Array.isArray(jobs))throw Error('invalid');return jobs;}catch(error){if(error.code==='ENOENT')return fallback;throw Error('发布任务记录无法读取，请保留文件并修复后重试，避免重复发送。');}},atomic,worker:runWorker,credentials,busy:()=>!!active,begin,notify:()=>progress({publishing:true}),disabled:smoke||captureReview});
  taskHistory=require('./history').createHistory({file:()=>path.join(root,'task-history.json'),read:(file,fallback)=>read(typeof file==='function'?file():file,fallback),atomic:(file,value)=>atomic(typeof file==='function'?file():file,value)});await taskHistory.seed(await articles());
  handle('article-page',async spec=>{const q=String(spec?.query||'').slice(0,200).toLowerCase(),filter=spec?.status||'all';return require('./history').pageRows((await articles()).filter(a=>a.title.toLowerCase().includes(q)&&(filter==='all'||a.status===filter||filter==='saved'&&a.status==='saved_unverified')),spec?.page);});
  handle('task-page',async page=>{let running;if(active?.id){const a=await read(path.join(articleDir(active.id),'article.json'));running={id:'running',recordId:active.historyId,articleId:active.id,title:a?.title||'任务执行中',kind:active.kind,state:'running',at:active.at};}return taskHistory.list(page,running);});
  handle('task-remove',id=>taskHistory.remove(id));handle('task-clear',()=>taskHistory.clear());
  handle('publish-archive',spec=>begin('archive',()=>publishing.archive(spec.id,spec.archived)));
  handle('publish-page',async spec=>require('./history').pageRows((await publishing.list()).filter(j=>!!j.archived===!!spec?.archived),spec?.page));
  const configFixture=(smoke||captureReview)?'data:text/html;charset=utf-8,'+encodeURIComponent('<style>body{font:18px sans-serif;padding:50px}h1{font-size:28px}</style><h1>微信官方页面 · 隔离示例</h1><p>这里显示官方扫码与公众号配置页面。</p><p>测试不连接微信，不显示真实二维码。</p>'):null;
  configAssistant=require('./config-assistant').createAssistant(()=>win,value=>progress({configPage:value}),{fixture:configFixture});
  handle('config-open',async spec=>configAssistant.open(String(spec?.login?'':(spec?.appId||settings.appId||'')).trim(),!!spec?.navigate));
  handle('config-hide',()=>{configAssistant.hide();return true;});
  handle('config-bounds',rect=>{if(!rect||!['x','y','width','height'].every(k=>Number.isFinite(rect[k])))throw Error('页面尺寸无效');configAssistant.bounds(rect);return true;});
  handle('config-refresh',()=>configAssistant.refresh());
  handle('config-state',()=>configAssistant.state());
  handle('config-close',()=>{configAssistant.release();return configAssistant.state();});
  notifications=require('./notifications').createNotifications(win,{disabled:smoke||captureReview});
  handle('notify',spec=>notifications.show(spec||{}));
  handle('config-copy-ip',ip=>configAssistant.copyIp(ip));
  handle('publish-list',()=>publishing.list());
  handle('publish-drafts',offset=>begin('drafts',()=>publishing.drafts(offset)));
  handle('publish-review',id=>begin('review',()=>publishing.review(id)));
  handle('publish-edit',spec=>begin('draft-edit',()=>publishing.edit(spec)));
  handle('publish-commit',spec=>begin('publish',()=>publishing.commit(spec)));
  handle('publish-cancel',id=>begin('cancel-schedule',()=>publishing.cancel(id)));
  handle('publish-status',id=>begin('publish-status',()=>publishing.status(id)));
  if(!smoke&&!captureReview)publishTimer=setInterval(()=>publishing.tick().catch(()=>{}),15000);
  handle('snapshot',async()=>({settings:publicSettings(settings),articles:await articles(),model:settings.startupError?{connected:false,accounts:0,credits:0}:await modelStatus(),checkin:{day:checkinState.day,message:checkinState.lastError||(checkinState.day===chinaDay()?checkinSummary(checkinState):'等待签到')},dataDir:root,defaultDataDir,storageNotice,version:app.getVersion(),busy:!!active}));
  handle('logout-model',()=>begin('logout',async()=>{
    if(settings.startupError)throw Error(settings.startupError);
    await logoutModel(gateway);checkinState={};checkinNextTryAt=0;await atomic(checkinFile(),checkinState);return true;
  }));
  handle('disconnect-wechat',()=>begin('disconnect',async()=>{await configAssistant.logout();wechatTokens.clear();const next=disconnectedWechat(settings);await atomic(path.join(root,'settings.json'),next);settings=next;return publicSettings(settings);}));
  handle('choose-data',async()=>{
    if(active)throw Error('请等待当前任务结束后更换数据目录。');
    const chosen=smoke?{canceled:false,filePaths:[path.join(app.getPath('userData'),'migrated-workspace')]}:await dialog.showOpenDialog(win,{title:'选择空文件夹作为数据目录（会复制现有文章，保留原目录）',properties:['openDirectory','createDirectory']});
    if(chosen.canceled)return false;
    return begin('storage',async()=>{
      const destination=chosen.filePaths[0];
      for(const protectedDir of [path.join(installDirectory,'resources'),path.join(installDirectory,'locales'),path.join(app.getPath('userData'),'model-runtime')])if(contains(protectedDir,destination))throw Error('请选择软件运行组件之外的空文件夹，例如 Qwriter/workspace。');
      try{const target=await migrateWorkspace(root,destination,preferencesFile);root=target;storageNotice='数据目录已切换，原目录保留。';return root;}
      catch(error){if(['EACCES','EPERM'].includes(error.code))throw Error('新目录没有写入权限，仍使用原目录。请选择其他可写文件夹。');if(error.code==='ENOSPC')throw Error('磁盘空间不足，仍使用原目录。请清理空间或选择其他磁盘。');throw error;}
    });
  });
  handle('checkin-now',()=>performCheckin(true));
  handle('save-behavior',async input=>{
    if(active)throw Error('请等待当前任务结束后更改设置。');
    const next={...settings};for(const key of ['autoSave','autoCheckin'])if(Object.hasOwn(input,key)){if(typeof input[key]!=='boolean')throw Error('设置值无效。');next[key]=input[key];}
    await atomic(path.join(root,'settings.json'),next);settings=next;checkinNextTryAt=0;return publicSettings(settings);
  });
  handle('open-help',async key=>{const urls={wechat:'https://mp.weixin.qq.com/',developer:'https://developers.weixin.qq.com/platform/'};if(!Object.hasOwn(urls,key))throw Error('无效帮助入口');await shell.openExternal(urls[key]);});
  handle('article',fullArticle);
  handle('save-settings',async(input)=>{
    if(active)throw Error('请等待任务结束后修改设置。');
    const next={...settings};if(String(input.appId||'').trim()!==settings.appId)delete next.secret;
    if(input.appId&&!/^wx[0-9a-fA-F]{16}$/.test(input.appId))throw Error('AppID格式不正确。');
    if(input.secret){if(input.secret.length<16)throw Error('AppSecret长度不正确。');if(!safeStorage.isEncryptionAvailable())throw Error('Windows凭据加密不可用，未保存密钥。');next.secret=safeStorage.encryptString(input.secret).toString('base64');}
    for(const key of ['appId','accountName','author'])next[key]=String(input[key]||'').trim().slice(0,100);
    await atomic(path.join(root,'settings.json'),next);settings=next;configurationIp=null;return publicSettings(settings);
  });
  const propose=(id,kind)=>begin(kind,async()=>{
    validateId(id);const dir=articleDir(id),original=await read(path.join(dir,'article.json'));
    if(!original?.paragraphs?.length||original.importedSaved)throw Error('请先打开一篇可编辑文章。');
    if(original.richHtml)throw Error('请先选择主题排版，再使用润色或整理章节。');
    if(fs.existsSync(path.join(dir,'rewrite-pending.json')))throw Error('请先采用或放弃已有润色稿。');
    const needsModel=kind!=='structure'||!original.paragraphs.some(p=>/^##\s+/m.test(p));
    if(needsModel&&!(await modelStatus()).connected)throw Error('请先登录模型账号。');
    const candidate=await runWorker(kind,{id}),proposalId=crypto.randomBytes(16).toString('hex');
    const pending={id,base:textHash(original),candidate:{...candidate,proposalId,kind}};
    await atomic(path.join(dir,'rewrite-pending.json'),pending);return pending.candidate;
  });
  handle('humanize',id=>propose(id,'humanize'));
  handle('structure',id=>propose(id,'structure'));
  handle('discard-rewrite',input=>begin('edit',async()=>{
    validateId(input.id);const dir=articleDir(input.id),pending=await read(path.join(dir,'rewrite-pending.json'));
    if(!pending||pending.candidate.proposalId!==input.proposalId)throw Error('润色预览已变化，请重新打开文章。');
    await fsp.unlink(path.join(dir,'rewrite-pending.json'));return fullArticle(input.id);
  }));
  handle('apply-rewrite',input=>begin('edit',async()=>{
    validateId(input.id);const dir=articleDir(input.id),proposal=await read(path.join(dir,'rewrite-pending.json'));
    if(!proposal||proposal.candidate.proposalId!==input.proposalId)throw Error('润色预览已失效，请重新打开文章。');
    const a=await read(path.join(dir,'article.json'));if(textHash(a)!==proposal.base)throw Error('原稿已发生变化，请放弃候选后重新润色。');
    await fsp.mkdir(path.join(dir,'versions'),{recursive:true});await atomic(path.join(dir,'versions','before-humanize-'+Date.now()+'.json'),a);
    if(proposal.candidate.kind==='structure'){a.layout='reading';a.layoutRevision=3;}
    a.paragraphs=proposal.candidate.paragraphs;a.digest=a.paragraphs[0].slice(0,50);a.wordCount=(a.paragraphs.join('').match(/[\u4e00-\u9fff]/g)||[]).length;
    a.status='ready';a.updatedAt=new Date().toISOString();a.humanizeUsage=proposal.candidate.usage;delete a.error;
    await atomic(path.join(dir,'article.json'),a);await fsp.unlink(path.join(dir,'rewrite-pending.json'));return fullArticle(a.id);
  }));
  handle('render-preview',async input=>{
    validateId(input.id);if(!['simple','reading','wechat','claude','media'].includes(input.layout)||!Array.isArray(input.paragraphs)||input.paragraphs.length>1000||input.paragraphs.some(p=>typeof p!=='string')||input.paragraphs.join('').length>80000)throw Error('排版输入无效');
    const hasImage=fs.existsSync(path.join(articleDir(input.id),'body.png'));
    const key=crypto.createHash('sha256').update(JSON.stringify([input.id,input.layout,input.layoutRevision,input.manualImages,input.paragraphs,hasImage])).digest('hex');
    if(previewCache.has(key))return previewCache.get(key);
    const result=await runWorker('render',{id:input.id,preview:{paragraphs:input.paragraphs,layout:input.layout,layoutRevision:input.layoutRevision===3?3:2,manualImages:input.manualImages===true}});
    if(previewCache.size>=24)previewCache.delete(previewCache.keys().next().value);previewCache.set(key,result.html);return result.html;
  });
  handle('save-layout',(id,layout)=>begin('layout',async()=>{validateId(id);if(!['simple','reading','wechat','claude','media'].includes(layout))throw Error('排版无效');const dir=articleDir(id),a=await read(path.join(dir,'article.json'));if(!a||a.importedSaved)throw Error('文章不可编辑');if(a.richHtml){a.paragraphs=require('./rich-content').richToMarkdown(a.richHtml).split(/\n\s*\n/).filter(Boolean);delete a.richHtml;}a.layout=layout;a.layoutRevision=3;a.status='ready';a.updatedAt=new Date().toISOString();await atomic(path.join(dir,'article.json'),a);return fullArticle(id);}));
  handle('diagnose',()=>begin('diagnose',async()=>{const wechat=await credentials();configurationIp=null;try{return await runWorker('diagnose',{wechat});}catch(error){const ip=(error.message.match(/(?:\d{1,3}\.){3}\d{1,3}/)||[])[0];if(ip&&error.message.includes('白名单')&&settings.appId===wechat.appId)configurationIp={appId:wechat.appId,ip,expires:Date.now()+600000};throw error;}}));
  handle('login-start',()=>begin('login',async()=>{if(settings.startupError)throw Error(settings.startupError);const data=await gateway('/ui/oauth/start',{realm:'cn'});const u=new URL(data.url);if(u.protocol!=='https:'||!['copilot.tencent.com','www.codebuddy.cn','www.workbuddy.cn'].includes(u.hostname))throw Error('登录地址不符合预期。');await shell.openExternal(u.href);return {state:data.state};}));
  handle('login-poll',async(state)=>begin('login',async()=>{if(typeof state!=='string'||state.length>150)throw Error('授权状态无效');const data=await gateway('/ui/oauth/poll',{realm:'cn',state});if(data.success)checkinNextTryAt=0;return {success:!!data.success,waiting:!!data.waiting};}));
  handle('generate',spec=>begin('generate',async()=>{
    spec={...spec,words:require('./shared').targetWords(spec.words),autoSave:settings.autoSave!==false};
    if(!(await modelStatus()).connected)throw Error('请先登录WorkBuddy账号。');
    if(spec.autoSave&&(!settings.appId||!settings.secret))throw Error('请先配置公众号，或关闭自动保存草稿。');
    const id='a'+Date.now()+'-'+crypto.randomBytes(3).toString('hex');active.id=id;progress({id,stage:'text',message:'正在准备文章任务…'});
    try{await runWorker('generate',{id,spec});if(active?.cancelled)throw Error('任务已取消。');if(spec.autoSave)await sendArticle(id);return await fullArticle(id);}catch(error){await failArticle(id,error.message);error.message+='（文章已保留在文章库）';throw error;}
  }));
  handle('send',id=>begin('send',async()=>{validateId(id);active.id=id;try{await sendArticle(id);return fullArticle(id);}catch(error){await failArticle(id,error.message);throw error;}}));
  handle('retry-images',id=>begin('images',async()=>{validateId(id);active.id=id;const p=path.join(articleDir(id),'article.json'),a=await read(p);if(!a?.paragraphs?.length)throw Error('请先生成正文。');if(a.imageRequestPending)throw Error('上次生图结果不确定，请先检查账号用量。可使用本地图片替换后继续。');await runWorker('images',{id});return fullArticle(id);}));
  handle('editor-image',async()=>{const chosen=await dialog.showOpenDialog(win,{title:'选择图片',properties:['openFile'],filters:[{name:'图片',extensions:['png','jpg','jpeg','webp']}]});if(chosen.canceled)return null;const file=chosen.filePaths[0],stat=await fsp.stat(file);if(stat.size>8*1024*1024)throw Error('图片需小于8MB');const bytes=await fsp.readFile(file);const mime=bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'?'png':bytes[0]===255&&bytes[1]===216?'jpeg':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'webp':null;if(!mime)throw Error('请选择有效的 PNG、JPG 或 WebP 图片');return 'data:image/'+mime+';base64,'+bytes.toString('base64');});
  handle('save-rich',spec=>begin('rich-edit',async()=>{validateId(spec.id);const a=await read(path.join(articleDir(spec.id),'article.json'));if(!a||a.importedSaved)throw Error('文章不可编辑');if(fs.existsSync(path.join(articleDir(spec.id),'rewrite-pending.json')))throw Error('请先处理润色稿');if(typeof spec.title!=='string'||!spec.title.trim()||spec.title.length>64)throw Error('标题需为1至64字');const html=require('./rich-content').cleanRichHtml(spec.html);if(spec.cover&&(typeof spec.cover!=='string'||spec.cover.length>12*1024*1024))throw Error('封面过大');await runWorker('rich-edit',{id:spec.id,title:spec.title.trim(),html,cover:spec.cover});return fullArticle(spec.id);}));
  handle('save-article',async(input)=>{if(active)throw Error('任务执行中暂不能修改文章。');const dir=articleDir(input.id),a=await read(path.join(dir,'article.json'));if(!a)throw Error('文章不存在');if(a.importedSaved)throw Error('历史验证稿仅供查看，请新建文章。');const paragraphs=String(input.body||'').split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);if(!input.title?.trim()||!paragraphs.length)throw Error('标题和正文不能为空');a.title=String(input.title).slice(0,64);a.paragraphs=paragraphs;a.wordCount=(paragraphs.join('').match(/[\u4e00-\u9fff]/g)||[]).length;a.digest=paragraphs[0].slice(0,50);a.status='ready';a.updatedAt=new Date().toISOString();delete a.error;await atomic(path.join(dir,'article.json'),a);return fullArticle(a.id);});
  handle('replace-image',async(id,kind)=>{if(active)throw Error('请等待任务结束');const dir=articleDir(id),a=await read(path.join(dir,'article.json'));if(a.importedSaved)throw Error('历史验证稿仅供查看');if(!['cover','body'].includes(kind))throw Error('无效图片类型');const chosen=await dialog.showOpenDialog(win,{title:'选择图片',properties:['openFile'],filters:[{name:'PNG图片',extensions:['png']}]});if(chosen.canceled)return null;const stat=await fsp.stat(chosen.filePaths[0]);if(stat.size>10*1024*1024)throw Error('图片需小于10MB');const bytes=await fsp.readFile(chosen.filePaths[0]);if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('请选择有效PNG图片');await fsp.writeFile(path.join(dir,kind+'.png'),bytes);a.status='ready';a.imageRequestPending=false;delete a.error;delete a.aiImages?.[kind+'.png'];await atomic(path.join(dir,'article.json'),a);return fullArticle(id);});
  handle('cancel',async()=>{if(!active)return;active.cancelled=true;active.child?.kill();});
  handle('open-data',()=>shell.openPath(root));
  handle('export',async(id)=>{const a=await fullArticle(id);const chosen=await dialog.showSaveDialog(win,{defaultPath:a.title+(a.richHtml?'.html':'.md'),filters:a.richHtml?[{name:'HTML文章',extensions:['html']},{name:'Markdown文字',extensions:['md']}]:[{name:'Markdown',extensions:['md']}]});if(chosen.canceled)return false;let content='# '+a.title+'\n\n'+a.paragraphs.join('\n\n');if(a.richHtml&&/\.html?$/i.test(chosen.filePath)){const body=a.richHtml.replace(/qwriter-asset:\/\/([a-f0-9]{64}\.png)/g,(_,name)=>a.images['inline/'+name]||'');content='<!doctype html><meta charset="utf-8"><title>'+escapeHtml(a.title)+'</title><h1>'+escapeHtml(a.title)+'</h1>'+body;}await fsp.writeFile(chosen.filePath,content);return true;});
  handle('backup',async()=>{const dest=await dialog.showOpenDialog(win,{title:'选择备份位置（备份不含账号密钥）',properties:['openDirectory','createDirectory']});if(dest.canceled)return false;const target=path.join(dest.filePaths[0],'ArticleStudio-backup-'+Date.now());await fsp.mkdir(target);await fsp.cp(path.join(root,'articles'),path.join(target,'articles'),{recursive:true,filter:(src)=>!src.endsWith('.lock')});await atomic(path.join(target,'settings-public.json'),publicSettings(settings));return target;});
}
app.whenReady().then(async()=>{
  preferencesFile=path.join(app.getPath('userData'),'preferences.json');
  const installBase=app.isPackaged?(process.env.PORTABLE_EXECUTABLE_DIR||path.dirname(process.execPath)):path.join(__dirname,'..');
  installDirectory=installBase;
  defaultDataDir=defaultWorkspace(installBase);
  const preferences=await read(preferencesFile,{}),legacyData=path.join(app.getPath('userData'),'workspace');
  root=(smoke||captureReview)?path.join(app.getPath('temp'),'ArticleStudio-smoke-'+process.pid):(process.env.ARTICLE_STUDIO_DATA_DIR||preferences.dataDir||(fs.existsSync(legacyData)?legacyData:defaultDataDir));
  try{await fsp.mkdir(path.join(root,'articles'),{recursive:true});await fsp.access(root,fs.constants.W_OK);}catch(error){if(root!==defaultDataDir)throw error;root=path.join(app.getPath('userData'),'workspace');await fsp.mkdir(path.join(root,'articles'),{recursive:true});storageNotice='安装目录不可写，已使用当前用户的数据目录。可在此选择其他可写目录。';}
  if(!smoke&&!process.env.ARTICLE_STUDIO_DATA_DIR)await savePreferences(preferencesFile,{...preferences,dataDir:root});
  if(process.argv.includes('--first-run-check')){
    const probe=path.join(root,'.qwriter-check-'+crypto.randomBytes(8).toString('hex'));
    await fsp.writeFile(probe,'Qwriter',{flag:'wx'});const writable=(await fsp.readFile(probe,'utf8'))==='Qwriter';await fsp.unlink(probe);
    console.log('FIRST_RUN_RESULT '+JSON.stringify({installDirectory,dataDir:root,defaultDataDir,writable,underInstall:root===defaultDataDir}));app.quit();return;
  }
  if(smoke){await fsp.mkdir(articleDir('smoke-edit'));await atomic(path.join(articleDir('smoke-edit'),'article.json'),{id:'smoke-edit',title:'编辑恢复测试',paragraphs:['这是一条仅用于界面自动验证的测试内容。'],status:'ready',wordCount:20,usage:{},aiImages:{}});}
  checkinState=await read(checkinFile(),{});
  settings=await read(path.join(root,'settings.json'),{});if(!smoke&&!captureReview){await migrateCredentials();await importPoc();}
  for(const a of await articles()){if(a.status==='generating'){const file=path.join(articleDir(a.id),'article.json'),full=await read(file);full.status='interrupted';full.error='上次任务中断，已有内容保留。';await atomic(file,full);}}
  delete settings.startupError;
  if(!smoke&&!captureReview){try{await ensureGateway();}catch(error){settings.startupError=error.message;}}
  else {gatewayConfig=path.join(app.getPath('userData'),'smoke-gateway.json');}
  win=new BrowserWindow({width:1380,height:900,minWidth:1060,minHeight:720,title:'Qwriter',icon:path.join(__dirname,'..','assets','qwriter.ico'),backgroundColor:'#f4f6f9',webPreferences:{backgroundThrottling:!smoke,preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.removeMenu();win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());await register();
  await win.loadFile(path.join(__dirname,'renderer','index.html'));
  if(captureReview&&!app.isPackaged){
    const output=path.join(__dirname,'..','.impeccable','review');await fsp.mkdir(output,{recursive:true});
    win.show();win.focus();
    await new Promise(r=>setTimeout(r,1800));
    await win.webContents.executeJavaScript("setView('guide');showGuideStep(0)");
    for(const step of [0,1,2,3]){await win.webContents.executeJavaScript(`showGuideStep(${step})`);await new Promise(r=>setTimeout(r,150));await fsp.writeFile(path.join(output,`guide-${step}.png`),(await win.webContents.capturePage()).toPNG());}
    win.setSize(1100,760);await win.webContents.executeJavaScript("showGuideStep(1)");await new Promise(r=>setTimeout(r,200));await fsp.writeFile(path.join(output,'guide-laptop.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("setView('compose')");
    win.setSize(1380,900);await new Promise(r=>setTimeout(r,300));await fsp.writeFile(path.join(output,'desktop.png'),(await win.webContents.capturePage()).toPNG());
    win.setSize(1100,760);await new Promise(r=>setTimeout(r,300));await fsp.writeFile(path.join(output,'laptop.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("state.article={id:'review-only',title:'今天有什么新的思考呢',paragraphs:Array.from({length:50},()=> '这是一段仅用于界面验收的示例内容。阅读长文章时，右侧预览独立滚动，左侧操作保持原位。'),status:'ready',wordCount:1800,images:{},aiImages:{},usage:{}};renderArticle();notice('')");
    await win.webContents.executeJavaScript("window.pendingBodyPreview");await new Promise(r=>setTimeout(r,200));await fsp.writeFile(path.join(output,'compose-long-laptop.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("state.article.layout='reading';state.article.paragraphs=['> 把每天的一点思考，整理成自己的表达。','## 从一个问题开始','先把真正关心的事写下来，再慢慢找出其中的++关键问题++。','### 先记录，再整理','一段具体的观察，比空泛的形容更容易让人理解。','## 给想法留一点空间','把判断和还没想明白的地方分开，表达也会更自然。','### 回到读者','不必为排版增加没有意义的内容。'];renderArticle();window.pendingBodyPreview");
    await new Promise(r=>setTimeout(r,200));await fsp.writeFile(path.join(output,'chapter-layout-laptop.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("state.article.pendingRewrite={candidate:{proposalId:'review-example',title:state.article.title,paragraphs:['这是一段用于审查的润色示例。阅读长文章时，文章区域独立滚动；左侧操作留在原处。']}};renderArticle();showRewrite()");
    await new Promise(r=>setTimeout(r,200));await fsp.writeFile(path.join(output,'rewrite-review-laptop.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("delete state.article.pendingRewrite;rewrite=null;renderArticle()");
    await win.webContents.executeJavaScript("setBusy(true);progress({stage:'text',message:'正在生成文章，请稍候…'})");
    await new Promise(r=>setTimeout(r,200));await fsp.writeFile(path.join(output,'compose-busy-laptop.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("setBusy(false)");
    win.setSize(1380,900);await win.webContents.executeJavaScript("setView('settings')");await new Promise(r=>setTimeout(r,300));await fsp.writeFile(path.join(output,'settings.png'),(await win.webContents.capturePage()).toPNG());
    win.setSize(1060,720);await new Promise(r=>setTimeout(r,250));await fsp.writeFile(path.join(output,'settings-laptop.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("setView('library')");await new Promise(r=>setTimeout(r,300));await fsp.writeFile(path.join(output,'library.png'),(await win.webContents.capturePage()).toPNG());
    settings.appId='wx0000000000000000';settings.secret=safeStorage.encryptString('isolated-review-secret').toString('base64');settings.accountName='界面审查示例';
    await win.webContents.executeJavaScript("setView('publishing');syncCloudDrafts().then(()=>inspectCloudDraft('review-draft'))");await new Promise(r=>setTimeout(r,200));await fsp.writeFile(path.join(output,'publishing.png'),(await win.webContents.capturePage()).toPNG());
    win.setSize(1380,900);await new Promise(r=>setTimeout(r,200));await fsp.writeFile(path.join(output,'publishing-desktop.png'),(await win.webContents.capturePage()).toPNG());
    win.setSize(1060,720);await win.webContents.executeJavaScript("document.querySelector('.cloud-body').textContent='这是仅用于验证独立滚动的长文章内容。'.repeat(600);document.getElementById('publishWhen').value='later';document.getElementById('publishWhen').onchange()");await new Promise(r=>setTimeout(r,200));await fsp.writeFile(path.join(output,'publishing-long-laptop.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("setView('guide');showGuideStep(1)");await new Promise(r=>setTimeout(r,200));await fsp.writeFile(path.join(output,'config-assistant.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("openConfigWeb()");await new Promise(r=>setTimeout(r,200));await fsp.writeFile(path.join(output,'embedded-config-laptop.png'),(await win.capturePage()).toPNG());if(process.argv.includes('--hold-embedded')){win.show();win.focus();return;}
    win.setSize(1380,900);await new Promise(r=>setTimeout(r,250));await fsp.writeFile(path.join(output,'embedded-config-desktop.png'),(await win.capturePage()).toPNG());
    await win.webContents.executeJavaScript("document.getElementById('configExpand').click()");await new Promise(r=>setTimeout(r,200));await fsp.writeFile(path.join(output,'embedded-config-expanded.png'),(await win.capturePage()).toPNG());
    await win.webContents.executeJavaScript("hideConfigWeb()");win.setSize(1060,720);await new Promise(r=>setTimeout(r,200));
    await win.webContents.executeJavaScript("showGuideStep(2);document.getElementById('guideDiagnosis').textContent='需要补配 IP';document.getElementById('guideIpBox').hidden=false;document.getElementById('guideIp').value='192.0.2.42'");await new Promise(r=>setTimeout(r,150));await fsp.writeFile(path.join(output,'configuration-ip.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("setView('settings');document.getElementById('autoCheckinToggle').setAttribute('aria-checked','false')");await new Promise(r=>setTimeout(r,250));await fsp.writeFile(path.join(output,'switch-states.png'),(await win.webContents.capturePage()).toPNG());
    console.log('REVIEW_CAPTURES_READY '+output);app.quit();
  }
  if(!smoke&&!captureReview){const tick=()=>performCheckin().catch(()=>{checkinNextTryAt=Date.now()+30*60*1000;checkinState.lastError='签到未确认，请稍后重试';progress({checkin:true});});checkinTimer=setInterval(tick,60000);setTimeout(tick,5000);}
  if(smoke){setTimeout(async()=>{try{
    const originalRoot=root;
    const result=await win.webContents.executeJavaScript(await fsp.readFile(path.join(__dirname,'renderer','smoke.js'),'utf8'));
    result.rewriteBackupPresent=(await fsp.readdir(path.join(root,'articles','smoke-edit','versions'))).some(x=>x.startsWith('before-humanize-'));
    result.storageOriginalPreserved=fs.existsSync(path.join(originalRoot,'articles','smoke-edit','article.json'));
    result.configuration=await win.webContents.executeJavaScript(await fsp.readFile(path.join(__dirname,'renderer','configuration-smoke.js'),'utf8'));
    result.configurationDom=await require('./configuration-fixture')(BrowserWindow);
    result.publishing=await win.webContents.executeJavaScript(await fsp.readFile(path.join(__dirname,'renderer','publish-smoke.js'),'utf8'));
    result.layoutEngine=await win.webContents.executeJavaScript(await fsp.readFile(path.join(__dirname,'renderer','layout-engine-smoke.js'),'utf8'));
    if(!app.isPackaged)await fsp.writeFile(path.join(__dirname,'..','build','layout-engine-app.png'),(await win.webContents.capturePage()).toPNG());
    result.richEditor=await win.webContents.executeJavaScript(await fsp.readFile(path.join(__dirname,'renderer','rich-editor-smoke.js'),'utf8'));
    if(!app.isPackaged)await fsp.writeFile(path.join(__dirname,'..','build','rich-editor-app.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript('closeRichEditor(true)');
    result.workflow=await win.webContents.executeJavaScript(await fsp.readFile(path.join(__dirname,'renderer','workflow-smoke.js'),'utf8'));
    if(!app.isPackaged){await win.webContents.executeJavaScript("setView('publishing')");await new Promise(r=>setTimeout(r,100));await fsp.writeFile(path.join(__dirname,'..','build','workflow-publishing.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("setView('tasks');renderLists()");await new Promise(r=>setTimeout(r,100));await fsp.writeFile(path.join(__dirname,'..','build','workflow-tasks.png'),(await win.webContents.capturePage()).toPNG());await win.webContents.executeJavaScript("setView('compose')");}
    result.layouts=[];
    for(const [width,height] of [[1380,900],[1100,760],[1060,720]]){win.webContents.enableDeviceEmulation({screenPosition:'desktop',screenSize:{width,height},viewPosition:{x:0,y:0},deviceScaleFactor:1,viewSize:{width,height},scale:1});await new Promise(r=>setTimeout(r,80));result.layouts.push(await win.webContents.executeJavaScript(await fsp.readFile(path.join(__dirname,'renderer','layout-smoke.js'),'utf8')));}
    if(process.env.ARTICLE_STUDIO_SMOKE_REPORT)await atomic(process.env.ARTICLE_STUDIO_SMOKE_REPORT,result);
    console.log('SMOKE_RESULT '+JSON.stringify(result));
  }catch(error){console.error('SMOKE_FAILED '+error.message);}finally{app.quit();}},1000);}

});
app.on('window-all-closed',()=>app.quit());
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
app.on('before-quit',()=>{notifications?.close();clearInterval(publishTimer);configAssistant?.close();clearInterval(checkinTimer);active?.child?.kill();gatewayChild?.kill();});

