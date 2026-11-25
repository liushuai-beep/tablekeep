const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('tablekeepDesktop',{
 isDesktop:true,platform:'darwin',
 getConfig:()=>ipcRenderer.invoke('config'),updatePreferences:x=>ipcRenderer.invoke('preferences',x),updateState:x=>ipcRenderer.invoke('state',x),
 setView:x=>ipcRenderer.invoke('view',x),hide:()=>ipcRenderer.invoke('hide'),showMenu:()=>ipcRenderer.invoke('menu'),
 readClipboard:()=>ipcRenderer.invoke('read'),copyResult:x=>ipcRenderer.invoke('copy',x),saveFile:x=>ipcRenderer.invoke('save',x),importDocument:()=>ipcRenderer.invoke('import'),importImage:()=>ipcRenderer.invoke('image'),
 onView:cb=>ipcRenderer.on('tablekeep:view',(_e,v)=>cb(v)),onConfig:cb=>ipcRenderer.on('tablekeep:config',(_e,v)=>cb(v)),onCommand:cb=>ipcRenderer.on('tablekeep:command',(_e,v)=>cb(v))
});
