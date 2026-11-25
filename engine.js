/* TableKeep prototype — independent structural conversion and inspection. */
(function (root) {
  'use strict';
  const MAX_ROWS = 200, MAX_COLS = 40, MAX_TEXT = 180000;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeLink = value => /^(https?:|mailto:)/i.test(value || '') ? value : '';
  const embeddedImage = value => /^data:image\/(png|jpeg|gif);base64,[a-z0-9+/=\s]+$/i.test(value || '');
  const imageType = value => embeddedImage(value) ? 'embedded' : /^data:image\/svg/i.test(value || '') ? 'svg' : 'external';
  const clone = value => JSON.parse(JSON.stringify(value));
  function imageDimensions(source) {
    if(!embeddedImage(source))return null;
    try {
      const bytes=Uint8Array.from(atob(source.slice(source.indexOf(',')+1).replace(/\s/g,'')),char=>char.charCodeAt(0)),view=new DataView(bytes.buffer);
      let width,height;
      if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes.length>=24){width=view.getUint32(16);height=view.getUint32(20);}
      else if(bytes[0]===71&&bytes[1]===73&&bytes[2]===70&&bytes.length>=10){width=view.getUint16(6,true);height=view.getUint16(8,true);}
      else if(bytes[0]===255&&bytes[1]===216){
        let offset=2;
        while(offset+8<bytes.length){if(bytes[offset++]!==255)continue;let marker=bytes[offset++];while(marker===255)marker=bytes[offset++];if(marker===217||marker===218)break;if(marker===216||marker===1||(marker>=208&&marker<=215))continue;const length=view.getUint16(offset);if(length<2)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){height=view.getUint16(offset+3);width=view.getUint16(offset+5);break;}offset+=length;}
      }
      return width>0&&height>0?{width,height}:null;
    }catch{return null;}
  }

  function markdownToHTML(input) {
    const inline = text => {
      const tokens = [];
      const hold = html => `\u0000${tokens.push(html) - 1}\u0000`;
      let s = text.replace(/`([^`]+)`/g, (_, t) => hold(`<code>${esc(t)}</code>`));
      s = s.replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g, (_, alt, src) => hold(`<img src="${esc(src)}" alt="${esc(alt)}">`));
      s = s.replace(/\[([^\]]+)\]\((https?:[^\s)]+)\)/g, (_, t, href) => hold(`<a href="${esc(href)}">${esc(t)}</a>`));
      s = esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
      s = s.replace(/\$([^\s$][^$\n]*?[^\s$]|[^\s$])\$(?!\d)/g, (_, tex) => `<span data-math-source="${tex}">${tex}</span>`);
      return s.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[Number(i)]);
    };
    const splitRow = line => {
      let text = line.trim();
      if (text.startsWith('|')) text = text.slice(1);
      if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
      const cells = []; let current = '', code = false, escaped = false;
      for (let index = 0; index < text.length; index++) {
        const c = text[index];
        if (escaped) { current += c; escaped = false; continue; }
        if (c === '\\' && ['|','\\'].includes(text[index + 1])) { escaped = true; continue; }
        if (c === '`') code = !code;
        if (c === '|' && !code) { cells.push(current.trim()); current = ''; } else current += c;
      }
      if (escaped) current += '\\';
      cells.push(current.trim()); return cells;
    };
    const lines = input.replace(/\r\n?/g, '\n').split('\n');
    const output = [];
    for (let i = 0; i < lines.length;) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (/^\s*(`{3,}|~{3,})/.test(line)) {
        const fence = line.trim().match(/^(`{3,}|~{3,})/)[0]; const code = []; i++;
        while (i < lines.length && !lines[i].trim().startsWith(fence)) code.push(lines[i++]);
        if (i < lines.length) i++;
        output.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); continue;
      }
      if (/^\s*<table\b/i.test(line)) {
        const chunk = [line]; i++;
        while (i < lines.length && !chunk.join('\n').includes('</table>')) chunk.push(lines[i++]);
        output.push(chunk.join('\n')); continue;
      }
      if (i + 1 < lines.length && line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
        const header = splitRow(line), alignments = splitRow(lines[i + 1]).map(value => value.endsWith(':') ? (value.startsWith(':') ? 'center' : 'right') : 'left'); i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
        output.push('<table><thead><tr>' + header.map((x,c) => `<th style="text-align:${alignments[c] || 'left'}">${inline(x)}</th>`).join('') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map((x,c) => `<td style="text-align:${alignments[c] || 'left'}">${inline(x)}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
        continue;
      }
      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) { output.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); i++; continue; }
      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*[-*+]\s+/, ''))}</li>`);
        output.push('<ul>' + items.join('') + '</ul>'); continue;
      }
      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          const item = lines[i++].match(/^\s*(\d+)[.)]\s+(.*)$/);
          items.push(`<li value="${Number(item[1])}">${inline(item[2])}</li>`);
        }
        output.push('<ol>' + items.join('') + '</ol>'); continue;
      }
      const paragraph = [line]; i++;
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*<table|\s*```)/.test(lines[i]) && !(i + 1 < lines.length && lines[i + 1].includes('---') && lines[i].includes('|'))) paragraph.push(lines[i++]);
      output.push('<p>' + paragraph.map(inline).join('<br>') + '</p>');
    }
    return output.join('\n');
  }

  function parse(input, options = {}) {
    input = String(input ?? '');
    if (input.length > 25000000) throw new Error('含图片的内容超过 25 MB，请拆分后导入。');
    if (input.replace(/data:image\/(?:png|jpeg|gif);base64,[a-z0-9+/=\s]+/gi, '[embedded image]').length > MAX_TEXT) throw new Error('内容较长。原型目前最多处理 18 万字符，请分段导入。');
    let seq = 0;
    const used = new Set(), warnings = [];
    const id = element => {
      const original = options.trustIds && element?.getAttribute?.('data-tk-id');
      let value = original && !used.has(original) ? original : 'n' + (++seq);
      while (used.has(value)) value = 'n' + (++seq);
      used.add(value); return value;
    };
    const isHTML = options.format === 'html' || (options.format !== 'markdown' && /<(table|p|div|section|h[1-6]|ul|ol|pre|img|svg)\b/i.test(input));
    const textRows = !isHTML && options.format !== 'markdown' ? input.replace(/\r\n?/g,'\n').replace(/\n+$/,'').split('\n') : [];
    const isTSV = textRows.length > 1 && textRows.every(row => row.includes('\t'));
    const textHTML = isTSV ? '<table><tbody>' + textRows.map(row => '<tr>' + row.split('\t').map(value => '<td>' + esc(value) + '</td>').join('') + '</tr>').join('') + '</tbody></table>' : '';
    const source = new DOMParser().parseFromString(isHTML ? input : isTSV ? textHTML : markdownToHTML(input), 'text/html');
    let count = 0;
    const runNodes = (nodes, inherited = {}) => {
      const runs = [];
      for (const node of nodes) {
        if (++count > 18000) throw new Error('内容结构过于复杂，请一次导入较小的表格。');
        if (node.nodeType === 3) {
          if (node.textContent) runs.push({ type: 'text', text: node.textContent, ...inherited });
          continue;
        }
        if (node.nodeType !== 1) continue;
        const tag = node.tagName.toLowerCase();
        if (['script','style','iframe','object','embed','link','meta','button','input','form'].includes(tag)) continue;
        if (tag === 'br') { runs.push({ type: 'break' }); continue; }
        if (tag === 'img') {
          const src = node.getAttribute('src') || node.getAttribute('data-source-src') || '';
          const size=imageDimensions(src),width=Number(node.getAttribute('width'))||parseFloat(node.style.width)||size?.width||180,height=Number(node.getAttribute('height'))||parseFloat(node.style.height)||(size?width*size.height/size.width:70),scale=Math.min(1,620/width,460/height);
          runs.push({ type: 'image', id: id(node), src, alt: node.getAttribute('alt') || '', width: Math.max(1,Math.round(width*scale)), height: Math.max(1,Math.round(height*scale)) });
          continue;
        }
        if (tag === 'svg') {
          const sid = id(node); runs.push({type:'image',id:sid,src:'data:image/svg+xml,' + encodeURIComponent(node.outerHTML),alt:'SVG 图表',width:240,height:100});
          continue;
        }
        if (node.hasAttribute('data-math-source') || tag === 'math' || node.getAttribute('role') === 'math') {
          const annotation = node.querySelector('annotation[encoding="application/x-tex"]');
          const raw = node.getAttribute('data-math-source') || annotation?.textContent || node.textContent;
          runs.push({ type: 'math', id: id(node), raw, display: node.getAttribute('display') === 'block' }); continue;
        }
        const next = {...inherited};
        if (['strong','b'].includes(tag) || Number(node.style.fontWeight) >= 600 || node.style.fontWeight === 'bold') next.bold = true;
        if (['em','i'].includes(tag) || node.style.fontStyle === 'italic') next.italic = true;
        if (tag === 'u') next.underline = true;
        if (tag === 'code') next.code = true;
        if (tag === 'sup') next.sup = true;
        if (tag === 'sub') next.sub = true;
        if (tag === 'a' && safeLink(node.getAttribute('href'))) next.href = safeLink(node.getAttribute('href'));
        if (/^#[0-9a-f]{6}$/i.test(node.style.color)) next.color = node.style.color.slice(1);
        runs.push(...runNodes(Array.from(node.childNodes), next));
      }
      return runs;
    };
    const parseBlocks = (container, depth = 0) => {
      if (depth > 6) throw new Error('嵌套层级过深。请拆分表格后导入。');
      const blocks = []; let pending = [];
      const flush = () => {
        if (pending.length && pending.some(n => n.nodeType === 1 || n.textContent.trim())) blocks.push({type:'paragraph',id:id(null),runs:runNodes(pending)});
        pending = [];
      };
      for (const node of Array.from(container.childNodes)) {
        if (node.nodeType === 3) { if (node.textContent.trim()) pending.push(node); continue; }
        if (node.nodeType !== 1) continue;
        const tag = node.tagName.toLowerCase();
        if (['script','style','iframe','object','embed','link','meta','button','input','form'].includes(tag)) continue;
        if (tag === 'table') { flush(); blocks.push(parseTable(node, depth + 1)); }
        else if (['div','section','article','main','header','footer','figure','figcaption','blockquote'].includes(tag)) { flush(); blocks.push(...parseBlocks(node, depth + 1)); }
        else if (tag === 'pre') { flush(); blocks.push({type:'code',id:id(node),text:node.textContent}); }
        else if (['ul','ol'].includes(tag)) {
          flush();
          const lid = id(node); let number = Number(node.getAttribute('start')) || 1;
          const items = Array.from(node.children).filter(n => n.tagName === 'LI').map(li => {
            const value = li.hasAttribute('value') ? Number(li.getAttribute('value')) : number;
            number = value + 1;
            return {id:id(li),value,runs:runNodes(Array.from(li.childNodes))};
          });
          blocks.push({type:'list',id:lid,ordered:tag==='ol',items});
        } else if (/^(p|h[1-6])$/.test(tag)) { flush(); blocks.push({type:tag === 'p' ? 'paragraph' : 'heading',level:Number(tag[1]) || 0,id:id(node),runs:runNodes(Array.from(node.childNodes))}); }
        else pending.push(node);
      }
      flush(); return blocks;
    };
    const parseTable = (element, depth) => {
      const tid = id(element);
      const rowElements = Array.from(element.rows).filter(row => row.closest('table') === element);
      if (rowElements.length > MAX_ROWS) throw new Error('原型每张表格最多支持 200 行，请分段导入。');
      const rows = [], occupied = [];
      rowElements.forEach((row, r) => {
        occupied[r] ||= []; let col = 0; const cells = [];
        for (const cell of Array.from(row.cells)) {
          while (occupied[r][col]) col++;
          const group = row.parentElement;
          const remaining = ['THEAD','TBODY','TFOOT'].includes(group.tagName) ? group.rows.length - row.sectionRowIndex : rowElements.length - r;
          const rs = cell.rowSpan === 0 ? remaining : Math.min(cell.rowSpan, remaining);
          const cs = cell.colSpan;
          if (col + cs > MAX_COLS) throw new Error('原型每张表格最多支持 40 列，请分段导入。');
          for (let y = r; y < r + rs; y++) {
            occupied[y] ||= [];
            for (let x = col; x < col + cs; x++) {
              if (occupied[y][x]) warnings.push({severity:'warning',title:'表格的合并区域发生重叠',detail:'输入中存在相互重叠的单元格，请核对原始结构。',nodeId:tid});
              occupied[y][x] = true;
            }
          }
          const cid = id(cell);
          cells.push({id:cid,row:r,col,rowSpan:rs,colSpan:cs,header:cell.tagName==='TH',align:cell.style.textAlign || 'left',background:cell.style.backgroundColor || '',blocks:parseBlocks(cell, depth)});
          col += cs;
        }
        rows.push({id:id(row),cells});
      });
      const colCount = Math.max(0,...occupied.map(r => r.length));
      return {type:'table',id:tid,caption:element.querySelector(':scope > caption')?.textContent || '',rows,rowCount:rows.length,colCount};
    };
    const blocks = parseBlocks(source.body);
    if (!blocks.length) throw new Error('没有识别到可转换的内容。请粘贴表格、HTML 或 Markdown。');
    return {blocks,warnings,format:isHTML?'HTML 富文本':isTSV?'TSV 表格':'Markdown / 文本'};
  }

  function walk(doc, fn) {
    const visitBlocks = blocks => blocks.forEach(block => {
      fn(block);
      if (block.type === 'table') block.rows.forEach(row => row.cells.forEach(cell => {fn({...cell,type:'cell',tableId:block.id});visitBlocks(cell.blocks);}));
      else if (block.type === 'list') block.items.forEach(item => {fn({...item,type:'item',listId:block.id});item.runs.forEach(fn);});
      else (block.runs || []).forEach(fn);
    });
    visitBlocks(doc.blocks);
  }
  const runText = runs => runs.map(r => r.type==='break'?'\n':r.type==='image'?'':r.type==='math'?r.raw:r.text || '').join('');
  const blockText = blocks => blocks.map(b => b.type==='table'?b.rows.map(r=>r.cells.map(c=>blockText(c.blocks)).join('\t')).join('\n'):b.type==='code'?b.text:b.type==='list'?b.items.map(i=>runText(i.runs)).join('\n'):runText(b.runs || [])).join('\n');
  function stats(doc) {
    const s = {tables:0,cells:0,merges:0,images:0,math:0,codes:0,chars:blockText(doc.blocks).length};
    walk(doc,n=>{if(n.type==='table')s.tables++;if(n.type==='cell'){s.cells++;if(n.rowSpan>1||n.colSpan>1)s.merges++;}if(n.type==='image')s.images++;if(n.type==='math')s.math++;if(n.type==='code')s.codes++;});
    return s;
  }
  function render(doc, options = {}) {
    const assets = options.assets || {};
    const attr = node => ` data-tk-id="${esc(node.id || '')}"`;
    const runsHTML = runs => runs.map(run => {
      if (run.type === 'break') return '<br>';
      if (run.type === 'image') {
        const source = assets[run.id] || run.src;
        const size=assets[run.id]&&imageDimensions(source),height=size?Math.round(run.width*size.height/size.width):run.height;
        if (embeddedImage(source)) return `<img${attr(run)} src="${esc(source)}" alt="${esc(run.alt)}" width="${run.width}" height="${height}" style="max-width:100%;object-fit:contain">`;
        return `<img${attr(run)} data-source-src="${esc(source)}" alt="${esc(run.alt || '待补入图片')}" width="${run.width}" height="${run.height}" class="unresolved-image">`;
      }
      if (run.type === 'math') return `<span${attr(run)} class="math-source" data-math-source="${esc(run.raw)}" title="公式原文；原型暂未转换原生公式">${esc(run.raw)}</span>`;
      let value = esc(run.text);
      if (run.code) value = `<code>${value}</code>`;
      if (run.bold) value = `<strong>${value}</strong>`;
      if (run.italic) value = `<em>${value}</em>`;
      if (run.underline) value = `<u>${value}</u>`;
      if (run.sup) value = `<sup>${value}</sup>`;
      if (run.sub) value = `<sub>${value}</sub>`;
      if (run.href) value = `<a href="${esc(safeLink(run.href))}" target="_blank" rel="noopener noreferrer">${value}</a>`;
      return value;
    }).join('');
    const blocksHTML = blocks => blocks.map(block => {
      if (block.type === 'table') return `<table${attr(block)}>${block.caption?'<caption>'+esc(block.caption)+'</caption>':''}<tbody>${block.rows.map(row=>`<tr${attr(row)}>${row.cells.map(cell=>{
        const tag=cell.header?'th':'td';
        return `<${tag}${attr(cell)} rowspan="${cell.rowSpan}" colspan="${cell.colSpan}" style="text-align:${['left','right','center'].includes(cell.align)?cell.align:'left'}">${blocksHTML(cell.blocks) || '<p></p>'}</${tag}>`;
      }).join('')}</tr>`).join('')}</tbody></table>`;
      if (block.type === 'code') return `<pre${attr(block)}><code>${esc(block.text)}</code></pre>`;
      if (block.type === 'list') {const tag=block.ordered?'ol':'ul';return `<${tag}${attr(block)}>${block.items.map(item=>`<li${attr(item)}${block.ordered?' value="'+item.value+'"':''}>${runsHTML(item.runs)}</li>`).join('')}</${tag}>`;}
      const tag = block.type==='heading'?'h'+Math.min(Math.max(block.level,1),6):'p';
      return `<${tag}${attr(block)}>${runsHTML(block.runs || [])}</${tag}>`;
    }).join('');
    return blocksHTML(doc.blocks);
  }
  function degraded(doc) {
    const out = clone(doc);
    const simplify = blocks => blocks.forEach(block => {
      if (block.type==='table') {
        block.rows.forEach((row,r)=>row.cells.forEach((cell,c)=>{
          cell.rowSpan=1;cell.colSpan=1;cell.row=r;cell.col=c;
          cell.blocks=[{type:'paragraph',id:cell.id+'flat',runs:[{type:'text',text:blockText(cell.blocks).replace(/\n/g,' ')}]}];
        }));
        block.colCount=Math.max(...block.rows.map(r=>r.cells.length));
      } else if (block.type==='code') block.text=block.text.replace(/ {2,}/g,' ').replace(/\n{2,}/g,'\n');
      else if (block.runs) block.runs=block.runs.filter(r=>r.type!=='image').map(r=>r.type==='text'?{...r,code:false,bold:false,italic:false}:r);
    });
    simplify(out.blocks); return out;
  }
  function inspect(original, actual, options = {}) {
    const expected = new Map(), actualNodes = new Map(), issues = [], assets = options.assets || {};
    walk(original,n=>{if(n.id)expected.set(n.id,n);});walk(actual,n=>{if(n.id)actualNodes.set(n.id,n);});
    const seen = new Set();
    const add = item => {const key=item.kind+':'+item.nodeId;if(!seen.has(key)){seen.add(key);issues.push({id:'issue'+issues.length,...item});}};
    let structural=0,textChanged=0,codeChanged=0,imageMissing=0,formulaMissing=0;
    const formatting = blocks => {
      const out=[];
      walk({blocks},n=>{if(n.type==='text'&&n.text.trim())out.push([n.text,!!n.bold,!!n.italic,!!n.underline,!!n.code,!!n.sup,!!n.sub,n.href||'']);});
      return JSON.stringify(out);
    };
    for(const [key,node] of expected) {
      const out=actualNodes.get(key);
      if(node.type==='table') {
        if(!out){structural++;add({severity:'loss',kind:'table',nodeId:key,title:'整张表格缺失',detail:'转换结果中未找到对应表格。'});}
      }
      if(node.type==='cell') {
        if(!out || node.colSpan!==out.colSpan || node.rowSpan!==out.rowSpan || node.col!==out.col || node.row!==out.row){structural++;add({severity:'loss',kind:'merge',nodeId:key,tableId:node.tableId,title:!out?'单元格缺失':'合并关系或位置发生变化',detail:`原位置：第 ${node.row+1} 行、第 ${node.col+1} 列；跨 ${node.rowSpan} 行、${node.colSpan} 列。`,repair:'restore'});}
        if(out && blockText(node.blocks)!==blockText(out.blocks)){textChanged++;add({severity:'loss',kind:'text',nodeId:key,tableId:node.tableId,title:'单元格文字或换行改变',detail:'原文和结果不一致。请检查换行、数字或单元格中的代码。',repair:'restore'});}
        if(out && blockText(node.blocks)===blockText(out.blocks) && formatting(node.blocks)!==formatting(out.blocks))add({severity:'loss',kind:'formatting',nodeId:key,tableId:node.tableId,title:'单元格的强调或链接改变',detail:'已对比加粗、斜体、上下标、代码标记和链接地址。',repair:'restore'});
      }
      if(node.type==='code') {
        if(!out || out.text!==node.text){codeChanged++;add({severity:'loss',kind:'code',nodeId:key,title:'代码原文被改动',detail:'字符、缩进或空行与输入不一致。',repair:'restore'});}
      }
      if(node.type==='image') {
        if(!out){imageMissing++;add({severity:'loss',kind:'image',nodeId:key,title:'图片在转换中丢失',detail:node.alt?`缺少图片「${node.alt}」。`:'结果中没有对应的图片。',repair:'restore'});}
        else if((assets[key]||node.src)!==out.src){imageMissing++;add({severity:'loss',kind:'image-change',nodeId:key,title:'图片来源发生变化',detail:'转换结果中的图片引用与原始内容不一致。',repair:'restore'});}
        const image=assets[key]||node.src;
        if(imageType(image)==='external')add({severity:'warning',kind:'external-image',nodeId:key,title:'一张图片尚未嵌入',detail:'输入只有外部或相对路径。为避免自动联网，原型没有下载；可从本机补入。',repair:'image'});
        if(imageType(image)==='svg')add({severity:'warning',kind:'svg',nodeId:key,title:'SVG 需要转为图片',detail:'已保留原始 SVG，原型暂未将其转为 Office 可嵌入的图片。可补入 PNG/JPEG。',repair:'image'});
      }
      if(node.type==='math') {
        if(!out||out.raw!==node.raw){formulaMissing++;add({severity:'loss',kind:'math-loss',nodeId:key,title:'公式原文缺失或改变',detail:'无法找到内容一致的原始公式。',repair:'restore'});}
        add({severity:'warning',kind:'math',nodeId:key,title:'公式保留为原文',detail:'此原型还未生成 Word 原生可编辑公式；导出时将明确保留 LaTeX/MathML 原文。'});
      }
      if(node.type==='list'&&node.ordered && out?.type==='list' && JSON.stringify(node.items.map(x=>x.value))!==JSON.stringify(out.items.map(x=>x.value)))add({severity:'loss',kind:'numbering',nodeId:key,title:'列表编号发生变化',detail:'原始编号与结果中的编号不同。',repair:'restore'});
      if(node.type==='list') {
        if(!out || out.type!=='list' || node.ordered!==out.ordered || blockText([node])!==blockText([out])) {
          textChanged++;add({severity:'loss',kind:'list-text',nodeId:key,title:'列表内容或类型发生变化',detail:'列表的文字、条目或有序/无序类型与输入不同。',repair:'restore'});
        } else if(formatting([node])!==formatting([out]))add({severity:'loss',kind:'formatting',nodeId:key,title:'列表的强调或链接改变',detail:'列表中的文字样式或链接地址与输入不同。',repair:'restore'});
      }
    }
    for(const [key,node] of actualNodes){
      if(!expected.has(key) && ['table','paragraph','heading','list','code','image','math'].includes(node.type) && (['table','image','math'].includes(node.type) || blockText([node]).trim())) {
        textChanged++;add({severity:'loss',kind:'added-content',nodeId:key,title:'结果中增加了内容',detail:'这一段内容在输入中不存在，请核对后恢复。',repair:'restore'});
      }
    }
    for(const block of original.blocks){
      if(['paragraph','heading'].includes(block.type)){
        const target=actualNodes.get(block.id);
        if(!target||runText(block.runs)!==runText(target.runs||[])){textChanged++;add({severity:'loss',kind:'body-text',nodeId:block.id,title:'正文文字发生变化',detail:'段落或标题与输入原文不一致。',repair:'restore'});}
        else if(formatting([block])!==formatting([target]))add({severity:'loss',kind:'formatting',nodeId:block.id,title:'正文的强调或链接改变',detail:'段落中的支持样式或链接地址与输入不同。',repair:'restore'});
      }
    }
    // Inline code is compared separately from ordinary formatting.
    const collectInline = doc => {const codes=[];walk(doc,n=>{if(n.type==='text'&&n.code)codes.push(n.text);});return codes;};
    if(JSON.stringify(collectInline(original))!==JSON.stringify(collectInline(actual))){codeChanged++;add({severity:'loss',kind:'inline-code',nodeId:'inline-code',title:'行内代码的内容或代码标记改变',detail:'原文中的代码片段未被完整保留。',repair:'restore'});}
    const plainA=blockText(original.blocks),plainB=blockText(actual.blocks);
    const numberTokens=text=>(text.match(/(?:[$¥￥€£]\s*)?[-+]?\d[\d,.]*(?:\s*[%％])?/g)||[]);
    if(JSON.stringify(numberTokens(plainA))!==JSON.stringify(numberTokens(plainB)))add({severity:'loss',kind:'numbers',nodeId:'numbers',title:'数字、金额或百分比序列改变',detail:'请逐项核对数据。检测序列变化不等于已判断数值的业务含义。',repair:'restore'});
    for(const warning of original.warnings||[])add({...warning,kind:'input-structure'});
    const loss=issues.filter(x=>x.severity==='loss').length, warning=issues.filter(x=>x.severity==='warning').length;
    const checks=[
      {label:'单元格与合并关系',ok:structural===0,detail:structural?`${structural} 处变化`:'行列位置与跨度一致'},
      {label:'文字与换行',ok:textChanged===0,detail:textChanged?`${textChanged} 处变化`:'单元格与正文文字一致'},
      {label:'强调与链接',ok:!issues.some(x=>x.kind==='formatting'),detail:issues.some(x=>x.kind==='formatting')?'存在样式或链接变化':'已核对支持的标记'},
      {label:'代码原文',ok:codeChanged===0,detail:codeChanged?'内容或代码标记改变':'字符与空白保持一致'},
      {label:'图片',ok:imageMissing===0&&!issues.some(x=>['external-image','svg'].includes(x.kind)),detail:imageMissing?'存在缺失图片':issues.some(x=>['external-image','svg'].includes(x.kind))?'有图片等待补入':'嵌入图片已保留'},
      {label:'公式原文',ok:formulaMissing===0,detail:formulaMissing?'存在公式原文缺失':'已核对原文；原生公式未转换'}
    ];
    return {issues,loss,warning,checks,stats:stats(original),checked:checks.filter(x=>x.ok).length};
  }
  function exportedHTML(html) {
    const parsed=new DOMParser().parseFromString(html,'text/html');
    const styles={table:'border-collapse:collapse;width:100%;margin:18px 0;font-family:Arial,Microsoft YaHei,sans-serif;font-size:11pt',th:'border:1px solid #aab9b3;padding:9px;vertical-align:top;background:#edf3ef',td:'border:1px solid #aab9b3;padding:9px;vertical-align:top',p:'margin:0 0 6px;line-height:1.6',pre:'white-space:pre-wrap;font-family:Consolas,monospace',code:'white-space:pre-wrap;font-family:Consolas,monospace'};
    for(const [tag,style] of Object.entries(styles))parsed.querySelectorAll(tag).forEach(node=>node.setAttribute('style',style+';'+(node.getAttribute('style')||'')));
    return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>TableKeep 转换结果</title></head><body>'+parsed.body.innerHTML+'</body></html>';
  }
  root.TableKeep={parse,render,stats,inspect,degraded,walk,blockText,runText,clone,esc,embeddedImage,imageType,imageDimensions,exportedHTML};
})(globalThis);
