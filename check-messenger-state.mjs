import assert from 'node:assert/strict';
import {MessengerService} from './messenger-service.mjs';
import {ActionCenter} from './action-center.mjs';
import {createRequire} from 'node:module';
const {TelegramService}=createRequire(import.meta.url)('./telegram-service.cjs');
let fail=false,readChat='';
const messenger=new MessengerService(async(name,args)=>{
 if(name==='messenger_select'){if(fail)throw Error('Selection failed');return {ok:true,chat:'Alex',chatKey:'tg:1'};}
 if(name==='messenger_search')throw Error('Network unavailable');
 if(name==='messenger_draft')return {ok:true,draftText:args.text};
 if(name==='messenger_read'){readChat=args.chat;return {ok:true,text:'History'};}
 throw Error(name);
},new ActionCenter());
await messenger.command({service:'telegram',action:'select',id:'M1'});
await messenger.command({service:'telegram',action:'draft',text:'Keep my draft'});
await assert.rejects(()=>messenger.command({service:'telegram',action:'search',query:'Other'}),/Network unavailable/);
assert.equal(messenger.drafts.has('telegram'),true);
fail=true;await assert.rejects(()=>messenger.command({service:'telegram',action:'select',id:'M2'}),/Selection failed/);
await messenger.command({service:'telegram',action:'read'});assert.equal(readChat,'tg:1');assert.equal(messenger.drafts.has('telegram'),true);
console.log('PASS: failed search and failed selection preserve the selected chat and pending draft.');
let peerCalls=0,failPeer=false;
const telegram=new TelegramService({home:'runtime',encode:x=>x,decode:x=>x,sdk:()=>({Api:{}})});
telegram.phase='connected';telegram.client={connected:true,getDialogs:async()=>[1,2].map(id=>({entity:{id,firstName:'Alex',className:'User'},name:'Alex '+id})),getPeerId:async entity=>{if(failPeer&&++peerCalls===2)throw Error('Peer lookup failed');return String(entity.id);}};
const found=await telegram.command('messenger_search',{query:'Alex'});
failPeer=true;await assert.rejects(()=>telegram.command('messenger_search',{query:'Alex'}),/Peer lookup failed/);
assert.equal(telegram.candidates.size,2);assert.equal((await telegram.command('messenger_select',{id:found.candidates[1].id})).chatKey,'tg:2');
console.log('PASS: interrupted Telegram indexing preserves the complete previous candidate list.');
