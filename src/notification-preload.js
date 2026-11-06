const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('notification',{close:()=>ipcRenderer.send('dismiss-notification')});
