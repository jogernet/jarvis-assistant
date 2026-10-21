const assert=require('node:assert/strict'),vm=require('node:vm'),{readFileSync}=require('node:fs');
(async()=>{
 const html=readFileSync('public/index.html','utf8'),elements=new Map(),listeners=new Map(),requests=[];let interval;
 const element=()=>({value:'',hidden:true,textContent:'',handlers:{},replaceChildren(...children){this.children=children;},classList:{add(){},remove(){}},addEventListener(name,fn){this.handlers[name]=fn;}});
 for(const m of html.matchAll(/id="([^"]+)"/g))elements.set(m[1],element());
 const data={musicProvider:'youtube',vkLibrary:'https://vk.com/audios0',vk:{login:'required',playback:'unknown'}};
 const window={jarvisDesktop:{services:async(action,body)=>{requests.push({action,body});if(action==='command'){if(body.action==='playlists')return {ok:true,playlists:[{name:'Favorites'}]};return {ok:false,error:'Войди в VK'};};return structuredClone(data);}},addEventListener(name,fn){listeners.set(name,fn);},dispatchEvent(event){listeners.get(event.type)?.(event);}};
 vm.runInNewContext(readFileSync('public/services-ui.js','utf8'),{window,document:{createElement:()=>element(),getElementById:id=>{assert.ok(elements.has(id),id);return elements.get(id);}},CustomEvent:class{constructor(type,options){this.type=type;Object.assign(this,options);}},setInterval(fn){interval=fn;}});
 const flush=()=>new Promise(r=>setImmediate(r));const $=id=>elements.get(id);
 $('nav-services').onclick();await flush();assert.equal($('services-panel').hidden,false);assert.equal($('assistant-panels').hidden,true);assert.equal($('music-provider').value,'youtube');
 $('music-provider').value='vk';$('music-provider').handlers.change();await interval();assert.equal($('music-provider').value,'vk','Polling must preserve unsaved preferences');
 await $('vk-connect').onclick();assert.ok(requests.some(r=>r.action==='connect'&&r.body.vkLibrary==='https://vk.com/audios0'));
 await $('vk-play').onclick();assert.equal($('services-message').textContent,'Войди в VK');assert.ok(!$('vk-playing').textContent.includes('играет'));
 await $('vk-playlists').onclick();assert.equal($('vk-playlist-options').children[0].value,'Favorites');$('vk-volume').value='65';await $('vk-volume-set').onclick();assert.equal(requests.at(-1).body.volume,65);await $('vk-mix').onclick();assert.equal(requests.at(-1).body.action,'mix');
 window.jarvisUiHidden=true;const hiddenCount=requests.length;await interval();assert.equal(requests.length,hiddenCount,'Minimized UI must stop polling even on the selected panel');window.jarvisUiHidden=false;await interval();assert.equal(requests.length,hiddenCount+1,'Restored UI resumes polling');window.dispatchEvent({type:'jarvis:panel',detail:'dialog'});assert.equal($('services-panel').hidden,true);const count=requests.length;await interval();assert.equal(requests.length,count,'Hidden services panel must stop polling');
 console.log('PASS: services navigation, saved/default values, edits preserved while polling, VK connection action, login error and hidden-panel polling.');
})().catch(e=>{console.error(e);process.exitCode=1;});
