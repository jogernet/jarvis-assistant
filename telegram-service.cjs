const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {signInQr}=require('./telegram-qr.cjs');
const {readInbox}=require('./telegram-inbox.cjs');
const {score,exactCandidates}=require('./chat-match.cjs');

function loadSdk(){
 try{const scoped=require('node:module').createRequire(path.join(__dirname,'telegram-runtime','package.json'));const {TelegramClient,Api}=scoped('telegram'),{StringSession}=scoped('telegram/sessions'),{generateRandomLong}=scoped('telegram/Helpers'),qr=scoped('qrcode'),{ConnectionTCPObfuscated}=scoped('telegram/network/connection'),{PromisedWebSockets,Logger}=scoped('telegram/extensions');return {TelegramClient,Api,StringSession,randomLong:generateRandomLong,qr,ConnectionTCPObfuscated,PromisedWebSockets,Logger};}
 catch{throw Error('Не удалось загрузить компоненты Telegram. Нажми «Подключить» для автоматической подготовки.');}
}
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
const label=entity=>entity.title||[entity.firstName,entity.lastName].filter(Boolean).join(' ')||entity.username||'Без названия';
const safeError=error=>{
 if(error?.telegramSetup)return error.message;
 if(error?.code==='TG_CONNECT_TIMEOUT')return 'Telegram не ответил при подключении. Прямое соединение и резервный защищённый канал недоступны. Проверь интернет или VPN и повтори подключение.';
 if(error?.code==='TG_QR_TIMEOUT')return 'Соединение установлено, но Telegram не выдал QR-код вовремя. Повтори подключение.';
 if(error?.code==='TG_API_TIMEOUT')return 'Telegram не ответил на запрос вовремя. Повтори действие.';
 const code=String(error?.errorMessage||error?.message||'');
 if(/MESSAGE_DELETE_FORBIDDEN|MESSAGE_AUTHOR_REQUIRED|CHAT_ADMIN_REQUIRED/.test(code))return 'Telegram не разрешил удалить это сообщение.';
 if(/PASSWORD_HASH_INVALID/.test(code))return 'Неверный пароль двухэтапной аутентификации.';
 if(/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/.test(code))return 'Вход Telegram отозван. Подключи аккаунт заново.';
 if(/FLOOD_WAIT|FLOOD_PREMIUM_WAIT/.test(code))return 'Telegram ограничил частоту запросов. Подожди перед новой попыткой.';
 if(/API_ID_INVALID/.test(code))return 'Telegram отклонил API ID / API Hash. Проверь их на my.telegram.org/apps.';
 if(/Не удалось загрузить компоненты Telegram/.test(code))return code;
 if(/CHAT_WRITE_FORBIDDEN|USER_BANNED|CHAT_RESTRICTED/.test(code))return 'В этот чат нельзя отправлять сообщения с текущего аккаунта.';
 return 'Не удалось выполнить запрос Telegram. Проверь подключение или повтори вход.';
};

class TelegramService{
 constructor({home,encode,decode,sdk=loadSdk,qrLogin=signInQr,prepare=async()=>{},connectTimeoutMs=12000,qrTimeoutMs=15000}){Object.assign(this,{encode,decode,sdkFactory:sdk,qrLogin,prepare,connectTimeoutMs,qrTimeoutMs});this.file=path.join(home,'telegram.enc');this.phase='disconnected';this.error='';this.generation=0;this.candidates=new Map();this.chats=new Map();this.drafts=new Map();this.undo=new Map();this.serial=0;this.revision=0;this.dialogs=null;this.dialogsAt=0;this.receipts=[];}
 sdk(){return this.sdkValue??=this.sdkFactory();}
 state(){return {phase:this.phase,connected:this.phase==='connected',saved:!!this.saved,account:this.account||this.saved?.account||'',error:this.error,detail:this.detail||'',startedAt:this.startedAt||0,transport:this.transport||'',canRetry:this.phase==='error'&&!!this.loginCredentials,qr:this.phase==='qr'?this.qr:'',expires:this.qrExpires||0};}
 async load(){try{this.saved=JSON.parse(this.decode(await fs.readFile(this.file)));this.receipts=Array.isArray(this.saved.receipts)?this.saved.receipts.filter(r=>/^S[a-f0-9-]{36}$/.test(r.id)&&Number.isInteger(r.messageId)&&r.messageId>0).slice(-2000):[];this.phase='saved';}catch(error){if(error.code!=='ENOENT'){this.phase='error';this.error='Не удалось прочитать защищённую сессию Telegram. Подключи аккаунт заново.';}}return this;}
 makeClient(config,transport='tcp'){
  const sdk=this.sdk(),session=new sdk.StringSession(config.session||'');
  const options={connectionRetries:1,reconnectRetries:1,retryDelay:500,requestRetries:1,timeout:8,floodSleepThreshold:0,deviceModel:'JARVIS Desktop',appVersion:'0.16.1',systemVersion:process.platform,...(sdk.Logger?{baseLogger:new sdk.Logger('none')}:{})};
  if(transport==='wss'){
   if(!sdk.ConnectionTCPObfuscated||!sdk.PromisedWebSockets)throw Error('Защищённый транспорт Telegram недоступен.');
   const dc=session.dcId||4,hosts={1:'pluto',2:'venus',3:'aurora',4:'vesta',5:'flora'};
   session.setDC(dc,(hosts[dc]||'vesta')+'.web.telegram.org',443);
   Object.assign(options,{useWSS:true,connection:sdk.ConnectionTCPObfuscated,networkSocket:sdk.PromisedWebSockets});
  }
  const client=new sdk.TelegramClient(session,config.apiId,config.apiHash,options);client.setLogLevel?.('none');if(transport==='wss'&&client.getDC){const getDC=client.getDC.bind(client);client.getDC=(dc,download=false)=>getDC(dc,download,true);}return client;
 }
 timed(operation,ms,code,signal){let timer,onAbort;const stopped=new Promise((_,reject)=>{onAbort=()=>reject(new DOMException('Операция отменена.','AbortError'));signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)onAbort();});return Promise.race([Promise.resolve(operation),stopped,new Promise((_,reject)=>{timer=setTimeout(()=>{const error=Error(code);error.code=code;reject(error);},ms);})]).finally(()=>{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);});}
 async dispose(client){if(!client)return;await this.timed(Promise.resolve().then(()=>client.destroy?client.destroy():client.disconnect()),2000,'TG_DISCONNECT_TIMEOUT').catch(()=>{});}
 async connectClient(config,generation,signal){
  let lastError;const transports=config.transport==='wss'?['wss']:['tcp','wss'];
  for(const transport of transports){
   signal?.throwIfAborted();if(generation!==this.generation)throw Error('Подключение отменено.');
   this.transport=transport;this.phase='connecting';this.detail=transport==='tcp'?'Устанавливаю прямое соединение с Telegram…':'Прямой канал не ответил. Пробую защищённый канал Telegram на порту 443…';
   const client=this.client=this.makeClient(config,transport);
   const connection=Promise.resolve().then(()=>client.connect());
   connection.then(()=>{if(generation!==this.generation||signal?.aborted||this.client!==client)this.dispose(client);},()=>{});
   try{const connected=await this.timed(connection,this.connectTimeoutMs,'TG_CONNECT_TIMEOUT',signal);signal?.throwIfAborted();if(generation!==this.generation)throw Error('Подключение отменено.');if(connected!==true&&client.connected!==true){const error=Error('TG_CONNECT_TIMEOUT');error.code='TG_CONNECT_TIMEOUT';throw error;}return client;}
   catch(error){lastError=error;await this.dispose(client);if(this.client===client)this.client=null;if(signal?.aborted||generation!==this.generation)throw error;}
  }
  if(!['API_ID_INVALID','AUTH_KEY_UNREGISTERED'].includes(lastError?.errorMessage)){const error=Error('TG_CONNECT_TIMEOUT');error.code='TG_CONNECT_TIMEOUT';throw error;}throw lastError;
 }
 async persist(config){const bytes=this.encode(JSON.stringify(config));this.persistPromise=(async()=>{await fs.mkdir(path.dirname(this.file),{recursive:true});const temp=this.file+'.tmp';await fs.writeFile(temp,bytes);await fs.rename(temp,this.file);this.saved=config;})();return this.persistPromise;}
 async startLogin(data){
  if(this.saved)throw Error('Сначала отключи сохранённый аккаунт Telegram перед новым входом.');
  const apiId=Number(data?.apiId),apiHash=String(data?.apiHash||'').trim();
  if(!Number.isSafeInteger(apiId)||apiId<=0||!/^\d{1,10}$/.test(String(data.apiId))||!/^[a-f0-9]{32}$/i.test(apiHash))throw Error('Введи числовой API ID и API Hash из my.telegram.org/apps.');
  await this.close();const generation=this.generation;this.loginCredentials={apiId,apiHash};this.loginAbort=new AbortController();const signal=this.loginAbort.signal;this.startedAt=Date.now();this.phase='preparing';this.detail='Проверяю компоненты Telegram…';this.error='';
  const active=()=>{signal.throwIfAborted();if(generation!==this.generation)throw Error('Вход отменён.');};
  this.authPromise=(async()=>{
   await this.prepare({signal,progress:message=>{if(generation===this.generation&&!signal.aborted)this.detail=message;}});active();this.sdk();
   const client=await this.connectClient({apiId,apiHash},generation,signal);active();
   this.phase='requesting_qr';this.detail='Соединение установлено. Получаю QR-код от Telegram…';
   let rejectQr;const deadline=new Promise((_,reject)=>{rejectQr=reject;});
   this.qrTimer=setTimeout(()=>{const error=Error('TG_QR_TIMEOUT');error.code='TG_QR_TIMEOUT';rejectQr(error);},this.qrTimeoutMs);
   const auth=this.qrLogin(client,this.sdk(),{apiId,apiHash},{
    qrCode:async({token,expires})=>{active();const image=await this.sdk().qr.toDataURL('tg://login?token='+Buffer.from(token).toString('base64url'),{width:240,margin:2});active();clearTimeout(this.qrTimer);this.qr=image;this.qrExpires=Number(expires)*1000;this.phase='qr';this.detail='Отсканируй QR и подтверди вход на телефоне. Проверяю подтверждение автоматически…';},
    password:async()=>{active();clearTimeout(this.qrTimer);this.qr='';this.phase='password';this.detail='Введи пароль двухэтапной защиты.';return new Promise((resolve,reject)=>{this.passwordWaiter={resolve,reject};});},
    onError:async error=>{if(error)this.lastAuthError=error;return true;}
   },{signal});
   const user=await Promise.race([auth,deadline]);active();this.phase='saving';this.detail='Сохраняю защищённую сессию…';
   this.account=label(user);await this.persist({apiId,apiHash,session:client.session.save(),account:this.account,transport:this.transport});active();this.phase='connected';this.loginCredentials=null;this.detail='Подключение готово.';this.qr='';this.error='';this.qrExpires=0;clearTimeout(this.authTimer);clearTimeout(this.qrTimer);
  })().catch(async error=>{if(generation===this.generation){clearTimeout(this.authTimer);clearTimeout(this.qrTimer);this.loginAbort.abort();this.phase='error';this.error=safeError(this.lastAuthError||error);this.lastAuthError=null;this.detail='';this.qr='';this.qrExpires=0;this.passwordWaiter?.reject(Error('Вход завершён.'));this.passwordWaiter=null;const failed=this.client;this.client=null;await this.dispose(failed);}});
  this.authTimer=setTimeout(()=>{if(generation===this.generation)this.close().then(()=>{if(this.generation===generation+1){this.phase='error';this.error='Время входа истекло. Подключи Telegram заново.';}});},180000);this.authTimer.unref?.();
  return this.state();
 }
 retryLogin(){if(!this.loginCredentials||this.phase!=='error')throw Error('Введи API ID и API Hash для нового входа.');return this.startLogin({...this.loginCredentials});}
 submitPassword(password){if(this.phase!=='password'||!this.passwordWaiter)throw Error('Сейчас пароль Telegram не запрашивается.');if(typeof password!=='string'||!password||password.length>512)throw Error('Введи пароль двухэтапной аутентификации.');const waiter=this.passwordWaiter;this.passwordWaiter=null;this.phase='requesting_qr';this.detail='Проверяю пароль…';waiter.resolve(password);return this.state();}
 async ensureClient(){
  if(this.phase==='connected'&&this.client?.connected)return this.client;
  if(['preparing','connecting','requesting_qr','saving','qr','password'].includes(this.phase))throw Error('Заверши вход Telegram в панели подключения.');
  if(!this.saved)throw Error('Подключи Telegram по QR-коду в разделе «Мессенджеры». Открывать Telegram Desktop не требуется.');
  if(this.connectPromise)return this.connectPromise;
  const generation=this.generation;this.connectionAbort=new AbortController();const signal=this.connectionAbort.signal;
  this.connectPromise=(async()=>{this.startedAt=Date.now();this.phase='preparing';await this.prepare({signal,progress:message=>this.detail=message});const client=await this.connectClient(this.saved,generation,signal);if(!await this.timed(client.checkAuthorization(),15000,'TG_API_TIMEOUT'))throw Error('AUTH_KEY_UNREGISTERED');this.phase='connected';this.detail='';this.error='';return client;})().catch(async error=>{if(generation===this.generation){this.phase='error';this.error=safeError(error);const failed=this.client;this.client=null;await this.dispose(failed);}throw Error(safeError(error));}).finally(()=>{this.connectPromise=null;});
  return this.connectPromise;
 }
 async close(){clearTimeout(this.authTimer);clearTimeout(this.qrTimer);this.loginAbort?.abort();this.connectionAbort?.abort();this.loginCredentials=null;this.generation++;this.lastAuthError=null;this.detail='';this.passwordWaiter?.reject(Error('Вход отменён.'));this.passwordWaiter=null;const client=this.client;this.client=null;this.qr='';this.qrExpires=0;this.candidates.clear();this.chats.clear();this.drafts.clear();this.undo.clear();this.dialogs=null;this.dialogsAt=0;this.contacts=null;this.contactsAt=0;this.phase=this.saved?'saved':'disconnected';await this.persistPromise?.catch(()=>{});if(client)await this.dispose(client);}
 async disconnect(){
  let client=this.client,revoked=false;if(!client&&this.saved){try{client=this.makeClient(this.saved,this.saved.transport||'tcp');}catch{}}
  await this.close();if(client){try{await this.timed(client.connect(),this.connectTimeoutMs,'TG_CONNECT_TIMEOUT');await this.timed(client.invoke(new (this.sdk().Api.auth.LogOut)({})),10000,'TG_API_TIMEOUT');revoked=true;}catch{}finally{await this.dispose(client);}}
  this.saved=null;this.receipts=[];this.account='';this.phase='disconnected';this.error=revoked?'':'Локальный вход удалён. Отзыв сессии на сервере не подтверждён; при необходимости заверши сеанс JARVIS в Telegram → Устройства.';await fs.rm(this.file,{force:true});return this.state();
 }
 async rememberReceipts(){if(!this.saved)return false;try{await this.persist({...this.saved,receipts:this.receipts});return true;}catch{return false;}}
 receiptPeer(record){const {Api}=this.sdk(),input=record.input;if(!input)throw Error('Не сохранён точный адрес сообщения. Удаление остановлено.');if(input.type==='InputPeerSelf')return new Api.InputPeerSelf();const field={InputPeerUser:'userId',InputPeerChannel:'channelId',InputPeerChat:'chatId'}[input.type];if(!field)throw Error('Неизвестный адрес сообщения.');return new Api[input.type]({[field]:BigInt(input.id),...(input.accessHash?{accessHash:BigInt(input.accessHash)}:{})});}
 async deleteSent(client,args,assertActive,signal,override){
  const record=override||(args.id?this.receipts.find(r=>r.id===args.id):[...this.receipts].reverse().find(r=>!r.deleted));
  if(!record)throw Error('Нет сохранённого ID отправленного Джарвисом сообщения. Можно удалять сообщения, отправленные после этого обновления.');
  if(record.deleted)return {ok:true,service:'telegram',sentId:record.id,deleted:true,result:'Это сообщение уже удалено.'};
  const peer=this.receiptPeer(record);let messages;
  try{messages=await this.timed(client.getMessages(peer,{ids:[record.messageId]}),15000,'TG_API_TIMEOUT',signal);}catch(error){throw Error(safeError(error));}
  assertActive();const message=messages.find(m=>m?.id===record.messageId&&m.className!=='MessageEmpty');
  if(!message)throw Error('Сообщение не найдено в Telegram. Удаление не выполнялось.');
  if(message.out!==true)throw Error('Сообщение не является исходящим. Удаление остановлено.');
  if(message.peerId&&'tg:'+String(await client.getPeerId(message.peerId))!==record.chatKey)throw Error('Чат сообщения не совпал. Удаление остановлено.');
  assertActive();try{await this.timed(client.deleteMessages(peer,[record.messageId],{revoke:true}),15000,'TG_API_TIMEOUT',signal);}catch(error){throw Error(safeError(error));}
  record.deleted=true;const receiptSaved=await this.rememberReceipts();
  return {ok:true,service:'telegram',sentId:record.id,deleted:true,receiptSaved,result:'Исходящее сообщение в чате «'+record.chat+'» удалено у всех участников.'};
 }
 async command(name,args,signal){
  const generation=this.generation;const assertActive=()=>{signal?.throwIfAborted();if(generation!==this.generation)throw Error('Аккаунт Telegram отключён.');};assertActive();const client=await this.ensureClient();assertActive();const action=name.replace(/^messenger_/,'');
  if(action==='latest_incoming'||action==='unread_recent'){const minutes=args.minutes??60;if(!Number.isInteger(minutes)||minutes<1||minutes>1440)throw Error('Укажи период от 1 до 1440 минут.');return readInbox(client,action,{minutes,assertActive,request:operation=>this.timed(Promise.resolve().then(operation),15000,'TG_API_TIMEOUT',signal)});}
  if(action==='delete_sent')return this.deleteSent(client,args,assertActive,signal);
  if(action==='search'){
   const query=normalize(args.query),nextCandidates=new Map();
   if(!query||query.length>100)throw Error('Введи имя чата до 100 символов.');
   if(!this.dialogs||Date.now()-this.dialogsAt>60000){try{this.dialogs=await client.getDialogs({limit:1000});this.dialogsAt=Date.now();}catch(error){throw Error(safeError(error));}}
   assertActive();const hits=[],entities=new Map();let contactsUnavailable=false;
   const add=(entity,title)=>{if(!entity)return;const aliases=[title,label(entity),entity.username,entity.firstName,entity.lastName],rank=score(args.query,aliases);if(rank)entities.set((entity.className||'peer')+':'+String(entity.id),{entity,title,aliases,rank});};
   for(const dialog of this.dialogs)add(dialog.entity,dialog.name||label(dialog.entity||{}));
   if(this.sdk().Api.contacts?.GetContacts){
    try{if(!this.contacts||Date.now()-this.contactsAt>300000||!entities.size){const result=await this.timed(client.invoke(new (this.sdk().Api.contacts.GetContacts)({hash:0n})),10000,'TG_API_TIMEOUT',signal);assertActive();this.contacts=result.users||[];this.contactsAt=Date.now();}for(const entity of this.contacts)add(entity,label(entity));}catch(error){assertActive();contactsUnavailable=true;if(!entities.size&&/AUTH_KEY_UNREGISTERED|SESSION_REVOKED/.test(String(error.errorMessage)))throw Error(safeError(error));}
   }
   if(/^@?[a-z0-9_]{5,32}$/i.test(args.query.trim())&&(args.query.trim().startsWith('@')||!entities.size)){
    try{const entity=await client.getEntity('@'+args.query.trim().replace(/^@/,''));add(entity,label(entity));}catch(error){assertActive();if(!entities.size&&!/USERNAME_NOT_OCCUPIED|USERNAME_INVALID/.test(String(error?.errorMessage)))throw Error(safeError(error));}
   }
   const sorted=[...entities.values()].sort((a,b)=>b.rank-a.rank||a.title.localeCompare(b.title,'ru'));
   for(const {entity,title,aliases,rank} of sorted.slice(0,40)){const id='M'+(++this.serial),key='tg:'+String(await client.getPeerId(entity));assertActive();const entry={entity,title,key,aliases};nextCandidates.set(id,entry);hits.push({id,name:title+(entity.username?' · @'+entity.username:''),aliases,peerId:key,match:rank>=98?'exact':'similar',role:entity.className||'chat'});}
   this.candidates=nextCandidates;for(const entry of nextCandidates.values())this.chats.set(entry.key,entry);
   return {ok:true,service:'telegram',candidates:hits,truncated:sorted.length>40||this.dialogs.length>=1000||contactsUnavailable,result:hits.length?'Найдено чатов: '+hits.length+'. Выбери получателя.':contactsUnavailable?'В загруженных диалогах чат не найден, а поиск контактов временно недоступен. Повтори запрос или укажи @username.':'Чат не найден. Уточни имя или @username.',...(!hits.length?{hint:'Можно искать имя без пробелов, по части имени или @username.'}:{})};
  }
  if(action==='select'){
   let entry=this.candidates.get(args.id);
   if(!entry){const found=exactCandidates(args.id,[...this.candidates].map(([id,e])=>({id,name:e.title,peerId:e.key,aliases:e.aliases})));if(found.length===1)entry=this.candidates.get(found[0].id);}
   if(!entry)throw Error('Выбери один из найденных чатов по имени или кнопкой в панели.');
   return {ok:true,service:'telegram',chat:entry.title,chatKey:entry.key,draftText:this.drafts.get(entry.key)?.text||'',result:'Выбран чат: '+entry.title};
  }
  const entry=this.chats.get(args.chat);if(!entry)throw Error('Сначала найди и выбери чат заново.');
  const output=result=>({ok:true,service:'telegram',chat:entry.title,chatKey:entry.key,...result});
  if(action==='delete_message'){
   if(!Number.isInteger(args.messageId)||!entry.outgoingIds?.has(args.messageId))throw Error('Сначала прочитай этот чат: удалять можно только исходящие сообщения из полученной истории.');
   const peer=await client.getInputEntity(entry.entity);assertActive();const type=peer.className,field={InputPeerUser:'userId',InputPeerChannel:'channelId',InputPeerChat:'chatId'}[type];
   const input=type==='InputPeerSelf'?{type}:field?{type,id:String(peer[field]),...(peer.accessHash!==undefined?{accessHash:String(peer.accessHash)}:{})}:null;
   const result=await this.deleteSent(client,{},assertActive,signal,{messageId:args.messageId,chat:entry.title,chatKey:entry.key,input});entry.outgoingIds.delete(args.messageId);return result;
  }
  if(action==='read'||action==='search_messages'){
   const query=action==='search_messages'?String(args.query||'').trim():'';
   if(action==='search_messages'&&(!query||query.length>200))throw Error('Введи текст для поиска до 200 символов.');
   let messages;try{messages=await client.getMessages(entry.entity,{limit:30,...(query?{search:query}:{})});}catch(error){throw Error(safeError(error));}assertActive();
   entry.outgoingIds??=new Set();for(const message of messages)if(message.out===true)entry.outgoingIds.add(message.id);
   const rows=[...messages].reverse().map(message=>({id:message.id,date:message.date,out:message.out===true,sender:message.senderId?String(message.senderId):'',text:message.message||'[Медиа или служебное сообщение]'}));
   const text=rows.map(row=>new Date(row.date*1000).toLocaleString('ru-RU')+' · '+(row.out?'Ты':row.sender||'Собеседник')+': '+row.text).join('\n\n').slice(0,16000);
   return output({messages:rows,text:text||'Сообщений не найдено.',draftText:this.drafts.get(entry.key)?.text||'',visibleOnly:false,result:query?'Результаты поиска в чате «'+entry.title+'».':'Последние '+rows.length+' сообщений чата «'+entry.title+'». Окно Telegram не использовалось.'});
  }
  if(action==='draft'){
   if(typeof args.text!=='string'||!args.text.trim()||args.text.length>4000)throw Error('Длина сообщения: от 1 до 4000 символов.');
   const before=this.drafts.get(entry.key)?.text||'',revision=++this.revision,token=randomUUID();this.drafts.set(entry.key,{text:args.text,revision,randomId:this.sdk().randomLong()});this.undo.clear();this.undo.set(token,{key:entry.key,before,revision});
   return output({undoToken:token,draftText:args.text,result:'Черновик сохранён в Джарвисе. Сообщение не отправлено.'});
  }
  if(action==='restore'){
   const record=this.undo.get(args.token),current=this.drafts.get(entry.key);if(!record||record.key!==entry.key||current?.revision!==record.revision)throw Error('Черновик уже изменён. Отмена остановлена.');
   this.drafts.set(entry.key,{text:record.before,revision:++this.revision,randomId:this.sdk().randomLong()});this.undo.delete(args.token);return output({draftText:record.before,result:'Предыдущий черновик восстановлен.'});
  }
  if(action==='send'){
   const draft=this.drafts.get(entry.key);if(!draft?.text.trim())throw Error('Сначала создай черновик в Джарвисе.');assertActive();
   let response,peer;
   try{peer=await client.getInputEntity(entry.entity);assertActive();response=await client.invoke(new (this.sdk().Api.messages.SendMessage)({peer,message:draft.text,randomId:draft.randomId,noWebpage:true}));}catch(error){throw Error(safeError(error)+' Не буду отправлять автоматически: сначала проверь чат.');}
   assertActive();const messageId=response?.className==='UpdateShortSentMessage'?response.id:response?.updates?.find(u=>u.className==='UpdateMessageID'&&String(u.randomId)===String(draft.randomId))?.id;
   let sentId,receiptSaved=false;
   if(Number.isInteger(messageId)&&messageId>0){
    const type=peer.className,field={InputPeerUser:'userId',InputPeerChannel:'channelId',InputPeerChat:'chatId'}[type];
    const input=type==='InputPeerSelf'?{type}:field?{type,id:String(peer[field]),...(peer.accessHash!==undefined?{accessHash:String(peer.accessHash)}:{})}:null;
    if(input){sentId='S'+randomUUID();this.receipts.push({id:sentId,messageId,chat:entry.title,chatKey:entry.key,input,at:Date.now()});this.receipts=this.receipts.slice(-2000);receiptSaved=await this.rememberReceipts();}
   }
   this.drafts.delete(entry.key);this.undo.clear();
   return output({draftText:'',submitted:true,deliveryConfirmed:false,sentId,receiptSaved,result:'Telegram принял сообщение в чат «'+entry.title+'».'+(sentId?' Можно удалить его командой «удали последнее отправленное сообщение».': ' Telegram не вернул ID: удаление через Джарвис пока недоступно.')+(sentId&&!receiptSaved?' ID доступен до закрытия Джарвиса; сохранить его на диск не удалось.':'')});
  }
  throw Error('Неизвестная команда Telegram.');
 }
}
module.exports={TelegramService,loadSdk,safeError};
