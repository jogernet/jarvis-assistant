const fs=require('node:fs/promises');
const path=require('node:path');
const allowed=url=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='vk.com'||u.hostname.endsWith('.vk.com')||u.hostname==='vk.ru'||u.hostname.endsWith('.vk.ru'));}catch{return false;}};
function libraryUrl(value){const u=new URL(value);if(!allowed(u.href)||!['vk.com','vk.ru','music.vk.com'].includes(u.hostname)||!/^\/(audios\d+|audio|music)?\/?$/.test(u.pathname))throw Error('Укажи ссылку на музыку VK: https://vk.com/audios0 или /music.');u.hash='';return u.href;}
const {probeScript,bridgeScript,controlPlayer}=require('./vk-player-bridge.cjs');
const {controlVolume}=require('./vk-player-bridge.cjs');
const {controlLibrary}=require('./vk-library-bridge.cjs');
const {withMusicFallback}=require('./music-fallback.cjs');
const commandScript=action=>bridgeScript('invoke',action);
async function createServices({BrowserWindow,session,home,spotify=null}){
 const file=path.join(home,'services.json');let preferences={musicProvider:'youtube',vkLibrary:'https://vk.com/audios0'},win=null,backgroundMusic=true,activeProvider=null;
 try{const data=JSON.parse(await fs.readFile(file,'utf8'));if(['vk','youtube','spotify'].includes(data.musicProvider))preferences.musicProvider=data.musicProvider;if(data.vkLibrary)preferences.vkLibrary=libraryUrl(data.vkLibrary);}catch{}
 const partition='persist:jarvis-vk-music',vkSession=session.fromPartition(partition),children=new Set();
 vkSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 async function state(){let vk={login:'not-open',playback:'unknown'};if(win&&!win.isDestroyed()){const url=win.webContents.getURL();if(allowed(url)){try{vk=await win.webContents.executeJavaScript(probeScript);}catch{vk={login:'loading',playback:'unknown'};}}}return {...preferences,vk,spotify:spotify?.state()||{connected:false,clientId:'',devices:[],playlists:[]}};}
 function park(){if(!win||win.isDestroyed())return;win.setSkipTaskbar?.(false);if(!win.isMinimized()){win.showInactive?.();win.minimize?.();}}
 async function open({background=true}={}){backgroundMusic=background;if(win&&!win.isDestroyed()){if(!background){if(win.isMinimized())win.restore();win.show();win.focus();}else park();return state();}
  win=new BrowserWindow({width:1920,height:1080,title:'VK Музыка — JARVIS',autoHideMenuBar:true,show:false,skipTaskbar:false,icon:path.join(__dirname,'assets','music.ico'),webPreferences:{partition,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  win.setAppDetails?.({appId:'JARVIS.VKMusic',appIconPath:path.join(__dirname,'assets','music.ico'),appIconIndex:0,relaunchDisplayName:'Музыка · JARVIS'});win.webContents.on('page-title-updated',event=>event.preventDefault());
  win.webContents.setWindowOpenHandler(({url})=>allowed(url)?{action:'allow',overrideBrowserWindowOptions:{icon:path.join(__dirname,'assets','music.ico'),webPreferences:{partition,nodeIntegration:false,contextIsolation:true,sandbox:true}}}:{action:'deny'});
  const guard=(event,url)=>{if(!allowed(url))event.preventDefault();};win.webContents.on('will-navigate',guard);win.webContents.on('will-redirect',guard);win.webContents.on('did-create-window',child=>{children.add(child);child.setIcon?.(path.join(__dirname,'assets','music.ico'));child.webContents.on('will-navigate',guard);child.webContents.on('will-redirect',guard);child.webContents.setWindowOpenHandler(()=>({action:'deny'}));child.on('closed',()=>children.delete(child));});win.on('close',event=>{event.preventDefault();backgroundMusic=true;park();});win.on('restore',()=>{backgroundMusic=false;});win.on('closed',()=>{win=null;});
  win.webContents.on('did-finish-load',async()=>{if(backgroundMusic&&(await state()).vk.login==='signed-in')park();});win.webContents.on('did-navigate-in-page',async()=>{if(backgroundMusic&&(await state()).vk.login==='signed-in')park();});
  win.maximize?.();park();try{await win.loadURL(preferences.vkLibrary);}finally{if(win&&!win.isDestroyed())win.webContents.setBackgroundThrottling?.(true);}const current=await state();if(!background||current.vk.login==='required'){if(win.isMinimized())win.restore();win.show();win.focus();}return current;
 }
 async function save(data){if(!['vk','youtube','spotify'].includes(data.musicProvider))throw Error('Неизвестный музыкальный сервис.');const next={musicProvider:data.musicProvider,vkLibrary:libraryUrl(data.vkLibrary||preferences.vkLibrary)};await fs.mkdir(home,{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(next));await fs.rename(file+'.tmp',file);preferences=next;return state();}
 let controlQueue=Promise.resolve(),queued=0;
 async function perform(action,provider='default',args={}){
  if(!['play','pause','next','previous','show','status','volume_up','volume_down','set_volume','start_music','my_tracks','play_track','mix','playlists','play_playlist','open_playlist','for_you','discoveries'].includes(action))throw Error('Неизвестная команда плеера.');
  if(!['default','vk','spotify'].includes(provider))throw Error('Неизвестный сервис.');
  if(action==='status')return {ok:true,...await state()};
  let selected=provider==='default'?preferences.musicProvider:provider;
  if(provider==='default'&&['next','previous','pause','play','volume_up','volume_down','set_volume'].includes(action)){
   if(activeProvider==='vk'&&win&&!win.isDestroyed())selected='vk';
   else if(activeProvider==='spotify'&&spotify?.state().connected)selected='spotify';
   else if(win&&!win.isDestroyed()){const current=await state();if(current.vk.login==='signed-in'&&['playing','paused'].includes(current.vk.playback))selected='vk';}
   else if(spotify?.state().connected&&spotify.state().playback==='playing')selected='spotify';
  }
  if(selected==='spotify'){if(!spotify)throw Error('Подключение Spotify доступно в JARVIS.exe.');return {...await spotify.command(action==='start_music'?'my_tracks':action,args),service:'spotify'};}
  if(selected!=='vk')return {ok:false,error:'Для голосовой команды выбери VK во вкладке «Сервисы» или попроси включить музыку именно в VK.'};
  if(['my_tracks','play_track'].includes(action))return {ok:false,unsupported:true,error:'Мои треки в VK отключены. Выбери плейлист: «Для вас», «Открытия» или название своего плейлиста.'};
  if(action==='start_music')action='for_you';
  if(!win||win.isDestroyed())await open();
  if(action==='show'){backgroundMusic=false;win.maximize?.();win.show();win.focus();return {ok:true,...await state()};}
  win.webContents.setBackgroundThrottling?.(false);
  try{let current=await state();for(let i=0;['unknown','loading'].includes(current.vk.login)&&i<8;i++){await new Promise(resolve=>setTimeout(resolve,200));current=await state();}
  if(current.vk.login!=='signed-in'){if(current.vk.login==='required'){win.show();win.focus();}return {ok:false,error:current.vk.login==='required'?'Войди в VK в открывшемся окне.':'VK ещё не показал музыкальную библиотеку. Открой «Моя музыка» в окне VK.'};}
  if(!allowed(win.webContents.getURL()))throw Error('Окно вышло с сайта VK.');
  const execute=async(next,options)=>{let result=['volume_up','volume_down','set_volume'].includes(next)?await controlVolume(win,next,options):['mix','playlists','play_playlist','open_playlist','for_you','discoveries'].includes(next)?await controlLibrary(win,next,options):await controlPlayer(win,next,{background:true});if(result.needsLibrary&&win.webContents.getURL()!==preferences.vkLibrary){await win.loadURL(preferences.vkLibrary);result=await controlLibrary(win,next,options);}return result;};
  return {...await withMusicFallback(action,args,execute),service:'vk'};}finally{if(win&&!win.isDestroyed())win.webContents.setBackgroundThrottling?.(true);}

 }
 function command(action,provider='default',args={}){if(action==='status')return perform(action,provider,args);if(queued>=3)return Promise.resolve({ok:false,error:'Дождись выполнения предыдущей команды плеера.'});queued++;const operation=controlQueue.catch(()=>{}).then(()=>perform(action,provider,args));controlQueue=operation;return operation.then(result=>{if(result.ok&&['vk','spotify'].includes(result.service)&&!['show','playlists','open_playlist','status'].includes(action))activeProvider=result.service;return result;}).finally(()=>queued--);}
 async function disconnect(){close();await vkSession.clearStorageData();if(preferences.musicProvider==='vk')await save({...preferences,musicProvider:'youtube'});return state();}
 function close(){for(const child of children)if(!child.isDestroyed())child.destroy();children.clear();if(win&&!win.isDestroyed())win.destroy();win=null;if(activeProvider==='vk')activeProvider=null;}
 return {state,save,open,command,disconnect,close,spotify};
}
module.exports={createServices,libraryUrl,allowed,commandScript,probeScript};
