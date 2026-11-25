const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const assert = require('node:assert/strict');

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  try {
    await window.loadFile(path.join(__dirname, 'harness.html'));
    const result = await window.webContents.executeJavaScript(`(async()=>{
      const K=TableKeep,checks=[];
      for(const sample of TableKeepSamples.get()){
        const source=K.parse(sample.input,{format:sample.format});
        const actual=K.parse(K.render(source),{format:'html',trustIds:true});
        const audit=K.inspect(source,actual);
        const damaged=K.parse(K.render(K.degraded(source)),{format:'html',trustIds:true});
        const binary=new Uint8Array(await TableKeepDOCX.make(actual).arrayBuffer());
        checks.push({name:sample.id,loss:audit.loss,damageDetected:K.inspect(source,damaged).loss>0,docxZip:binary[0]===80&&binary[1]===75});
      }
      const source=K.parse('<table><tr><td rowspan="2">East</td><td>00128.50</td></tr><tr><td></td></tr></table>');
      const altered=K.parse(K.render(source).replace('00128.50','999.99'),{format:'html',trustIds:true});
      const unsafe=K.render(K.parse('<table><tr><td onclick="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src="https://example.invalid/a.png" onerror="alert(2)"></td></tr></table>'));
      return {checks,numericLoss:K.inspect(source,altered).issues.some(i=>i.kind==='numbers'),safe:!unsafe.includes('<script')&&!unsafe.includes('onclick')&&!unsafe.includes('onerror')&&!unsafe.includes('href="javascript:'),mergeLoss:K.inspect(source,K.parse(K.render(source),{format:'html',trustIds:true})).loss};
    })()`);
    for (const check of result.checks) {
      assert.equal(check.loss, 0, check.name + ': round trip');
      assert.equal(check.damageDetected, true, check.name + ': degraded conversion');
      assert.equal(check.docxZip, true, check.name + ': DOCX container');
    }
    assert.equal(result.numericLoss, true, 'actual number edit must trigger loss');
    assert.equal(result.safe, true, 'source HTML must be sanitized');
    assert.equal(result.mergeLoss, 0, 'row spans and empty cells must survive');
    const fidelity = await window.webContents.executeJavaScript('runTableKeepFidelityChecks()');
    for (const check of fidelity) assert.equal(check.passed, true, JSON.stringify(check));
    console.log(`Passed ${12 + fidelity.length} core checks, including ${fidelity.length} targeted fidelity regressions.`);
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
