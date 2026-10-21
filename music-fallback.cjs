const starts=new Set(['play','play_playlist','mix','for_you','discoveries']);
async function withMusicFallback(action,args,execute){
 const attempts=[];
 const attempt=async(next,options)=>{try{const result=await execute(next,options);attempts.push({action:next,ok:result.ok===true,error:result.error});return result;}catch(error){attempts.push({action:next,ok:false,error:error.message});return {ok:false,error:error.message};}};
 let result=await attempt(action,args);
 if(result.ok!==false||!starts.has(action)||args.fallback===false)return result;
 for(const next of ['for_you','mix','discoveries','play'].filter(next=>next!==action)){
  result=await attempt(next,{});
  if(result.ok&&result.verified&&result.playback==='playing')return {...result,fallback:true,requestedAction:action,sourceAction:next,attempts,result:'Включил '+({for_you:'плейлист «Для вас»',mix:'VK Микс',discoveries:'плейлист «Открытия»',play:'доступную музыку'})[next]+' вместо недоступного варианта.'};
 }
 return {ok:false,error:'Не удалось запустить ни запрошенную музыку, ни запасные варианты VK. '+(result.error||''),attempts};
}
module.exports={withMusicFallback};
