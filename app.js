(function(){
 'use strict';
 const K=TableKeep,$=id=>document.getElementById(id),desktop=window.tablekeepDesktop;
 const state={source:null,actual:null,audit:null,assets:{},mode:'faithful',edited:false,dirty:false,valid:false,example:null,showAll:false};
 const samples=TableKeepSamples.get();let editTimer,toastTimer,pendingImageId,collapseTimer,reading=false,pendingInspection=false;
 let preferences={pinned:false,collapseAfterCopy:true};
 const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
 if(desktop?.platform==='darwin')document.body.classList.add('desktop-mac');
 let view=new URLSearchParams(location.search).get('view')==='popup'?'popup':'workbench';
 function updateView(next){view=next;clearTimeout(collapseTimer);document.body.classList.toggle('menubar',view==='popup');$('viewButton').textContent=view==='popup'?'展开工作台':'回到菜单栏';controls();}
 function updateConfig(config){preferences=config;$('pinButton').setAttribute('aria-pressed',String(config.pinned));$('pinButton').title=config.pinned?'已固定，点击取消固定':'固定面板，点击其他位置时保持展开';setText('shortcutHint',config.shortcutRegistered?(config.shortcut.includes('Alt')?'⌘⌥V 读取':'⌘⇧V 读取'):config.shortcut?'快捷键被占用 · ⌘V 粘贴':'⌘V 粘贴');}
 const expand=async()=>{if(desktop?.setView)await desktop.setView('workbench');else updateView('workbench');};
 const setText=(id,text)=>$(id).textContent=text;
 const toast=(text,error=false)=>{clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.toggle('error',error);$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4200);};
 function error(text){$('errorBanner').textContent=text;$('errorBanner').hidden=!text;}
 function setSourceTab(code){
  $('sourceEditorWrap').hidden=!code;$('sourcePreview').hidden=code;
  $('sourcePreviewTab').classList.toggle('active',!code);$('sourceCodeTab').classList.toggle('active',code);
  $('sourcePreviewTab').setAttribute('aria-selected',String(!code));$('sourceCodeTab').setAttribute('aria-selected',String(code));
 }
 function examples(){
  $('exampleButtons').innerHTML=samples.map((s,i)=>`<button class="example-button${state.example===s.id?' active':''}" data-example="${K.esc(s.id)}" aria-pressed="${state.example===s.id}" title="${K.esc(s.description)}">${icon(i===0?'table':i===1?'image':'code')}${K.esc(s.name)}</button>`).join('');
 }
 function controls(){
  const available=!!state.source&&state.valid&&!state.dirty&&!pendingInspection;
  document.body.classList.toggle('has-content',!!state.source);
  for(const id of ['copyButton','docxButton','htmlButton','reportButton','faithfulButton','degradedButton'])$(id).disabled=!available;
  if(available&&state.audit?.loss){$('copyButton').disabled=true;$('docxButton').disabled=true;$('htmlButton').disabled=true;}
  $('resultPreview').setAttribute('contenteditable',String(!!state.source&&state.valid&&!state.dirty&&view==='workbench'));
  $('resultPreview').setAttribute('role',view==='popup'?'region':'textbox');
  $('resultPreview').setAttribute('aria-label',view==='popup'?'转换预览，可在工作台编辑':'转换结果，可编辑并检查内容变化');
  if(view==='popup')$('resultPreview').removeAttribute('aria-multiline');else $('resultPreview').setAttribute('aria-multiline','true');
  $('restoreButton').hidden=!(state.mode==='degraded'||state.edited);
  $('faithfulButton').classList.toggle('active',state.mode==='faithful');$('faithfulButton').setAttribute('aria-pressed',String(state.mode==='faithful'));
  $('degradedButton').classList.toggle('active',state.mode==='degraded');$('degradedButton').setAttribute('aria-pressed',String(state.mode==='degraded'));
  $('simulationNotice').hidden=state.mode!=='degraded';$('editedFlag').hidden=!state.edited;
  $('emptyResult').hidden=!!state.source;$('resultPreview').hidden=!state.source;
  document.querySelector('.result-panel').classList.toggle('is-stale',state.dirty||!state.valid);
  const a=state.audit,ready=available&&a;
  $('quickAudit').disabled=!ready;
  $('quickAudit').className='quick-audit '+(!ready?'neutral':a.loss?'loss':a.warning?'warning':'success');
  setText('quickAuditTitle',!ready?(pendingInspection?'正在检查变化':state.source?'等待重新转换':'等待粘贴内容'):a.loss?`发现 ${a.loss} 处内容变化`:a.warning?`${a.warning} 项需要确认`:'支持的结构已保留');
  setText('quickAuditDetail',!ready?'只在你操作时读取，不保存粘贴历史。':a.loss?'展开查看变化；恢复完整内容后再导出。':a.warning?'展开查看限制或从本机补入图片。':`${a.stats.tables} 张表格 · ${a.stats.merges} 处合并 · 查看详细检查`);
  const tables=[];if(state.actual)K.walk(state.actual,node=>{if(node.type==='table')tables.push(node);});
  const cols=Math.max(0,...tables.map(table=>table.colCount));
  $('resultPreview').style.setProperty('--table-min-width',Math.min(2400,cols*92)+'px');
  setText('previewMetadata',tables.length===1?`${tables[0].rowCount} 行 × ${cols} 列`:tables.length?`${tables.length} 张表格`:state.source?'文本片段':'');
  setText('quickSourceLabel',state.source?`${state.source.format} · ${state.example?'演示数据':'当前内容'}`:'HTML · Markdown · TSV');
  desktop?.updateState?.({hasContent:!!state.source&&state.valid,canExport:!!available&&!a?.loss}).catch(()=>{});
 }
 function neutral(title,subtitle){
  $('auditSummary').className='audit-summary neutral';setText('auditTitle',title);setText('auditSubtitle',subtitle);
  $('auditSymbol').innerHTML=icon('info');$('resultState').className='state-label neutral';$('resultState').innerHTML=icon('info')+K.esc(title);
  setText('exportTitle',title);setText('exportHint',subtitle);controls();
 }
 function applyInput(input,format='auto',example=null){
  clearTimeout(collapseTimer);clearTimeout(editTimer);clearTimeout(toastTimer);$('toast').hidden=true;pendingInspection=false;setText('copyLabel','复制富文本');
  error('');state.example=example;state.showAll=false;
  try{
   const doc=K.parse(input,{format});state.source=doc;state.assets={};state.mode='faithful';state.edited=false;state.dirty=false;state.valid=true;
   $('sourceEditor').value=input;setText('inputFormat',doc.format);
   $('sourcePreview').innerHTML=K.render(doc);
   renderResult();examples();if(view==='popup')$('copyButton').focus({preventScroll:true});
  }catch(err){state.valid=false;error(err.message);neutral('输入需要调整','请检查输入后重新转换。');examples();}
 }
 function renderResult(){
  if(!state.source)return;
  const doc=state.mode==='degraded'?K.degraded(state.source):K.clone(state.source);
  $('resultPreview').innerHTML=K.render(doc,{assets:state.assets});state.edited=false;inspectDOM();
 }
 function inspectDOM(){
  pendingInspection=false;
  if(!state.source||!state.valid)return;
  try{
   const actual=K.parse($('resultPreview').innerHTML,{format:'html',trustIds:true});
   state.actual=actual;state.audit=K.inspect(state.source,actual,{assets:state.assets});renderInspection();controls();
  }catch(err){
   // Removing every result node is a real loss, not an input parsing error.
   state.actual={blocks:[],warnings:[],format:'HTML 富文本'};state.audit=K.inspect(state.source,state.actual,{assets:state.assets});renderInspection();controls();
  }
 }
 function renderInspection(){
  const a=state.audit,s=a.stats,status=a.loss?'loss':a.warning?'warning':'success';
  $('auditSummary').className='audit-summary '+status;$('auditSymbol').innerHTML=icon(status==='success'?'check':'warning');
  setText('auditTitle',a.loss?`发现 ${a.loss} 处内容变化`:a.warning?`${a.warning} 项需要确认`:'支持的结构已保留');
  setText('auditSubtitle',a.loss?'点击问题，定位到对应内容。':a.warning?'已保留的位置仍有转换限制。':'已核对转换前后的内容结构。');
  $('resultState').className='state-label '+status;$('resultState').innerHTML=icon(status==='success'?'check':'warning')+K.esc(a.loss?'检测到变化':a.warning?'有待确认项':'结构已保留');
  setText('checkCount',`${a.checks.length} 项核对`);
  $('inputStats').innerHTML=`<span><strong>${s.tables}</strong> 张表格</span><span><strong>${s.cells}</strong> 个单元格</span><span><strong>${s.merges}</strong> 处合并</span><span><strong>${s.images}</strong> 张图片</span>`;
  $('checkList').innerHTML=a.checks.map(c=>`<div class="check-row">${icon(c.ok?'check':'warning').replace('class="icon"','class="icon '+(c.ok?'':'warning')+'"')}<div class="check-text"><strong>${K.esc(c.label)}</strong><span>${K.esc(c.detail)}</span></div></div>`).join('');
  $('issuesSection').hidden=!a.issues.length;setText('issueCount',a.issues.length+' 项');
  const visible=state.showAll?a.issues:a.issues.slice(0,4);
  $('issueList').innerHTML=visible.map(item=>`<article class="issue-item ${item.severity}"><button class="issue-focus" data-issue="${item.id}" title="定位对应内容">${icon('warning')}<span><strong>${K.esc(item.title)}</strong><p>${K.esc(item.detail)}</p></span></button>${item.repair==='image'?`<button class="text-button" data-image="${K.esc(item.nodeId)}">${icon('image')}从本机补入图片</button>`:''}</article>`).join('')+(a.issues.length>4&&!state.showAll?`<button class="more-issues" id="showAllIssues">展开其余 ${a.issues.length-4} 项</button>`:'');
  setText('exportTitle',a.loss?'先恢复完整内容，再导出':a.warning?'可导出，仍有转换限制':'内容已准备好');
  setText('exportHint',a.loss?'保留原始内容后，可重新复制或导出。':a.warning?'未补入的图片将显示占位文字；公式以原文保留。':'合并结构与嵌入图片将写入导出文件。');
 }
 function focusIssue(issue){
  $('resultPreview').querySelectorAll('.selected-finding,.selected-cell').forEach(n=>n.classList.remove('selected-finding','selected-cell'));
  let node=$('resultPreview').querySelector(`[data-tk-id="${CSS.escape(issue.nodeId)}"]`);
  if(!node&&issue.tableId)node=$('resultPreview').querySelector(`[data-tk-id="${CSS.escape(issue.tableId)}"]`);
  if(node){node.classList.add('selected-finding');node.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center',inline:'nearest'});}
  else toast('这是跨多个位置的变化，请核对结果或恢复保真转换。');
 }
 async function readClipboard(){
  if(reading)return;reading=true;clearTimeout(collapseTimer);
  const button=$('pasteButton');button.disabled=true;$('quickPasteButton').disabled=true;$('quickPasteButton').setAttribute('aria-busy','true');$('quickPasteButton').querySelector('span').textContent='正在读取…';
  try{
   let data;
   if(desktop)data=await desktop.readClipboard();
   else if(navigator.clipboard?.read){
    data={html:'',text:''};const items=await navigator.clipboard.read();
    for(const item of items){for(const [type,key] of [['text/html','html'],['text/plain','text']])if(item.types.includes(type))data[key]=await(await item.getType(type)).text();}
   }else data={text:await navigator.clipboard.readText()};
   if(!data.html&&!data.text){toast('剪贴板里没有可读取的表格或文本。',true);return;}
   applyInput(data.html||data.text,data.html?'html':'auto');toast('已读取剪贴板并完成检查。');
  }catch(err){await expand();setSourceTab(true);$('sourceEditor').focus();toast('未能读取剪贴板，可以直接粘贴到输入框。',true);}
  finally{reading=false;button.disabled=false;$('quickPasteButton').disabled=false;$('quickPasteButton').removeAttribute('aria-busy');$('quickPasteButton').querySelector('span').textContent='读取剪贴板';}
 }
 async function importDocument(){
  try{
   if(desktop){const file=await desktop.importDocument();if(file){applyInput(file.content,file.format);toast('已导入 '+file.name);}}
   else $('fileInput').click();
  }catch(err){toast(err.message,true);}
 }
 async function readFile(file){
  if(!file)return;if(!/\.(html?|md|markdown|txt|tsv)$/i.test(file.name)){toast('不支持此文件类型。请使用 HTML、Markdown、TXT 或 TSV；DOCX 目前只支持导出。',true);return;}if(file.size>25000000){toast('文件超过 25 MB，请拆分内容。',true);return;}
  applyInput(await file.text(),/\.html?$/i.test(file.name)?'html':/\.(md|markdown)$/i.test(file.name)?'markdown':'auto');toast('已导入 '+file.name);
 }
 async function imageFile(file){
  if(!file||!pendingImageId)return;
  if(file.size>10000000){toast('图片超过 10 MB，请压缩后再补入。',true);return;}
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('未能读取这张图片。'));reader.readAsDataURL(file);});
  if(!K.embeddedImage(data)){toast('请选择 PNG、JPEG 或 GIF 图片。',true);return;}
  attachImage(pendingImageId,data);
 }
 function attachImage(id,data){state.assets[id]=data;renderResult();toast('图片已嵌入，检查结果已更新。');}
 async function addImage(id){
  pendingImageId=id;
  try{if(desktop){const image=await desktop.importImage();if(image)attachImage(id,image.data);}else{$('imageInput').value='';$('imageInput').click();}}
  catch(err){toast(err.message,true);}
 }
 function clear(){
  clearTimeout(editTimer);clearTimeout(collapseTimer);clearTimeout(toastTimer);$('toast').hidden=true;pendingInspection=false;setText('copyLabel','复制富文本');
  state.source=null;state.actual=null;state.audit=null;state.example=null;state.dirty=false;state.valid=false;state.assets={};state.mode='faithful';state.edited=false;
  $('sourceEditor').value='';$('sourcePreview').innerHTML='<div class="empty-state"><h3>放入你的内容</h3><p>读取剪贴板，或拖入一份 HTML / Markdown 文件。</p></div>';$('resultPreview').innerHTML='';$('checkList').innerHTML='';$('inputStats').innerHTML='';$('issuesSection').hidden=true;error('');neutral('等待输入内容','选择示例或导入你自己的内容。');examples();
 }
 async function save(format){
  if(pendingInspection){clearTimeout(editTimer);inspectDOM();}
  if(!state.source||!state.actual||state.dirty||!state.valid)return;
  if(state.audit?.loss&&format!=='json'){toast('检测到内容变化，请先在工作台恢复完整结果。',true);return;}
  const button=$(format==='docx'?'docxButton':format==='html'?'htmlButton':'reportButton');button.disabled=true;
  try{
   let blob;
   if(format==='docx')blob=TableKeepDOCX.make(state.actual,{assets:state.assets});
   else if(format==='html')blob=new Blob([K.exportedHTML(K.render(state.actual,{assets:state.assets}))],{type:'text/html;charset=utf-8'});
   else blob=new Blob([JSON.stringify({prototype:'TableKeep 0.3',mode:state.mode,edited:state.edited,scope:'对已识别结构进行检查；不代表 Word/WPS 最终显示验证。',summary:{loss:state.audit.loss,warning:state.audit.warning},stats:state.audit.stats,checks:state.audit.checks,issues:state.audit.issues},null,2)],{type:'application/json;charset=utf-8'});
   if(desktop){const result=await desktop.saveFile({format,data:format==='docx'?Array.from(new Uint8Array(await blob.arrayBuffer())):await blob.text()});if(result)toast('已导出 '+result.name);}
   else{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='TableKeep-result.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('已导出文件。');}
  }catch(err){toast('导出未完成：'+err.message,true);}finally{controls();}
 }
 async function copy(){
  if(pendingInspection){clearTimeout(editTimer);inspectDOM();}
  if(!state.actual||!state.valid||state.dirty||state.audit?.loss)return;
  try{
   const html=K.exportedHTML(K.render(state.actual,{assets:state.assets})),text=K.blockText(state.actual.blocks);
   let result;if(desktop)result=await desktop.copyResult({html,text});
   else if(navigator.clipboard?.write)await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([text],{type:'text/plain'})})]);
   else throw new Error('请使用文件导出。');
   if(view!=='popup')toast(state.audit.warning?'已复制富文本；待确认项仍会保留。':'已复制富文本，可以粘贴到办公软件。');
   setText('copyLabel','已复制');clearTimeout(collapseTimer);
   collapseTimer=setTimeout(()=>{if(result?.collapse)desktop?.hide?.();setText('copyLabel','复制富文本');},result?.collapse?280:1600);
  }catch(err){toast('未能复制，请改用 DOCX 或 HTML 导出。',true);}
 }
 $('exampleButtons').addEventListener('click',event=>{const button=event.target.closest('[data-example]');if(button){const s=samples.find(s=>s.id===button.dataset.example);applyInput(s.input,s.format,s.id);setSourceTab(false);}});
 $('sourcePreviewTab').onclick=()=>setSourceTab(false);$('sourceCodeTab').onclick=()=>{setSourceTab(true);$('sourceEditor').focus();};
 $('sourceEditor').addEventListener('input',()=>{state.dirty=true;error('');neutral('输入已修改','点击“转换并检查”更新结果。');});
 $('sourceEditor').addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();applyInput($('sourceEditor').value);}});
 $('sourceEditor').addEventListener('paste',event=>{const html=event.clipboardData?.getData('text/html');if(html){event.preventDefault();$('sourceEditor').value=html;state.dirty=true;neutral('输入已修改','已读取富文本，请点击“转换并检查”。');}});
 $('convertButton').onclick=()=>applyInput($('sourceEditor').value);
 $('pasteButton').onclick=readClipboard;$('importButton').onclick=importDocument;$('clearButton').onclick=clear;
 $('fileInput').onchange=event=>readFile(event.target.files[0]);$('imageInput').onchange=event=>imageFile(event.target.files[0]).catch(err=>toast(err.message,true));
 $('faithfulButton').onclick=()=>{state.mode='faithful';state.showAll=false;renderResult();};
 $('degradedButton').onclick=()=>{state.mode='degraded';state.showAll=false;renderResult();};
 $('restoreButton').onclick=()=>{state.mode='faithful';state.showAll=false;renderResult();toast('已从输入原文恢复保真结果。');};
 $('resultPreview').addEventListener('input',()=>{state.edited=true;pendingInspection=true;clearTimeout(editTimer);controls();editTimer=setTimeout(inspectDOM,180);});
 $('resultPreview').addEventListener('paste',event=>{event.preventDefault();document.execCommand('insertText',false,event.clipboardData?.getData('text/plain')||'');});
 $('resultPreview').addEventListener('click',event=>{if(event.target.closest('a')){event.preventDefault();toast('链接地址已保留；预览中不打开外部网页。');}const cell=event.target.closest('td,th');if(cell){$('resultPreview').querySelectorAll('.selected-cell').forEach(n=>n.classList.remove('selected-cell'));cell.classList.add('selected-cell');}});
 $('issueList').addEventListener('click',event=>{const img=event.target.closest('[data-image]');if(img){addImage(img.dataset.image);return;}const button=event.target.closest('[data-issue]');if(button)focusIssue(state.audit.issues.find(i=>i.id===button.dataset.issue));if(event.target.closest('#showAllIssues')){state.showAll=true;renderInspection();}});
 $('sourcePreview').addEventListener('click',event=>{if(event.target.closest('a'))event.preventDefault();});
 $('aboutButton').onclick=()=>$('aboutPanel').hidden=!$('aboutPanel').hidden;$('closeAbout').onclick=()=>$('aboutPanel').hidden=true;
 $('copyButton').onclick=copy;$('docxButton').onclick=()=>save('docx');$('htmlButton').onclick=()=>save('html');$('reportButton').onclick=()=>save('json');
 for(const type of ['dragenter','dragover'])$('sourceDrop').addEventListener(type,event=>{event.preventDefault();$('sourceDrop').classList.add('dragging');});
 $('sourceDrop').addEventListener('dragleave',()=>$('sourceDrop').classList.remove('dragging'));
 $('sourceDrop').addEventListener('drop',event=>{event.preventDefault();$('sourceDrop').classList.remove('dragging');const file=event.dataTransfer?.files[0];if(file)readFile(file);else{const data=event.dataTransfer?.getData('text/html')||event.dataTransfer?.getData('text/plain');if(data)applyInput(data);}});
 $('viewButton').onclick=()=>desktop?.setView?desktop.setView(view==='popup'?'workbench':'popup'):updateView(view==='popup'?'workbench':'popup');
 $('hideButton').onclick=()=>desktop?.hide?.();
 $('pinButton').onclick=async()=>{try{updateConfig(await desktop.updatePreferences({pinned:!preferences.pinned}));}catch(err){toast('设置未能保存，请重试。',true);}};
 $('moreButton').onclick=()=>desktop?.showMenu?.();
 $('quickPasteButton').onclick=readClipboard;$('quickImport').onclick=importDocument;$('quickClear').onclick=clear;
 $('quickExample').onclick=()=>applyInput(samples[0].input,samples[0].format,samples[0].id);
 $('quickAudit').onclick=async()=>{await expand();$('inspectionTitle').scrollIntoView({block:'nearest'});};
 desktop?.onView?.(updateView);desktop?.onConfig?.(updateConfig);desktop?.onCommand?.(command=>{clearTimeout(collapseTimer);if(command==='paste')readClipboard();if(command==='import')importDocument();if(command==='copy')copy();if(command==='docx')save('docx');if(command==='html')save('html');if(command==='report')save('json');if(command==='clear')clear();if(command==='help')expand().then(()=>$('aboutPanel').hidden=false);if(command==='preferences-error')toast('设置未能保存，请重试。',true);});
 desktop?.getConfig?.().then(config=>{updateConfig(config);updateView(config.mode);});
 document.addEventListener('paste',event=>{if(view==='popup'&&!event.target.closest('textarea,[contenteditable="true"]')){const html=event.clipboardData?.getData('text/html'),text=event.clipboardData?.getData('text/plain');if(html||text){event.preventDefault();applyInput(html||text,html?'html':'auto');}}});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){$('aboutPanel').hidden=true;$('toast').hidden=true;if(view==='popup')desktop?.hide?.();}if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();copy();}});
 const previewScroll=document.querySelector('.result-scroll');
 for(const type of ['dragenter','dragover'])previewScroll.addEventListener(type,event=>{if(view==='popup'){event.preventDefault();previewScroll.classList.add('dragging');}});
 previewScroll.addEventListener('dragleave',()=>previewScroll.classList.remove('dragging'));
 previewScroll.addEventListener('drop',event=>{if(view!=='popup')return;event.preventDefault();previewScroll.classList.remove('dragging');const file=event.dataTransfer?.files[0];if(file)readFile(file);else{const html=event.dataTransfer?.getData('text/html'),text=event.dataTransfer?.getData('text/plain');if(html||text)applyInput(html||text,html?'html':'auto');}});
 window.TableKeepUI={applyInput,getState:()=>({source:K.clone(state.source),actual:K.clone(state.actual),audit:K.clone(state.audit),assets:{...state.assets},mode:state.mode,edited:state.edited,dirty:state.dirty,valid:state.valid}),attachImage};
 updateView(view);clear();
})();
