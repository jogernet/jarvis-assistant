const {parseQuickCommand}=require('./quick-commands.cjs');
function musicToolRoute(name,args={},request='',wakeName='Джарвис'){
 if(!['find_music','open_app','open_url','search_web'].includes(name))return null;
 const command=parseQuickCommand(request,{wakeName});if(command?.kind==='music')return {command};
 let musicUrl=false;try{musicUrl=['music.youtube.com','music.youtube.ru'].includes(new URL(args.url).hostname);}catch{}
 if(name!=='find_music'&&!(name==='open_app'&&args.app==='music')&&!(name==='open_url'&&musicUrl))return null;
 // Opening another service requires a request for that service or for a music search.
 if(/(?:ютуб|youtube)/i.test(request)||name==='find_music'&&/(?:^|\s)(?:найди|поищи|поиск)(?:\s|$)/i.test(request))return null;
 return {blocked:true,error:'Не открывай YouTube Music для управления текущей музыкой. Используй music_control с next, previous, pause или play. Сервис менять только по просьбе пользователя.'};
}
module.exports={musicToolRoute};
