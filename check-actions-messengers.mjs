import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {ActionCenter} from './action-center.mjs';
import {MessengerService} from './messenger-service.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{parseQuickCommand}=require('./quick-commands.cjs');

const actions=new ActionCenter();let value=20;
await actions.run('Громкость',async(_signal,undo)=>{value=40;undo(async()=>{if(value!==40)throw Error('Изменено');value=20;return {ok:true};});return {ok:true};});
await actions.run('Чтение',async()=>({ok:true}),{undoable:false});assert.equal(actions.state().canUndo,true);
value=50;await assert.rejects(()=>actions.undo(),/Изменено/);assert.equal(value,50,'Undo must not overwrite a later user edit');
value=40;await actions.undo();assert.equal(value,20);assert.equal(actions.state().canUndo,false);
await actions.run('Отправка',async()=>({ok:true}),{reason:'Нельзя удалить автоматически'});await assert.rejects(()=>actions.undo(),/Нельзя удалить/);
let released;const busy=actions.run('Ожидание',signal=>new Promise((resolve,reject)=>{released=resolve;signal.addEventListener('abort',()=>reject(Error('cancelled')));}));
await assert.rejects(()=>actions.run('Второе действие',async()=>({ok:true})),/Дождись/);actions.cancel();await assert.rejects(()=>busy,/cancelled/);assert.equal(actions.state().history[0].phase,'cancelled');

const calls=[];let draft='',original='',sent=0,uncertain=false;
const messenger=new MessengerService(async(name,args,signal)=>{
 assert.equal(signal.aborted,false);calls.push({name,args});
 if(name==='messenger_search')return {ok:true,candidates:[{id:'M1',name:'Alex'},{id:'M2',name:'Alex'}]};
 if(name==='messenger_select')return {ok:true,chat:args.id==='M1'?'Alex personal':'Alex work'};
 if(name==='messenger_read')return {ok:true,text:'Текст переписки',chat:args.chat};
 if(name==='messenger_draft'){original=draft;draft=args.text;return {ok:true,undoToken:'test-token'};}
 if(name==='messenger_restore'){assert.equal(args.chat,'Alex work');if(draft!=='Новый ответ')throw Error('Черновик изменён');draft=original;return {ok:true};}
 if(name==='messenger_send'){sent++;if(uncertain)throw Error('Статус отправки неизвестен');draft='';return {ok:true};}
 throw Error(name);
},actions);
await assert.rejects(()=>messenger.command({service:'telegram',action:'send'},{sendAuthorized:true}),/выбери/);
const found=await messenger.command({service:'telegram',action:'search',query:'Alex'});assert.equal(found.candidates.length,2);assert.equal(calls.length,1,'Ambiguous search never selects automatically');
await messenger.command({service:'telegram',action:'select',id:'M2'});
await messenger.command({service:'telegram',action:'draft',text:'Новый ответ'});assert.equal(sent,0,'Draft never sends');
await actions.undo();assert.equal(draft,'');
await messenger.command({service:'telegram',action:'draft',text:'Привет'});
await assert.rejects(()=>messenger.command({service:'telegram',action:'send'}),/прямой просьбе/);assert.equal(sent,0);
uncertain=true;await assert.rejects(()=>messenger.command({service:'telegram',action:'send'},{sendAuthorized:true}),/неизвестен/);
await assert.rejects(()=>messenger.command({service:'telegram',action:'send'},{sendAuthorized:true}),/уже запрашивалась/);assert.equal(sent,1,'Unknown delivery cannot trigger duplicate sends');
await messenger.command({service:'telegram',action:'search',query:'Other'});await assert.rejects(()=>messenger.command({service:'telegram',action:'read'}),/выбери/);
await assert.rejects(()=>messenger.command({service:'skype',action:'read'}),/Неизвестная/);
assert.equal(parseQuickCommand('Джарвис найди чат с Сашей в телеграме').kind,'messenger');
assert.equal(parseQuickCommand('найди чат Alex в дискорде').service,'discord');
assert.equal(parseQuickCommand('отмени последнее действие').kind,'undo');
assert.equal(parseQuickCommand('не отправляй сообщение в телеграм'),null);

const {server,registerMessenger,registerComputer,registerServices,musicAction,actionCenter}=await import('./server.mjs');
async function request(url,method='GET',headers={},body=''){
 const req=Readable.from(body?[body]:[]);Object.assign(req,{url,method,headers:{host:'127.0.0.1:3213',...headers}});
 let status,content='';await new Promise(resolve=>server.emit('request',req,{setHeader(){},writeHead(s){status=s;},end(v){content+=v||'';resolve();}}));return {status,content};
}
const page=await request('/'),token=page.content.match(/name="jarvis-token" content="([^"]+)/)[1];
const post=(url,data)=>request(url,'POST',{'x-jarvis-token':token},JSON.stringify(data));
assert.equal((await request('/messenger','POST',{},'{}')).status,403);
registerComputer(async()=>({ok:true}));registerMessenger(async()=>({ok:true,candidates:[]}));
assert.equal((await post('/messenger',{service:'telegram',action:'search',query:'A'})).status,400,'Stopped controls reject messenger actions');
await post('/computer',{control:true,vision:false});
assert.equal((await post('/messenger',{service:'telegram',action:'search',query:'A'})).status,200);
assert.equal((await post('/actions',{action:'state'})).status,200);
let volume=25;registerServices({state:async()=>({vk:{volume,playback:'paused'}}),command:async(action,service,args)=>{volume=action==='volume_up'?volume+10:args.volume;return {ok:true,service:'vk',volume};}});
await musicAction('volume_up','vk');assert.equal(volume,35);await actionCenter.undo();assert.equal(volume,25);
await musicAction('volume_up','vk');volume=70;await assert.rejects(()=>actionCenter.undo(),/уже изменена/);assert.equal(volume,70);
await post('/computer',{stop:true});
console.log('PASS: guarded undo, read-only actions, cancellation, serial execution, recipient ambiguity, drafts, send authorization, duplicate-send prevention, messenger auth routes and volume rollback.');
