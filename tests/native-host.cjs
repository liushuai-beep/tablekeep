const path=require('node:path'),fs=require('node:fs/promises'),os=require('node:os'),assert=require('node:assert/strict');
const {app,BrowserWindow,clipboard,dialog}=require('electron');
const dir=path.resolve(__dirname,'..');
const profile=path.join(os.tmpdir(),'tablekeep-native-'+process.pid);
process.env.TABLEKEEP_TEST_MODE='1';process.env.TABLEKEEP_TEST_DATA=profile;process.env.TABLEKEEP_TEST_OUTPUT=path.join(profile,'export');
require(path.join(dir,'main.cjs'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const checks=[],record=name=>checks.push({name,passed:true});
 try{
  for(let i=0;i<100&&!globalThis.__tablekeepTest;i++)await sleep(20);
  const t=globalThis.__tablekeepTest,win=BrowserWindow.getAllWindows()[0];assert.ok(t);if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));await sleep(50);
  assert.ok(t.tray.getBounds().width>0);record('创建真实菜单栏图标');
  await t.changePreferences({pinned:true});t.showMode('popup');win.blur();await sleep(150);assert.equal(win.isVisible(),true);record('固定后失焦仍保持展开');
  await t.changePreferences({pinned:false});win.focus();win.blur();await sleep(150);assert.equal(win.isVisible(),false);record('取消固定后失焦自动收起');
  t.showMode('popup');win.blur();t.tray.emit('click');await sleep(150);assert.equal(win.isVisible(),false);record('菜单栏点击与失焦事件不互相抵消');
  t.showMode('popup');await win.webContents.executeJavaScript('TableKeepUI.applyInput(TableKeepSamples.get()[0].input,"html")');await sleep(40);
  let menu=t.actionsTemplate();assert.equal(menu.find(x=>x.label==='复制富文本').enabled,true);record('原生菜单随转换状态启用动作');
  let written;clipboard.write=async items=>{const item=items[0];written={html:await(await item.getType('text/html')).text(),text:await(await item.getType('text/plain')).text()};};
  win.webContents.send('tablekeep:command','copy');await sleep(400);assert.equal(win.isVisible(),false);assert.ok(written.html.includes('rowspan="2"'));record('原生复制返回有效富文本，成功后自动收起（隔离剪贴板）');
  await t.changePreferences({pinned:true});t.showMode('popup');win.webContents.send('tablekeep:command','copy');await sleep(400);assert.equal(win.isVisible(),true);record('固定面板复制后保持展开');
  const bounds=win.getBounds();assert.equal(bounds.width,460);assert.equal(bounds.height,600);record('紧凑面板尺寸正确');
  t.showMode('workbench');await sleep(30);const state=await win.webContents.executeJavaScript('TableKeepUI.getState()');assert.equal(state.audit.stats.merges,5);record('工作台切换保留同一份合并表格');
  win.webContents.send('tablekeep:command','docx');await sleep(100);const bytes=await fs.readFile(path.join(profile,'export/TableKeep-result.docx'));assert.equal(bytes.subarray(0,2).toString(),'PK');record('原生 DOCX 写出');
  const preferences=JSON.parse(await fs.readFile(path.join(profile,'preferences.json'),'utf8'));assert.deepEqual(Object.keys(preferences).sort(),['collapseAfterCopy','pinned','shortcut']);assert.equal(preferences.pinned,true);record('仅持久化偏好设置，不写入文档内容');
  await t.changePreferences({pinned:false});await win.webContents.executeJavaScript('const node=[...document.querySelectorAll("#resultPreview td p")].find(p=>p.textContent==="128.50");node.textContent="999.99";document.querySelector("#resultPreview").dispatchEvent(new Event("input",{bubbles:true}));');await sleep(220);menu=t.actionsTemplate();assert.equal(menu.find(x=>x.label==='复制富文本').enabled,false);assert.equal(menu.find(x=>x.label==='导出 DOCX…').enabled,false);assert.equal(menu.find(x=>x.label==='导出检查报告…').enabled,true);record('实际内容变化同步到原生菜单禁用状态');
  const imageFile=path.join(dir,'assets/icon.png');dialog.showOpenDialog=async()=>({canceled:false,filePaths:[imageFile]});
  const image=await win.webContents.executeJavaScript('tablekeepDesktop.importImage()');assert.equal(image.data,'data:image/png;base64,'+(await fs.readFile(imageFile)).toString('base64'));record('本机图片按原始字节嵌入，不重新编码');
  console.log(JSON.stringify({checks},null,2));app.quit();
 }catch(e){console.error(e);app.exit(1);}
});
