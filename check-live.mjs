import {Readable} from 'node:stream';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {server,registerComputer,stopComputer,shutdown} from './server.mjs';
const instances=[],nativeCalls=[];let output='';
class FakeSocket extends EventTarget{
 static OPEN=1;
 constructor(){super();this.readyState=1;this.sent=[];instances.push(this);}
 send(text){this.sent.push(JSON.parse(text));}
 close(){this.readyState=3;}
 message(data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(data)}));}
}
globalThis.WebSocket=FakeSocket;
const flush=()=>new Promise(r=>setImmediate(r));
async function request(url,method='GET',headers={},body=''){
 const req=Readable.from(body?[body]:[]);Object.assign(req,{url,method,headers:{host:'127.0.0.1:3213',...headers}});let status,content='';
 await new Promise(resolve=>server.emit('request',req,{setHeader(){},writeHead(s){status=s;},end(v){content+=v||'';resolve();}}));return {status,content};
}
const page=await request('/');const token=page.content.match(/name="jarvis-token" content="([^"]+)/)[1];
assert.ok(page.content.includes('v'+JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8')).version),'Version is visible before authentication');assert.ok(!page.content.includes('__APP_VERSION__'));
const events=Readable.from([]);Object.assign(events,{url:'/events?token='+token,method:'GET',headers:{host:'127.0.0.1:3213'}});
server.emit('request',events,{setHeader(){},writeHead(){},write(data){output+=data;},end(){}});
registerComputer(async(name,args,signal)=>{nativeCalls.push(name);if(name==='type_text'&&args.text==='slow-test')return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));return name==='screen_view'?{ok:true,image:'dGVzdA==',width:100,height:100,activeHwnd:'42'}:{ok:true,windows:[{hwnd:'42',title:'YouTube'}]};});
const result=await request('/connect','POST',{'x-jarvis-token':token},JSON.stringify({key:'synthetic-key',control:true,vision:true}));assert.equal(result.status,200);
const socket=instances[0];socket.dispatchEvent(new Event('open'));assert.ok(socket.sent[0].setup.tools[0].functionDeclarations.some(d=>d.name==='click_screen'));
socket.message({setupComplete:{}});await flush();
socket.message({serverContent:{modelTurn:{parts:[{text:'DO_NOT_SHOW_PRIVATE_THOUGHTS',thought:true}]},outputTranscription:{text:'Привет'}}});await flush();assert.ok(!output.includes('DO_NOT_SHOW_PRIVATE_THOUGHTS'));assert.ok(output.includes('Привет'));
socket.message({toolCall:{functionCalls:[{id:'screen',name:'screen_view',args:{}}]}});await flush();
assert.ok(socket.sent.some(m=>m.realtimeInput?.video?.data==='dGVzdA=='),'Send screen frame to Gemini');
assert.ok(socket.sent.some(m=>m.toolResponse?.functionResponses?.[0].id==='screen'),'Return tool result to Gemini');
socket.message({toolCall:{functionCalls:[{id:'cancel-me',name:'type_text',args:{text:'slow-test'}}]}});await flush();
socket.message({toolCallCancellation:{ids:['cancel-me']}});await flush();
assert.ok(!socket.sent.some(m=>m.toolResponse?.functionResponses?.some(r=>r.id==='cancel-me')),'Never send a response for a cancelled tool call');
socket.message({toolCall:{functionCalls:[{id:'after-cancel',name:'list_windows',args:{}}]}});await flush();
assert.ok(socket.sent.some(m=>m.toolResponse?.functionResponses?.some(r=>r.id==='after-cancel'&&r.response.ok===true)),'Speech interruption must preserve mouse and keyboard permission');
const debug=await request('/diagnostics','POST',{'x-jarvis-token':token},'{}');const stats=JSON.parse(debug.content);assert.equal(stats.control,true);assert.equal(stats.vision,true);assert.ok(stats.totals.sent>=1);assert.ok(!debug.content.includes('synthetic-key'));assert.equal(stats.preview,undefined);

// Voice captions are cleaned before reaching the renderer or command router.
socket.message({serverContent:{inputTranscription:{text:'<noise> Джарвис'}}});await flush();
socket.message({serverContent:{inputTranscription:{text:' включи музыку <noise>'}}});await flush();
assert.ok(output.includes('Джарвис включи музыку'));assert.ok(!output.includes('<noise>'));
socket.message({serverContent:{turnComplete:true}});await flush();
socket.message({serverContent:{inputTranscription:{text:'Открой телеграм'}}});await flush();
socket.message({serverContent:{inputTranscription:{text:'Открой Telegram',finished:true}}});await flush();
socket.message({serverContent:{inputTranscription:{text:'Покажи последние сообщения',finished:true}}});await flush();
const captions=output.split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6))).filter(message=>message.serverContent?.inputTranscription).map(message=>message.serverContent.inputTranscription.displayText);
assert.equal(captions.at(-2),'Открой Telegram');assert.equal(captions.at(-1),'Покажи последние сообщения','Finished speech must not merge into the next request');
socket.message({serverContent:{turnComplete:true}});await flush();
socket.message({serverContent:{inputTranscription:{text:'你好世界'}}});await flush();
const beforeUncertain=nativeCalls.length;
socket.message({toolCall:{functionCalls:[{id:'uncertain-input',name:'list_windows',args:{}}]}});await flush();
assert.equal(nativeCalls.length,beforeUncertain,'Unreliable transcription cannot trigger native commands');
assert.ok(!output.includes('你好世界'));assert.ok(output.includes('Речь распознана неуверенно'));
socket.message({serverContent:{turnComplete:true}});await flush();
socket.message({serverContent:{inputTranscription:{text:'Джарвис покажи окна'}}});await flush();
socket.message({toolCall:{functionCalls:[{id:'clear-input',name:'list_windows',args:{}}]}});await flush();
assert.equal(nativeCalls.length,beforeUncertain+1,'A clear next request restores command execution');
socket.message({serverContent:{turnComplete:true}});await flush();

stopComputer();const count=nativeCalls.length;
socket.message({toolCall:{functionCalls:[{id:'stopped',name:'type_text',args:{text:'do not type'}}]}});await flush();assert.equal(nativeCalls.length,count,'Emergency stop must prevent native input');
await request('/connect','POST',{'x-jarvis-token':token},JSON.stringify({key:'synthetic-key',control:false,vision:false}));
const second=instances[1];second.dispatchEvent(new Event('open'));assert.ok(second.sent[0].setup.tools[0].functionDeclarations.some(d=>d.name==='click_screen'),'Native capabilities must remain discoverable while permission is disabled');
second.message({setupComplete:{}});await flush();
await request('/computer','POST',{'x-jarvis-token':token},JSON.stringify({control:true,vision:true}));
second.message({toolCall:{functionCalls:[{id:'enabled-later',name:'list_windows',args:{}}]}});await flush();assert.ok(second.sent.some(m=>m.toolResponse?.functionResponses?.some(r=>r.id==='enabled-later'&&r.response.ok===true)),'Enabling control during a session must unlock existing tools');

assert.deepEqual(second.sent[0].setup.contextWindowCompression,{slidingWindow:{}});
assert.deepEqual(second.sent[0].setup.sessionResumption,{});
second.message({sessionResumptionUpdate:{resumable:true,newHandle:'SECRET_RESUME_HANDLE'}});await flush();assert.ok(!output.includes('SECRET_RESUME_HANDLE'),'Resumption credentials stay in main process');
const disconnect=new Event('close');Object.assign(disconnect,{code:1006,reason:''});second.readyState=3;second.dispatchEvent(disconnect);
assert.ok(output.includes('"retryable":true'));
await request('/connect','POST',{'x-jarvis-token':token},JSON.stringify({key:'synthetic-key',control:true,vision:false,resume:true}));
const third=instances[2];third.dispatchEvent(new Event('open'));assert.deepEqual(third.sent[0].setup.sessionResumption,{handle:'SECRET_RESUME_HANDLE'});third.message({setupComplete:{}});await flush();
const callsBefore=nativeCalls.length;third.message({toolCall:{functionCalls:[{id:'enabled-later',name:'list_windows',args:{}}]}});await flush();assert.equal(nativeCalls.length,callsBefore,'Resumed duplicate tool IDs reuse the previous result');assert.ok(third.sent.some(m=>m.toolResponse?.functionResponses?.some(r=>r.id==='enabled-later')));
const state=await request('/connection','POST',{'x-jarvis-token':token},'{}');assert.equal(JSON.parse(state.content).connected,true);assert.ok(!state.content.includes('SECRET_RESUME_HANDLE'));
events.emit('close');assert.equal(third.readyState,1,'Short SSE loss must not close Gemini');assert.equal(JSON.parse((await request('/connection','POST',{'x-jarvis-token':token},'{}')).content).connected,true);
const restoredEvents=Readable.from([]);Object.assign(restoredEvents,{url:'/events?token='+token,method:'GET',headers:{host:'127.0.0.1:3213'}});server.emit('request',restoredEvents,{setHeader(){},writeHead(){},write(data){output+=data;},end(){}});
await request('/disconnect','POST',{'x-jarvis-token':token},'{}');
await request('/connect','POST',{'x-jarvis-token':token},JSON.stringify({key:'synthetic-key',control:false,resume:true}));const fourth=instances[3];fourth.dispatchEvent(new Event('open'));assert.deepEqual(fourth.sent[0].setup.sessionResumption,{},'Explicit disconnect clears the resume handle');
shutdown();assert.equal(socket.readyState,3);assert.equal(second.readyState,3);events.emit('close');restoredEvents.emit('close');
console.log('PASS: compression, private session handles, reconnection, command deduplication and explicit disconnect.');
console.log('PASS: Live tool declarations, video frames, tool responses, thought filtering and emergency stop across the server boundary.');
