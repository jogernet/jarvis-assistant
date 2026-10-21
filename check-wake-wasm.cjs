// Execute the actual bundled WASM decoder and model in a Node worker. Only browser
// IndexedDB persistence is replaced with temporary memory for this engine test.
const {Worker,isMainThread,parentPort}=require('node:worker_threads');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
if(isMainThread){
 const worker=new Worker(__filename),timer=setTimeout(()=>{worker.terminate();console.error('FAIL: local speech engine timed out');process.exitCode=1;},45000);
 worker.on('message',message=>{if(message?.event==='load'){assert.equal(message.result,true);worker.postMessage({action:'create',recognizerId:'test',sampleRate:16000});}else if(message===undefined){worker.postMessage({action:'audioChunk',recognizerId:'test',sampleRate:16000,data:new Float32Array(16000)});}else if(['result','partialresult'].includes(message.event)){assert.equal(message.result.partial||message.result.text||'','');clearTimeout(timer);console.log('PASS: actual Vosk WASM, Russian tar model extraction, decoder creation and silence decoding without microphone or network.');worker.terminate();}else if(message.event==='error'){clearTimeout(timer);console.error(message);process.exitCode=1;worker.terminate();}});
 worker.on('error',error=>{clearTimeout(timer);console.error(error);process.exitCode=1;});
 worker.postMessage({action:'load',modelUrl:'/models/ru-small.tar.gz'});
}else{
 globalThis.self=globalThis;globalThis.location={href:'http://local.test/vendor/vosk-worker.js'};globalThis.postMessage=message=>parentPort.postMessage(message);globalThis.addEventListener=(event,fn)=>{if(event==='message')parentPort.on('message',data=>fn({data}));};globalThis.close=()=>process.exit(0);globalThis.require=require;globalThis.__dirname=__dirname;
 const originalFetch=globalThis.fetch;globalThis.fetch=async(url,...args)=>String(url).includes('/models/ru-small.tar.gz')?new Response(fs.readFileSync(path.join(__dirname,'public/models/ru-small.tar.gz')),{headers:{'Content-Length':String(fs.statSync(path.join(__dirname,'public/models/ru-small.tar.gz')).size)}}):originalFetch(url,...args);
 let source=fs.readFileSync(path.join(__dirname,'public/vendor/vosk-worker.js'),'utf8');source=source.replace('this.Vosk.FS.mount(this.Vosk.IDBFS, {}, storagePath);','').replaceAll('this.Vosk.syncFilesystem(true)','Promise.resolve()').replaceAll('this.Vosk.syncFilesystem(false)','Promise.resolve()');require('node:vm').runInThisContext(source,{filename:'vosk-worker.js'});
}
