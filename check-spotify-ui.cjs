const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
(async()=>{
 const elements=new Map(),listeners=new Map(),requests=[];
 const element=()=>({value:'',textContent:'',disabled:false,events:{},addEventListener(type,fn){this.events[type]=fn;},replaceChildren(...children){this.children=children;}});
 for(const match of fs.readFileSync('public/index.html','utf8').matchAll(/id="([^"]+)"/g))elements.set(match[1],element());
 let data={connected:false,clientId:'',devices:[]};
 const window={addEventListener(type,fn){listeners.set(type,fn);},jarvisDesktop:{async services(action,body){requests.push({action,body});if(action==='spotify-connect')return data={pending:true,clientId:body.clientId,connected:false};if(action==='spotify-device')return data={...data,deviceId:body.deviceId};if(action==='spotify-disconnect')return data={connected:false,clientId:''};if(body?.action==='playlists')return {ok:true,playlists:[{name:'Night'}]};return {ok:true,accepted:true,result:'Spotify принял команду'};}}};
 vm.runInNewContext(fs.readFileSync('public/spotify-ui.js','utf8'),{window,document:{getElementById:id=>{assert.ok(elements.has(id),id);return elements.get(id);},createElement:element}});
 const $=id=>elements.get(id);assert.equal($('spotify-next').disabled,true);
 $('spotify-client-id').value='a'.repeat(32);$('spotify-client-id').events.input();listeners.get('jarvis:services-state')({detail:{spotify:{connected:false,clientId:'old'}}});assert.equal($('spotify-client-id').value,'a'.repeat(32),'Polling preserves entered Client ID');
 await $('spotify-connect').onclick();assert.equal(requests.at(-1).action,'spotify-connect');assert.equal(requests.at(-1).body.clientId,'a'.repeat(32));
 data={...data,connected:true,pending:false,devices:[{id:'A',name:'Computer',active:true}]};listeners.get('jarvis:services-state')({detail:{spotify:data}});assert.equal($('spotify-next').disabled,false);assert.equal($('spotify-device').children[1].value,'A');
 $('spotify-device').value='A';await $('spotify-device').onchange();assert.equal(requests.at(-1).body.deviceId,'A');
 await $('spotify-next').onclick();assert.equal(requests.at(-1).action,'spotify-command');assert.equal(requests.at(-1).body.action,'next');assert.equal($('spotify-message').textContent,'Spotify принял команду');
 await $('spotify-playlists').onclick();assert.equal($('spotify-playlist-options').children[0].value,'Night');$('spotify-playlist-name').value='Night';await $('spotify-playlist-play').onclick();assert.equal(requests.at(-1).body.action,'play_playlist');assert.equal(requests.at(-1).body.name,'Night');
 await $('spotify-disconnect').onclick();assert.equal($('spotify-next').disabled,true);assert.equal($('spotify-client-id').value,'');
 console.log('PASS: Spotify setup, Client ID edits, authorization state, device selection, playlist controls and disconnect UI.');
})().catch(error=>{console.error(error);process.exitCode=1;});
