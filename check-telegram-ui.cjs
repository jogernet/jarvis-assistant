const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
(async()=>{
 const elements=new Map(),calls=[],listeners=new Map();let timeoutCount=0;
 const element=()=>({value:'',hidden:false,disabled:false,textContent:'',src:'',handlers:{},children:[],scrollIntoView(){this.scrolled=true;},addEventListener(name,fn){this.handlers[name]=fn;},removeAttribute(name){delete this[name];},replaceChildren(){this.children=[];},click(){return this.onclick?.();}});
 for(const match of fs.readFileSync('public/index.html','utf8').matchAll(/id="([^"]+)"/g))elements.set(match[1],element());
 const $=id=>{assert.ok(elements.has(id),'Missing '+id);return elements.get(id);};
 let state={phase:'disconnected',saved:false};
 const bridge=async(action,data)=>{calls.push({action,data});if(action==='connect')state={phase:'qr',qr:'data:image/png;base64,ZmFrZQ=='};if(action==='password')state={phase:'connected',account:'Owner'};if(action==='cancel')state={phase:'disconnected'};return state;};
 vm.runInNewContext(fs.readFileSync('public/telegram-ui.js','utf8'),{window:{jarvisDesktop:{telegram:bridge},addEventListener(name,fn){listeners.set(name,fn);}},document:{hidden:false,getElementById:$,addEventListener(){}},setTimeout(){timeoutCount++;return timeoutCount;},clearTimeout(){}});
 await new Promise(r=>setImmediate(r));assert.equal(timeoutCount,0,'No auth polling when disconnected');
 $('telegram-api-id').value='12345';$('telegram-api-hash').value='private-api-hash';await $('telegram-connect').onclick();
 assert.equal($('telegram-api-hash').value,'');assert.equal($('telegram-qr').hidden,false);assert.equal($('telegram-qr').scrolled,true,'QR is brought into view automatically');assert.equal(calls.at(-1).action,'connect');assert.equal(calls.at(-1).data.apiHash,'private-api-hash');
 $('telegram-password').value='private-password';await $('telegram-password-submit').onclick();assert.equal($('telegram-password').value,'');assert.equal(calls.at(-1).action,'password');assert.equal($('telegram-qr').hidden,true);assert.equal($('telegram-qr').src,undefined);assert.equal($('telegram-finish').hidden,false);
 await $('telegram-finish').onclick();assert.ok(calls.some(c=>c.action==='finish'));assert.equal($('telegram-finish').hidden,true);
 const source=fs.readFileSync('desktop.cjs','utf8');assert.ok(source.includes("args.service==='telegram'?telegram.command"));assert.ok(source.includes('telegramPrivateSnapshot??=module.pausePrivateInput()'));
 assert.ok(!fs.readFileSync('public/telegram-ui.js','utf8').includes('localStorage'),'No credential persistence in renderer');
 console.log('PASS: Telegram auth UI, local IPC-only credentials, cleared inputs, QR removal, explicit capture restoration and no idle auth polling.');
})().catch(error=>{console.error(error);process.exitCode=1;});
