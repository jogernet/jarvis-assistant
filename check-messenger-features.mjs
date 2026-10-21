import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ActionCenter} from './action-center.mjs';
import {MessengerService} from './messenger-service.mjs';
import {sendRequested,sendConfirmed,deleteRequested} from './messenger-intent.mjs';
const require=createRequire(import.meta.url),fs=require('node:fs/promises'),path=require('node:path');
const {TelegramService,loadSdk}=require('./telegram-service.cjs'),{readInbox}=require('./telegram-inbox.cjs'),{parseQuickCommand}=require('./quick-commands.cjs');
for(const t of ['отправь Саше привет','напиши Саше привет','подготовь и отправь ответ','сгенерируй и отправь ответ'])assert.equal(sendRequested(t),true,t);
for(const t of ['не отправляй','только черновик','напиши черновик','подготовь ответ','не надо отправлять'])assert.equal(sendRequested(t),false,t);
for(const t of ['подтверждаю','да, отправляй','да','подтверждаю отправку'])assert.equal(sendConfirmed(t),true,t);
assert.equal(sendConfirmed('не подтверждаю'),false);assert.equal(deleteRequested('не удаляй сообщение'),false);
let sends=0,deletes=0;const sentId='S12345678-1234-1234-1234-123456789abc',actions=new ActionCenter();
const messenger=new MessengerService(async(name,args)=>{
 if(name==='messenger_select')return {ok:true,chatKey:'tg:2',chat:'Alex'};
 if(name==='messenger_draft')return {ok:true,undoToken:'U1',draftText:args.text};
 if(name==='messenger_send'){sends++;return {ok:true,sentId};}
 if(name==='messenger_delete_sent'){deletes++;assert.equal(args.id,sentId);return {ok:true,deleted:true};}
 if(name==='messenger_latest_incoming'||name==='messenger_unread_recent'){assert.equal(args.chat,undefined);return {ok:true,text:'От Alice: привет'};}
 return {ok:true};
},actions);
await messenger.command({service:'telegram',action:'latest_incoming'});
await messenger.command({service:'telegram',action:'unread_recent',minutes:60});
await assert.rejects(()=>messenger.command({service:'telegram',action:'send'},{userRequest:'подтверждаю'}),/выбери/);
await messenger.command({service:'telegram',action:'select',id:'M1'});
await assert.rejects(()=>messenger.command({service:'telegram',action:'send'},{userRequest:'подтверждаю'}),/прямой просьбе/);
await messenger.command({service:'telegram',action:'draft',text:'Привет'});
await messenger.command({service:'telegram',action:'send'},{userRequest:'подтверждаю'});assert.equal(sends,1);
await assert.rejects(()=>messenger.command({service:'telegram',action:'send'},{userRequest:'отправь'}),/уже запрашивалась/);
await actions.undo();assert.equal(deletes,1,'Undo after Telegram send deletes its exact receipt');
await messenger.command({service:'telegram',action:'draft',text:'Второе'});
await messenger.command({service:'telegram',action:'send'},{userRequest:'напиши Саше Второе'});assert.equal(sends,2);
await assert.rejects(()=>messenger.command({service:'telegram',action:'delete_sent',id:sentId}),/прямой просьбе/);
await messenger.command({service:'telegram',action:'delete_sent',id:sentId},{userRequest:'удали это сообщение'});assert.equal(deletes,2);
for(const [text,action] of [['прочитай последнее сообщение которое мне прислали','latest_incoming'],['озвучь непрочитанные сообщения и от кого за последний час','unread_recent'],['удали последнее отправленное сообщение в телеграме','delete_sent']])assert.equal(parseQuickCommand(text)?.action,action,text);
assert.equal(parseQuickCommand('не удаляй последнее отправленное сообщение'),null);

const sdk=loadSdk(),home=await fs.mkdtemp(path.join('runtime','test-telegram-messaging-'));
const encode=text=>Buffer.from(Buffer.from(text).toString('base64')),decode=bytes=>Buffer.from(bytes.toString(),'base64').toString();
const peer=new sdk.Api.InputPeerUser({userId:2n,accessHash:987654321n});let actualSends=0,actualDeletes=0,out=true,wrongPeer=false,shape='short';
const client={connected:true,getInputEntity:async()=>peer,getPeerId:async entity=>String(entity.userId??entity.id),
 getMessages:async(_peer,args)=>{if(!args.ids)return [{id:77,out:true,date:1,message:'Old own message',peerId:new sdk.Api.PeerUser({userId:2n})}];assert.deepEqual(args.ids,[77]);return [{id:77,out,peerId:new sdk.Api.PeerUser({userId:wrongPeer?3n:2n})}];},
 invoke:async request=>{assert.ok(request instanceof sdk.Api.messages.SendMessage);actualSends++;return shape==='short'?new sdk.Api.UpdateShortSentMessage({id:77,pts:1,ptsCount:1,date:1,out:true}):new sdk.Api.Updates({updates:[new sdk.Api.UpdateMessageID({id:77,randomId:request.randomId})],users:[],chats:[],date:1,seq:1});},
 deleteMessages:async(input,ids,options)=>{assert.ok(input instanceof sdk.Api.InputPeerUser);assert.equal(String(input.userId),'2');assert.deepEqual(ids,[77]);assert.deepEqual(options,{revoke:true});actualDeletes++;return [{pts:2,ptsCount:1}];}};
const service=new TelegramService({home,encode,decode});service.client=client;service.phase='connected';service.saved={apiId:123,apiHash:'a'.repeat(32),session:'fake-session'};service.chats.set('tg:2',{key:'tg:2',title:'Alex',entity:{id:2}});
await service.command('messenger_draft',{chat:'tg:2',text:'Do not store this message body'});
let result=await service.command('messenger_send',{chat:'tg:2'});assert.ok(result.sentId);assert.equal(result.receiptSaved,true);assert.equal(actualSends,1);
const ciphertext=await fs.readFile(path.join(home,'telegram.enc'),'utf8');assert.ok(!ciphertext.includes('Do not store'));assert.ok(!ciphertext.includes('987654321'));
const persisted=JSON.parse(decode(Buffer.from(ciphertext)));assert.ok(!JSON.stringify(persisted).includes('Do not store'));assert.equal(persisted.receipts.length,1);
const restored=await new TelegramService({home,encode,decode}).load();restored.client=client;restored.phase='connected';assert.equal(restored.receipts[0].id,result.sentId);
out=false;await assert.rejects(()=>restored.command('messenger_delete_sent',{id:result.sentId}),/не является исходящим/);assert.equal(actualDeletes,0);
out=true;wrongPeer=true;await assert.rejects(()=>restored.command('messenger_delete_sent',{id:result.sentId}),/не совпал/);assert.equal(actualDeletes,0);
wrongPeer=false;let deleted=await restored.command('messenger_delete_sent',{});assert.equal(deleted.deleted,true);assert.equal(actualDeletes,1);
await restored.command('messenger_delete_sent',{id:result.sentId});assert.equal(actualDeletes,1,'Deleting the same receipt is idempotent');
await assert.rejects(()=>restored.command('messenger_delete_sent',{id:'S00000000-0000-0000-0000-000000000000'}),/Нет сохранённого ID/);
shape='updates';await service.command('messenger_draft',{chat:'tg:2',text:'Second message'});result=await service.command('messenger_send',{chat:'tg:2'});assert.ok(result.sentId,'UpdateMessageID must map the random nonce to a sent receipt');

await assert.rejects(()=>service.command('messenger_delete_message',{chat:'tg:2',messageId:77}),/Сначала прочитай/);
await service.command('messenger_read',{chat:'tg:2'});await service.command('messenger_delete_message',{chat:'tg:2',messageId:77});assert.equal(actualDeletes,2,'Older own messages can be deleted after reading the exact selected chat');
await assert.rejects(()=>service.command('messenger_delete_message',{chat:'tg:2',messageId:999}),/Сначала прочитай/);
let callCount=0,searchCount=0;const discord=new MessengerService(async name=>{if(name==='messenger_call'){callCount++;return {ok:true,initiated:true,verificationPending:true,callState:'requested',chat:'Ваня',result:'Команда звонка выполнена'};}if(name==='messenger_search'){searchCount++;return {ok:true,candidates:[]};}throw Error(name);},new ActionCenter());
await assert.rejects(()=>discord.command({service:'discord',action:'call',query:'Ваня'},{userRequest:'не звони Ване',requestId:1}),/прямой просьбе/);
let callResult=await discord.command({service:'discord',action:'call',query:'Ваня'},{userRequest:'позвони контакту ваня в дискорде',requestId:2});assert.equal(callResult.initiated,true);assert.equal(callCount,1);
callResult=await discord.command({service:'discord',action:'search',query:'Ваня'},{userRequest:'позвони контакту ваня в дискорде',requestId:2});assert.equal(callResult.alreadyHandled,true);assert.equal(searchCount,0,'Do not turn a completed call into a failed follow-up contact search');
await discord.command({service:'discord',action:'call',query:'Ваня'},{userRequest:'позвони контакту ваня в дискорде',requestId:2});assert.equal(callCount,1,'Do not invoke the call twice in one user turn');
await discord.command({service:'discord',action:'search',query:'Ваня'},{userRequest:'найди чат Ваня',requestId:3});assert.equal(searchCount,1,'A new request can still search normally');
const now=Date.now(),sec=Math.floor(now/1000),seen=[];
const dialogs=[{entity:{id:1,className:'User'},name:'Alice',date:sec,unreadCount:2,dialog:{readInboxMaxId:10},isUser:true},{entity:{id:2,className:'User'},name:'Bob',date:sec-5,unreadCount:0,dialog:{readInboxMaxId:20},isUser:true}];
const inboxClient={getDialogs:async()=>dialogs,getMessages:async(entity,args)=>{seen.push(args);return entity.id===1?[
 {id:14,date:sec,out:true,message:'My outgoing'},
 {id:13,date:sec-60,out:false,message:'Unread new',senderId:1,getSender:async()=>({firstName:'Alice'})},
 {id:12,date:sec-4000,out:false,message:'Unread old',senderId:1},
 {id:9,date:sec-90,out:false,message:'Already read',senderId:1}
 ]:[{id:22,date:sec-5,out:true,message:'My outgoing to Bob'},{id:21,date:sec-15,out:false,message:'Latest incoming',senderId:2,getSender:async()=>({firstName:'Bob'})}];}};
result=await readInbox(inboxClient,'latest_incoming',{now});assert.equal(result.messages.length,1);assert.equal(result.messages[0].sender,'Bob');assert.equal(result.messages[0].text,'Latest incoming');assert.equal(result.markedRead,false);
seen.length=0;result=await readInbox(inboxClient,'unread_recent',{minutes:60,now});assert.equal(result.messages.length,1);assert.equal(result.messages[0].text,'Unread new');assert.equal(result.messages[0].sender,'Alice');assert.equal(seen[0].minId,10);assert.equal(result.markedRead,false);
const limited={getDialogs:async()=>Array.from({length:101},(_,i)=>({...dialogs[0],entity:{id:i+1},date:sec-i})),getMessages:async()=>[]};result=await readInbox(limited,'unread_recent',{now});assert.equal(result.truncated,true);assert.match(result.text,/часть результатов/);
await fs.rm(home,{recursive:true,force:true});
console.log('PASS: one confirmation, direct send, draft-only and negative intent, duplicate prevention, undo exact send, delete authorization, encrypted sent receipts, restart/delete, own-message and peer checks, update nonce IDs, latest incoming across chats, last-hour unread/sender filtering, no read acknowledgement and visible partial results.');
