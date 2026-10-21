// Real WASM/model smoke test; no microphone, credentials or Gemini connection.
const {app,BrowserWindow}=require('electron');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
app.setPath('userData',path.join(__dirname,'runtime','wake-smoke-profile'));
let server,window;const timeout=setTimeout(()=>{console.error('FAIL: offline model load timed out');app.exit(1);},65000);
app.whenReady().then(async()=>{
 server=http.createServer((req,res)=>{res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'");if(req.url==='/'){res.end('<!doctype html><script src="/vendor/vosk.js"></script><script src="/wake-listener.js"></script>');return;}const files={'/vendor/vosk.js':'vendor/vosk.js','/wake-listener.js':'wake-listener.js','/models/ru-small.tar.gz':'models/ru-small.tar.gz'};if(!files[req.url]){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'application/gzip');fs.createReadStream(path.join(__dirname,'public',files[req.url])).pipe(res);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 window=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 window.webContents.on('console-message',(_e,_level,message)=>{if(/error|Ignoring word/i.test(message))console.error(message.slice(0,250));});
 await window.loadURL('http://127.0.0.1:'+server.address().port);
 const result=await window.webContents.executeJavaScript(`(async()=>{const events=[];const listener=new JarvisWake.WakeListener({onWake(){},onSleep(){},onState:state=>events.push(state)});await listener.start();listener.feed(new Int16Array(4096).buffer);await new Promise(resolve=>setTimeout(resolve,300));listener.close();return events;})()`);
 if(!result.includes('waiting'))throw Error('No local recognizer readiness');console.log('PASS: actual Vosk WASM and Russian model load in sandboxed Electron with production CSP, offline PCM input and clean shutdown.');clearTimeout(timeout);window.destroy();server.close();app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
