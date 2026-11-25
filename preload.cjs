const {contextBridge,ipcRenderer}=require('electron');
const invoke=async(channel,...args)=>{const response=await ipcRenderer.invoke(channel,...args);if(!response.ok)throw new Error(response.error);return response.value;};
contextBridge.exposeInMainWorld('tablekeepDesktop',{
 isDesktop:true,
 platform:process.platform,
 getConfig:()=>invoke('tablekeep:config'),
 updatePreferences:change=>invoke('tablekeep:preferences',change),
 showMenu:()=>invoke('tablekeep:menu'),
 updateState:state=>invoke('tablekeep:state',state),
 onConfig:callback=>{const handler=(_event,config)=>callback(config);ipcRenderer.on('tablekeep:config',handler);return()=>ipcRenderer.removeListener('tablekeep:config',handler);},
 setView:mode=>invoke('tablekeep:view',mode),
 hide:()=>invoke('tablekeep:hide'),
 onView:callback=>{const handler=(_event,mode)=>callback(mode);ipcRenderer.on('tablekeep:view',handler);return()=>ipcRenderer.removeListener('tablekeep:view',handler);},
 onCommand:callback=>{const handler=(_event,command)=>callback(command);ipcRenderer.on('tablekeep:command',handler);return()=>ipcRenderer.removeListener('tablekeep:command',handler);},
 readClipboard:()=>invoke('tablekeep:clipboard'),
 copyResult:payload=>invoke('tablekeep:copy',payload),
 importDocument:()=>invoke('tablekeep:import'),
 importImage:()=>invoke('tablekeep:image'),
 saveFile:payload=>invoke('tablekeep:save',payload)
});
