(()=>{
 const $=id=>document.getElementById(id),bridge=window.jarvisDesktop?.telegram;
 let timer,busy=false,privateInput=false,previousPhase='';
 const active=['preparing','connecting','requesting_qr','saving','qr','password'];
 const phases={preparing:'Подготавливаю Telegram…',requesting_qr:'Получаю QR-код…',saving:'Сохраняю защищённую сессию…',saved:'Вход сохранён. Подключение выполнится при первой команде.',disconnected:'Telegram не подключён.',connecting:'Подключаюсь к Telegram…',qr:'Сканируй QR-код приложением Telegram на телефоне.',password:'Telegram запросил пароль двухэтапной защиты.',connected:'Telegram подключён в фоне.',error:'Не удалось подключиться.'};
 function clearSecrets(){$('telegram-api-hash').value='';$('telegram-password').value='';}
 function render(state){if(active.includes(state.phase))$('telegram-account-drawer').open=true;
  $('telegram-status').textContent=(state.error||state.detail||phases[state.phase]||state.phase)+(active.includes(state.phase)&&state.startedAt?' · '+Math.max(0,Math.floor((Date.now()-state.startedAt)/1000))+' с':'')+(state.account?' · '+state.account:'');
  $('telegram-qr').hidden=state.phase!=='qr'||!state.qr;
  $('telegram-qr-help').hidden=$('telegram-qr').hidden;
  if(!$('telegram-qr').hidden){if($('telegram-qr').src!==state.qr)$('telegram-qr').src=state.qr;if(previousPhase!=='qr')$('telegram-qr').scrollIntoView?.({block:'center',behavior:'smooth'});}else $('telegram-qr').removeAttribute('src');
  $('telegram-retry').hidden=!state.canRetry;
  $('telegram-password-box').hidden=state.phase!=='password';
  $('telegram-connect').disabled=state.saved||active.includes(state.phase);
  $('telegram-api-id').disabled=$('telegram-api-hash').disabled=$('telegram-connect').disabled;
  $('telegram-disconnect').disabled=!state.saved&&!state.connected;
  $('telegram-cancel').hidden=!active.includes(state.phase);
  $('telegram-finish').hidden=!privateInput||active.includes(state.phase);
  if(state.phase==='connected')clearSecrets();
  if(state.phase==='password'&&previousPhase!=='password'){$('telegram-password-box').scrollIntoView?.({block:'center',behavior:'smooth'});$('telegram-password').focus?.();}
  previousPhase=state.phase;
  clearTimeout(timer);if(active.includes(state.phase)&&!document.hidden&&!window.jarvisUiHidden)timer=setTimeout(refresh,1000);
 }
 async function refresh(){if(!bridge)return;try{render(await bridge('state'));}catch(error){$('telegram-status').textContent=error.message;}}
 async function command(action,data){if(!bridge){$('telegram-status').textContent='Запусти отдельное приложение JARVIS.exe.';return;}if(busy)return;busy=true;try{render(await bridge(action,data));}catch(error){$('telegram-status').textContent=error.message;$('telegram-finish').hidden=!privateInput;}finally{busy=false;}}
 $('telegram-connect').onclick=()=>{privateInput=true;const data={apiId:$('telegram-api-id').value.trim(),apiHash:$('telegram-api-hash').value.trim()};clearSecrets();return command('connect',data);};
 $('telegram-retry').onclick=()=>{privateInput=true;return command('retry');};
 $('telegram-qr').onerror=()=>{$('telegram-status').textContent='QR-код получен, но изображение не отобразилось. Нажми «Отменить вход» и подключись заново.';};
 $('telegram-password-submit').onclick=()=>{const password=$('telegram-password').value;$('telegram-password').value='';return command('password',{password});};
 $('telegram-password').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('telegram-password-submit').click();}});
 $('telegram-cancel').onclick=()=>command('cancel');
 $('telegram-disconnect').onclick=()=>{clearSecrets();$('messenger-candidates').replaceChildren();$('messenger-content').textContent='';$('messenger-text').value='';$('messenger-chat').textContent='Чат не выбран';for(const id of ['messenger-read','messenger-draft','messenger-send','messenger-generate','messenger-search-text'])$(id).disabled=true;return command('disconnect');};
 $('telegram-finish').onclick=async()=>{if(!bridge)return;clearSecrets();$('telegram-qr').removeAttribute('src');$('telegram-qr').hidden=true;try{await bridge('finish');privateInput=false;$('telegram-finish').hidden=true;await refresh();}catch(error){$('telegram-status').textContent=error.message;}};
 window.addEventListener('jarvis:visible',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();else clearTimeout(timer);});window.addEventListener('pagehide',()=>clearTimeout(timer));
 if(bridge)refresh();else $('telegram-status').textContent='Фоновое подключение доступно в JARVIS.exe.';
})();
