(()=>{
 const $=id=>document.getElementById(id);
 let debounce,phase='idle';
 const rows=new Map();
 function display(text,state){phase=state;$('status').textContent=text;$('activity-banner').textContent=text;$('activity-banner').dataset.phase=state;$('core-state').textContent=text;}
 window.jarvisActivity={
  actionState(row){if(row)display((row.phase==='running'?'Выполняю: ':row.phase==='error'?'Ошибка: ':row.phase==='cancelled'?'Остановлено: ':'Готово: ')+row.label,row.phase==='running'?'running':row.phase==='error'?'error':'idle');},
  get busy(){return phase==='processing'||phase==='running';},
  heard(_text,finished=false){if($('action-heard'))$('action-heard').textContent='Услышал: '+String(_text).slice(0,500);display('Слушаю команду','listening');clearTimeout(debounce);if(finished)display('Обрабатываю запрос','processing');else debounce=setTimeout(()=>display('Обрабатываю запрос','processing'),900);},
  submitted(text){if($('action-heard'))$('action-heard').textContent='Запрос: '+String(text||'').slice(0,500);clearTimeout(debounce);display('Обрабатываю запрос','processing');},
  progress(data){clearTimeout(debounce);if(data.stage==='started'){display('Выполняю: '+data.label,'running');const row=document.createElement('p');row.className='message action';row.textContent='▶ '+data.label;$('chat').append(row);$('empty-chat').hidden=true;rows.set(data.id,row);}
   else{const failed=data.stage==='error',cancelled=data.stage==='cancelled';const text=failed?'Ошибка: '+data.error:cancelled?'Выполнение остановлено':data.verificationPending?'Клик/ввод выполнен · Проверяю результат на экране':'Шаг выполнен: '+data.label;display(text,failed?'error':cancelled?'idle':'processing');const row=rows.get(data.id);if(row)row.textContent=(failed?'✗ ':cancelled?'■ ':'✓ ')+text;rows.delete(data.id);}
  },
  complete(){clearTimeout(debounce);if(phase!=='error')display('Ответ завершён · Готов к следующей команде','idle');},
  stop(){clearTimeout(debounce);rows.clear();display('Управление остановлено','idle');},
 };
})();
