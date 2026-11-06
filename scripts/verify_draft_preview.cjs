const {app,BrowserWindow,protocol}=require('electron');
const fs=require('node:fs');const path=require('node:path');
app.whenReady().then(async()=>{
  const win=new BrowserWindow({width:1060,height:720,show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  // Deterministic local image responses: no account, remote drafts or publishing.
  protocol.handle('https',()=>new Response('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420"><rect width="600" height="420" fill="#d9edf0"/><rect x="80" y="80" width="440" height="260" rx="12" fill="#006b80"/><text x="300" y="220" font-size="32" text-anchor="middle" fill="white">Preview image</text></svg>',{headers:{'Content-Type':'image/svg+xml'}}));
  await win.loadFile(path.join(__dirname,'../src/renderer/index.html'));
  const result=await win.webContents.executeJavaScript(`(async()=>{
    const host=document.createElement('div');document.querySelectorAll('.view').forEach(n=>n.classList.remove('active'));document.getElementById('publishing').classList.add('active');document.querySelector('.shell').className='shell publishing-mode';document.getElementById('publishForm').hidden=false;document.getElementById('publishReview').replaceChildren(host);host.className='cloud-body';host.style.cssText='width:600px;max-width:100%;margin:auto';
    const html='<section style="color:rgb(40,40,40);padding:16px"><h2 style="font-size:23px">章节标题</h2><p>图片前</p><img data-src="https://mmbiz.qpic.cn/first" style="height:20px;max-height:20px" onerror="window.previewPwned=true"><p>图片后</p><img src="https://mmbiz.qlogo.cn/second"><table><tr><td>表格</td></tr></table><a href="javascript:alert(1)">链接</a><script>window.previewPwned=true<\/script><iframe src="file:///C:/"></iframe><p style="position:fixed;background-image:url(https://example.org/a)">安全检查</p><img src="file:///C:/secret"></section>';
    renderCloudBody(host,html);await new Promise(r=>setTimeout(r,300));const root=host.shadowRoot;
    const imgs=[...root.querySelectorAll('img')];const heading=root.querySelector('h2');
    const safe=!root.querySelector('script,iframe,[onerror],[href]')&&!window.previewPwned&&![...root.querySelectorAll('[style]')].some(n=>n.style.position||n.style.backgroundImage);
    const order=root.textContent.indexOf('图片前')<root.textContent.indexOf('图片后')&&imgs[0].previousElementSibling.textContent==='图片前';
    imgs[0].dispatchEvent(new Event('error'));const failed=!imgs[0].nextElementSibling.hidden&&imgs[0].hidden;
    imgs[0].nextElementSibling.querySelector('button').click();const retry=!imgs[0].hidden;
    return {safe,order,images:imgs.length===2,unsupported:root.textContent.includes('图片地址暂不支持预览'),heading:getComputedStyle(heading).fontSize==='23px',unclipped:getComputedStyle(imgs[0]).maxHeight==='none',table:!!root.querySelector('table td'),failed,retry,https:normalizeDraftImage('http://mmbiz.qpic.cn/a')==='https://mmbiz.qpic.cn/a',blocked:normalizeDraftImage('https://mmbiz.qpic.cn.evil.com/a')===null};
  })()`);
  await new Promise(r=>setTimeout(r,150));
  fs.mkdirSync(path.join(__dirname,'../build'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'../build/draft-preview.png'),(await win.webContents.capturePage()).toPNG());
  console.log(JSON.stringify(result));if(!Object.values(result).every(Boolean))process.exitCode=1;app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
