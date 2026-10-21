import vm from 'node:vm';
import {createRequire} from 'node:module';const requireParser=createRequire(import.meta.url)('./quick-commands.cjs');const wakeNames=createRequire(import.meta.url)('./public/wake-name.js');
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./public/index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('./public/desktop-app.js',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(savedConfig=null,preferences={}){
 const elements=new Map(),events=[],requests=[],saved=[];let forgotten=0;const timers=new Map();let timerId=0;
 function element(){return {value:'',type:'password',content:'fixture-token',hidden:false,checked:true,disabled:false,textContent:'',className:'',scrollTop:0,scrollHeight:0,clientHeight:100,children:[],listeners:{},classList:{add(){},remove(){},toggle(){}},addEventListener(name,fn){this.listeners[name]=fn;},append(item){this.children.push(item);},querySelectorAll:()=>[],focus(){this.focused=true;}};}
 for(const match of html.matchAll(/id="([^"]+)"/g))elements.set(match[1],element());
 elements.get('workspace').hidden=true;elements.get('model').value='gemini-2.5-flash-native-audio-preview-12-2025';
 const api={load:async()=>savedConfig,save:async data=>{saved.push(data);return {saved:true};},forget:async()=>{forgotten++;},ready(){},window(){}};
 const context=vm.createContext({
  document:{getElementById:id=>{assert.ok(elements.has(id),'Missing HTML element: '+id);return elements.get(id);},querySelector:()=>element(),querySelectorAll:()=>[],createElement:element},
  window:{JarvisWakeName:wakeNames,JarvisCommands:requireParser,jarvisDesktop:api,addEventListener(){}},console:{log(){}},
  EventSource:class{constructor(){events.push(this);}close(){}},
  AudioContext:class{createGain(){return {gain:{value:1,setTargetAtTime(){}},connect(){}};}resume(){return new Promise(()=>{});}},
  localStorage:{getItem:key=>preferences[key]??null,setItem(key,value){preferences[key]=value;assert.ok(['jarvis-output-volume','jarvis-wake-enabled','jarvis-quick-commands-v2','jarvis-quick-voice-feedback','jarvis-wake-name','jarvis-voice'].includes(key),'Only public voice preferences may use renderer storage');}},
  AbortSignal,Date,setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimeout:id=>timers.delete(id),setInterval(){},
  fetch:async(path,options)=>{requests.push({path,body:JSON.parse(options.body)});return {ok:true,json:async()=>path==='/connection'?{connected:true}:{ok:true}};},
 });
 await vm.runInContext(source,context);return {elements,events,requests,saved,timers,forgotten:()=>forgotten};
}
const fresh=await fixture();const $=id=>fresh.elements.get(id);
assert.equal($('quick-commands').checked,false,'Small local speech model must not execute misheard commands by default');
assert.equal($('onboarding').hidden,false);assert.equal($('workspace').hidden,true);
await $('connect').onclick();assert.equal(fresh.requests.length,0);
const key='x.y/z+'.repeat(8)+'abcde';$('key').value=key;
$('reveal-key').onclick();assert.equal($('key').type,'text');$('reveal-key').onclick();assert.equal($('key').type,'password');
fresh.events[0].onopen();await $('connect').onclick();assert.equal(fresh.requests[0].body.key,key);assert.equal(fresh.saved.length,0,'Never save an unvalidated key');
await fresh.events[0].onmessage({data:JSON.stringify({connected:true})});
assert.equal($('workspace').hidden,false);assert.equal($('onboarding').hidden,true);assert.equal(fresh.saved[0].key,key);assert.equal($('key').value,key);
$('connection-settings').onclick();assert.equal($('onboarding').hidden,false);$('back-main').onclick();assert.equal($('workspace').hidden,false);
const restored=await fixture({key,model:'restored-model',control:false});
assert.equal(restored.elements.get('workspace').hidden,false,'Saved credentials skip first-run gate');
restored.events[0].onopen();await flush();assert.equal(restored.requests[0].body.key,key);assert.equal(restored.requests[0].body.model,'restored-model');
await restored.events[0].onmessage({data:JSON.stringify({connected:true})});
await restored.elements.get('forget').onclick();assert.equal(restored.forgotten(),1);assert.equal(restored.elements.get('key').value,'');assert.equal(restored.elements.get('onboarding').hidden,false);
assert.ok(!/localStorage\.setItem\([^)]*(?:api-key|data\.key|pendingSave)/.test(source),'API key must never be persisted by renderer');
$('jarvis-volume').value='35';$('jarvis-volume').oninput();assert.equal($('jarvis-volume-value').textContent,'35%');
const chat=$('chat');chat.scrollHeight=1000;chat.scrollTop=20;chat.listeners.scroll();
await fresh.events[0].onmessage({data:JSON.stringify({serverContent:{modelTurn:{parts:[{text:'PRIVATE ENGLISH REASONING',thought:true},{text:'UNMARKED INTERNAL TEXT'}]},outputTranscription:{text:'Готов, слушаю тебя.'}}})});
assert.equal(chat.scrollTop,20,'Incoming output must not pull the user away from older messages');
assert.ok(chat.children.some(p=>p.textContent==='Готов, слушаю тебя.'));
assert.ok(!chat.children.some(p=>p.textContent.includes('REASONING')||p.textContent.includes('INTERNAL')),'Internal thoughts must never appear in chat');
$('scroll-latest').onclick();assert.equal(chat.scrollTop,1000);
console.log('PASS: first-run gate, reveal key, save only after success, main window, saved-key auto-connect, settings and forget.');
console.log('PASS: public transcripts only, manual scroll position preserved, jump to latest.');

const recovering=await fixture({key,control:true});await recovering.events[0].onopen();await flush();
await recovering.events[0].onmessage({data:JSON.stringify({connected:true})});
await recovering.events[0].onmessage({data:JSON.stringify({disconnected:true,retryable:true,error:'network'})});
let retry=[...recovering.timers].find(([,t])=>t.delay===1000);assert.ok(retry,'Transient failures schedule a retry');recovering.timers.delete(retry[0]);await retry[1].fn();await flush();
assert.equal(recovering.requests.filter(r=>r.path==='/connect').at(-1).body.resume,true);
await recovering.events[0].onmessage({data:JSON.stringify({disconnected:true,retryable:false,error:'bad key'})});
assert.equal(recovering.timers.size,0,'Fatal API failures must not loop');
await recovering.elements.get('reconnect').onclick();await recovering.events[0].onmessage({data:JSON.stringify({disconnected:true,retryable:true})});
assert.ok(recovering.timers.size);await recovering.elements.get('disconnect').onclick();assert.equal(recovering.timers.size,0,'Explicit disconnect cancels retries');
const count=recovering.requests.filter(r=>r.path==='/connect').length;await recovering.events[0].onopen();await flush();assert.equal(recovering.requests.filter(r=>r.path==='/connect').length,count,'SSE reconnect cannot undo manual disconnect');
console.log('PASS: bounded automatic reconnect, resumption, fatal error and explicit disconnect cancellation.');

const sseRecovery=await fixture({key});await sseRecovery.events[0].onopen();await flush();await sseRecovery.events[0].onmessage({data:JSON.stringify({connected:true})});const beforeSse=sseRecovery.requests.filter(r=>r.path==='/connect').length;sseRecovery.events[0].onerror();await sseRecovery.events[0].onopen();assert.equal(sseRecovery.requests.filter(r=>r.path==='/connect').length,beforeSse,'Recovering EventSource reuses the existing cloud connection');assert.equal(sseRecovery.elements.get('send').disabled,false);
const bounded=await fixture({key});await bounded.events[0].onopen();await flush();
for(let attempt=0;attempt<6;attempt++){await bounded.events[0].onmessage({data:JSON.stringify({disconnected:true,retryable:true})});const entry=[...bounded.timers].find(([,t])=>t.delay<=10000);if(attempt===5){assert.equal(entry,undefined,'Retry budget is finite');break;}assert.ok(entry);bounded.timers.delete(entry[0]);await entry[1].fn();await flush();}
assert.equal(bounded.requests.filter(r=>r.path==='/connect').length,6);
console.log('PASS: EventSource restoration preserves the cloud session; retries stop after five attempts.');

const namePrefs={};const renamed=await fixture(null,namePrefs);renamed.elements.get('wake-name').value='Алиса';renamed.elements.get('wake-name-save').onclick();assert.equal(namePrefs['jarvis-wake-name'],'Алиса');const reopened=await fixture(null,namePrefs);assert.equal(reopened.elements.get('wake-name').value,'Алиса','Wake name survives restarting the UI');renamed.elements.get('wake-name').value='замолчи';renamed.elements.get('wake-name-save').onclick();assert.equal(namePrefs['jarvis-wake-name'],'Алиса','Invalid names do not replace the saved name');console.log('PASS: editable wake name, restart restoration and validation.');
