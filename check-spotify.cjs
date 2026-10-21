const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {SpotifyService}=require('./spotify-service.cjs');
(async()=>{
 const home=await fs.mkdtemp(path.join(__dirname,'runtime','test-spotify-')),key=crypto.randomBytes(32),requests=[],opened=[];let clock=100000,failStatus=0;
 const encode=value=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]);};
 const decode=bytes=>{const cipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8');};
 const response=(data,status=200)=>({ok:status>=200&&status<300,status,headers:{get:()=>5},json:async()=>data});
 async function fetch(url,options={}){const u=new URL(url);requests.push({url,options});assert.ok(['accounts.spotify.com','api.spotify.com'].includes(u.hostname));assert.equal(options.redirect,'error');
  if(u.pathname==='/api/token')return response({access_token:'ACCESS_SECRET',refresh_token:'REFRESH_SECRET',expires_in:3600});
  assert.equal(options.headers.Authorization,'Bearer ACCESS_SECRET');if(failStatus){const code=failStatus;failStatus=0;return response({},code);}
  if(u.pathname==='/v1/me/player/devices')return response({devices:[{id:'A',name:'Computer',is_active:false,is_restricted:false},{id:'B',name:'Phone',is_active:true,is_restricted:false}]});
  if(u.pathname==='/v1/me/player'&&(!options.method||options.method==='GET'))return response({is_playing:true,item:{name:'Song',artists:[{name:'Artist'}]},device:{id:'A',name:'Computer',volume_percent:50}});
  if(u.pathname==='/v1/me/tracks')return response({items:[{track:{uri:'spotify:track:first',name:'First song',artists:[{name:'Artist'}]}},{track:{uri:'spotify:track:second',name:'Second song',artists:[{name:'Other'}]}}]});
  if(u.pathname==='/v1/me/playlists')return response({items:[{id:'rock',name:'Rock'},{id:'night',name:'Night'}]});
  return response(null,204);
 }
 const dependencies={home,encode,decode,fetch,now:()=>clock,openExternal:async url=>opened.push(url)};
 const service=await new SpotifyService(dependencies).load();await assert.rejects(()=>service.connect('not-a-client-id'));await service.connect('a'.repeat(32));
 const authorization=new URL(opened.at(-1));assert.equal(authorization.hostname,'accounts.spotify.com');assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');assert.equal(authorization.searchParams.get('redirect_uri'),'http://127.0.0.1:3214/spotify/callback');
 await assert.rejects(()=>service.callback(new URL('http://127.0.0.1:3214/spotify/callback?code=x&state=wrong')));
 const callback=new URL('http://127.0.0.1:3214/spotify/callback');callback.search=new URLSearchParams({code:'one-time-code',state:authorization.searchParams.get('state')}).toString();await service.callback(callback);
 const tokenBody=requests.find(r=>new URL(r.url).pathname==='/api/token').options.body;assert.equal(crypto.createHash('sha256').update(tokenBody.get('code_verifier')).digest('base64url'),authorization.searchParams.get('code_challenge'));await assert.rejects(()=>service.callback(callback),'OAuth callback cannot be replayed');
 assert.equal(service.state().connected,true);assert.ok(!JSON.stringify(service.state()).includes('SECRET'));const disk=await fs.readFile(path.join(home,'spotify.enc'));assert.ok(!disk.includes(Buffer.from('SECRET')),'Tokens must go through encrypted persistence');
 await service.selectDevice('A');const tracks=await service.command('my_tracks');assert.equal(tracks.accepted,true);assert.equal(tracks.verified,undefined,'API acceptance is not observed playback');let play=requests.filter(r=>new URL(r.url).pathname==='/v1/me/player/play').at(-1);assert.equal(new URL(play.url).searchParams.get('device_id'),'A');assert.deepEqual(JSON.parse(play.options.body).uris,['spotify:track:first','spotify:track:second']);
 await service.command('play_playlist',{name:'Night'});play=requests.filter(r=>new URL(r.url).pathname==='/v1/me/player/play').at(-1);assert.equal(JSON.parse(play.options.body).context_uri,'spotify:playlist:night');
 await service.command('play_track',{name:'Second Other'});play=requests.filter(r=>new URL(r.url).pathname==='/v1/me/player/play').at(-1);assert.deepEqual(JSON.parse(play.options.body).uris,['spotify:track:second']);
 await service.command('next');await service.command('previous');await service.command('pause');await service.command('volume_up');assert.ok(requests.some(r=>new URL(r.url).searchParams.get('volume_percent')==='60'));
 await assert.rejects(()=>service.command('set_volume',{volume:110}));await assert.rejects(()=>service.command('play_playlist',{name:'missing'}));await assert.rejects(()=>service.selectDevice('missing'));
 const loaded=await new SpotifyService(dependencies).load();assert.equal(loaded.state().deviceId,'A');clock+=3600000;await loaded.command('play');assert.ok(requests.some(r=>r.options.body instanceof URLSearchParams&&r.options.body.get('grant_type')==='refresh_token'));
 failStatus=403;await assert.rejects(()=>loaded.command('play'),/Premium/);failStatus=429;await assert.rejects(()=>loaded.command('play'),/5 сек/);
 await loaded.disconnect();assert.equal(loaded.state().connected,false);await assert.rejects(()=>fs.readFile(path.join(home,'spotify.enc')));await assert.rejects(()=>loaded.command('play'));
 console.log('PASS: Spotify PKCE/state/replay protection, encrypted persistence, refresh, device targeting, saved tracks, playlists, local controls and API error handling.');
})().catch(error=>{console.error(error);process.exitCode=1;});
