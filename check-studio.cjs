const assert=require('node:assert/strict'),vm=require('node:vm'),{readFileSync}=require('node:fs');
(async()=>{
 const html=readFileSync('public/index.html','utf8'),elements=new Map(),listeners=new Map();
 const element=()=>({value:'',hidden:true,checked:false,textContent:'',content:'test-token',dataset:{},children:[],handlers:{},classList:{add(){},remove(){},toggle(){}},append(el){this.children.push(el);},replaceChildren(){this.children=[];},removeAttribute(){},setAttribute(name,value){this[name]=value;},addEventListener(name,fn){this.handlers[name]=fn;},click(){return this.onclick?.();},showModal(){this.open=true;},close(){this.open=false;}});
 for(const m of html.matchAll(/id="([^"]+)"/g)){assert.ok(!elements.has(m[1]),'Duplicate ID '+m[1]);elements.set(m[1],element());}
 const $=id=>{assert.ok(elements.has(id),'Missing '+id);return elements.get(id);};$('workspace').hidden=false;
 const data={enabled:true,notes:[{id:'a',text:'Люблю VK'}],sessions:[{id:'s',title:'Мой диалог',at:1000,messages:[{role:'user',text:'Тестовая история'}]}]};
 const window={jarvisDesktop:{journal:async(action,args)=>{if(action==='add')data.notes.push({id:'b',text:args.text});if(action==='delete')data.notes=data.notes.filter(n=>n.id!==args.id);if(action==='enabled')data.enabled=args.enabled;if(action==='clear-history')data.sessions=[];return structuredClone(data);}},addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);}};
 const diagnostics={at:2000,vision:true,captureFps:12,sendFps:1,detectionFps:.6,captureTargetFps:20,sentTargets:17,lastSentAt:1000};
 vm.runInNewContext(readFileSync('public/studio-ui.js','utf8'),{window,document:{getElementById:$,querySelector:()=>element(),createElement:element,activeElement:null},CustomEvent:class{constructor(type,options){this.type=type;Object.assign(this,options);}},setInterval(){},fetch:async()=>({ok:true,json:async()=>diagnostics}),AbortSignal,Date});
 const flush=()=>new Promise(r=>setImmediate(r));await flush();
 $('nav-memory').onclick();await flush();assert.equal($('memory-panel').hidden,false);assert.equal($('assistant-panels').hidden,true);assert.equal($('inspector').hidden,false);assert.equal($('memory-list').children[0].textContent,'Люблю VK');
 $('memory-text').value='Предпочитаю русский';await $('memory-add').onclick();assert.equal(data.notes.length,2);assert.equal($('memory-text').value,'');
 $('memory-enabled').checked=false;await $('memory-enabled').onchange();assert.equal(data.enabled,false);
 $('nav-history').onclick();await flush();assert.equal($('memory-panel').hidden,true);$('history-list').children[0].onclick();assert.equal($('history-detail').children[0].children[1].textContent,'Тестовая история');
 $('nav-screen').onclick();await flush();assert.equal($('screen-capture').textContent,'12');assert.equal($('screen-send').textContent,'1');assert.equal($('screen-targets').textContent,'17');assert.ok($('studio-vision').textContent.includes('12 FPS'));
 $('nav-chat').onclick();await flush();assert.equal($('assistant-panels').hidden,false);assert.equal($('inspector').hidden,true);
 assert.ok(html.includes('60 FPS · максимум'));assert.ok(html.includes('до 1 свежего кадра/с'));assert.equal($('assistant-panels').hidden,false);
 for(const [name,id] of Object.entries({actions:'actions-panel',messengers:'messengers-panel',preferences:'preferences-panel'})){$('nav-'+name).onclick();await flush();assert.equal($(id).hidden,false,'New panel '+name+' must open');assert.equal($('assistant-panels').hidden,true);assert.equal($('inspector').hidden,false);}
 console.log('PASS: studio layout IDs, compact navigation and full-page tools with Chat navigation, memory edit/disable, history selection and separate actual capture/detection/transmission metrics.');
})().catch(e=>{console.error(e);process.exitCode=1;});
