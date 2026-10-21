const $=id=>document.getElementById(id),token=document.querySelector('meta[name="jarvis-token"]').content;
const revealKey=document.createElement('button');
revealKey.id='reveal-key';revealKey.type='button';revealKey.textContent='Показать ключ';
revealKey.onclick=()=>{const show=$('key').type==='password';$('key').type=show?'text':'password';revealKey.textContent=show?'Скрыть ключ':'Показать ключ';};
$('key').insertAdjacentElement('afterend',revealKey);
const keyHint=document.createElement('p');keyHint.className='hint';keyHint.id='key-hint';
revealKey.insertAdjacentElement('afterend',keyHint);
$('key').oninput=()=>{const length=$('key').value.trim().length;keyHint.textContent=length?'Вставлено символов: '+length:'Ключ ещё не вставлен.';};
$('key').oninput();
let connected=false,player,nextAudio=0,recording,source,node,micContext,stream,queue=Promise.resolve(),assistantBubble,userBubble;
const playing=new Set();
function status(t){$('status').textContent=t;}
function bubble(role,text){const p=document.createElement('p');p.className='message '+role;p.textContent=text;$('chat').append(p);p.scrollIntoView({block:'nearest'});return p;}
async function api(path,data){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Jarvis-Token':token},body:JSON.stringify(data)});const body=await r.json();if(!r.ok)throw Error(body.error);return body;}
function clearAudio(){for(const p of playing){try{p.stop();}catch{}}playing.clear();nextAudio=0;}
function setConnected(value){connected=value;$('send').disabled=$('mic').disabled=!value;$('disconnect').disabled=!value;$('connect').disabled=value;$('control').disabled=value;$('model').disabled=value;}
async function stopMic(sendEnd=true){recording=false;node?.disconnect();source?.disconnect();stream?.getTracks().forEach(t=>t.stop());await micContext?.close().catch(()=>{});micContext=null;node=null;source=null;stream=null;$('mic').textContent='🎙 Включить микрофон';$('mic').classList.remove('active');if(sendEnd&&connected)await queue.then(()=>api('/send',{audioEnd:true})).catch(e=>status(e.message));}
function play(base64){if(!player)return;const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const view=new DataView(bytes.buffer);const audio=player.createBuffer(1,bytes.length/2,24000);const channel=audio.getChannelData(0);for(let i=0;i<channel.length;i++)channel[i]=view.getInt16(i*2,true)/32768;const p=player.createBufferSource();p.buffer=audio;p.connect(player.destination);nextAudio=Math.max(player.currentTime,nextAudio);p.start(nextAudio);nextAudio+=audio.duration;playing.add(p);p.onended=()=>playing.delete(p);}
const events=new EventSource('/events?token='+encodeURIComponent(token));
events.onmessage=e=>{const m=JSON.parse(e.data);if(m.connected){setConnected(true);status('Gemini подключён. Можно говорить или писать.');}if(m.disconnected){setConnected(false);stopMic(false);clearAudio();}if(m.error){status(m.error);if(m.disconnected)$('connect').disabled=false;}if(m.action)bubble('action','Открытие: '+m.action);
 const c=m.serverContent;if(c){if(c.interrupted){clearAudio();assistantBubble=null;}if(c.inputTranscription?.text){userBubble??=bubble('user','');userBubble.textContent+=c.inputTranscription.text;}if(c.outputTranscription?.text){assistantBubble??=bubble('assistant','');assistantBubble.textContent+=c.outputTranscription.text;}for(const p of c.modelTurn?.parts||[])if(p.inlineData?.data)play(p.inlineData.data);if(c.turnComplete){assistantBubble=null;userBubble=null;}}
};
events.onerror=()=>{status('Связь с приложением потеряна. Обнови страницу.');setConnected(false);stopMic(false);clearAudio();};
$('connect').onclick=async()=>{try{$('connect').disabled=true;status('Подключаюсь…');player??=new AudioContext();await player.resume();await api('/connect',{key:$('key').value.trim(),model:$('model').value.trim(),control:$('control').checked});}catch(e){status(e.message);$('connect').disabled=false;}};
$('disconnect').onclick=async()=>{await stopMic();try{await api('/disconnect',{});}catch(e){status(e.message);}setConnected(false);clearAudio();status('Отключено.');};
$('form').onsubmit=async e=>{e.preventDefault();const text=$('text').value.trim();if(!text||!connected)return;try{await player.resume();await api('/send',{text});bubble('user',text);$('text').value='';}catch(err){status(err.message);}};
$('mic').onclick=async()=>{if(recording){await stopMic();return;}try{stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});micContext=new AudioContext({sampleRate:16000});await micContext.audioWorklet.addModule('/mic.js');await micContext.resume();source=micContext.createMediaStreamSource(stream);node=new AudioWorkletNode(micContext,'capture');recording=true;node.port.onmessage=e=>{if(!recording||!connected)return;const audio=btoa(String.fromCharCode(...new Uint8Array(e.data)));queue=queue.then(()=>recording&&connected?api('/send',{audio}):undefined).catch(err=>{status(err.message);stopMic(false);});};source.connect(node);node.connect(micContext.destination);$('mic').textContent='■ Выключить микрофон';$('mic').classList.add('active');status('Слушаю.');}catch(e){await stopMic(false);status('Микрофон: '+e.message);}};
window.addEventListener('pagehide',()=>{stream?.getTracks().forEach(t=>t.stop());events.close();});
let connectionTimeout;
$('connect').onclick=async()=>{
 const key=$('key').value.trim();
 if(!key){status('Сначала вставь API-ключ в поле выше.');$('key').focus();return;}
 try{
  $('connect').disabled=true;$('connect').textContent='Подключаюсь…';status('Соединяюсь с Gemini. Ожидай до 20 секунд.');
  clearTimeout(connectionTimeout);connectionTimeout=setTimeout(()=>{if(!connected){$('connect').disabled=false;$('connect').textContent='Подключить Gemini';status('Подключение не завершилось. Проверь интернет и доступность Gemini API.');}},23000);
  if(!player)player=new AudioContext();player.resume().catch(()=>{});
  await api('/connect',{key,model:$('model').value.trim(),control:$('control').checked});
 }catch(e){clearTimeout(connectionTimeout);$('connect').disabled=false;$('connect').textContent='Подключить Gemini';status('Ошибка: '+e.message);}
};
const handleEvent=events.onmessage;
events.onmessage=e=>{
 const m=JSON.parse(e.data),key=$('key').value;handleEvent(e);$('key').value=key;
 if(m.connected||m.disconnected){clearTimeout(connectionTimeout);$('connect').textContent=m.connected?'Подключено':'Подключить Gemini';}
};
