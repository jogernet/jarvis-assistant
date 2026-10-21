const name=entity=>entity?.title||[entity?.firstName,entity?.lastName].filter(Boolean).join(' ')||(entity?.username?'@'+entity.username:'');
const incoming=m=>m&&m.out!==true&&(typeof m.message==='string'&&m.message.length>0||m.media)&&m.className!=='MessageService';
async function readInbox(client,mode,{minutes=60,assertActive=()=>{},request=operation=>operation(),now=Date.now()}={}){
 assertActive();const all=await request(()=>client.getDialogs({limit:1000}));assertActive();
 const since=Math.floor(now/1000)-minutes*60;
 const eligible=all.filter(d=>d.entity&&!d.entity.self&&(mode!=='unread_recent'||(d.unreadCount>0&&(!d.date||Number(d.date)>=since)))).sort((a,b)=>Number(b.date||b.message?.date||0)-Number(a.date||a.message?.date||0));
 let truncated=all.length>=1000||eligible.length>100,failedChats=0,best=null;const rows=[];
 for(const dialog of eligible.slice(0,100)){
  assertActive();const upper=Number(dialog.date||dialog.message?.date||0);
  if(mode==='latest_incoming'&&best&&upper&&upper<best.message.date)continue;
  const readMax=Number(dialog.dialog?.readInboxMaxId??0);
  let messages;
  try{messages=await request(()=>client.getMessages(dialog.entity,{limit:101,...(mode==='unread_recent'?{minId:readMax}:{})}));}catch(error){assertActive();failedChats++;continue;}
  assertActive();
  const hits=[...messages].filter(m=>incoming(m)&&(mode!=='unread_recent'||m.id>readMax&&m.date>=since)).sort((a,b)=>b.date-a.date||b.id-a.id);
  if(mode==='latest_incoming'){
   if(hits[0]&&(!best||hits[0].date>best.message.date))best={dialog,message:hits[0]};
   if(!hits.length&&messages.length>=101)truncated=true;
  }else{
   if(messages.length>=101&&messages[messages.length-1]?.date>=since)truncated=true;
   for(const message of hits)rows.push({dialog,message});
  }
 }
 if(failedChats)truncated=true;
 const selected=mode==='latest_incoming'?(best?[best]:[]):rows.sort((a,b)=>a.message.date-b.message.date||a.message.id-b.message.id);
 if(selected.length>200)truncated=true;
 const senders=new Map(),messages=[];
 for(const {dialog,message} of selected.slice(-200)){
  assertActive();const senderId=String(message.senderId||'');let sender=name(message.sender);
  if(!sender&&senderId){
   if(!senders.has(senderId)){
    try{const entity=message.getSender?await request(()=>message.getSender()):await request(()=>client.getEntity(message.senderId));senders.set(senderId,name(entity));}catch{assertActive();senders.set(senderId,'');}
   }
   sender=senders.get(senderId);
  }
  const chat=dialog.name||name(dialog.entity)||'Чат';
  sender=sender||(dialog.isUser||dialog.entity.className==='User'?chat:senderId?'Участник '+senderId:chat);
  const body=message.message||'[Вложение без текста]';if(body.length>4000)truncated=true;
  messages.push({id:message.id,date:message.date,chat,sender,senderId,text:body.slice(0,4000),out:false});
 }
 assertActive();let text=messages.map(m=>new Date(m.date*1000).toLocaleString('ru-RU')+' · От '+m.sender+(m.sender===m.chat?'':' · '+m.chat)+': '+m.text).join('\n\n');
 if(text.length>24000){text=text.slice(0,24000);truncated=true;}
 const note=truncated?' Показана часть результатов: достигнут предел проверки или часть чатов недоступна.':'';
 const result=(mode==='latest_incoming'?(messages.length?'Последнее найденное входящее сообщение.':'Входящих сообщений не найдено.'):'Непрочитанных входящих за последние '+minutes+' мин: '+messages.length+'.')+note;
 return {ok:true,service:'telegram',scope:'inbox',messages,text:(text||result)+(text&&note?'\n\n'+note:''),truncated,failedChats,minutes:mode==='unread_recent'?minutes:undefined,markedRead:false,result};
}
module.exports={readInbox};
