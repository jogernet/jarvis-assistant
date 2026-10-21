const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {TelegramService,loadSdk}=require('./telegram-service.cjs'),{TelegramSetup}=require('./telegram-setup.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(test){for(let i=0;i<100;i++){if(test())return;await delay(5);}throw Error('State did not settle');}
(async()=>{
 const home=await fs.mkdtemp(path.join(__dirname,'runtime','test-telegram-connect-'));
 let installed=false,launches=0,killed=0;
 const setup=new TelegramSetup({directory:path.join(home,'dependencies'),loadSdk:()=>{if(!installed)throw Error('missing');return {ready:true};},locate:async()=>path.join(home,'npm-cli.js'),start:(exe,args,options)=>{
  launches++;assert.equal(exe,'node.exe');assert.ok(args.includes('--ignore-scripts'));assert.equal(options.windowsHide,true);assert.ok(!JSON.stringify(args).includes('apiHash'));
  const child=new EventEmitter();child.stderr=new PassThrough();child.kill=()=>killed++;queueMicrotask(()=>{installed=true;child.emit('close',0);});return child;
 }});
 const steps=[];assert.equal((await setup.ensure({progress:text=>steps.push(text)})).ready,true);assert.equal(launches,1);assert.ok(steps.some(text=>text.includes('Загружаю')));
 await setup.ensure();assert.equal(launches,1,'Installed clients never launch another installer');
 const hangingSetup=new TelegramSetup({directory:path.join(home,'cancel-dependencies'),loadSdk:()=>{throw Error('missing');},locate:async()=>'/npm.js',start:()=>{const child=new EventEmitter();child.stderr=new PassThrough();child.kill=()=>killed++;return child;},timeoutMs:20});
 await assert.rejects(()=>hangingSetup.ensure(),/две минуты/);assert.equal(killed,1,'Installation timeout terminates the child');

 let mode='fallback',finishAuth;const clients=[];
 class Client{
  constructor(session,_id,_hash,options){this.session=session;this.options=options;clients.push(this);}
  setLogLevel(){}
  connect(){if(mode==='returns-false-all'||(!this.options.useWSS&&mode==='returns-false'))return Promise.resolve(false);if(mode==='offline'||(!this.options.useWSS&&mode==='fallback'))return new Promise(()=>{});this.connected=true;return Promise.resolve(true);}
  async destroy(){this.closed=true;}
  signInUserWithQrCode(_credentials,callbacks){assert.equal(this.connected,true,'QR must not be requested after a failed connect');if(mode==='no-qr')return new Promise(()=>{});callbacks.qrCode({token:Buffer.from('fake-token'),expires:100});return new Promise(resolve=>finishAuth=resolve);}
 }
 const sdk=()=>({TelegramClient:Client,StringSession:class{setDC(dc,host,port){Object.assign(this,{dcId:dc,serverAddress:host,port});}save(){return 'fake-session';}},ConnectionTCPObfuscated:class{},PromisedWebSockets:class{},qr:{toDataURL:async()=> 'data:image/png;base64,ZmFrZQ=='}});
 const service=new TelegramService({home,encode:value=>Buffer.from(value),decode:bytes=>bytes.toString(),qrLogin:(client,_sdk,credentials,callbacks)=>client.signInUserWithQrCode(credentials,callbacks),sdk,connectTimeoutMs:20,qrTimeoutMs:30});
 await service.startLogin({apiId:'12345',apiHash:'a'.repeat(32)});await until(()=>service.phase==='qr');
 assert.equal(clients.length,2);assert.equal(clients[0].closed,true);assert.equal(clients[1].options.useWSS,true);assert.equal(clients[1].session.serverAddress,'vesta.web.telegram.org');assert.equal(clients[1].session.port,443);assert.ok(service.state().qr.startsWith('data:image/png'));
 await service.close();assert.equal(clients[1].closed,true);
 mode='returns-false';const beforeFalse=clients.length;await service.startLogin({apiId:'12345',apiHash:'a'.repeat(32)});await until(()=>service.phase==='qr');assert.equal(clients.length,beforeFalse+2,'A false connect result must try the fallback');assert.equal(service.transport,'wss');await service.close();
 mode='returns-false-all';await service.startLogin({apiId:'12345',apiHash:'a'.repeat(32)});await until(()=>service.phase==='error');assert.match(service.state().error,/не ответил при подключении/);assert.ok(!service.state().error.includes('не выдал QR'),'A failed connection must not be misreported as a QR timeout');await service.close();
 mode='offline';await service.startLogin({apiId:'12345',apiHash:'a'.repeat(32)});await until(()=>service.phase==='error');assert.match(service.state().error,/не ответил/);assert.equal(service.state().canRetry,true);
 mode='working';await service.retryLogin();await until(()=>service.phase==='qr');await service.close();
 mode='no-qr';await service.startLogin({apiId:'12345',apiHash:'a'.repeat(32)});await until(()=>service.phase==='error');assert.match(service.state().error,/не выдал QR/);await service.close();
 mode='offline';await service.startLogin({apiId:'12345',apiHash:'a'.repeat(32)});await delay(5);await service.close();await delay(60);assert.equal(service.phase,'disconnected','Cancelled connection cannot publish a late QR or error');

 const real=loadSdk();const qr=await real.qr.toDataURL('tg://login?token=FAKE-NON-AUTHENTICATING-TEST-TOKEN',{width:240,margin:2});const png=Buffer.from(qr.split(',')[1],'base64');assert.equal(png.subarray(1,4).toString(),'PNG');
 const local=new TelegramService({home,encode:value=>Buffer.from(value),decode:bytes=>bytes.toString()});const wss=local.makeClient({apiId:1,apiHash:'0'.repeat(32)},'wss');assert.equal(wss.useWSS,true);assert.equal(wss.session.serverAddress,'vesta.web.telegram.org');assert.equal(wss._connection.name,'ConnectionTCPObfuscated');await local.dispose(wss);
 console.log('PASS: automatic in-app preparation, installed dependency reuse, installer timeout, TCP→WSS fallback, stage timeouts, QR timeout, retry without retyping, cancellation, real QR PNG generation and real SDK WSS configuration (no account login).');
})().catch(error=>{console.error(error);process.exitCode=1;});
