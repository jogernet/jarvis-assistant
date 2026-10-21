const $=id=>document.getElementById(id),desktop=window.jarvisDesktop;
desktop?.onVisibility?.(hidden=>{window.jarvisUiHidden=hidden;if(!hidden)window.dispatchEvent(new Event('jarvis:visible'));});
const token=document.querySelector('meta[name="jarvis-token"]').content;
let connected=false,everConnected=false,saved=false,settingsLoaded=false,eventReady=false,connecting=false,pendingSave=null;
let player,nextAudio=0,assistantBubble,userBubble,micContext,micStream,micSource,micNode,recording=false,audioQueue=Promise.resolve(),pendingChunks=0,toolCount=0,connectionTimer;
let connectionWanted=false,retryTimer,retryAttempts=0,resumeMic=false,eventOpened=false;
let wakeReplyTimer;
function cancelWakeReply(){clearTimeout(wakeReplyTimer);wakeReplyTimer=null;}
function scheduleWakeReply(){cancelWakeReply();wakeReplyTimer=setTimeout(()=>{if(recording&&connected&&useQuickVoice()&&!window.JarvisWakeName.strip(wakeListener?.partial||'',wakeName).trim()&&$('wake-reply-enabled')?.checked!==false)api('/wake-reply',{}).catch(e=>status(e.message));},650);}
let wakeName='Джарвис';try{wakeName=window.JarvisWakeName.validate(localStorage.getItem('jarvis-wake-name')||wakeName);}catch{}
const playing=new Set(),bootTime=Date.now();
let voiceMeter,outputGain,wakeListener,capturePromise,preRoll=[],audioGeneration=0,voiceSuppressed=false,startMicPromise,micActivation=0,utterance=[],utteranceSpeech=false,quickStreaming=false,utteranceQueue=Promise.resolve();
let outputVolume=Number(localStorage.getItem('jarvis-output-volume')??100);if(!Number.isFinite(outputVolume))outputVolume=100;outputVolume=Math.max(0,Math.min(100,outputVolume));
$('jarvis-voice').value=localStorage.getItem('jarvis-voice')||'Orus';$('jarvis-voice').onchange=()=>localStorage.setItem('jarvis-voice',$('jarvis-voice').value);
$('jarvis-voice-apply').onclick=async()=>{await stopMic(false);clearAudio();return beginConnection();};
$('jarvis-volume').value=outputVolume;$('jarvis-volume-value').textContent=outputVolume+'%';
$('jarvis-volume').oninput=()=>{outputVolume=Number($('jarvis-volume').value);localStorage.setItem('jarvis-output-volume',String(outputVolume));$('jarvis-volume-value').textContent=outputVolume+'%';if(outputGain)outputGain.gain.setTargetAtTime(outputVolume/100,player.currentTime,.02);};
$('wake-name').value=wakeName;
function updateWakeHint(){$('wake-name-hint').textContent='Скажи «'+wakeName+'», чтобы начать разговор. «Замолчи» останавливает ответ и передачу голоса.';}updateWakeHint();
$('wake-name-save').onclick=()=>{try{const next=window.JarvisWakeName.validate($('wake-name').value);wakeListener?.setWakeName(next);wakeName=next;$('wake-name').value=next;localStorage.setItem('jarvis-wake-name',next);updateWakeHint();if(connected)api('/wake-name',{wakeName}).catch(e=>status(e.message));$('wake-name-status').textContent='Имя сохранено: '+next;}catch(e){$('wake-name-status').textContent=e.message;}};
$('wake-name').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('wake-name-save').onclick();}});
$('wake-enabled').checked=localStorage.getItem('jarvis-wake-enabled')!=='false';
$('quick-commands').checked=localStorage.getItem('jarvis-quick-commands-v2')==='true';$('quick-commands').onchange=()=>{localStorage.setItem('jarvis-quick-commands-v2',String($('quick-commands').checked));if(utterance.length)sendUtteranceAudio(utterance.splice(0));};
$('quick-voice-feedback').checked=localStorage.getItem('jarvis-quick-voice-feedback')==='true';$('quick-voice-feedback').onchange=()=>localStorage.setItem('jarvis-quick-voice-feedback',String($('quick-voice-feedback').checked));
let followChat=true,controlEnabled=true,visionEnabled=true;
function scrollChat(force=false){if(force)followChat=true;if(followChat)$('chat').scrollTop=$('chat').scrollHeight;$('scroll-latest').hidden=followChat;}
$('chat').addEventListener('scroll',()=>{const chat=$('chat');followChat=chat.scrollHeight-chat.scrollTop-chat.clientHeight<70;$('scroll-latest').hidden=followChat;});
$('scroll-latest').onclick=()=>scrollChat(true);
function computerState(state){controlEnabled=state.control;visionEnabled=state.vision;$('vision-toggle').textContent=visionEnabled?'Экран: ВКЛ':'Экран: ВЫКЛ';$('vision-toggle').classList.toggle('enabled',visionEnabled);$('stop-tools').textContent=controlEnabled?'Стоп действий':'Включить управление';}
$('vision-toggle').onclick=async()=>{try{$('vision').checked=!visionEnabled;await api('/computer',{control:controlEnabled,vision:$('vision').checked});}catch(e){status(e.message);}};
$('stop-tools').onclick=async()=>{try{if(controlEnabled){$('control').checked=false;await api('/computer',{stop:true});}else{$('control').checked=true;await api('/computer',{control:true,vision:$('vision').checked});}}catch(e){status(e.message);}};

const DEFAULT_MODEL='gemini-2.5-flash-native-audio-preview-12-2025';
function status(text){$('status').textContent=text;$('gate-status').textContent=text;}
function showMain(){everConnected=true;$('onboarding').hidden=true;$('workspace').hidden=false;}
function showGate(){ $('onboarding').hidden=false;$('workspace').hidden=true;$('back-main').hidden=!everConnected; }
function updateConnection(value){
 connected=value;connecting=false;clearTimeout(connectionTimer);
 if(value&&$('wake-enabled').checked)enableWake().catch(()=>{});else if(!value){wakeListener?.stop();releaseCapture();}
 $('connect').disabled=false;$('connect').textContent='Подключить и продолжить ↗';
 $('mic').disabled=$('send').disabled=!value;$('disconnect').disabled=!value&&!connectionWanted;
 $('reconnect').hidden=value;$('connection-dot').classList.toggle('online',value);
 $('connection-label').textContent=value?'Подключён':'Не подключён';$('core-code').textContent=value?'ONLINE':'STANDBY';
 $('core-state').textContent=value?'Готов к разговору':'Ожидание подключения';
}
function updateSaved(value){saved=value;$('saved-state').textContent=value?'СОХРАНЁН':'В ПАМЯТИ';}
async function api(path,data){
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Jarvis-Token':token},body:JSON.stringify(data),signal:AbortSignal.timeout(path==='/quick-command'?30000:10000)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Ошибка приложения.');return result;
}
function keyChanged(){const count=$('key').value.trim().length;$('key-length').textContent=count?'Вставлено символов: '+count:'Ключ ещё не введён';}
$('key').addEventListener('input',keyChanged);
$('reveal-key').onclick=()=>{const show=$('key').type==='password';$('key').type=show?'text':'password';$('reveal-key').textContent=show?'Скрыть':'Показать';};
window.jarvisVoiceLevel=()=>playing.size&&player?.state==='running'?(voiceMeter?.sample()||0):0;
function clearAudio(){for(const source of playing){try{source.stop();}catch{}}playing.clear();nextAudio=0;$('orb').classList.remove('speaking');window.dispatchEvent?.(new Event('jarvis:voice-stop'));}
function bubble(role,text){$('empty-chat').hidden=true;const item=document.createElement('p');item.className='message '+role;item.textContent=text;$('chat').append(item);scrollChat(role==='user');return item;}
async function ensurePlayer(){try{player??=new AudioContext();if(!outputGain){outputGain=player.createGain();outputGain.gain.value=outputVolume/100;voiceMeter=window.JarvisVoiceMeter?.connect(player,outputGain);if(!voiceMeter)outputGain.connect(player.destination);}await player.resume();}catch{status('Звук недоступен. Ответы отображаются текстом.');}}
function play(data){
 if(!player||voiceSuppressed)return;
 const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));if(bytes.length%2)return;
 const view=new DataView(bytes.buffer),buffer=player.createBuffer(1,bytes.length/2,24000),channel=buffer.getChannelData(0);
 for(let i=0;i<channel.length;i++)channel[i]=view.getInt16(i*2,true)/32768;
 const source=player.createBufferSource();source.buffer=buffer;source.connect(outputGain);nextAudio=Math.max(player.currentTime+.015,nextAudio);source.start(nextAudio);nextAudio+=buffer.duration;playing.add(source);$('orb').classList.add('speaking');$('core-state').textContent='Отвечаю';
 source.onended=()=>{playing.delete(source);if(!playing.size){$('orb').classList.remove('speaking');if(window.jarvisActivity?.busy)return;$('core-state').textContent=recording?'Слушаю тебя':connected?'Готов к разговору':'Не подключён';}};
}
async function releaseCapture(){const context=micContext;micNode?.disconnect();micSource?.disconnect();micStream?.getTracks().forEach(t=>t.stop());micContext=micStream=micNode=micSource=null;if(context)await context.close().catch(()=>{});}
async function stopMic(sendEnd=true){cancelWakeReply();
 if(userBubble?.classList?.contains?.('provisional')){userBubble.remove();userBubble=null;}recording=false;audioGeneration++;micActivation++;preRoll=[];utterance=[];utteranceSpeech=false;quickStreaming=false;wakeListener?.setActive(false);
 if(!wakeListener?.enabled)await releaseCapture();
 $('mic').textContent='◉ Начать разговор';$('mic-state').textContent=wakeListener?.enabled?'ЖДУ ИМЯ':'ВЫКЛ';$('meter').classList.remove('active');$('orb').classList.remove('listening');
 if(sendEnd&&connected)await audioQueue.then(()=>api('/send',{audioEnd:true})).catch(e=>status(e.message));
 if(connected)$('core-state').textContent=wakeListener?.enabled?'Жду «'+wakeName+'»':'Готов к разговору';
}
function forwardAudio(data){if(!recording||!connected)return;const generation=audioGeneration;if(pendingChunks>=40){stopMic(false);status('Передача звука отстаёт. Разговор остановлен.');return;}const audio=btoa(String.fromCharCode(...new Uint8Array(data)));pendingChunks++;audioQueue=audioQueue.then(()=>recording&&connected&&generation===audioGeneration?api('/send',{audio}):undefined).catch(e=>{stopMic(false);status(e.message);}).finally(()=>pendingChunks--);}
function useQuickVoice(){return $('quick-commands').checked&&wakeListener?.enabled;}
async function tryQuick(text){if(!$('quick-commands').checked)return false;const parsed=window.JarvisCommands?.parseQuickCommand(text,{wakeName});if(window.JarvisCommands&&!parsed)return false;const result=await api('/quick-command',{text,wakeName,voiceFeedback:$('quick-voice-feedback').checked});if(!result.handled)return false;if(userBubble?.classList.contains?.('provisional')){userBubble.textContent=text;userBubble.title='';userBubble.classList.remove('provisional');userBubble=null;}else bubble('user',text);status((result.ok===false?'Не получилось: ':'')+result.label);if(!result.acknowledged)bubble('assistant',result.label);toolCount++;$('tool-count').textContent=String(toolCount);return true;}
async function sendUtteranceAudio(chunks,end=false){const generation=audioGeneration;audioQueue=audioQueue.then(async()=>{for(let i=0;i<chunks.length;i+=6){if(!recording||!connected||generation!==audioGeneration)return;const audioChunks=chunks.slice(i,i+6).map(data=>btoa(String.fromCharCode(...new Uint8Array(data))));await api('/send',{audioChunks});}if(end&&recording&&generation===audioGeneration)await api('/send',{audioEnd:true});}).catch(e=>status(e.message));return audioQueue;}
function previewSpeech(text){
 const stripped=window.JarvisWakeName.strip(text,wakeName).trim();
 if(!useQuickVoice()||!recording||!stripped||playing.size)return;
 const caption=window.JarvisTranscript?.clean(stripped)||{text:stripped,uncertain:false};
 if(!caption.text||caption.uncertain)return;
 if(userBubble&&!userBubble.classList.contains?.('provisional'))return;
 userBubble??=bubble('user','');userBubble.textContent=caption.text;userBubble.classList.add('provisional');
 userBubble.title='Предварительное распознавание';
 window.jarvisActivity?.heard(caption.text);scrollChat();
}
function streamQuestion(text){
 if(!useQuickVoice()||!recording||quickStreaming||!utterance.length)return;
 if(window.JarvisCommands?.mayBeQuickCommand(text,{wakeName})!==false)return;
 quickStreaming=true;sendUtteranceAudio(utterance.splice(0));
}

function handleUtterance(text){if(text.trim()&&!window.JarvisWakeName.strip(text,wakeName).trim()){utterance=[];utteranceSpeech=false;return;}if(text.trim())cancelWakeReply();if(!useQuickVoice()||!recording)return;const chunks=utterance.splice(0),streamed=quickStreaming,generation=audioGeneration;quickStreaming=false;utteranceSpeech=false;const interrupt=window.JarvisCommands?.parseQuickCommand(text,{wakeName});if(interrupt?.kind==='undo'||interrupt?.kind==='cancel'){tryQuick(text).catch(e=>status(e.message));return;}if(!chunks.length&&!streamed&&!text.trim())return;utteranceQueue=utteranceQueue.then(async()=>{if(!recording||generation!==audioGeneration)return;if(streamed){await sendUtteranceAudio(chunks,true);return;}try{if(await tryQuick(text))return;}catch(e){status(e.message);return;}await sendUtteranceAudio(chunks,true);}).catch(e=>status(e.message));}
async function ensureCapture(){
 if(micStream)return;if(capturePromise)return capturePromise;
 capturePromise=(async()=>{micStream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});if(!connected){micStream.getTracks().forEach(t=>t.stop());micStream=null;throw Error('Нет подключения.');}micContext=new AudioContext({sampleRate:16000});await micContext.audioWorklet.addModule('/mic.js');await micContext.resume();micSource=micContext.createMediaStreamSource(micStream);micNode=new AudioWorkletNode(micContext,'capture');micNode.port.onmessage=event=>{if(!connected)return;preRoll.push(event.data);if(preRoll.length>20)preRoll.shift();try{wakeListener?.feed(event.data);}catch(e){wakeListener?.stop();$('wake-status').textContent='Ошибка локального распознавания: '+e.message;}if(recording){if(useQuickVoice()&&!quickStreaming){const pcm=new Int16Array(event.data),voiced=pcm.some(value=>Math.abs(value)>350);if(!utteranceSpeech&&voiced){utterance.push(...preRoll.slice(0,-1));utteranceSpeech=true;}if(utteranceSpeech)utterance.push(event.data);if(utterance.reduce((samples,chunk)=>samples+chunk.byteLength/2,0)>=19200){quickStreaming=true;sendUtteranceAudio(utterance.splice(0));}}else forwardAudio(event.data);}};micSource.connect(micNode);micNode.connect(micContext.destination);})();
 try{await capturePromise;}catch(error){await releaseCapture();throw error;}finally{capturePromise=null;}
}
async function startMic(){if(recording||!connected)return;if(startMicPromise)return startMicPromise;const activation=++micActivation;startMicPromise=(async()=>{await ensurePlayer();await ensureCapture();if(activation!==micActivation||!connected)return;await api('/voice',{paused:false});if(activation!==micActivation||!connected)return;voiceSuppressed=false;audioGeneration++;recording=true;wakeListener?.setActive(true);utterance=[];utteranceSpeech=preRoll.some(data=>new Int16Array(data).some(value=>Math.abs(value)>350));quickStreaming=false;for(const data of preRoll){if(useQuickVoice()){utterance.push(data);wakeListener.feed(data);}else forwardAudio(data);}preRoll=[];$('mic').textContent='◼ Закончить разговор';$('mic-state').textContent='ВКЛ';$('meter').classList.add('active');$('orb').classList.add('listening');$('core-state').textContent='Слушаю тебя';status('Микрофон включён. Говори.');})();try{await startMicPromise;}finally{startMicPromise=null;}}
async function silence(){cancelWakeReply();voiceSuppressed=true;clearAudio();window.jarvisActivity?.stop();await stopMic(false);if(connected)await api('/voice',{paused:true}).catch(e=>status(e.message));status(wakeListener?.enabled?'Ответ остановлен. Жду «'+wakeName+'».':'Ответ остановлен. Микрофон выключен.');}
async function enableWake(){if(!connected)return;try{wakeListener??=new window.JarvisWake.WakeListener({wakeName,onWake:()=>startMic().then(()=>scheduleWakeReply()).catch(e=>{wakeListener?.setActive(false);status(e.message);}),onSleep:()=>silence(),onText:text=>handleUtterance(text),onPartial:text=>{previewSpeech(text);if(window.JarvisWakeName.strip(text,wakeName).trim())cancelWakeReply();streamQuestion(text);},onState:(state,error)=>{$('wake-status').textContent=({loading:'Загружаю локальное распознавание…',waiting:'Жду имя · звук остаётся на компьютере',active:'Слушаю · простые команды локально, вопросы — Gemini',off:'Пробуждение выключено',error:'Ошибка: '+error})[state];if(!recording)$('mic-state').textContent=state==='waiting'?'ЖДУ ИМЯ':'ВЫКЛ';}});if(wakeListener.enabled)return;wakeListener.setActive(recording);await wakeListener.start();if(!connected||!$('wake-enabled').checked){wakeListener.stop();return;}await ensureCapture();}catch(e){wakeListener?.stop();$('wake-status').textContent='Не удалось включить пробуждение: '+(e?.message||'ошибка модели');if(!recording)await releaseCapture();throw e;}}
$('wake-enabled').onchange=async()=>{localStorage.setItem('jarvis-wake-enabled',String($('wake-enabled').checked));if($('wake-enabled').checked)await enableWake().catch(()=>{});else{wakeListener?.stop();if(!recording)await releaseCapture();}};
function cancelRetry(){clearTimeout(retryTimer);retryTimer=null;}
function scheduleRetry(){
 if(!connectionWanted||!eventReady||retryTimer||connecting||connected)return;
 if(retryAttempts>=5){status('Не удалось восстановить связь. Нажми «Подключиться» для новой попытки.');return;}
 const delay=Math.min(1000*2**retryAttempts++,10000);status('Восстанавливаю подключение к Gemini…');
 retryTimer=setTimeout(()=>{retryTimer=null;if(connectionWanted&&eventReady&&!connected)beginConnection(true);},delay);
}
async function beginConnection(automatic=false){
 automatic=automatic===true;if(!automatic){connectionWanted=true;retryAttempts=0;}cancelRetry();
 if(connecting)return;
 const key=$('key').value.trim();if(!key){showGate();status('Вставь API-ключ Gemini.');$('key').focus();return;}
 if(!eventReady){status('Подключаюсь к приложению. Попробуй ещё раз через секунду.');return;}
 connecting=true;$('disconnect').disabled=false;$('connect').disabled=true;$('connect').textContent='Проверяю подключение…';status('Подключаюсь к Gemini…');
 pendingSave={wakeName,resume:automatic,key,model:$('model').value.trim()||DEFAULT_MODEL,voice:$('jarvis-voice').value,control:$('control').checked,vision:$('vision').checked,remember:$('remember').checked};
 connectionTimer=setTimeout(()=>{if(connecting){updateConnection(false);status('Gemini не ответил.');scheduleRetry();}},23000);
 ensurePlayer();
 try{await api('/connect',pendingSave);}catch(e){updateConnection(false);status(e.message);if(automatic)scheduleRetry();}
}
const events=new EventSource('/events?token='+encodeURIComponent(token));
async function autoConnect(){if(connectionWanted&&settingsLoaded&&eventReady&&saved&&!connected&&!connecting)await beginConnection();}
events.onopen=async()=>{eventReady=true;if(!eventOpened){eventOpened=true;autoConnect();return;}try{const state=await api('/connection',{});if(!connectionWanted)return;if(state.connected){await events.onmessage({data:JSON.stringify({connected:true})});}else if(!state.connecting){if(state.retryable===false)status(state.error);else scheduleRetry();}}catch(e){status(e.message);scheduleRetry();}};
events.onerror=()=>{resumeMic=resumeMic||recording;eventReady=false;cancelRetry();updateConnection(false);stopMic(false);clearAudio();status('Восстанавливаю связь с приложением…');};
events.onmessage=async event=>{
 let message;try{message=JSON.parse(event.data);}catch{return;}
 if(message.connected){
  cancelRetry();retryAttempts=0;if(!connectionWanted)return;
  updateConnection(true);showMain();status('Gemini подключён. Можно говорить или писать.');
  if(resumeMic){resumeMic=false;startMic().catch(e=>status(e.message));}
  if(pendingSave){const data=pendingSave;pendingSave=null;
   try{
    if(data.remember&&desktop){await desktop.save({key:data.key,model:data.model,voice:data.voice,control:data.control,vision:data.vision});updateSaved(true);}
    else{if(desktop)await desktop.forget();updateSaved(false);}
   }catch(e){updateSaved(false);status('Подключено. Не удалось сохранить ключ: '+e.message);}
  }
 }
 if(message.disconnected){resumeMic=resumeMic||recording;window.jarvisActivity?.stop();updateConnection(false);stopMic(false);clearAudio();if(message.retryable!==false)scheduleRetry();}
 if(message.error&&!retryTimer)status(message.error);if(message.connectionNotice)status(message.connectionNotice);
 if(message.actionCenter)window.dispatchEvent(new CustomEvent('jarvis:actions',{detail:message.actionCenter}));
 if(message.messengerResult)window.dispatchEvent(new CustomEvent('jarvis:messenger',{detail:message.messengerResult}));
 if(message.progress)window.jarvisActivity?.progress(message.progress);
 if(message.action){toolCount++;$('tool-count').textContent=String(toolCount);if(!window.jarvisActivity)bubble('action',message.action);}
 if(message.computerState){computerState(message.computerState);if(!message.computerState.control)window.jarvisActivity?.stop();}
 if(message.visionError)status('Экран: '+message.visionError);
 const content=message.serverContent;if(!content)return;
 if(content.interrupted){clearAudio();assistantBubble=null;}
 if(content.inputTranscription?.displayText||content.inputTranscription?.text){const text=content.inputTranscription.displayText??content.inputTranscription.text;window.jarvisActivity?.heard(text,content.inputTranscription.finished===true);userBubble??=bubble('user','');userBubble.classList.remove('provisional');userBubble.title='';userBubble.textContent=content.inputTranscription.displayText??(window.JarvisTranscript?.merge(userBubble.textContent,text)||text);}
 if(content.inputTranscription?.text&&window.JarvisWake?.intent((userBubble?.textContent||''),true)==='sleep'){await silence();}
 if(content.inputTranscription?.finished===true)userBubble=null;
 if(content.outputTranscription?.text&&!voiceSuppressed){assistantBubble??=bubble('assistant','');assistantBubble.textContent=content.outputTranscription.displayText??(window.JarvisTranscript?.merge(assistantBubble.textContent,content.outputTranscription.text)||content.outputTranscription.text);}
 // Audio transcripts are the public answer. Text parts may contain internal reasoning.
 for(const part of content.modelTurn?.parts||[])if(!part.thought&&part.inlineData?.data)play(part.inlineData.data);
 scrollChat();
 if(content.turnComplete){window.jarvisActivity?.complete();assistantBubble=null;userBubble=null;}
};
$('connect').onclick=beginConnection;
$('reconnect').onclick=beginConnection;
$('disconnect').onclick=async()=>{connectionWanted=false;resumeMic=false;cancelRetry();await stopMic();try{await api('/disconnect',{});}catch(e){status(e.message);}updateConnection(false);clearAudio();status('Отключено. Ключ сохранён для следующего запуска.');};
$('connection-settings').onclick=()=>{showGate();status(connected?'Подключение активно. Можно изменить ключ или настройки.':'Настройки подключения.');};
$('back-main').onclick=showMain;
$('nav-dialog').onclick=()=>{showMain();window.dispatchEvent(new CustomEvent('jarvis:panel',{detail:'dialog'}));};
$('forget').onclick=async()=>{connectionWanted=false;resumeMic=false;cancelRetry();
 try{if(desktop)await desktop.forget();await stopMic();await api('/disconnect',{});clearAudio();updateConnection(false);updateSaved(false);pendingSave=null;$('key').value='';keyChanged();everConnected=false;showGate();status('Сохранённый ключ удалён. Введи новый для подключения.');}catch(e){status(e.message);}
};
$('clear-chat').onclick=()=>{for(const p of $('chat').querySelectorAll('.message'))p.remove();$('empty-chat').hidden=false;assistantBubble=userBubble=null;};
$('form').onsubmit=async event=>{event.preventDefault();const text=$('text').value.trim();if(!text||!connected)return;voiceSuppressed=false;await api('/voice',{paused:false});await ensurePlayer();try{window.jarvisActivity?.submitted(text);if(!(await tryQuick(text))){await api('/send',{text});bubble('user',text);}$('text').value='';}catch(e){status(e.message);}};
for(const button of document.querySelectorAll('[data-prompt]'))button.onclick=()=>{$('text').value=button.dataset.prompt;$('text').focus();};
$('mic').onclick=async()=>{try{if(recording){voiceSuppressed=true;clearAudio();await stopMic();await api('/voice',{paused:true});}else await startMic();}catch(e){await stopMic(false);status('Микрофон: '+e.message);}};
for(const action of ['minimize','maximize','close'])$(action).onclick=()=>desktop?.window(action);
setInterval(()=>{if(window.jarvisUiHidden||document.hidden)return;const seconds=Math.floor((Date.now()-bootTime)/1000);$('clock').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');},1000);
window.addEventListener('pagehide',()=>{connectionWanted=false;cancelRetry();wakeListener?.close();micStream?.getTracks().forEach(t=>t.stop());events.close();});
desktop?.onCommand?.(command=>{if(command==='microphone')$('mic').click();if(command==='diagnostics')$('nav-diagnostics').click();});
async function boot(){
 if(!desktop){$('remember').checked=false;$('remember').disabled=true;$('storage-note').textContent='Нет связи с функциями приложения. Если это JARVIS.exe, переустанови последнюю версию. В браузере сохранение ключа недоступно.';}
 try{const config=await desktop?.load();if(config?.key){connectionWanted=true;$('key').value=config.key;$('model').value=config.model||DEFAULT_MODEL;if(config.voice)$('jarvis-voice').value=config.voice;$('control').checked=config.control===true;$('vision').checked=config.vision!==false;$('remember').checked=true;updateSaved(true);keyChanged();showMain();status('Ключ восстановлен. Подключаюсь…');}}
 catch(e){status(e.message);}
 settingsLoaded=true;await autoConnect();desktop?.ready();console.log('JARVIS_UI_READY');
}
boot();
