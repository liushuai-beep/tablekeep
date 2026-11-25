/* Minimal OOXML writer. Tables preserve gridSpan/vMerge and embedded PNG/JPEG/GIF. */
(function(root){
  'use strict';
  const K=root.TableKeep,enc=new TextEncoder();
  const xml=value=>K.esc(String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,''));
  const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  const crc32=bytes=>{let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
  const join=parts=>{const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let off=0;for(const p of parts){result.set(p,off);off+=p.length;}return result;};
  const header=(length,fn)=>{const a=new Uint8Array(length),v=new DataView(a.buffer);fn(v);return a;};
  function zip(files){
    const local=[],central=[];let offset=0;
    for(const [name,content] of Object.entries(files)){
      const nameBytes=enc.encode(name),bytes=typeof content==='string'?enc.encode(content):content,crc=crc32(bytes);
      const head=header(30,v=>{v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,nameBytes.length,true);});
      local.push(head,nameBytes,bytes);
      central.push(header(46,v=>{v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint32(16,crc,true);v.setUint32(20,bytes.length,true);v.setUint32(24,bytes.length,true);v.setUint16(28,nameBytes.length,true);v.setUint32(42,offset,true);}),nameBytes);
      offset+=head.length+nameBytes.length+bytes.length;
    }
    const cent=join(central),count=Object.keys(files).length;
    return join([...local,cent,header(22,v=>{v.setUint32(0,0x06054b50,true);v.setUint16(8,count,true);v.setUint16(10,count,true);v.setUint32(12,cent.length,true);v.setUint32(16,offset,true);})]);
  }
  function makeDOCX(doc,options={}){
    const assets=options.assets||{},files={},relationships=[],imageTypes=new Set();let relseq=0,drawseq=0;
    function relationship(type,target,external=false){const id='rId'+(++relseq);relationships.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${xml(target)}"${external?' TargetMode="External"':''}/>`);return id;}
    relationship('styles','styles.xml');
    function image(run,availableWidth){
      const source=assets[run.id]||run.src;
      if(!K.embeddedImage(source))return `<w:r><w:rPr><w:color w:val="98611C"/></w:rPr><w:t xml:space="preserve">${xml('[待补入图片：'+(run.alt||'无名称')+']')}</w:t></w:r>`;
      const [,type,base64]=source.match(/^data:image\/(png|jpeg|gif);base64,([a-z0-9+/=\s]+)$/i);
      const extension=type.toLowerCase()==='jpeg'?'jpg':type.toLowerCase();
      const binary=atob(base64.replace(/\s/g,'')),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      const filename='image'+(++drawseq)+'.'+extension;files['word/media/'+filename]=bytes;imageTypes.add(extension);
      const size=assets[run.id]&&K.imageDimensions(source),ratio=size?size.height/size.width:(run.height||70)/(run.width||180);
      const rid=relationship('image','media/'+filename),width=Math.min(run.width||180,options.imageMaxWidth||400,Math.max(1,availableWidth/15)),height=ratio*width,cx=Math.round(width*9525),cy=Math.round(height*9525);
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${drawseq}" name="${xml(run.alt||filename)}" descr="${xml(run.alt)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${drawseq}" name="${filename}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    }
    function textRun(run,availableWidth){
      if(run.type==='break')return '<w:r><w:br/></w:r>';
      if(run.type==='image')return image(run,availableWidth);
      const properties=[];
      if(run.bold)properties.push('<w:b/>');if(run.italic)properties.push('<w:i/>');if(run.underline)properties.push('<w:u w:val="single"/>');
      if(run.code)properties.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:shd w:fill="EFF3F0"/>');
      if(run.sup||run.sub)properties.push(`<w:vertAlign w:val="${run.sup?'superscript':'subscript'}"/>`);
      if(run.type==='math')properties.push('<w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/><w:color w:val="8D611E"/>');
      const text=run.type==='math'?run.raw:run.text||'';
      const segments=text.split(/(\n|\t)/).map(s=>s==='\n'?'<w:br/>':s==='\t'?'<w:tab/>':`<w:t xml:space="preserve">${xml(s)}</w:t>`).join('');
      const value=`<w:r>${properties.length?'<w:rPr>'+properties.join('')+'</w:rPr>':''}${segments}</w:r>`;
      return run.href?`<w:hyperlink r:id="${relationship('hyperlink',run.href,true)}">${value}</w:hyperlink>`:value;
    }
    const paragraph=(runs,properties='',availableWidth=9900)=>`<w:p><w:pPr>${properties}<w:spacing w:after="90"/></w:pPr>${runs.map(run=>textRun(run,availableWidth)).join('')}</w:p>`;
    function blockXML(block,availableWidth=9900,alignment='left'){
      const align=['left','right','center'].includes(alignment)?`<w:jc w:val="${alignment}"/>`:'';
      if(block.type==='code')return paragraph([{type:'text',text:block.text,code:true}],align+'<w:shd w:fill="F1F5F2"/>',availableWidth);
      if(block.type==='list')return block.items.map(item=>paragraph([{type:'text',text:block.ordered?item.value+'. ':'• '},...item.runs],align+'<w:ind w:left="260" w:hanging="260"/>',availableWidth)).join('');
      if(block.type!=='table')return paragraph(block.runs||[],align+(block.type==='heading'?`<w:pStyle w:val="Heading${Math.min(block.level,3)}"/>`:''),availableWidth);
      const cols=Math.max(block.colCount,1),width=Math.max(1,Math.floor(availableWidth/cols)),margin=Math.min(110,Math.max(1,Math.floor(width/5))),grid=[];
      block.rows.forEach((row,r)=>row.cells.forEach(cell=>{for(let y=r;y<r+cell.rowSpan;y++){grid[y]||=[];for(let x=cell.col;x<cell.col+cell.colSpan;x++)grid[y][x]=cell;}}));
      const rows=block.rows.map((row,r)=>{
        const cells=[];
        for(let c=0;c<cols;){
          const cell=grid[r]?.[c];
          if(!cell){cells.push(`<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`);c++;continue;}
          if(c!==cell.col){c++;continue;}
          const continuation=cell.row<r,span=cell.colSpan;
          const properties=`<w:tcW w:w="${width*span}" w:type="dxa"/>${span>1?'<w:gridSpan w:val="'+span+'"/>':''}${cell.rowSpan>1?(continuation?'<w:vMerge/>':'<w:vMerge w:val="restart"/>'):''}${cell.header?'<w:shd w:fill="EAF2ED"/>':''}<w:vAlign w:val="top"/>`;
          let content=continuation?'<w:p/>':cell.blocks.map(b=>blockXML(b,Math.max(1,width*span-margin*2),cell.align)).join('')||'<w:p/>';
          if(!content.endsWith('</w:p>')&&!content.endsWith('<w:p/>'))content+='<w:p/>';
          cells.push(`<w:tc><w:tcPr>${properties}</w:tcPr>${content}</w:tc>`);c+=span;
        }
        const allHeader=row.cells.length&&row.cells.every(c=>c.header);
        return `<w:tr><w:trPr>${allHeader?'<w:tblHeader/>':''}</w:trPr>${cells.join('')}</w:tr>`;
      }).join('');
      const borders=['top','left','bottom','right','insideH','insideV'].map(side=>`<w:${side} w:val="single" w:sz="4" w:color="B4C3BA"/>`).join('');
      const table=`<w:tbl><w:tblPr><w:tblW w:w="${width*cols}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="${margin}" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="${margin}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array.from({length:cols},()=>`<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>`;
      return (block.caption?paragraph([{type:'text',text:block.caption,bold:true}]):'')+table;
    }
    const body=doc.blocks.map(b=>blockXML(b)).join('');
    files['word/document.xml']=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/></w:sectPr></w:body></w:document>`;
    files['word/styles.xml']='<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei"/><w:sz w:val="21"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'+[1,2,3].map(level=>`<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="${34-level*3}"/></w:rPr></w:style>`).join('')+'</w:styles>';
    files['word/_rels/document.xml.rels']='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+relationships.join('')+'</Relationships>';
    files['_rels/.rels']='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    files['[Content_Types].xml']='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+Array.from(imageTypes).map(type=>`<Default Extension="${type}" ContentType="image/${type==='jpg'?'jpeg':type}"/>`).join('')+'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
    return new Blob([zip(files)],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  }
  root.TableKeepDOCX={make:makeDOCX,zip};
})(globalThis);
