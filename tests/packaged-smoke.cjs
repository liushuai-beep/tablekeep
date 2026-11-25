const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const assert = require('node:assert/strict');

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'tablekeep-smoke-'));
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const binary = path.resolve(__dirname, '../../TableKeep-build/TableKeep-darwin-arm64/TableKeep.app/Contents/MacOS/TableKeep');
  const env = { ...process.env, TABLEKEEP_TEST_MODE: '1', TABLEKEEP_TEST_DATA: profile, TABLEKEEP_TEST_OUTPUT: path.join(profile, 'exports') };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(binary, [`--remote-debugging-port=${port}`], { env, stdio: 'ignore' });
  let startupError, socket;
  child.on('error', error => { startupError = error; });
  try {
    let target;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (startupError) throw startupError;
      if (child.exitCode !== null || child.signalCode) throw new Error('Packaged app exited before opening its window.');
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`);
        target = (await response.json()).find(item => item.type === 'page' && item.url.includes('index.html'));
      } catch {}
      if (target) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(target, 'Packaged window must start');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Packaged conversion timed out')), 20000);
      socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        clearTimeout(timer);
        if (message.error || message.result.exceptionDetails) reject(new Error(JSON.stringify(message)));
        else resolve(message.result.result.value);
      });
      socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { awaitPromise: true, returnByValue: true, expression: `(async()=>{
        while(!window.TableKeepUI)await new Promise(resolve=>setTimeout(resolve,50));
        const waitForView=async predicate=>{const deadline=Date.now()+5000;while(!predicate()){if(Date.now()>deadline)throw new Error('View did not settle');await new Promise(resolve=>setTimeout(resolve,20));}};
        const empty=TableKeepUI.getState().source===null;
        const sample=TableKeepSamples.get()[0];TableKeepUI.applyInput(sample.input,sample.format,sample.id);
        const audit=TableKeepUI.getState().audit;
        await tablekeepDesktop.setView('workbench');
        await waitForView(()=>!document.body.classList.contains('menubar'));
        const expanded=!document.body.classList.contains('menubar');
        await tablekeepDesktop.setView('popup');
        await waitForView(()=>document.body.classList.contains('menubar'));
        const compact=document.body.classList.contains('menubar');
        const binary=new Uint8Array(await TableKeepDOCX.make(TableKeepUI.getState().actual).arrayBuffer());
        await tablekeepDesktop.saveFile({format:'docx',data:Array.from(binary)});
        return {empty,expanded,compact,loss:audit.loss,merges:audit.stats.merges};
      })()` } }));
    });
    assert.deepEqual(result, { empty: true, expanded: true, compact: true, loss: 0, merges: 5 });
    assert.ok((await fs.stat(path.join(profile, 'exports/TableKeep-result.docx'))).size > 1000);
    console.log('Packaged app passed startup, empty state, shared-view conversion, merge inspection, and native DOCX export.');
  } finally {
    socket?.close();
    child.kill('SIGTERM');
    await new Promise(resolve => { if (!child.pid || child.exitCode !== null || child.signalCode) resolve(); else child.once('exit', resolve); });
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
