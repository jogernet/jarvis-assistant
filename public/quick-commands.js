(function(root){
 function parseQuickCommand(input,{wakeName='Джарвис'}={}){
  if(typeof input!=='string'||input.length>500)return null;
  let text=input.toLowerCase().replace(/ё/g,'е').replace(/[,.!?«»"']/g,' ').replace(/\s+/g,' ').trim().replace(/^пожалуйста /,'').replace(/ пожалуйста$/,'').trim();
  const names=typeof module!=='undefined'?require('./wake-name.js'):root.JarvisWakeName;text=names.strip(text,wakeName).replace(/^пожалуйста /,'').trim();
  if(/^(?:отмена|отмени команду|отменить последнюю команду|отмени|отменить|отмени последнее|отмени последнюю команду|отмени последнее действие|верни как было)$/.test(text))return {kind:'undo'};
  if(/^(?:стоп действий|останови действие|останови выполнение)$/.test(text))return {kind:'cancel'};
  const messenger=text.match(/^(?:найди|открой|покажи)(?: мне)? (?:чат|переписку)(?: с)? (.{1,100}?) (?:в|во) (телеграм(?:е|ме)?|telegram|тг|дискорд(?:е)?|discord)$/);
  if(messenger)return {kind:'messenger',service:/дискорд|discord/.test(messenger[2])?'discord':'telegram',action:'search',args:{query:messenger[1]}};
  const findMessages=text.match(/^(?:найди|поищи) (?:в переписке|в сообщениях|в чате) (.{1,200}?) (?:в|во) (?:телеграм(?:е|ме)?|telegram|тг)$/);
  if(findMessages)return {kind:'messenger',service:'telegram',action:'search_messages',args:{query:findMessages[1]}};
  const readChat=text.match(/^(?:прочитай|покажи)(?: мне)? (?:сообщения|переписку)(?: в (?:текущем|выбранном) чате)? (?:в|из) (телеграм(?:е|ме)?|telegram|тг|дискорд(?:е)?|discord)$/);
  if(readChat)return {kind:'messenger',service:/дискорд|discord/.test(readChat[1])?'discord':'telegram',action:'read',args:{}};
  const tgSuffix='(?: (?:в|из) (?:телеграм(?:е|ме)?|telegram|тг))?';
  const latest=new RegExp('^(?:прочитай|озвучь|покажи)(?: мне)? последнее (?:входящее )?сообщение(?: которое мне прислали| которое мне пришло)?'+tgSuffix+'$');
  if(latest.test(text))return {kind:'messenger',service:'telegram',action:'latest_incoming',args:{}};
  const unread=new RegExp('^(?:прочитай|озвучь|покажи)(?: мне)? (?:все )?непрочитанные(?: сообщения)?(?: и от кого)?(?: за (?:последний )?час)?'+tgSuffix+'$');
  if(unread.test(text))return {kind:'messenger',service:'telegram',action:'unread_recent',args:{minutes:60}};
  const deleteLast=new RegExp('^(?:удали|сотри) (?:мое |свое )?последнее (?:отправленное )?сообщение'+tgSuffix+'$');
  if(deleteLast.test(text))return {kind:'messenger',service:'telegram',action:'delete_sent',args:{}};
  const provider=text.match(/ (?:в |на )(вк|vk|вконтакте|спотифай|spotify)$/);if(provider)text=text.slice(0,provider.index);
  const music=(action,args={})=>({kind:'music',action,args,...(provider?{service:/спотифай|spotify/.test(provider[1])?'spotify':'vk'}:{})});
  if(/^(?:переключи|переключить)(?: музыку)? на (?:следующий(?: трек)?|следующую(?: песню| композицию)?)$/.test(text)||/^(?:вруби|включай) (?:следующий трек|следующую песню)$/.test(text)||/^(?:пропусти(?: трек)?|скипни(?: трек)?|скип)$/.test(text))return music('next');
  if(/^(?:переключи|переключить)(?: музыку)? на (?:предыдущий(?: трек)?|предыдущую(?: песню| композицию)?)$/.test(text))return music('previous');
  const start='(?:включи|вруби|запусти|поставь|включить|запустить)';
  if(new RegExp('^'+start+' (?:мне )?(?:(?:мою|свою|любимую) )?музыку$').test(text)||new RegExp('^'+start+' (?:мои|мне мои) (?:треки|песни|аудиозаписи)$').test(text))return music(/(?:мои|мне мои) (?:треки|песни|аудиозаписи)$/.test(text)?'my_tracks':'start_music');
  if(/^(?:следующий|следующая|дальше|переключи|переключи трек|переключи музыку|переключи песню|следующий трек|следующая песня|следующая композиция|другой трек|включи следующий|включи следующую|включи следующий трек|включи следующую песню|поставь следующий трек|давай следующий трек)$/.test(text))return music('next');
  if(/^(?:предыдущий|предыдущая|назад|предыдущий трек|предыдущая песня|предыдущая композиция|включи предыдущий|включи предыдущую|включи предыдущий трек|включи предыдущую песню|поставь предыдущий трек)$/.test(text))return music('previous');
  if(/^(?:пауза|стоп музыка|останови музыку|останови воспроизведение|выключи музыку|выруби музыку|поставь на паузу|поставь музыку на паузу|музыку на паузу)$/.test(text))return music('pause');
  if(/^(?:продолжи|продолжай|продолжи музыку|продолжи воспроизведение|сними с паузы|возобнови музыку|возобнови воспроизведение)$/.test(text))return music('play');
  const relative=text.match(/^(?:(?:сделай|прибавь|увеличь|убавь|уменьши) )?(?:музыку )?(громче|тише|громкость)(?: музыки)?(?: на (\d{1,3}))?$/);
  if(relative&&!(relative[1]==='громкость'&&!/^(?:прибавь|увеличь|убавь|уменьши)/.test(text))){const step=relative[2]===undefined?undefined:Number(relative[2]);if(step!==undefined&&(step<1||step>100))return null;return music(relative[1]==='тише'||/^(?:убавь|уменьши)/.test(text)?'volume_down':'volume_up',step===undefined?{}:{step});}
  const numbers={ноль:0,десять:10,двадцать:20,тридцать:30,сорок:40,пятьдесят:50,шестьдесят:60,семьдесят:70,восемьдесят:80,девяносто:90,сто:100};
  const volume=text.match(/^(?:(?:поставь|установи|сделай) )?громкость(?: музыки)?(?: на)? (\d{1,3}|ноль|десять|двадцать|тридцать|сорок|пятьдесят|шестьдесят|семьдесят|восемьдесят|девяносто|сто)(?: процентов| процент| процента|%)?$/);if(volume){const value=Object.hasOwn(numbers,volume[1])?numbers[volume[1]]:Number(volume[1]);return value<=100?music('set_volume',{volume:value}):null;}
  const special=text.match(new RegExp('^'+start+' (?:плейлист )?(для вас|для меня|открытия|вк микс|vk микс|микс)$'));if(special)return music(({'для вас':'for_you','для меня':'for_you','открытия':'discoveries'})[special[1]]||'mix');
  if(/^(?:покажи|обнови)(?: мои)? плейлисты$/.test(text))return music('playlists');
  const playlist=text.match(new RegExp('^('+start+'|открой) (?:мой )?плейлист (.{1,160})$'));if(playlist&&!/^(?:не |как |почему )/.test(playlist[2]))return music(playlist[1]==='открой'?'open_playlist':'play_playlist',{name:playlist[2]});
  const track=text.match(new RegExp('^'+start+' (?:(?:мой )?трек|песню) (.{1,160})$'));if(track&&!/^(?:не |как |почему )/.test(track[1]))return music('play_track',{name:track[1]});
  const apps={'ютуб':'youtube','youtube':'youtube','браузер':'browser','калькулятор':'calculator','блокнот':'notepad','проводник':'explorer','дискорд':'discord','телеграм':'telegram','телеграмм':'telegram','telegram':'telegram'};const app=text.match(/^(?:открой|запусти) (.+)$/);if(app&&apps[app[1]])return {kind:'app',app:apps[app[1]]};
  return null;
 }
 function mayBeQuickCommand(input,{wakeName='Джарвис'}={}){
  const names=typeof module!=='undefined'?require('./wake-name.js'):root.JarvisWakeName;
  const text=names.strip(String(input||'').toLowerCase().replace(/ё/g,'е').replace(/[,.!?<>"']/g,' ').replace(/\s+/g,' ').trim(),wakeName).replace(/^пожалуйста\s+/,'');
  if(!text)return true;
  if(parseQuickCommand(text,{wakeName}))return true;
  const first=text.split(' ')[0];
  return ['отмена','отмени','отменить','откат','верни','стоп','останови','найди','открой','покажи','поищи','прочитай','зачитай','озвучь','удали','сотри','переключи','переключить','вруби','включай','включи','воспроизведи','играй','запусти','поставь','пропусти','скипай','скипни','скип','следующий','следующая','дальше','переключай','другой','давай','предыдущий','предыдущая','назад','пауза','выключи','выруби','продолжи','продолжить','сними','возобнови','сделай','прибавь','увеличь','убавь','уменьши','музыку','громче','тише','громкость','установи'].some(word=>word===first||(!text.includes(' ')&&word.startsWith(first)));
 }
 const api={parseQuickCommand,mayBeQuickCommand};if(typeof module!=='undefined')module.exports=api;else root.JarvisCommands=api;
})(typeof window!=='undefined'?window:globalThis);
