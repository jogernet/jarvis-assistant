const fs=require('node:fs/promises');
const path=require('node:path');
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const scopes='user-read-playback-state user-modify-playback-state user-library-read playlist-read-private playlist-read-collaborative';
const norm=value=>String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
class SpotifyService{
 constructor({home,encode,decode,fetch:fetcher=globalThis.fetch,openExternal,now=Date.now,redirectUri='http://127.0.0.1:3214/spotify/callback'}){
  Object.assign(this,{file:path.join(home,'spotify.enc'),encode,decode,fetch:fetcher,openExternal,now,redirectUri});this.config={};this.view={playback:'unknown',title:'',devices:[],playlists:[]};this.generation=0;this.saving=Promise.resolve();
 }
 async load(){try{this.config=JSON.parse(this.decode(await fs.readFile(this.file)));}catch(error){if(error.code!=='ENOENT')this.view.error='Не удалось прочитать подключение Spotify. Подключись заново.';}return this;}
 state(){return {connected:!!this.config.refreshToken,clientId:this.config.clientId||'',deviceId:this.config.deviceId||'',redirectUri:this.redirectUri,pending:!!this.pending,...structuredClone(this.view)};}
 async persist(){
  if(!this.encode)throw Error('Защищённое хранение Spotify доступно в JARVIS.exe.');const generation=this.generation,value=JSON.stringify(this.config);
  this.saving=this.saving.catch(()=>{}).then(async()=>{if(generation!==this.generation)return;await fs.mkdir(path.dirname(this.file),{recursive:true});if(generation!==this.generation)return;await fs.writeFile(this.file+'.tmp',this.encode(value));if(generation!==this.generation){await fs.rm(this.file+'.tmp',{force:true});return;}await fs.rename(this.file+'.tmp',this.file);});return this.saving;
 }
 async connect(clientId){
  if(!/^[a-f0-9]{32}$/i.test(clientId||''))throw Error('Вставь Client ID приложения из Spotify Dashboard: 32 символа. Client Secret не нужен.');
  const generation=++this.generation;this.pending=null;this.config={clientId,deviceId:''};await this.persist();if(generation!==this.generation)throw Error('Подключение Spotify отменено.');
  const verifier=randomBytes(48).toString('base64url'),state=randomBytes(32).toString('base64url');
  this.pending={verifier,state,expires:this.now()+600000,generation};
  const url=new URL('https://accounts.spotify.com/authorize');url.search=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:this.redirectUri,scope:scopes,state,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')}).toString();
  await this.openExternal(url.href);this.view.error='';return {ok:true,pending:true,...this.state()};
 }
 async callback(url){
  const pending=this.pending,state=url.searchParams.get('state')||'';
  if(!pending||this.now()>pending.expires||state.length!==pending.state.length||!timingSafeEqual(Buffer.from(state),Buffer.from(pending.state)))throw Error('Сеанс входа Spotify истёк или не совпадает. Нажми «Подключить» заново.');
  this.pending=null;if(url.searchParams.has('error'))throw Error('Авторизация Spotify отменена.');
  const code=url.searchParams.get('code');if(!code||code.length>4096)throw Error('Spotify не вернул код авторизации.');
  const token=await this.tokenRequest({grant_type:'authorization_code',code,redirect_uri:this.redirectUri,code_verifier:pending.verifier});
  if(pending.generation!==this.generation)throw Error('Подключение Spotify отменено.');
  this.acceptTokens(token);await this.persist();this.view.error='';return {ok:true};
 }
 async tokenRequest(values){
  const response=await this.fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.config.clientId,...values}),signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw Error('Spotify не принял авторизацию. Проверь Client ID, Redirect URI и доступ аккаунта в Dashboard.');return response.json();
 }
 acceptTokens(token){if(typeof token.access_token!=='string'||typeof(token.refresh_token||this.config.refreshToken)!=='string')throw Error('Spotify вернул неполную авторизацию.');Object.assign(this.config,{accessToken:token.access_token,refreshToken:token.refresh_token||this.config.refreshToken,expiresAt:this.now()+Math.max(60,Number(token.expires_in)||3600)*1000});}
 async refreshToken(){
  if(!this.config.refreshToken)throw Error('Сначала подключи Spotify во вкладке «Сервисы».');
  if(this.refreshing)return this.refreshing;
  const generation=this.generation;
  this.refreshing=(async()=>{const token=await this.tokenRequest({grant_type:'refresh_token',refresh_token:this.config.refreshToken});if(generation!==this.generation)throw Error('Spotify отключён.');this.acceptTokens(token);await this.persist();})().finally(()=>{this.refreshing=null;});return this.refreshing;
 }
 async request(route,{method='GET',body,retry=true}={}){
  if(!route.startsWith('/')||route.startsWith('//'))throw Error('Недопустимый запрос Spotify.');
  if(!this.config.accessToken||this.now()>=this.config.expiresAt-30000)await this.refreshToken();
  const generation=this.generation;
  const response=await this.fetch('https://api.spotify.com/v1'+route,{method,headers:{Authorization:'Bearer '+this.config.accessToken,...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000),redirect:'error'});
  if(generation!==this.generation)throw Error('Spotify отключён.');
  if(response.status===401&&retry){await this.refreshToken();return this.request(route,{method,body,retry:false});}
  if(response.status===403)throw Error('Spotify отклонил управление. Нужны Premium, разрешения и доступ аккаунта к приложению в Dashboard.');
  if(response.status===404)throw Error('Нет активного устройства Spotify. Открой Spotify на ПК, затем обнови устройства.');
  if(response.status===429)throw Error('Spotify ограничил запросы. Повтори через '+(Number(response.headers?.get('retry-after'))||30)+' сек.');
  if(!response.ok)throw Error('Ошибка Spotify API ('+response.status+').');if(response.status===204)return null;return response.json();
 }
 async refresh(){
  if(!this.config.refreshToken)return this.state();
  const [player,data]=await Promise.all([this.request('/me/player'),this.request('/me/player/devices')]);
  this.view.devices=(data?.devices||[]).filter(d=>!d.is_restricted).map(d=>({id:d.id,name:d.name,active:d.is_active,type:d.type}));
  Object.assign(this.view,{playback:player?(player.is_playing?'playing':'paused'):'unknown',title:player?.item?[...(player.item.artists||[]).map(a=>a.name),player.item.name].filter(Boolean).join(' — '):'',volume:player?.device?.volume_percent,activeDevice:player?.device?.name||'',error:''});return this.state();
 }
 async selectDevice(deviceId){if(typeof deviceId!=='string'||deviceId.length>200)throw Error('Некорректное устройство.');const data=await this.request('/me/player/devices');if(deviceId&&!(data?.devices||[]).some(d=>d.id===deviceId&&!d.is_restricted))throw Error('Устройство Spotify сейчас недоступно.');this.config.deviceId=deviceId;await this.persist();return {ok:true,...await this.refresh()};}
 async device(){const data=await this.request('/me/player/devices'),devices=(data?.devices||[]).filter(d=>!d.is_restricted);const selected=this.config.deviceId?devices.find(d=>d.id===this.config.deviceId):devices.find(d=>d.is_active)||(devices.length===1?devices[0]:null);if(!selected)throw Error(this.config.deviceId?'Выбранное устройство Spotify недоступно. Обнови список и выбери устройство.':'Открой Spotify на ПК и выбери устройство во вкладке «Сервисы».');return selected;}
 async playlists(){const result=[];for(let offset=0;offset<500;offset+=50){const page=await this.request('/me/playlists?limit=50&offset='+offset);for(const item of page?.items||[])if(item?.id&&item.name)result.push({id:item.id,name:item.name,uri:'spotify:playlist:'+item.id});if(!page?.next)break;}this.view.playlists=result;return result;}
 async command(action,args={}){
  if(action==='status')return {ok:true,...await this.refresh()};
  if(action==='show'){await this.openExternal('https://open.spotify.com');return {ok:true,opened:true,result:'Spotify открыт'};}
  if(action==='playlists')return {ok:true,playlists:await this.playlists()};
  let payload;
  if(['play_playlist','open_playlist','for_you','discoveries','mix'].includes(action)){
   const name=({for_you:'Для вас',discoveries:'Открытия',mix:'Daily Mix'})[action]||args.name;if(typeof name!=='string'||!name.trim()||name.length>160)throw Error('Укажи название плейлиста Spotify.');
   const list=await this.playlists(),exact=list.filter(p=>norm(p.name)===norm(name)),matches=exact.length?exact:list.filter(p=>norm(p.name).includes(norm(name)));
   if(matches.length!==1)throw Error(matches.length?'Есть несколько подходящих плейлистов Spotify. Уточни название.':'Такой плейлист не найден среди твоих плейлистов Spotify.');
   if(action==='open_playlist'){await this.openExternal('https://open.spotify.com/playlist/'+matches[0].id);return {ok:true,opened:true,name:matches[0].name};}payload={context_uri:matches[0].uri};
  }
  if(['my_tracks','play_track'].includes(action)){
   if(action==='play_track'&&(typeof args.name!=='string'||!args.name.trim()||args.name.length>160))throw Error('Укажи название сохранённого трека Spotify.');
   const saved=[];for(let offset=0;offset<(action==='my_tracks'?50:500);offset+=50){const page=await this.request('/me/tracks?limit=50&offset='+offset);saved.push(...(page?.items||[]).map(i=>i.track).filter(t=>t?.uri&&!t.is_local&&t.is_playable!==false));if(action==='my_tracks'||!page?.next)break;}
   const terms=norm(args.name).split(' ').filter(Boolean),found=action==='my_tracks'?saved:saved.filter(t=>terms.every(term=>norm(t.name+' '+(t.artists||[]).map(a=>a.name).join(' ')).includes(term)));
   if(!found.length)throw Error('Не найден доступный сохранённый трек Spotify.');if(action==='play_track'&&found.length>1)throw Error('Найдено несколько сохранённых треков. Уточни исполнителя.');payload={uris:found.slice(0,50).map(t=>t.uri)};
  }
  const device=await this.device(),query='device_id='+encodeURIComponent(device.id);
  if(['play','my_tracks','play_track','play_playlist','for_you','discoveries','mix'].includes(action))await this.request('/me/player/play?'+query,{method:'PUT',...(payload?{body:payload}:{})});
  else if(action==='pause')await this.request('/me/player/pause?'+query,{method:'PUT'});
  else if(['next','previous'].includes(action))await this.request('/me/player/'+action+'?'+query,{method:'POST'});
  else if(['set_volume','volume_up','volume_down'].includes(action)){let volume=args.volume;const step=args.step??10;if(!Number.isFinite(step)||step<1||step>100)throw Error('Шаг громкости должен быть от 1 до 100.');if(action!=='set_volume'){const state=await this.request('/me/player');if(state?.device?.id!==device.id||!Number.isFinite(state?.device?.volume_percent))throw Error('Не удалось узнать громкость выбранного устройства. Укажи процент явно.');volume=Math.max(0,Math.min(100,state.device.volume_percent+(action==='volume_up'?step:-step)));}if(!Number.isInteger(volume)||volume<0||volume>100)throw Error('Громкость должна быть от 0 до 100.');await this.request('/me/player/volume?volume_percent='+volume+'&'+query,{method:'PUT'});this.view.volume=volume;return {ok:true,accepted:true,volume,result:'Spotify принял громкость '+volume+'%'};}
  else throw Error('Неизвестная команда Spotify.');
  // A 204 confirms acceptance; do not claim observed playback before a fresh state.
  return {ok:true,accepted:true,service:'spotify',result:'Spotify принял команду: '+({play:'продолжить',pause:'пауза',next:'следующий трек',previous:'предыдущий трек',my_tracks:'мои треки',play_track:'выбранный трек',play_playlist:'выбранный плейлист',for_you:'плейлист',discoveries:'плейлист',mix:'микс'})[action]};
 }
 async disconnect(){this.generation++;this.pending=null;this.config={};this.view={playback:'unknown',title:'',devices:[],playlists:[]};await this.saving.catch(()=>{});await fs.rm(this.file,{force:true});return {ok:true,...this.state()};}
}
module.exports={SpotifyService};
