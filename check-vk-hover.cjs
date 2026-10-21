const assert=require('node:assert/strict'),vm=require('node:vm');
const {controlLibrary}=require('./vk-library-bridge.cjs');
(async()=>{
 let hovered=null,track='old',playing=false;const clicks=[],moves=[];
 const element=(text,left,top,width,height)=>({textContent:text,isConnected:true,getBoundingClientRect:()=>({left,top,width,height,right:left+width,bottom:top+height}),getAttribute:()=>'',scrollIntoView(){},querySelectorAll:()=>[],contains:()=>false,closest:()=>null,classList:{contains:()=>false},click(){throw Error('DOM click must not replace trusted cover input');}});
 function card(name,left){const node=element(name,left,100,200,280),cover=element('',left,100,200,200),play=element('',left+80,180,40,40),title=element(name,left,310,200,30);play.parentCover=cover;play.track=name;node.getAttribute=key=>key==='href'?'/music/album/'+name:'';node.querySelectorAll=selector=>selector.includes('PlaylistCard__title')?[title]:selector.startsWith('.audio_pl__cover')?[cover]:selector==='.audio_pl__action_play'?[play]:[];return {node,cover,play};}
 const a=card('Favorites',100),b=card('Discoveries',400),row=element('Artist First song',100,450,380,50),cover=element('',100,450,40,40),play=element('',100,450,40,40),title=element('First song',150,450,200,20);play.parentCover=cover;play.track='1_first';row.getAttribute=key=>key==='data-full-id'?'1_first':'';
 row.querySelectorAll=selector=>selector.includes('__title')?[title]:selector==='.audio_row__cover'?[cover]:selector==='.audio_row__play_btn'?[play]:[];
 const block={parentElement:null,querySelectorAll:selector=>selector.includes('audio_row')?[row]:[]},heading=element('Мои треки',100,410,200,30);heading.parentElement=block;
 const doc={body:{},querySelectorAll:selector=>selector.startsWith('.audio_pl_item,')?[a.node,b.node]:selector.startsWith('a,button')?[heading]:[]};
 const context=vm.createContext({document:doc,location:{pathname:'/music'},getComputedStyle:el=>({display:'block',visibility:el.parentCover&&hovered!==el.parentCover?'hidden':'visible'})});
 let attached=false;const contents={debugger:{isAttached:()=>attached,attach(){attached=true;},detach(){attached=false;},async sendCommand(method,event){assert.equal(method,'Input.dispatchMouseEvent');if(event.type==='mouseMoved'){moves.push(event);hovered=[a.cover,b.cover,cover].find(el=>{const r=el.getBoundingClientRect();return event.x>=r.left&&event.x<=r.right&&event.y>=r.top&&event.y<=r.bottom;})||null;}if(event.type==='mouseReleased'){const button=[a.play,b.play,play].find(el=>{const r=el.getBoundingClientRect();return el.parentCover===hovered&&event.x>=r.left&&event.x<=r.right&&event.y>=r.top&&event.y<=r.bottom;});assert.ok(button,'Only a visible Play overlay may receive a click');track=button.track;playing=true;clicks.push(track);}}},async executeJavaScript(code){if(code.startsWith('/*jarvis-vk-probe-v2*/'))return {playback:playing?'playing':'paused',trackId:track,title:track==='1_first'?'Artist First song':track,position:0};return vm.runInContext(code,context);}};
 const win={webContents:contents,show(){throw Error('Must stay minimized');},focus(){throw Error('Must not steal focus');}};
 const options={delay:async()=>{}};
 assert.equal((await controlLibrary(win,'play_playlist',{name:'Favorites'},options)).verified,true);
 assert.equal((await controlLibrary(win,'play_playlist',{name:'Discoveries'},options)).verified,true);
 assert.equal((await controlLibrary(win,'my_tracks',{},options)).unsupported,true);
 assert.deepEqual(clicks,['Favorites','Discoveries']);assert.equal(context.location.pathname,'/music','Playing a card must leave the library open');assert.ok(moves.length>=4,'Hover precedes overlay clicks');
 console.log('PASS: hover-only Play overlays, switch between two playlists without navigation, disabled personal tracks and minimized window.');
})().catch(error=>{console.error(error);process.exitCode=1;});
