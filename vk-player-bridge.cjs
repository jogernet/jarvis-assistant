// Runs only in the official VK service window. Returns player state and button geometry,
// never credentials, cookies, audio stream URLs or account data.
async function vkBridge(mode,action,options={}){
 const music=/^\/(audio|music)/.test(location.pathname);
 const visible=e=>{if(!e?.getBoundingClientRect)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden';};
 const all=selector=>{try{return [...document.querySelectorAll(selector)];}catch{return [];}};
 const first=selector=>all(selector).find(visible);
 let player;try{if(typeof window.getAudioPlayer==='function')player=window.getAudioPlayer();}catch{}
 const media=all('audio').find(a=>(a.currentSrc||a.src)&&!a.paused)||all('audio').find(a=>a.currentSrc||a.src);
 const roots='.audio_page_player,.audio_page_player2,#audio_page_player,.top_audio_player,#top_audio_player,[data-testid="audio-player"]';
 const selectors={play:['.audio_page_player_play','.audio_page_player_icon--play','.top_audio_player_play','[data-testid="audio-player-play"]','.audio_row__play_btn'],pause:['.audio_page_player_play','.audio_page_player_icon--pause','.top_audio_player_play','[data-testid="audio-player-pause"]'],next:['.audio_page_player_next','.top_audio_player_next','[data-testid="audio-player-next"]'],previous:['.audio_page_player_prev','.top_audio_player_prev','[data-testid="audio-player-prev"]']};
 const words={play:/^(воспроизвести|включить|продолжить|play|resume)(\s|$)/i,pause:/^(пауза|приостановить|pause)(\s|$)/i,next:/^(следующ(ий|ая)|next)(\s|$)/i,previous:/^(предыдущ(ий|ая)|previous|prev)(\s|$)/i};
 function locate(command){
  const candidates=[];for(const selector of selectors[command]||[])for(const el of all(selector))candidates.push({el,selector});
  for(const root of all(roots))for(const el of root.querySelectorAll('button,[role="button"],[aria-label],[title],[onclick]')){const label=(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').trim();const click=el.getAttribute('onclick')||'';if(words[command]?.test(label)||(command==='next'&&/\bplayNext\s*\(/.test(click))||(command==='previous'&&/\bplayPrev\s*\(/.test(click)))candidates.push({el,selector:'player-label'});}
  for(const item of candidates){let el=item.el;if(!visible(el))continue;const clickable=el.closest('button,[role="button"],[onclick]');if(clickable&&visible(clickable)&&clickable.getBoundingClientRect().width<180)el=clickable;const rect=el.getBoundingClientRect();const x=rect.left+rect.width/2,y=rect.top+rect.height/2;if(x<0||y<0||x>=innerWidth||y>=innerHeight)continue;const hit=document.elementFromPoint(x,y);if(!hit||!(hit===el||el.contains(hit)))continue;if(mode==='click'){el.click();return {invoked:true,method:'VK DOM button'};}return {x,y,selector:item.selector,label:(el.getAttribute('aria-label')||el.getAttribute('title')||'').slice(0,80)};}
  return null;
 }
 function read(){
  let playback='unknown',position=Number.isFinite(media?.currentTime)?media.currentTime:null,current,trackId='',volume=null;
  try{if(typeof player?.getVolume==='function'){const value=Number(player.getVolume());if(Number.isFinite(value))volume=Math.round(value<=1?value*100:value);}else if(media)volume=Math.round(media.volume*100);}catch{}
  try{if(typeof player?.isPlaying==='function'){const value=player.isPlaying();if(typeof value==='boolean')playback=value?'playing':'paused';}if(typeof player?.getCurrentAudio==='function')current=player.getCurrentAudio();if(typeof player?.getCurrentTime==='function'){const value=player.getCurrentTime();if(Number.isFinite(value))position=value;}}catch{}
  if(current){const id=Array.isArray(current)?String(current[1])+'_'+String(current[0]):String(current.fullId||current.full_id||((current.owner_id??current.ownerId)!==undefined?(current.owner_id??current.ownerId)+'_'+current.id:current.id)||'');if(/^[a-zA-Z0-9_-]{1,100}$/.test(id))trackId=id;}
  if(playback==='unknown'&&media)playback=media.paused?'paused':'playing';
  if(playback==='unknown')try{const state=navigator.mediaSession?.playbackState;if(['playing','paused'].includes(state))playback=state;}catch{}
  if(playback==='unknown'){if(first('.audio_page_player_icon--pause,.audio_page_player_play.audio_playing,.top_audio_player.audio_playing,.top_audio_player_play.audio_playing'))playback='playing';else if(first('.audio_page_player_icon--play'))playback='paused';}
  if(playback==='unknown')for(const root of all(roots)){for(const button of root.querySelectorAll('[aria-label],[title]')){if(!visible(button))continue;const label=button.getAttribute('aria-label')||button.getAttribute('title')||'';if(words.pause.test(label)){playback='playing';break;}if(words.play.test(label))playback='paused';}if(playback!=='unknown')break;}
  let title='';try{const metadata=navigator.mediaSession?.metadata;if(metadata?.title)title=[metadata.artist,metadata.title].filter(Boolean).join(' — ');}catch{}
  if(!title){const label=first('.audio_page_player_title,.top_audio_player_title,.audio_page_player_title_song,[data-testid="audio-player-track-title"]');title=label?.textContent?.trim()||'';}
  if(!title&&current&&!Array.isArray(current))title=[current.performer||current.artist,current.title].filter(v=>typeof v==='string').join(' — ');
  const required=/^(id|login|oauth)\./.test(location.hostname)||!!first('input[type=password],form[action*=login]');
  const library=!!player||!!media||!!first('.audio_row,.audio_row__inner,[class*=AudioRow]')||all('h1,h2,a,button').some(e=>e.textContent?.trim()==='Моя музыка');
  return {login:required?'required':music&&library?'signed-in':'unknown',playback,volume,position,title:title.slice(0,240),trackId,playerApi:!!player,buttons:Object.fromEntries(['play','pause','next','previous'].map(key=>[key,!!locate(key)]))};
 }
 if(mode==='set-volume'){if(!Number.isFinite(options.volume)||options.volume<0||options.volume>100)return {invoked:false,error:'Громкость должна быть от 0 до 100.'};try{if(typeof player?.setVolume==='function'){const old=typeof player.getVolume==='function'?Number(player.getVolume()):null;player.setVolume(old>1?options.volume:options.volume/100);return {invoked:true};}if(media){media.volume=options.volume/100;return {invoked:true};}}catch{}return {invoked:false,error:'Этот плеер VK не предоставляет управление громкостью.'};}
 if(mode==='probe')return read();
 if(mode==='click')return locate(action)||{invoked:false};
 if(mode==='locate')return {target:locate(action)};
 if(mode==='invoke'){
  try{
   if(action==='play'&&media){await media.play();return {invoked:true,method:'media.play'};}
   if(action==='pause'&&media){media.pause();return {invoked:true,method:'media.pause'};}
   const methods={play:['resume','play'],pause:['pause'],next:['playNext'],previous:['playPrev']};
   for(const method of methods[action]||[])if(typeof player?.[method]==='function'){await player[method]();return {invoked:true,method:'VK.'+method};}
  }catch{return {invoked:false,error:'VK отклонил команду плеера.'};}
  return {invoked:false,error:'Не найдены кнопка или поддерживаемый метод плеера VK.'};
 }
 return {invoked:false};
}
const probeScript='/*jarvis-vk-probe-v2*/('+vkBridge.toString()+')('+JSON.stringify('probe')+')';
const bridgeScript=(mode,action,options)=>'('+vkBridge.toString()+')('+JSON.stringify(mode)+','+JSON.stringify(action)+(options===undefined?'':','+JSON.stringify(options))+')';
function confirmed(action,before,after){if(action==='play')return after.playback==='playing';if(action==='pause')return after.playback==='paused';const changed=!!(before.trackId&&after.trackId&&before.trackId!==after.trackId)||!!(before.title&&after.title&&before.title!==after.title);return changed||(action==='previous'&&Number.isFinite(before.position)&&Number.isFinite(after.position)&&before.position>2&&after.position<before.position-1);}
async function controlPlayer(win,action,{delay=ms=>new Promise(r=>setTimeout(r,ms)),attempts=8,background=false}={}){
 const contents=win.webContents,before=await contents.executeJavaScript(probeScript);
 if(['play','pause'].includes(action)&&confirmed(action,before,before))return {ok:true,verified:true,playback:before.playback,title:before.title,already:true};
 const located=await contents.executeJavaScript(bridgeScript('locate',action));let method;
 if(action==='pause'||background){const result=await contents.executeJavaScript(bridgeScript('invoke',action),true);if(result.invoked)method=result.method;else if(before.playback==='unknown')return {ok:false,error:'VK не сообщает состояние плеера. Открой его окно и проверь воспроизведение.'};}
 if(!method&&background){const result=await contents.executeJavaScript(bridgeScript('click',action),true);if(!result.invoked)return {ok:false,error:'Не найдена кнопка плеера VK.'};method=result.method;}
 if(!method&&located.target&&typeof contents.sendInputEvent==='function'){
  win.show();win.focus();contents.focus?.();const zoom=contents.getZoomFactor?.()||1,x=Math.round(located.target.x*zoom),y=Math.round(located.target.y*zoom);
  contents.sendInputEvent({type:'mouseMove',x,y});contents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});contents.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:1});method='VK player button';
 }else if(!method){const result=await contents.executeJavaScript(bridgeScript('invoke',action),true);if(!result.invoked)return {ok:false,error:result.error||'Не найдена кнопка плеера VK.',playback:before.playback};method=result.method;}
 let after=before;for(let i=0;i<attempts;i++){await delay(300);after=await contents.executeJavaScript(probeScript);if(confirmed(action,before,after))return {ok:true,verified:true,playback:after.playback,title:after.title,method};}
 return {ok:false,playback:after.playback,title:after.title,error:['next','previous'].includes(action)?'VK не подтвердил переключение трека. Открой «Моя музыка» и выбери первый трек, чтобы создать очередь.':'VK не подтвердил '+(action==='play'?'воспроизведение':'паузу')+'. Проверь плеер в окне VK.'};
}
function trustedClick(win,target){const contents=win.webContents;win.show();win.focus();contents.focus?.();const zoom=contents.getZoomFactor?.()||1,x=Math.round(target.x*zoom),y=Math.round(target.y*zoom);contents.sendInputEvent({type:'mouseMove',x,y});contents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});contents.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:1});}
async function controlVolume(win,action,args={},{delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){const contents=win.webContents,before=await contents.executeJavaScript(probeScript);let volume=args.volume;const step=args.step??10;if(!Number.isFinite(step)||step<1||step>100)return {ok:false,error:'Шаг громкости должен быть от 1 до 100.'};if(action!=='set_volume'){if(!Number.isFinite(before.volume))return {ok:false,error:'Не удалось прочитать громкость VK. Попробуй задать её явно, например 50%.'};volume=Math.max(0,Math.min(100,before.volume+(action==='volume_up'?step:-step)));}if(!Number.isFinite(volume)||volume<0||volume>100)return {ok:false,error:'Громкость должна быть от 0 до 100%.'};const result=await contents.executeJavaScript(bridgeScript('set-volume',action,{volume}),true);if(!result.invoked)return {ok:false,error:result.error};for(let i=0;i<5;i++){const after=await contents.executeJavaScript(probeScript);if(Number.isFinite(after.volume)&&Math.abs(after.volume-volume)<=2)return {ok:true,verified:true,volume:after.volume,result:'Громкость '+after.volume+'%'};await delay(150);}return {ok:false,error:'VK не подтвердил изменение громкости.'};}
module.exports={vkBridge,probeScript,bridgeScript,controlPlayer,controlVolume,trustedClick,confirmed};
