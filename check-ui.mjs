import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const elements=new Map();
function element(){return {value:'',content:'local-token',type:'password',textContent:'',disabled:false,classList:{add(){},remove(){}},insertAdjacentElement(_pos,e){if(e.id)elements.set(e.id,e);},append(){},scrollIntoView(){},focus(){this.focused=true;}};}
for(const id of ['key','model','control','connect','disconnect','mic','send','status','chat','text','form'])elements.set(id,element());
elements.get('model').value='gemini-2.5-flash-native-audio-preview-12-2025';
const sockets=[],requests=[];let fail=false;
const context=vm.createContext({
 document:{getElementById:id=>elements.get(id),querySelector:()=>element(),createElement:element},
 window:{addEventListener(){}},EventSource:class{constructor(){sockets.push(this);}close(){}},
 AudioContext:class{resume(){return new Promise(()=>{});}},
 setTimeout:()=>1,clearTimeout(){},
 fetch:async(path,options)=>{requests.push({path,body:JSON.parse(options.body)});return {ok:!fail,json:async()=>fail?{error:'test failure'}:{ok:true}};},
});
vm.runInContext(readFileSync(new URL('./public/app.js',import.meta.url),'utf8'),context);
await elements.get('connect').onclick();assert.equal(requests.length,0);assert.equal(elements.get('key').focused,true);
const key='x.y/z+'.repeat(8)+'abcde';assert.equal(key.length,53);elements.get('key').value=key;elements.get('key').oninput();assert.ok(elements.get('key-hint').textContent.includes(String(key.length)));
elements.get('reveal-key').onclick();assert.equal(elements.get('key').type,'text');
elements.get('reveal-key').onclick();assert.equal(elements.get('key').type,'password');
await elements.get('connect').onclick();assert.equal(requests[0].path,'/connect');assert.equal(requests[0].body.key,key);
sockets[0].onmessage({data:JSON.stringify({connected:true})});assert.equal(elements.get('key').value,key);assert.equal(elements.get('send').disabled,false);
sockets[0].onmessage({data:JSON.stringify({disconnected:true,error:'test disconnect'})});
fail=true;await elements.get('connect').onclick();assert.equal(elements.get('connect').disabled,false);assert.equal(elements.get('key').value,key);
console.log('PASS: key visibility, empty-key feedback, connect without audio blocking, key retention and failure recovery.');
