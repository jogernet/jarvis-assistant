const assert=require('node:assert/strict');
const {controlLibrary}=require('./vk-library-bridge.cjs');
(async()=>{
 let playing=true,track='old',changed=true,selected='',path='/music',clicks=0,probes=0,attached=false;
 const win={show(){throw Error('Must stay minimized');},focus(){throw Error('Must not focus');},webContents:{debugger:{isAttached:()=>attached,attach(){attached=true;},detach(){attached=false;},async sendCommand(_method,event){if(event.type==='mouseReleased'){clicks++;if(selected.startsWith('open:'))path='/music/album/'+selected.slice(5);else if(changed)track=selected;}}},async executeJavaScript(code){
  if(code.startsWith('/*jarvis-vk-probe-v2*/')){probes++;return {playback:playing?'playing':'paused',title:track,trackId:track,position:15};}
  const match=code.match(/\)\("([^"]+)",(\{.*\})\)$/s);assert.ok(match,'Serialized invocation');const mode=match[1],args=JSON.parse(match[2]);
  if(mode==='page-info')return {path,headings:[]};if(mode==='scroll-library')return {moved:false};if(mode==='list')return {ok:true,playlists:[{name:'Favorites'},{name:'Night'}]};
  if(mode==='locate-playlist-cover'){selected=args.name;return {hover:{x:100,y:100},target:args.afterHover?{x:140,y:180}:null,name:args.name};}
  if(mode==='locate-playlist'){selected='open:'+args.name;return {target:{x:100,y:100},name:args.name};}
  if(mode==='locate-mix'){selected='mix';return {target:{x:100,y:100}};}throw Error('Unexpected '+mode);
 }}};
 const options={delay:async()=>{}};
 assert.equal((await controlLibrary(win,'my_tracks',{},options)).unsupported,true);assert.equal((await controlLibrary(win,'play_track',{name:'song'},options)).unsupported,true);assert.equal(probes,0,'Removed VK functions do not wake the player');
 assert.equal((await controlLibrary(win,'play_playlist',{name:'Favorites'},options)).verified,true);assert.equal(clicks,1);assert.equal(path,'/music','Play must not navigate');
 assert.equal((await controlLibrary(win,'play_playlist',{name:'Night'},options)).verified,true);assert.equal(clicks,2);assert.equal(path,'/music');
 const before=track;assert.equal((await controlLibrary(win,'open_playlist',{name:'Favorites'},options)).opened,true);assert.equal(track,before,'Opening a playlist must not start it');
 changed=false;assert.equal((await controlLibrary(win,'mix',{},options)).ok,false,'Unrelated playback cannot verify a new mix');
 assert.equal((await controlLibrary(win,'playlists',{},options)).playlists.length,2);assert.equal((await controlLibrary(win,'play_playlist',{},options)).ok,false);
 console.log('PASS: playlist cover playback, switching without navigation, explicit open, verification and removed VK personal-track commands.');
})().catch(error=>{console.error(error);process.exitCode=1;});
