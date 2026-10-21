const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {runtimeModules}=require('./distribution/stage-release.cjs');
(async()=>{
 const files=await runtimeModules();assert.ok(files.includes('preload.cjs'),'The packaged app must include its isolated Electron bridge');
 const vm=require('node:vm'),calls=[];let bridge;
 vm.runInNewContext(await fs.readFile('preload.cjs','utf8'),{require(name){assert.equal(name,'electron');return {contextBridge:{exposeInMainWorld(name,value){assert.equal(name,'jarvisDesktop');bridge=value;}},ipcRenderer:{invoke:(...args)=>{calls.push(args);return Promise.resolve({});},send(){},on(){},removeListener(){}}};}});
 await bridge.save({key:'fixture-not-a-key'});await bridge.load();await bridge.telegram('state');await bridge.services('state');await bridge.updates('state');
 assert.deepEqual(calls.map(call=>call[0]),['jarvis:save','jarvis:load','jarvis:telegram','jarvis:services','jarvis:updates']);
 for(const file of ['public/index.html','public/desktop.html']){const html=await fs.readFile(file,'utf8');assert.ok(html.includes('v__APP_VERSION__'));assert.ok(html.includes('Текущая версия: __APP_VERSION__'));}
 console.log('PASS: packaging includes preload; isolated bridge exposes encrypted settings, Telegram, VK and updates; version labels exist before connection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
