(()=>{
 const $=id=>document.getElementById(id),token=document.querySelector('meta[name="jarvis-token"]').content;
 const request=async(path,data)=>{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Jarvis-Token':token},body:JSON.stringify(data),signal:AbortSignal.timeout(90000)});const result=await response.json();if(!response.ok||result.ok===false)throw Error(result.error||'Действие не подтверждено.');return result;};
 const add=(parent,tag,text,cls)=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;parent.append(el);return el;};
 const phases={running:'Выполняется',finished:'Готово',cancelled:'Остановлено',error:'Ошибка'};
 function actions(state){
  const row=state.current||state.history[0];window.jarvisActivity?.actionState(row);
  $('action-current').textContent=row?row.label:'Готов к команде';$('action-phase').textContent=row?phases[row.phase]:'Ожидание';
  $('action-result').textContent=row?.error||(row?.durationMs!==undefined?'Выполнение: '+row.durationMs+' мс':'Ход выполнения появится здесь.');
  $('action-cancel').disabled=!state.current;$('action-undo').disabled=!state.canUndo;$('undo-last').disabled=!state.canUndo;
  $('action-undo-note').textContent=state.canUndo?'Доступна отмена последнего действия.':state.undoReason;
  $('action-history').replaceChildren();
  for(const item of state.history){const el=add($('action-history'),'article','','action-row');add(el,'strong',item.label);add(el,'small',new Date(item.at).toLocaleTimeString('ru-RU')+' · '+phases[item.phase]+(item.durationMs!==undefined?' · '+item.durationMs+' мс':''));if(item.error)add(el,'p',item.error);}
 }
 async function action(name){try{const result=await request('/actions',{action:name});$('action-result').textContent=result.result||'';actions(await request('/actions',{action:'state'}));}catch(error){$('action-result').textContent=error.message;}}
 $('action-cancel').onclick=()=>action('cancel');$('action-undo').onclick=$('undo-last').onclick=()=>action('undo');
 window.addEventListener('jarvis:actions',e=>actions(e.detail));
 window.addEventListener('jarvis:visible',()=>request('/actions',{action:'state'}).then(actions).catch(()=>{}));
 const service=()=>$('messenger-provider').value;
 let selectedService=null,draftDirty=false;
 let providerRevision=0;
 const syncProviderButtons=()=>{for(const id of ['messenger-latest','messenger-unread','messenger-delete-last'])$(id).disabled=service()!=='telegram';};
 const updateDraftButtons=()=>{$('messenger-send').disabled=!selectedService||!$('messenger-text').value.trim();};
 function result(data){
  $('messenger-status').textContent=data.result||'';
  if(data.candidates){$('messenger-content').textContent='';$('messenger-text').value='';$('messenger-draft-recipient').textContent='Выбери получателя из результатов поиска.';$('messenger-draft-status').textContent='Черновика пока нет.';$('messenger-candidates').replaceChildren();$('messenger-chat').textContent='Чат не выбран';selectedService=null;$('messenger-read').disabled=$('messenger-draft').disabled=$('messenger-send').disabled=$('messenger-generate').disabled=true;
   for(const candidate of data.candidates){const button=add($('messenger-candidates'),'button',candidate.name,'messenger-candidate');button.onclick=()=>run({action:'select',id:candidate.id});}
  }
  if(data.chat){$('messenger-chat').textContent=data.chat;selectedService=data.service||service();$('messenger-read').disabled=$('messenger-draft').disabled=$('messenger-send').disabled=$('messenger-generate').disabled=false;}
  if(Object.hasOwn(data,'text'))$('messenger-content').textContent=data.text;
  if(Object.hasOwn(data,'draftText')){
   $('messenger-text').value=data.draftText;draftDirty=false;
   $('messenger-draft-recipient').textContent=data.chat?'Кому: '+data.chat:'Получатель не выбран';
   $('messenger-draft-status').textContent=data.draftText?'Черновик готов. Проверь текст; его можно изменить перед отправкой.':data.submitted?'Сообщение отправлено.':'Черновика пока нет.';
   if(data.draftText){window.dispatchEvent(new CustomEvent('jarvis:panel',{detail:'messengers'}));$('messenger-draft-editor').scrollIntoView?.({block:'start',behavior:'smooth'});}
  }
  updateDraftButtons();
  $('messenger-search-text').disabled=!(selectedService==='telegram');
 }
 let busy=false;
 async function run(data){if(busy)return;const provider=service(),revision=providerRevision;busy=true;$('messenger-status').textContent='Выполняю…';try{const response=await request('/messenger',{...data,service:provider});if(provider!==service()||revision!==providerRevision)return;result(response);return response;}catch(error){if(provider===service()&&revision===providerRevision)$('messenger-status').textContent=error.message;}finally{busy=false;}}
 $('messenger-search').onclick=()=>run({action:'search',query:$('messenger-query').value});
 $('messenger-query').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('messenger-search').click();}});
 $('messenger-provider').onchange=()=>{providerRevision++;$('messenger-status').textContent='';$('messenger-text').value='';draftDirty=false;$('messenger-draft-recipient').textContent='Сначала выбери получателя.';$('messenger-draft-status').textContent='Черновика пока нет.';for(const id of ['messenger-latest','messenger-unread','messenger-delete-last'])$(id).disabled=service()!=='telegram';$('messenger-search-text').disabled=true;selectedService=null;$('messenger-chat').textContent='Чат не выбран';$('messenger-candidates').replaceChildren();$('messenger-content').textContent='';$('messenger-read').disabled=$('messenger-draft').disabled=$('messenger-send').disabled=$('messenger-generate').disabled=true;};
 $('messenger-search-text').onclick=()=>run({action:'search_messages',query:$('messenger-message-query').value});
 $('messenger-read').onclick=()=>run({action:'read'});
 $('messenger-draft').onclick=()=>run({action:'draft',text:$('messenger-text').value});
 $('messenger-text').addEventListener('input',()=>{draftDirty=true;$('messenger-draft-status').textContent='Есть правки. При отправке будет использован текст из этого поля.';updateDraftButtons();});
 $('messenger-send').onclick=async()=>{if(busy)return;if(draftDirty){const saved=await run({action:'draft',text:$('messenger-text').value});if(!saved)return;}return run({action:'send'});};
 $('messenger-latest').onclick=()=>run({action:'latest_incoming'});
 $('messenger-unread').onclick=()=>run({action:'unread_recent',minutes:60});
 $('messenger-delete-last').onclick=()=>run({action:'delete_sent'});
 $('messenger-generate').onclick=()=>{if(!selectedService)return;$('text').value='Прочитай сообщения в выбранном чате '+(service()==='telegram'?'Telegram':'Discord')+' через messenger_control read и подготовь уместный ответ'+($('messenger-instruction').value.trim()?'. Пожелания: '+$('messenger-instruction').value.trim():'')+'. Помести его в черновик через messenger_control draft. Не отправляй.';$('form').requestSubmit();};
 window.addEventListener('jarvis:messenger',e=>{if(e.detail.service&&service()!==e.detail.service){$('messenger-provider').value=e.detail.service;$('messenger-provider').onchange();}syncProviderButtons();result(e.detail);window.dispatchEvent(new CustomEvent('jarvis:panel',{detail:'messengers'}));if(e.detail.draftText)$('messenger-draft-editor').scrollIntoView?.({block:'start',behavior:'smooth'});});
 $('wake-reply-enabled').checked=localStorage.getItem('jarvis-wake-reply')!=='false';$('wake-reply-enabled').onchange=()=>localStorage.setItem('jarvis-wake-reply',String($('wake-reply-enabled').checked));
 syncProviderButtons();request('/actions',{action:'state'}).then(actions).catch(()=>{});
})();
