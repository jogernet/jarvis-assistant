// Telegram QR login: push notifications are a fast path, polling also confirms
// acceptance when UpdateLoginToken is missed. Only one request runs at a time.
async function signInQr(client,{Api},credentials,callbacks,{signal,pollMs=10000,requestTimeoutMs=15000}={}){
 let pending=false,wake,closed=false;
 const updated=update=>{if(update instanceof Api.UpdateLoginToken){pending=true;wake?.();}};
 const aborted=()=>wake?.();
 const request=async operation=>{
  let timer,onAbort;
  try{return await Promise.race([Promise.resolve().then(()=>{signal?.throwIfAborted();return operation();}),new Promise((_,reject)=>{
   onAbort=()=>reject(new DOMException('Login cancelled','AbortError'));
   signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)onAbort();
   timer=setTimeout(()=>{const error=Error('TG_API_TIMEOUT');error.code='TG_API_TIMEOUT';reject(error);},requestTimeoutMs);
  })]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
 };
 client.addEventHandler(updated);
 signal?.addEventListener('abort',aborted,{once:true});
 try{
  while(!closed){
   signal?.throwIfAborted();pending=false;
   let result;
   try{
    result=await request(()=>client.invoke(new Api.auth.ExportLoginToken({...credentials,exceptIds:[]})));
    if(result instanceof Api.auth.LoginTokenMigrateTo){
     await request(()=>client._switchDC(result.dcId));
     signal?.throwIfAborted();
     result=await request(()=>client.invoke(new Api.auth.ImportLoginToken({token:result.token})));
    }
   }catch(error){
    if(error.errorMessage!=='SESSION_PASSWORD_NEEDED')throw error;
    signal?.throwIfAborted();
    return await client.signInWithPassword(credentials,callbacks);
   }
   signal?.throwIfAborted();
   if(result instanceof Api.auth.LoginTokenSuccess&&result.authorization instanceof Api.auth.Authorization)return result.authorization.user;
   if(!(result instanceof Api.auth.LoginToken))throw Error('Unexpected Telegram QR response');
   await callbacks.qrCode(result);signal?.throwIfAborted();
   if(pending)continue;
   const waitMs=Math.max(250,Math.min(pollMs,Number(result.expires)*1000-Date.now()));
   await new Promise(resolve=>{const timer=setTimeout(finish,waitMs);function finish(){clearTimeout(timer);wake=null;resolve();}wake=finish;if(pending||signal?.aborted)finish();});
  }
 }finally{closed=true;wake?.();client.removeEventHandler(updated);signal?.removeEventListener('abort',aborted);}
}
module.exports={signInQr};
