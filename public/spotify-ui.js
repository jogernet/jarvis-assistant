(()=>{
 const $=id=>document.getElementById(id);let busy=false,dirty=false,signature='',current={};
 $('spotify-client-id').addEventListener('input',()=>{dirty=true;});
 function render(data){current=data||{};if(!dirty)$('spotify-client-id').value=current.clientId||'';
  $('spotify-state').textContent=current.connected?'Spotify подключён':current.pending?'Ожидаю вход в открытом браузере':'Spotify не подключён';
  $('spotify-track').textContent=[current.activeDevice,current.title].filter(Boolean).join(' · ');
  const devices=current.devices||[],next=JSON.stringify(devices);if(next!==signature){signature=next;const option=document.createElement('option');option.value='';option.textContent='Активное устройство';$('spotify-device').replaceChildren(option,...devices.map(item=>{const node=document.createElement('option');node.value=item.id;node.textContent=item.name+(item.active?' · активно':'');return node;}));}$('spotify-device').value=current.deviceId||'';
  for(const id of ['play','pause','next','previous','volume-down','volume-up','my-tracks','track-play','playlists','playlist-play'])$('spotify-'+id).disabled=busy||!current.connected;
 }
 async function run(action,data){if(busy)return;busy=true;render(current);$('spotify-message').textContent=action==='spotify-connect'?'Открываю вход Spotify…':'Выполняю…';try{const result=await window.jarvisDesktop.services(action,data);if(result.ok===false)throw Error(result.error);if(action==='spotify-connect'||action==='spotify-disconnect')dirty=false;if(['spotify-connect','spotify-disconnect','spotify-refresh','spotify-device'].includes(action))render(result);if(result.playlists){$('spotify-playlist-options').replaceChildren(...result.playlists.map(item=>{const node=document.createElement('option');node.value=item.name;return node;}));$('spotify-message').textContent='Плейлистов: '+result.playlists.length;}else $('spotify-message').textContent=result.result||(result.pending?'Заверши вход в браузере.':'Готово.');}catch(error){$('spotify-message').textContent=error.message;}finally{busy=false;render(current);}}
 window.addEventListener('jarvis:services-state',event=>render(event.detail.spotify));
 $('spotify-connect').onclick=()=>run('spotify-connect',{clientId:$('spotify-client-id').value.trim()});
 $('spotify-disconnect').onclick=()=>run('spotify-disconnect');$('spotify-refresh').onclick=()=>run('spotify-refresh');
 $('spotify-device').onchange=()=>run('spotify-device',{deviceId:$('spotify-device').value});
 for(const action of ['show','play','pause','next','previous','playlists'])$('spotify-'+action).onclick=()=>run('spotify-command',{action});
 for(const [id,action] of Object.entries({'my-tracks':'my_tracks','volume-up':'volume_up','volume-down':'volume_down'}))$('spotify-'+id).onclick=()=>run('spotify-command',{action});
 $('spotify-playlist-play').onclick=()=>run('spotify-command',{action:'play_playlist',name:$('spotify-playlist-name').value.trim()});
 $('spotify-track-play').onclick=()=>run('spotify-command',{action:'play_track',name:$('spotify-track-name').value.trim()});
 render({});
})();
