(()=>{
 const $=id=>document.getElementById(id),token=document.querySelector('meta[name="jarvis-token"]').content;
 let visible=false,busy=false;
 const names={list_controls:'Кнопки и ссылки Windows',click_control:'Точное нажатие элемента',move_mouse:'Наведение курсора',system_status:'Права и состояние Windows',screen_view:'Просмотр экрана',list_windows:'Список окон',focus_window:'Переключение окон',click_screen:'Мышь: нажатия',scroll_screen:'Мышь: прокрутка',type_text:'Клавиатура: ввод текста',press_key:'Клавиатура: сочетания',open_app:'Запуск программ',open_url:'Открытие сайтов',search_web:'Поиск в браузере',find_music:'Поиск музыки'};
 const kinds={tool:'ИНСТРУМЕНТ',result:'РЕЗУЛЬТАТ',error:'ОШИБКА',connection:'СОЕДИНЕНИЕ',cancel:'ОТМЕНА ШАГА',control:'УПРАВЛЕНИЕ',speech:'ГОЛОС',text:'ТЕКСТ'};
 const volume=n=>n>1048576?(n/1048576).toFixed(1)+' МБ':Math.round(n/1024)+' КБ';
 async function api(path,data){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Jarvis-Token':token},body:JSON.stringify(data),signal:AbortSignal.timeout(8000)});const body=await r.json();if(!r.ok)throw Error(body.error);return body;}
 function line(parent,text,className=''){const item=document.createElement('div');item.className=className;item.textContent=text;parent.append(item);return item;}
 function age(at,now){return at?Math.max(0,(now-at)/1000).toFixed(1)+' с назад':'ещё не было';}
 function render(data){
  $('diag-connection').textContent=data.connected?'Gemini: подключён':'Gemini: отключён';
  $('diag-permission').textContent=(data.elevated===true?'Windows: администратор':data.elevated===false?'Windows: обычные права':'Права Windows не проверены')+(data.nativeAvailable===false?' · модуль ввода недоступен':'');
  $('diag-model').textContent='Модель: '+(data.model||'—');
  $('diag-capture-fps').textContent=String(data.captureFps);$('diag-send-fps').textContent=String(data.sendFps);
  $('diag-captured').textContent='Всего: '+data.totals.captured;$('diag-sent').textContent='Всего: '+data.totals.sent;
  $('diag-size').textContent=data.width?data.width+' × '+data.height:'—';$('diag-capture-time').textContent='Захват: '+(data.captureMs??'—')+' мс';
  $('diag-tool-total').textContent=String(data.totals.toolCalls);$('diag-tool-errors').textContent='Ошибок: '+data.totals.toolErrors;
  $('diag-tool-latency').textContent='Последний инструмент: '+(data.lastToolMs??'—')+' мс';
  $('diag-queue').textContent='Выполняется: '+data.pending;
  $('diag-flow').textContent='Экран: '+(data.vision?'передача включена':'выключен')+' · Мышь и клавиатура: '+(data.control?'инструменты включены':'выключены');
  $('diag-frame-age').textContent='Последний отправленный кадр: '+age(data.lastSentAt,data.at);
  $('diag-delivery').textContent='Очередь передачи: '+volume(data.videoQueueBytes||0)+' · Пропусков отправки: '+(data.totals.skippedFrames||0)+'. Gemini не подтверждает обработку каждого кадра.';
  $('diag-geometry').textContent=data.display?'Физический экран: '+data.display.width+' × '+data.display.height+' · Начало: '+data.display.left+', '+data.display.top+' · Сетка X/Y: 0–1000':'Геометрия экрана ещё не получена.';
  $('diag-window').textContent='Активное окно: '+(data.activeWindow||'—');
  $('diag-traffic').textContent='Экран: '+volume(data.totals.screenBytes)+' · Микрофон: '+volume(data.totals.audioInBytes)+' · Голос ответа: '+volume(data.totals.audioOutBytes);
  $('diag-preview').hidden=!data.preview;if(data.preview)$('diag-preview').src=data.preview;else $('diag-preview').removeAttribute('src');
  $('diag-last-error').textContent=data.lastError?'Последняя ошибка: '+data.lastError:'Ошибок пока нет.';
  $('diag-capabilities').replaceChildren();
  for(const cap of data.capabilities||[]){const stats=data.tools[cap.name];line($('diag-capabilities'),(cap.enabled?'● ':'○ ')+(names[cap.name]||cap.name)+' — '+(cap.enabled?'включено':'выключено')+(stats?' · '+stats.calls+' выз. · '+stats.lastResult:''),cap.enabled?'cap-enabled':'');}
  $('diag-events').replaceChildren();
  for(const event of data.events||[]){const row=line($('diag-events'),'',event.kind==='error'?'event-error':'');const time=new Date(event.at).toLocaleTimeString('ru-RU');line(row,time+'  '+(kinds[event.kind]||event.kind),'event-time');line(row,event.message);const details=event.details||{},parts=[];if(details.tool)parts.push(names[details.tool]||details.tool);for(const [key,label]of Object.entries({x:'x',y:'y',button:'кнопка',key:'клавиши',amount:'прокрутка',hwnd:'окно',textLength:'символов ввода',queryLength:'символов запроса',site:'сайт',characters:'символов',error:'ошибка',count:'число',durationMs:'выполнение, мс'}))if(details[key]!==undefined)parts.push(label+': '+details[key]);if(parts.length)line(row,parts.join(' · '),'event-details');}
 }
 async function refresh(){if(!visible||busy||document.hidden||window.jarvisUiHidden)return;busy=true;try{render(await api('/diagnostics',{preview:true}));}catch(error){$('diag-last-error').textContent=error.message;}finally{busy=false;}}
 function show(){window.dispatchEvent(new CustomEvent('jarvis:panel',{detail:'diagnostics'}));visible=true;$('workspace').hidden=false;$('onboarding').hidden=true;$('diagnostics-panel').hidden=false;$('nav-diagnostics').classList.add('active');$('nav-dialog').classList.remove('active');$('main-title').textContent='Диагностика.';refresh();}
 function hide(){window.dispatchEvent(new CustomEvent('jarvis:panel',{detail:'dialog'}));visible=false;$('diagnostics-panel').hidden=true;$('nav-diagnostics').classList.remove('active');$('nav-dialog').classList.add('active');$('main-title').textContent='На связи.';}
 $('nav-diagnostics').onclick=show;$('nav-dialog').addEventListener('click',hide);
 $('diag-enable').onclick=async()=>{try{await api('/computer',{control:true,vision:true});$('control').checked=$('vision').checked=true;if(window.jarvisDesktop&&$('remember').checked&&$('key').value.trim())await window.jarvisDesktop.save({key:$('key').value.trim(),model:$('model').value.trim(),control:true,vision:true});await refresh();}catch(error){$('diag-last-error').textContent=error.message;}};
 $('diag-stop').onclick=async()=>{try{await api('/computer',{stop:true});await refresh();}catch(error){$('diag-last-error').textContent=error.message;}};
 window.addEventListener('jarvis:panel',event=>{if(event.detail!=='diagnostics')visible=false;});
 window.addEventListener('jarvis:visible',()=>refresh());
 setInterval(refresh,1500);
})();
