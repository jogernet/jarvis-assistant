const assert=require('node:assert/strict');
const {signInQr}=require('./telegram-qr.cjs');
const {loadSdk}=require('./telegram-service.cjs');
const {Api}=loadSdk();
const credentials={apiId:123,apiHash:'a'.repeat(32)};
const token=()=>new Api.auth.LoginToken({token:Buffer.from('fake-test-token'),expires:Math.floor(Date.now()/1000)+30});
const success=()=>new Api.auth.LoginTokenSuccess({authorization:new Api.auth.Authorization({user:{firstName:'Owner'}})});
function fixture(results){
 const handlers=new Set();let calls=0;
 const client={addEventHandler:h=>handlers.add(h),removeEventHandler:h=>handlers.delete(h),
  invoke:async request=>{calls++;const next=results.shift();if(typeof next==='function')return next(request);if(next instanceof Error)throw next;return next;},
  _switchDC:async dc=>{client.dc=dc;},signInWithPassword:async(_credentials,callbacks)=>{assert.equal(await callbacks.password(),'test-password');return {firstName:'Owner'};}};
 return {client,handlers,get calls(){return calls;},push(){for(const h of handlers)h(new Api.UpdateLoginToken());}};
}
(async()=>{
 // Acceptance must finish even when Telegram's update never arrives.
 let f=fixture([token(),success()]),qr=0;
 let user=await signInQr(f.client,{Api},credentials,{qrCode:async()=>qr++},{pollMs:1});
 assert.equal(user.firstName,'Owner');assert.equal(qr,1);assert.equal(f.calls,2);assert.equal(f.handlers.size,0);
 // Register before exporting: an update during QR rendering cannot be lost.
 f=fixture([token(),success()]);
 await signInQr(f.client,{Api},credentials,{qrCode:async()=>f.push()},{pollMs:60000});
 assert.equal(f.calls,2);assert.equal(f.handlers.size,0);
 // A successful first response must not render another QR.
 f=fixture([success()]);await signInQr(f.client,{Api},credentials,{qrCode:()=>assert.fail('stale QR')});
 // Cross-DC acceptance imports the returned token before reporting success.
 f=fixture([new Api.auth.LoginTokenMigrateTo({dcId:2,token:Buffer.from('migration-test')}),request=>{assert.ok(request instanceof Api.auth.ImportLoginToken);assert.equal(request.token.toString(),'migration-test');return success();}]);
 await signInQr(f.client,{Api},credentials,{});assert.equal(f.client.dc,2);assert.equal(f.handlers.size,0);
 // Password-required must leave QR waiting and invoke the 2FA callback.
 const passwordError=Object.assign(Error('2FA'),{errorMessage:'SESSION_PASSWORD_NEEDED'});
 f=fixture([token(),passwordError]);user=await signInQr(f.client,{Api},credentials,{qrCode:async()=>f.push(),password:async()=>'test-password'});
 assert.equal(user.firstName,'Owner');assert.equal(f.handlers.size,0);
 // Cancellation clears listeners and cannot perform another export.
 f=fixture([token()]);const abort=new AbortController();
 await assert.rejects(()=>signInQr(f.client,{Api},credentials,{qrCode:async()=>abort.abort()},{signal:abort.signal}),{name:'AbortError'});
 assert.equal(f.calls,1);assert.equal(f.handlers.size,0);
 f=fixture([()=>new Promise(()=>{})]);
 await assert.rejects(()=>signInQr(f.client,{Api},credentials,{}, {requestTimeoutMs:10}),{code:'TG_API_TIMEOUT'});assert.equal(f.handlers.size,0);
 console.log('PASS: QR acceptance without push, early update, immediate success, DC migration, 2FA, cancellation, request timeout and listener cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
