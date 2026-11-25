const {app,BrowserWindow,ipcMain,clipboard,ClipboardItem,dialog,Menu,session,nativeImage,Tray,screen,globalShortcut}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const testMode=process.env.TABLEKEEP_TEST_MODE==='1';
app.setName('TableKeep');
if(testMode&&process.env.TABLEKEEP_TEST_DATA)app.setPath('userData',process.env.TABLEKEEP_TEST_DATA);
else app.setPath('userData',path.join(app.getPath('appData'),'TableKeep Prototype'));
const entry=pathToFileURL(path.join(__dirname,'index.html')).href+'?view=popup';
let window,tray,quitting=false,mode='popup',dialogDepth=0,shortcutRegistered=false,blurTimer;
let preferences={pinned:false,collapseAfterCopy:true,shortcut:'CommandOrControl+Shift+V'},hostState={hasContent:false,canExport:false};
const preferencesFile=path.join(app.getPath('userData'),'preferences.json');
const shortcutChoices=['CommandOrControl+Shift+V','CommandOrControl+Alt+V',''];
let preferenceWrites=Promise.resolve();
const config=()=>({mode,shortcutRegistered,version:app.getVersion(),...preferences});
const command=name=>window.webContents.send('tablekeep:command',name);
function broadcastConfig(){window.webContents.send('tablekeep:config',config());}
async function changePreferences(change){
 for(const key of ['pinned','collapseAfterCopy'])if(typeof change?.[key]==='boolean')preferences[key]=change[key];
 if(shortcutChoices.includes(change?.shortcut)&&change.shortcut!==preferences.shortcut){
  if(preferences.shortcut&&shortcutRegistered)globalShortcut.unregister(preferences.shortcut);
  preferences.shortcut=change.shortcut;shortcutRegistered=!!preferences.shortcut&&globalShortcut.register(preferences.shortcut,showAndPaste);
 }
 clearTimeout(blurTimer);broadcastConfig();
 const serialized=JSON.stringify(preferences);
 preferenceWrites=preferenceWrites.catch(()=>{}).then(async()=>{await fs.mkdir(path.dirname(preferencesFile),{recursive:true});await fs.writeFile(preferencesFile,serialized,'utf8');});
 await preferenceWrites;return config();
}
function actionsTemplate(){
 const send=name=>()=>command(name);
 return [
  {label:'读取剪贴板并检查',click:showAndPaste},
  {label:'导入文件…',accelerator:'CommandOrControl+O',click:send('import')},
  {type:'separator'},
  {label:'复制富文本',accelerator:'CommandOrControl+Enter',enabled:hostState.canExport,click:send('copy')},
  {label:'导出 DOCX…',accelerator:'CommandOrControl+S',enabled:hostState.canExport,click:send('docx')},
  {label:'导出 HTML…',enabled:hostState.canExport,click:send('html')},
  {label:'导出检查报告…',enabled:hostState.hasContent,click:send('report')},
  {type:'separator'},
  {label:mode==='popup'?'展开工作台':'回到菜单栏',accelerator:'CommandOrControl+D',click:()=>showMode(mode==='popup'?'workbench':'popup')},
  {label:'固定面板',type:'checkbox',checked:preferences.pinned,click:item=>changePreferences({pinned:item.checked}).catch(()=>command('preferences-error'))},
  {label:'复制后收起面板',type:'checkbox',checked:preferences.collapseAfterCopy,click:item=>changePreferences({collapseAfterCopy:item.checked}).catch(()=>command('preferences-error'))},
  {label:'全局快捷键',submenu:shortcutChoices.map((shortcut,i)=>({label:['⌘⇧V','⌘⌥V','关闭'][i],type:'radio',checked:preferences.shortcut===shortcut,click:()=>changePreferences({shortcut}).catch(()=>command('preferences-error'))}))},
  ...(!shortcutRegistered&&preferences.shortcut?[{label:'快捷键被占用，可使用读取按钮',enabled:false}]:[]),
  {type:'separator'},
  {label:'清空当前内容',enabled:hostState.hasContent,click:send('clear')},
  {label:'使用说明',click:send('help')},
  {label:'退出 TableKeep',accelerator:'CommandOrControl+Q',click:()=>app.quit()}
 ];
}
function showActions(){
 clearTimeout(blurTimer);dialogDepth++;
 let selected=false;
 const mark=items=>items.map(item=>({...item,...(item.click?{click:(...args)=>{selected=true;item.click(...args);}}:{}),...(Array.isArray(item.submenu)?{submenu:mark(item.submenu)}:{})}));
 const menu=Menu.buildFromTemplate(mark(actionsTemplate()));
 menu.popup({window,callback:()=>{dialogDepth--;if(!quitting&&!window.isDestroyed()&&window.isVisible()){if(selected||preferences.pinned)window.focus();else window.hide();}}});
 return true;
}
async function nativeDialog(task){dialogDepth++;try{return await task();}finally{dialogDepth--;if(window?.isVisible())window.focus();}}
const unwrap=(fn)=>async(event,...args)=>{
 if(event.senderFrame?.url!==entry)throw new Error('Untrusted sender');
 try{return {ok:true,value:await fn(...args)};}catch(error){return {ok:false,error:error.message||'操作没有完成，请重试。'};}
};
async function readClipboard(){
 if(typeof clipboard.readHTML==='function'){
  const html=clipboard.readHTML(),text=clipboard.readText();
  if(!html&&!text){const image=clipboard.readImage();if(!image.isEmpty())return {html:`<p><img src="${image.toDataURL()}" alt="剪贴板图片"></p>`,text:''};}
  return {html,text};
 }
 const items=await clipboard.read();const output={html:'',text:''};
 for(const item of items){for(const [mime,key] of [['text/html','html'],['text/plain','text']]){if(item.types.includes(mime))output[key]=await(await item.getType(mime)).text();}}
 return output;
}
async function copyResult({html,text}){
 if(typeof html!=='string'||typeof text!=='string'||html.length>25000000||text.length>500000)throw new Error('复制内容过大，请改用文件导出。');
 if(typeof clipboard.writeHTML==='function')clipboard.write({html,text});
 else await clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([text],{type:'text/plain'})})]);
 return {collapse:mode==='popup'&&preferences.collapseAfterCopy&&!preferences.pinned};
}
async function importDocument(){
 const result=await nativeDialog(()=>dialog.showOpenDialog(window,{title:'导入表格或文档片段',properties:['openFile'],filters:[{name:'HTML、Markdown 或文本',extensions:['html','htm','md','markdown','txt','tsv']}]}));
 if(result.canceled)return null;
 const filename=result.filePaths[0],stat=await fs.stat(filename);
 if(stat.size>25000000)throw new Error('文件超过 25 MB，请先拆分内容。');
 return {name:path.basename(filename),content:await fs.readFile(filename,'utf8'),format:/\.html?$/i.test(filename)?'html':/\.(md|markdown)$/i.test(filename)?'markdown':'auto'};
}
async function importImage(){
 const result=await nativeDialog(()=>dialog.showOpenDialog(window,{title:'从本机补入图片',properties:['openFile'],filters:[{name:'图片',extensions:['png','jpg','jpeg','gif']}]}));
 if(result.canceled)return null;
 const filename=result.filePaths[0],stat=await fs.stat(filename);
 if(stat.size>10000000)throw new Error('图片超过 10 MB，请压缩后再补入。');
 const image=nativeImage.createFromPath(filename);
 if(image.isEmpty())throw new Error('未能读取图片，请选择有效的 PNG、JPEG 或 GIF。');
 const bytes=await fs.readFile(filename);
 const mime=bytes[0]===137&&bytes[1]===80?'png':bytes[0]===255&&bytes[1]===216?'jpeg':bytes[0]===71&&bytes[1]===73&&bytes[2]===70?'gif':null;
 if(!mime)throw new Error('请选择有效的 PNG、JPEG 或 GIF。');
 const size=image.getSize();return {name:path.basename(filename),data:'data:image/'+mime+';base64,'+bytes.toString('base64'),width:size.width,height:size.height};
}
async function saveFile({format,data}){
 const formats={docx:'Word 文档',html:'HTML 文档',json:'检查报告'};
 if(!Object.hasOwn(formats,format))throw new Error('不支持这个导出格式。');
 let bytes;
 if(typeof data==='string')bytes=Buffer.from(data,'utf8');
 else if(Array.isArray(data)&&data.length<25000000&&data.every(n=>Number.isInteger(n)&&n>=0&&n<=255))bytes=Buffer.from(data);
 else throw new Error('导出数据无效，请重新转换。');
 if(bytes.length>25000000)throw new Error('导出内容超过原型大小限制，请拆分内容。');
 let filename;
 if(testMode&&process.env.TABLEKEEP_TEST_OUTPUT){await fs.mkdir(process.env.TABLEKEEP_TEST_OUTPUT,{recursive:true});filename=path.join(process.env.TABLEKEEP_TEST_OUTPUT,'TableKeep-result.'+format);}
 else{
  const result=await nativeDialog(()=>dialog.showSaveDialog(window,{title:'导出'+formats[format],defaultPath:path.join(app.getPath('downloads'),'TableKeep-result.'+format),filters:[{name:formats[format],extensions:[format]}]}));
  if(result.canceled)return null;filename=result.filePath;
 }
 await fs.writeFile(filename,bytes);return {name:path.basename(filename)};
}
function positionPopup(){
 const anchor=tray.getBounds();
 const display=screen.getDisplayNearestPoint(anchor.width?{x:anchor.x,y:anchor.y}:screen.getCursorScreenPoint());
 const area=display.workArea,width=Math.min(460,area.width-16),height=Math.min(600,area.height-12);
 const x=Math.round(Math.min(Math.max(anchor.x+anchor.width/2-width/2,area.x+8),area.x+area.width-width-8));
 const y=Math.round(Math.min(Math.max(anchor.y+anchor.height+5,area.y+5),area.y+area.height-height-5));
 return {x,y,width,height};
}
function showMode(next=mode){
 clearTimeout(blurTimer);
 mode=next;
 window.setMinimumSize(320,400);
 window.setResizable(mode==='workbench');
 window.setAlwaysOnTop(mode==='popup','floating');
 if(mode==='popup')window.setBounds(positionPopup());
 else{
  const area=screen.getDisplayMatching(window.getBounds()).workArea;
  const width=Math.min(1440,area.width-32),height=Math.min(940,area.height-32);
  window.setBounds({x:Math.round(area.x+(area.width-width)/2),y:Math.round(area.y+(area.height-height)/2),width,height});
  window.setMinimumSize(Math.min(1080,width),Math.min(700,height));
 }
 window.webContents.send('tablekeep:view',mode);window.show();window.focus();
}
function togglePopup(){clearTimeout(blurTimer);if(window.isVisible()&&mode==='popup')window.hide();else showMode('popup');}
function showAndPaste(){showMode('popup');window.webContents.send('tablekeep:command','paste');}
if(!testMode&&!app.requestSingleInstanceLock())app.quit();
else app.whenReady().then(async()=>{
 try{const saved=JSON.parse(await fs.readFile(preferencesFile,'utf8'));for(const key of ['pinned','collapseAfterCopy'])if(typeof saved[key]==='boolean')preferences[key]=saved[key];if(shortcutChoices.includes(saved.shortcut))preferences.shortcut=saved.shortcut;}catch{}
 app.setAboutPanelOptions({applicationName:'TableKeep',applicationVersion:app.getVersion()});
 if(process.platform==='darwin')app.setActivationPolicy('accessory');
 session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
 session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!['file:','data:','blob:','devtools:'].some(prefix=>details.url.startsWith(prefix))}));
 ipcMain.handle('tablekeep:clipboard',unwrap(readClipboard));
 ipcMain.handle('tablekeep:copy',unwrap(copyResult));
 ipcMain.handle('tablekeep:import',unwrap(importDocument));
 ipcMain.handle('tablekeep:image',unwrap(importImage));
 ipcMain.handle('tablekeep:save',unwrap(saveFile));
 ipcMain.handle('tablekeep:view',unwrap(next=>{if(!['popup','workbench'].includes(next))throw new Error('无效窗口模式');showMode(next);return next;}));
 ipcMain.handle('tablekeep:hide',unwrap(()=>{window.hide();return true;}));
 ipcMain.handle('tablekeep:config',unwrap(config));
 ipcMain.handle('tablekeep:preferences',unwrap(changePreferences));
 ipcMain.handle('tablekeep:menu',unwrap(showActions));
 ipcMain.handle('tablekeep:state',unwrap(state=>{hostState={hasContent:state?.hasContent===true,canExport:state?.canExport===true};return true;}));
 window=new BrowserWindow({width:460,height:600,minWidth:320,minHeight:400,show:false,frame:false,resizable:false,skipTaskbar:true,title:'TableKeep',backgroundColor:'#f4f7f4',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',(event,url)=>{if(url!==entry)event.preventDefault();});
 window.on('blur',()=>{clearTimeout(blurTimer);blurTimer=setTimeout(()=>{if(mode==='popup'&&!dialogDepth&&!preferences.pinned&&!window.isFocused())window.hide();},100);});
 window.on('close',event=>{if(!quitting){event.preventDefault();window.hide();}});
 const trayImage=nativeImage.createFromPath(path.join(__dirname,'assets','trayTemplate.png'));
 trayImage.setTemplateImage(true);tray=new Tray(trayImage);
 tray.setToolTip('TableKeep · 表格保真与损失检查');
 tray.on('click',togglePopup);
 tray.on('right-click',showActions);
 shortcutRegistered=!!preferences.shortcut&&globalShortcut.register(preferences.shortcut,showAndPaste);
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'TableKeep',submenu:[{label:'设置…',accelerator:'CommandOrControl+,',click:showActions},{type:'separator'},{role:'quit'}]},
  {label:'文件',submenu:[{label:'导入文件…',accelerator:'CommandOrControl+O',click:()=>command('import')},{label:'导出 DOCX…',accelerator:'CommandOrControl+S',click:()=>command('docx')},{label:'收起窗口',accelerator:'CommandOrControl+W',click:()=>window.hide()}]},
  {label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
  {label:'显示',submenu:[{label:'切换工作台',accelerator:'CommandOrControl+D',click:()=>showMode(mode==='popup'?'workbench':'popup')}]},
  {label:'窗口',submenu:[{role:'minimize'},{role:'zoom'}]},
  {label:'帮助',submenu:[{label:'TableKeep 使用说明',click:()=>command('help')}]}
 ]));
 window.once('ready-to-show',()=>{if(!testMode||process.env.TABLEKEEP_TEST_SHOW==='1')showMode('popup');});
 window.loadFile(path.join(__dirname,'index.html'),{query:{view:'popup'}});
 app.on('activate',()=>showMode('popup'));
 app.on('second-instance',()=>showMode('popup'));
 // Private in-memory handles for native regression tests; never exposed to the renderer.
 if(testMode)globalThis.__tablekeepTest={tray,getMode:()=>mode,showMode,togglePopup,showAndPaste,getShortcut:()=>shortcutRegistered,actionsTemplate,changePreferences,config};
});
app.on('before-quit',()=>{quitting=true;});
app.on('will-quit',()=>{globalShortcut.unregisterAll();tray?.destroy();});
app.on('window-all-closed',()=>{if(quitting)app.quit();});
