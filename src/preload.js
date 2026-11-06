const {contextBridge,ipcRenderer}=require('electron');
const channels=new Set(['article-page','task-page','task-remove','task-clear','publish-page','publish-archive','save-rich','editor-image','publish-edit','config-hide','config-bounds','config-refresh','config-state','notify','config-close','config-open','config-copy-ip','publish-list','publish-drafts','publish-review','publish-commit','publish-cancel','publish-status','structure','render-preview','checkin-now','save-behavior','humanize','apply-rewrite','discard-rewrite','save-layout','logout-model','disconnect-wechat','choose-data','open-help','snapshot','article','save-settings','diagnose','login-start','login-poll','generate','send','retry-images','save-article','replace-image','cancel','open-data','export','backup']);
contextBridge.exposeInMainWorld('studio',{
  call:(name,...args)=>{if(!channels.has(name))throw Error('Unsupported operation');return ipcRenderer.invoke(name,...args);},
  onProgress:(fn)=>{const listener=(_event,data)=>fn(data);ipcRenderer.on('progress',listener);return()=>ipcRenderer.removeListener('progress',listener);}
});
