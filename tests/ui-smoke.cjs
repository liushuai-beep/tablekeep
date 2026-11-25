const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'..'),review=path.join(require('node:os').tmpdir(),'tablekeep-ui-'+process.pid);fs.mkdirSync(review,{recursive:true});
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:460,height:600,frame:false,webPreferences:{preload:path.join(__dirname,'ui-preload.cjs'),sandbox:true,contextIsolation:true}});
 let settings={mode:'popup',version:'0.3.0',pinned:false,collapseAfterCopy:true,shortcutRegistered:true,shortcut:'CommandOrControl+Shift+V'},lastCopy=null,hostState={},saveCount=0;
 ipcMain.handle('config',()=>settings);ipcMain.handle('preferences',(_e,change)=>{settings={...settings,...change};win.webContents.send('tablekeep:config',settings);return settings;});
 ipcMain.handle('state',(_e,x)=>{hostState=x;return true;});ipcMain.handle('view',(_e,v)=>{settings.mode=v;win.setSize(v==='popup'?460:1440,v==='popup'?600:844);win.webContents.send('tablekeep:view',v);return v;});
 ipcMain.handle('hide',()=>true);ipcMain.handle('menu',()=>true);ipcMain.handle('copy',(_e,x)=>{lastCopy=x;return {collapse:false};});ipcMain.handle('read',()=>({text:'地区\t金额\n华东\t00128.50'}));ipcMain.handle('save',()=>{saveCount++;return {name:'test.docx'};});ipcMain.handle('import',()=>null);ipcMain.handle('image',()=>null);
 const checks=[];const record=name=>checks.push({name,passed:true});const js=source=>win.webContents.executeJavaScript(source);
 const shot=async name=>{await js('window.scrollTo(0,0);document.activeElement?.blur();document.querySelector("#toast").hidden=true');await new Promise(r=>setTimeout(r,250));fs.writeFileSync(path.join(review,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 try{
  await win.loadFile(path.join(dir,'index.html'),{query:{view:'popup'}});await new Promise(r=>setTimeout(r,80));
  assert.equal(await js('TableKeepUI.getState().source'),null);assert.equal(await js('getComputedStyle(document.querySelector(".export-bar")).display'),'none');record('空状态隐藏无可用内容的导出区');await shot('empty');
  await js('document.querySelector("#quickExample").click()');assert.equal(await js('TableKeepUI.getState().audit.loss'),0);assert.equal(await js('document.querySelector("#resultPreview").contentEditable'),'false');record('小面板只读，完整合并表格预览');
  assert.equal(await js('document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1'),true);record('460×600 操作区无整页溢出');await shot('ready');
  await js('document.querySelector("#pinButton").click()');await new Promise(r=>setTimeout(r,20));assert.equal(await js('document.querySelector("#pinButton").getAttribute("aria-pressed")'),'true');record('固定按钮状态与设置同步');
  await js('document.querySelector("#viewButton").click()');await new Promise(r=>setTimeout(r,30));assert.equal(await js('document.querySelector("#resultPreview").contentEditable'),'true');record('展开后可编辑且保留内容');
  await js('const p=[...document.querySelectorAll("#resultPreview td p")].find(p=>p.textContent==="128.50");p.textContent="999.99";document.querySelector("#resultPreview").dispatchEvent(new Event("input",{bubbles:true}));document.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",metaKey:true,bubbles:true}));');
  assert.equal(lastCopy,null);assert.ok(await js('TableKeepUI.getState().audit.loss>0'));record('编辑后立即按复制快捷键不会绕过检查');
  win.webContents.send('tablekeep:command','docx');await new Promise(r=>setTimeout(r,30));assert.equal(saveCount,0);record('快捷键/原生菜单不会绕过损失导出限制');await shot('workbench');
  await js('document.querySelector("#viewButton").click()');await new Promise(r=>setTimeout(r,30));await shot('loss');
  await js('TableKeepUI.applyInput(TableKeepSamples.get()[1].input,"html")');await shot('warning');
  await js('document.querySelector("#quickPasteButton").click()');await new Promise(r=>setTimeout(r,30));assert.equal(await js('TableKeepUI.getState().audit.stats.tables'),1);assert.equal(await js('document.querySelector("#quickSourceLabel").textContent.startsWith("TSV")'),true);record('TSV 读取入口与来源状态');
  await js('document.querySelector("#copyButton").click()');await new Promise(r=>setTimeout(r,30));assert.ok(lastCopy.html.includes('<table'));assert.ok(lastCopy.text.includes('00128.50'));record('复制数据保留表格及前导零（隔离剪贴板）');
  await new Promise(r=>setTimeout(r,1700));win.setSize(460,500);await shot('short');assert.equal(await js('document.documentElement.scrollHeight<=innerHeight+1'),true);record('短面板布局');
  win.setSize(460,600);await js('const transfer=new DataTransfer();transfer.items.add(new File(["binary fixture"],"unsupported.docx"));document.querySelector(".result-scroll").dispatchEvent(new DragEvent("drop",{dataTransfer:transfer,bubbles:true}));');assert.ok(await js('document.querySelector("#toast").textContent.includes("不支持此文件类型")'));assert.equal(await js('TableKeepUI.getState().audit.stats.tables'),1);await js('TableKeepUI.applyInput("", "html")');await shot('error');record('错误状态仍可恢复输入');
  const metrics=await js('({width:innerWidth,height:innerHeight})');fs.writeFileSync(path.join(review,'ui-results.json'),JSON.stringify({checks,metrics,hostState},null,2));console.log(JSON.stringify({checks},null,2));app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
});
