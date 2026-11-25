(function(root){
  'use strict';
  function chart(){
    const canvas=document.createElement('canvas');canvas.width=240;canvas.height=76;
    const c=canvas.getContext('2d');c.fillStyle='#f2f7f4';c.fillRect(0,0,240,76);
    c.strokeStyle='#d7e4dd';c.lineWidth=1;c.beginPath();c.moveTo(10,59);c.lineTo(230,59);c.stroke();
    c.beginPath();c.strokeStyle='#34755a';c.lineWidth=3;
    [48,39,44,29,32,17,10].forEach((y,i)=>i?c.lineTo(14+i*34,y+6):c.moveTo(14,y+6));c.stroke();
    c.fillStyle='#34755a';c.beginPath();c.arc(218,16,4,0,Math.PI*2);c.fill();
    return canvas.toDataURL('image/png');
  }
  function get(){
    const image=chart();
    return [
      {id:'merged',name:'复杂合并表格',description:'多级表头、跨行合并与嵌入图片',format:'html',input:`<h2>区域经营简报</h2>
<p>2026 年第三季度 · 以下数据为原型演示数据</p>
<table>
  <thead>
    <tr>
      <th rowspan="2">区域</th>
      <th rowspan="2">负责人</th>
      <th colspan="2">经营指标</th>
      <th rowspan="2">备注与趋势</th>
    </tr>
    <tr><th>营收（万元）</th><th>同比</th></tr>
  </thead>
  <tbody>
    <tr>
      <td rowspan="2"><strong>华东</strong></td>
      <td>林予</td><td>128.50</td><td><strong>+18.2%</strong></td>
      <td><strong>重点增长</strong><br>新客户贡献 32%<br><img src="${image}" alt="华东季度增长趋势" width="120" height="38"></td>
    </tr>
    <tr><td>陈安</td><td>96.80</td><td>+12.6%</td><td>回款完成<br><em>保留单元格换行</em></td></tr>
    <tr><td><strong>华南</strong></td><td>苏禾</td><td>112.30</td><td>+15.4%</td><td><a href="https://example.com/report">查看资料链接</a><br>编号：000182</td></tr>
  </tbody>
</table>
<p>口径说明：营收按确认收入统计，编号中的前导零属于原始内容。</p>`},
      {id:'images',name:'图片待补入',description:'外部图片保留位置，提示手动补入',format:'html',input:`<h2>项目交付清单</h2>
<p>演示数据 · 外部图片不会自动下载</p>
<table>
  <tr><th>项目</th><th>交付内容</th><th>状态</th></tr>
  <tr><td rowspan="2"><strong>网站改版</strong></td><td>首页视觉稿<br><img src="https://example.invalid/design.png" alt="首页视觉稿" width="150" height="80"></td><td>待确认</td></tr>
  <tr><td>组件说明<br><strong>按钮与表单</strong><br>链接：<a href="https://example.com/spec">设计说明</a></td><td>已完成</td></tr>
  <tr><td>报价</td><td colspan="2">金额 ¥ 12,800.00<br>交付日期：2026-12-08</td></tr>
</table>`},
      {id:'protected',name:'代码与金额混排',description:'保护空格、代码和金额；公式保留原文',format:'html',input:`<h2>配置与计费说明</h2>
<p>演示数据 · Prices: $ 5 and $ 10.</p>
<table>
  <tr><th>内容类型</th><th>原始内容</th></tr>
  <tr><td>行内代码</td><td>请运行 <code>echo "$ HOME $"</code>，空格应保持原样。</td></tr>
  <tr><td>配置片段</td><td><pre><code>if enabled:
    amount = 128.50


    print("$ HOME $")</code></pre></td></tr>
  <tr><td>公式</td><td><span data-math-source="E = mc^2">E = mc^2</span><br>原型保留公式原文，不生成原生公式。</td></tr>
  <tr><td>标识符</td><td>编号 000182<br>版本 1.0.03</td></tr>
</table>
<ol><li value="3">第三题</li><li value="7">第七题</li><li value="12">第十二题</li></ol>`}
    ];
  }
  root.TableKeepSamples={get};
})(globalThis);
