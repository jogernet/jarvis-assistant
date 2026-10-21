const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {TelegramService,loadSdk}=require('./telegram-service.cjs');
(async()=>{
 const home=await fs.mkdtemp(path.join(__dirname,'runtime','test-telegram-'));let clients=0,dialogs=0,reads=0,sends=0,qrHandler,completeAuth,disconnects=0,nonce=0;
 const entityA={id:1,firstName:'Alex',username:'alex_personal'},entityB={id:2,firstName:'Alex',username:'alex_work'};
 class SendMessage{constructor(args){Object.assign(this,args);}}class LogOut{}
 class Client{
  constructor(session){clients++;this.session=session;this.connected=false;}
  setLogLevel(){}
  async connect(){this.connected=true;}
  async disconnect(){this.connected=false;disconnects++;}
  async checkAuthorization(){return true;}
  async signInUserWithQrCode(_config,handlers){qrHandler=handlers;await handlers.qrCode({token:Buffer.from('secret-login-token'),expires:123});return new Promise(resolve=>{completeAuth=resolve;});}
  async getDialogs(){dialogs++;return [{entity:entityA,name:'Alex'},{entity:entityB,name:'Alex'}];}
  async getPeerId(entity){return String(entity.id);}
  async getInputEntity(entity){return {peer:entity.id};}
  async getMessages(entity,options){reads++;assert.equal(entity.id,2);if(options.search)assert.equal(options.search,'встреча');return [{id:11,date:100,out:false,senderId:2,message:'Привет'},{id:10,date:90,out:true,senderId:99,message:'Привет, как дела?'}];}
  async invoke(request){if(request instanceof SendMessage){sends++;assert.equal(request.peer.peer,2);assert.equal(request.message,'Ответ');assert.equal(typeof request.randomId,'bigint');}return {ok:true};}
 }
 const sdk=()=>({TelegramClient:Client,Api:{messages:{SendMessage},auth:{LogOut}},StringSession:class{constructor(value){this.value=value;}save(){return 'super-secret-session';}},randomLong:()=>BigInt(++nonce),qr:{toDataURL:async value=>'data:image/png;base64,'+Buffer.from(value).toString('base64')}});
 const encode=value=>Buffer.from('encrypted:'+Buffer.from(value).toString('base64')),decode=value=>Buffer.from(value.toString().slice(10),'base64').toString();
 const service=await new TelegramService({home,encode,decode,sdk,qrLogin:(client,_sdk,credentials,callbacks)=>client.signInUserWithQrCode(credentials,callbacks)}).load();
 await assert.rejects(()=>service.command('messenger_search',{query:'Alex'}),/Подключи Telegram/);assert.equal(clients,0,'No startup connections before login');
 await service.startLogin({apiId:'12345',apiHash:'a'.repeat(32)});await new Promise(r=>setImmediate(r));
 assert.equal(service.state().phase,'qr');assert.ok(!JSON.stringify(service.state()).includes('super-secret-session'));
 completeAuth({firstName:'Owner'});await service.authPromise;assert.equal(service.state().connected,true);
 const disk=await fs.readFile(path.join(home,'telegram.enc'),'utf8');assert.ok(!disk.includes('super-secret-session'));assert.ok(!disk.includes('a'.repeat(32)));
 const found=await service.command('messenger_search',{query:'Alex'});assert.equal(found.candidates.length,2);assert.notEqual(found.candidates[0].peerId,found.candidates[1].peerId);
 const selected=await service.command('messenger_select',{id:found.candidates[1].id});assert.equal(selected.chatKey,'tg:2');
 await service.command('messenger_search',{query:'Alex'});assert.equal(dialogs,1,'Dialog index is cached, not polled in background');
 const context={chat:selected.chatKey};const read=await service.command('messenger_read',context);assert.equal(read.visibleOnly,false);assert.ok(read.text.indexOf('как дела')<read.text.lastIndexOf('Привет'));
 await service.command('messenger_search_messages',{...context,query:'встреча'});assert.equal(reads,2);
 const draft=await service.command('messenger_draft',{...context,text:'Первый'});assert.equal(sends,0);
 await service.command('messenger_draft',{...context,text:'Ответ'});await assert.rejects(()=>service.command('messenger_restore',{...context,token:draft.undoToken}),/изменён/);
 await service.command('messenger_send',context);assert.equal(sends,1);await assert.rejects(()=>service.command('messenger_send',context),/черновик/);assert.equal(sends,1);
 await service.close();const restored=await new TelegramService({home,encode,decode,sdk,qrLogin:(client,_sdk,credentials,callbacks)=>client.signInUserWithQrCode(credentials,callbacks)}).load();assert.equal(restored.state().phase,'saved');assert.equal(restored.client,undefined,'Loading encrypted state does not start background requests');
 await restored.command('messenger_search',{query:'Alex'});assert.equal(restored.state().connected,true);
 const aborted=new AbortController();aborted.abort();await assert.rejects(()=>restored.command('messenger_read',context,aborted.signal),{name:'AbortError'});
 await restored.disconnect();await assert.rejects(()=>fs.readFile(path.join(home,'telegram.enc')),{code:'ENOENT'});
 const passwordService=new TelegramService({home,encode,decode,sdk,qrLogin:(client,_sdk,credentials,callbacks)=>client.signInUserWithQrCode(credentials,callbacks)});await passwordService.startLogin({apiId:'123',apiHash:'b'.repeat(32)});await new Promise(r=>setImmediate(r));const password=qrHandler.password();assert.equal(passwordService.state().phase,'password');passwordService.submitPassword('private-2fa');assert.equal(await password,'private-2fa');assert.ok(!JSON.stringify(passwordService.state()).includes('private-2fa'));await passwordService.close();
 console.log('PASS: Telegram QR/2FA, encrypted session, lazy reconnect, ambiguous peers, API history/search, cached dialogs, local drafts, guarded undo, unique send nonce, no duplicate send and logout.');
 try{const real=loadSdk();assert.equal(typeof real.TelegramClient,'function');console.log('PASS: Telegram client dependency loads.');}catch{console.log('NOTE: real Telegram dependency is not installed; network installation and live login remain unverified.');}
})().catch(error=>{console.error(error);process.exitCode=1;});
