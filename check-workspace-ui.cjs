const {app,BrowserWindow}=require('electron');
const path=require('node:path'),fs=require('node:fs/promises');
app.setPath('userData',path.join(__dirname,'runtime','workspace-ui-test'));
process.env.JARVIS_PORT='3297';
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
let backend,win;
app.whenReady().then(async()=>{
 const {pathToFileURL}=require('node:url');const module=await import(pathToFileURL(path.join(__dirname,'server.mjs')).href);backend=module.server;
 await new Promise(resolve=>backend.listen(3297,'127.0.0.1',resolve));
 win=new BrowserWindow({show:false,width:1280,height:830,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const errors=[];win.webContents.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message);});
 win.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('http://127.0.0.1:3297/')}));
 await win.loadURL('http://127.0.0.1:3297');
 const inspect=await win.webContents.executeJavaScript(`(async()=>{
  document.getElementById('onboarding').hidden=true;document.getElementById('workspace').hidden=false;
  const seen=new Set();for(const el of document.querySelectorAll('[id]')){if(seen.has(el.id))throw Error('Duplicate ID '+el.id);seen.add(el.id);}
  const result=[];for(const name of ['actions','messengers','preferences','history','memory','services','screen','diagnostics']){
   document.getElementById('nav-'+name).click();await new Promise(r=>setTimeout(r,30));
   const id=({actions:'actions-panel',messengers:'messengers-panel',preferences:'preferences-panel',history:'history-panel',memory:'memory-panel',services:'services-panel',screen:'screen-panel',diagnostics:'diagnostics-panel'})[name];
   if(document.getElementById(id).hidden)throw Error('Panel not shown '+name);
   result.push(name);
  }
  document.getElementById('nav-messengers').click();
  return {panels:result,overflow:document.documentElement.scrollWidth>innerWidth,settings:!!document.getElementById('connection-settings')};
 })()`);
 if(inspect.overflow)throw Error('Horizontal overflow');if(errors.length)throw Error(errors.join('\n'));
 await fs.writeFile(path.join(__dirname,'runtime','workspace-messengers.png'),(await win.webContents.capturePage()).toPNG());
 await win.webContents.executeJavaScript("document.getElementById('nav-preferences').click()");
 await fs.writeFile(path.join(__dirname,'runtime','workspace-settings.png'),(await win.webContents.capturePage()).toPNG());
 console.log('PASS: Electron UI, panel navigation, unique IDs, settings, no horizontal overflow, no renderer errors. '+JSON.stringify(inspect));
 backend.closeAllConnections();backend.close();app.exit(0);
}).catch(error=>{console.error(error);backend?.closeAllConnections();backend?.close();app.exit(1);});
setTimeout(()=>{console.error('UI check timed out');app.exit(1);},20000).unref();
