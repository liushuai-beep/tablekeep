// Real Chromium clipboard experiment + actual TableKeep renderer captures.
// No screen recording, native tray simulation, or Word/WPS rendering is claimed.
const {app,BrowserWindow,ipcMain,clipboard,ClipboardItem}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'..'),out=path.resolve(process.env.TABLEKEEP_DEMO_OUT||path.join(repo,'docs/demo'));
fs.mkdirSync(out,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const snapshot=async()=>Promise.all((await clipboard.read()).filter(item=>item.types.length).map(async item=>new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type=>[type,await item.getType(type)]))))));
const fingerprint=async()=>{const entries=[];for(const item of await clipboard.read())for(const type of [...item.types].sort()){const blob=await item.getType(type);entries.push(type+':'+(blob instanceof Blob?Buffer.from(await blob.arrayBuffer()).toString('base64'):JSON.stringify(blob)));}return crypto.createHash('sha256').update(entries.join('\n')).digest('hex');};
const readClipboard=async()=>{const result={html:'',text:''};for(const item of await clipboard.read())for(const [type,key]of [['text/html','html'],['text/plain','text']])if(item.types.includes(type))result[key]=await (await item.getType(type)).text();return result;};
const writeClipboard=async(html,text)=>clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([text],{type:'text/plain'})})]);
app.whenReady().then(async()=>{
 const backup=await snapshot();
 let ownFingerprint=null,copies=0,saves=0,settings={mode:'popup',version:'0.3.0',pinned:false,collapseAfterCopy:false,shortcutRegistered:false};
 const report={version:require(path.join(repo,'package.json')).version,createdAt:new Date().toISOString(),environment:{electron:process.versions.electron,chromium:process.versions.chrome,platform:process.platform},scope:'Real macOS clipboard / Chromium editable-region paste; actual TableKeep renderer. NOT Word/WPS/Pages paste or physical tray interaction. Edited amount is a deliberate, labeled test.',checks:[]};
 const record=(name,value)=>report.checks.push({name,...value});
 const win=new BrowserWindow({show:false,width:460,height:600,frame:false,webPreferences:{preload:path.join(repo,'preload.cjs'),sandbox:true,contextIsolation:true}});
 const browser=new BrowserWindow({show:false,width:1120,height:740,webPreferences:{sandbox:true,contextIsolation:true}});
 const execute=async(w,s)=>{const r=await w.webContents.executeJavaScript(`(()=>{try{return {ok:true,value:eval(${JSON.stringify(s)})};}catch(e){return {ok:false,error:e.stack};}})()`,true);if(!r.ok)throw Error(r.error);return r.value;};
 const js=s=>win.webContents.executeJavaScript(s,true),bj=s=>execute(browser,s);
 for(const [channel,handler] of Object.entries({
  config:()=>settings,preferences:(_e,x)=>{settings={...settings,...x};win.webContents.send('tablekeep:config',settings);return settings;},
  state:()=>true,view:(_e,v)=>{settings.mode=v;win.setSize(v==='popup'?460:1440,v==='popup'?600:844);win.webContents.send('tablekeep:view',v);return v;},
  hide:()=>true,menu:()=>true,clipboard:readClipboard,
  copy:async(_e,x)=>{await writeClipboard(x.html,x.text);ownFingerprint=await fingerprint();copies++;return {collapse:false};},
  save:(_e,x)=>{const file=path.join(out,'TableKeep-demo.'+x.format);fs.writeFileSync(file,x.format==='docx'?Buffer.from(x.data):x.data);saves++;return {name:path.basename(file)};},
  import:()=>null,image:()=>null
 }))ipcMain.handle('tablekeep:'+channel,async(e,...args)=>{try{return {ok:true,value:await handler(e,...args)};}catch(error){return {ok:false,error:error.message};}});
 const shot=async(w,name)=>{if(w===win)await js('document.activeElement?.blur();document.querySelector("#toast").hidden=true');await pause(220);fs.writeFileSync(path.join(out,name+'.png'),(await w.webContents.capturePage()).toPNG());};
 const wait=async(fn)=>{for(let i=0;i<50;i++){if(await fn())return;await pause(80);}throw Error('Timed out waiting for experiment state');};
 try{
  await win.loadFile(path.join(repo,'index.html'),{query:{view:'popup'}});await pause(120);
  const html=await js('TableKeepSamples.get()[0].input');
  const fixture=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>TableKeep clipboard experiment</title><style>body{font:16px/1.6 -apple-system,sans-serif;color:#20372d;margin:32px;background:#fff}header{font-size:13px;color:#53655b;border-bottom:1px solid #d9e2dc;padding-bottom:12px;margin-bottom:20px}h2{font-size:24px;margin:12px 0}table{border-collapse:collapse;width:100%;font-size:16px}th,td{border:1px solid #aebdb2;padding:14px;vertical-align:middle}th{background:#edf3ee}#editor{min-height:540px;outline:none}a{color:#245f46}</style><header id="label">源网页 · 合成数据 / Source webpage · synthetic data</header><article id="editor" contenteditable="true">${html}</article><script src="${path.relative(out,path.join(repo,'engine.js')).split(path.sep).join('/')}"></script></html>`;
  fs.writeFileSync(path.join(out,'source.html'),fixture);
  await browser.loadFile(path.join(out,'source.html'));await pause(200);
  const baselineHTML=await bj('document.querySelector("#editor").innerHTML');
  report.source=await bj('TableKeep.stats(TableKeep.parse(document.querySelector("#editor").innerHTML,{format:"html"}))');
  await shot(browser,'01-source');
  await bj('(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector("#editor"));getSelection().removeAllRanges();getSelection().addRange(r);document.querySelector("#editor").focus();})()');
  browser.webContents.copy();await pause(160);ownFingerprint=await fingerprint();
  const {html:nativeHTML,text:nativeText}=await readClipboard();
  assert.ok(nativeHTML.includes('<table'),'Native webpage copy must supply HTML table');
  const paste=async(kind,label)=>{
   await bj(`document.querySelector('#editor').innerHTML='';document.querySelector('#label').textContent=${JSON.stringify(label)};document.querySelector('#editor').focus()`);
   browser.webContents[kind]();await wait(async()=>!!await bj('document.querySelector("#editor").textContent.trim()'));
   await pause(180);
   const result=await bj(`(()=>{const actual=TableKeep.parse(document.querySelector('#editor').innerHTML,{format:'html'}),source=TableKeep.parse(${JSON.stringify(baselineHTML)},{format:'html'});return {stats:TableKeep.stats(actual),audit:TableKeep.inspect(source,actual),html:document.querySelector('#editor').innerHTML};})()`);
   fs.writeFileSync(path.join(out,kind==='pasteAndMatchStyle'?'plain-paste.html':'rich-paste-latest.html'),result.html);
   return result;
  };
  const direct=await paste('paste','默认富文本粘贴 → Chromium 编辑区 / Native rich-text paste');
  await shot(browser,'02-direct-rich');
  record('direct-rich-text',{stats:direct.stats,audit:direct.audit});
  await writeClipboard(nativeHTML,nativeText);ownFingerprint=await fingerprint();
  const plain=await paste('pasteAndMatchStyle','匹配样式粘贴 → Chromium 编辑区 / Native paste-and-match-style');
  await shot(browser,'03-plain');record('paste-and-match-style',{stats:plain.stats,audit:plain.audit});
  await writeClipboard(nativeHTML,nativeText);ownFingerprint=await fingerprint();
  await js('document.querySelector("#quickPasteButton").click()');await wait(async()=>await js('TableKeepUI.getState().source!==null'));
  const ready=await js('TableKeepUI.getState()');assert.equal(ready.audit.loss,0);
  record('tablekeep-import',{stats:ready.audit.stats,audit:ready.audit});await shot(win,'04-tablekeep-ready');
  await js('document.querySelector("#copyButton").click()');await wait(()=>copies===1);
  const converted=await paste('paste','TableKeep 富文本 → Chromium 编辑区 / TableKeep rich-text paste');
  await shot(browser,'05-tablekeep-paste');record('tablekeep-paste',{stats:converted.stats,audit:converted.audit});
  await pause(1700);
  await js('document.querySelector("#docxButton").click()');await wait(()=>saves===1);
  await js('document.querySelector("#viewButton").click()');await wait(async()=>await js('document.querySelector("#resultPreview").contentEditable==="true"'));
  await js('(()=>{const p=[...document.querySelectorAll("#resultPreview td p")].find(p=>p.textContent==="128.50");if(!p)throw Error("Expected amount missing");p.textContent="999.99";document.querySelector("#resultPreview").dispatchEvent(new Event("input",{bubbles:true}));})()');
  await wait(async()=>await js('TableKeepUI.getState().audit.loss>0'));
  const edited=await js('({audit:TableKeepUI.getState().audit,copyDisabled:document.querySelector("#copyButton").disabled,exportDisabled:document.querySelector("#docxButton").disabled})');
  assert.ok(edited.copyDisabled&&edited.exportDisabled);await js('document.querySelector("#copyButton").click()');assert.equal(copies,1);
  record('deliberate-amount-edit',{from:'128.50',to:'999.99',...edited,copyHandlerWasBlocked:true});
  await js('document.querySelector("#toast").hidden=true;document.activeElement?.blur()');await shot(win,'06-amount-detected-workbench');
  await js('document.querySelector("#viewButton").click()');await wait(async()=>await js('document.querySelector("#resultPreview").contentEditable==="false"'));await shot(win,'07-amount-detected-popup');
  await js('document.querySelector("#viewButton").click()');await pause(150);await js('document.querySelector("#restoreButton").click()');
  assert.equal(await js('TableKeepUI.getState().audit.loss'),0);assert.equal(await js('document.querySelector("#copyButton").disabled'),false);
  record('restore',{loss:0,copyEnabled:true});
  await js('document.querySelector("#viewButton").click()');await pause(150);await shot(win,'08-restored');
  assert.equal(direct.stats.tables,1);assert.equal(converted.stats.tables,1);assert.equal(plain.stats.tables,0);
  report.conclusion='Default rich-text paste also preserved the supported table structure in Chromium. Paste-and-match-style lost table/image structure. TableKeep imported and copied the table and detected a deliberately edited amount. This does not establish that direct paste is generally broken or that Word/WPS final rendering was tested.';
  report.success=true;
 }catch(error){report.success=false;report.error=error.stack;process.exitCode=1;}
 finally{
  if(ownFingerprint&&await fingerprint()===ownFingerprint){if(backup.length)await clipboard.write(backup);else clipboard.clear();report.clipboardRestored=true;}
  else report.clipboardRestored=false;
  fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({success:report.success,error:report.error,source:report.source,checks:report.checks.map(x=>({name:x.name,stats:x.stats,loss:x.audit?.loss,copyDisabled:x.copyDisabled})),clipboardRestored:report.clipboardRestored,out},null,2));
  app.exit(report.success?0:1);
 }
}).catch(error=>{console.error(error);app.exit(1);});
