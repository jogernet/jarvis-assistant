const {app,BrowserWindow,ipcMain,Menu,safeStorage,shell,dialog,desktopCapturer,screen,Tray,nativeImage}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const smoke=process.argv.includes('--smoke-test');
const {profilePath}=require('./distribution-profile.cjs');
const home=profilePath(app,{smoke});
const {UpdateService}=require('./update-service.cjs');
let updates;
app.setPath('userData',home);
app.name='JARVIS';if(process.platform==='win32')app.setAppUserModelId('local.jarvis.assistant');
let win,backend,origin,stopComputer,shutdown,trayController,closeNativeWorker,services,journal,quitFlushed=false;
const {installTray}=require('./tray-controller.cjs');
const {showOnStart}=require('./show-on-start.cjs');
const {globalShortcut,session}=require('electron');
const {createServices}=require('./service-manager.cjs');
const {SpotifyService}=require('./spotify-service.cjs');
const {JournalStore}=require('./journal-store.cjs');
const {TelegramService,loadSdk:loadTelegramSdk}=require('./telegram-service.cjs');
const {TelegramSetup}=require('./telegram-setup.cjs');
const telegramSetup=new TelegramSetup({loadSdk:loadTelegramSdk});
let telegram,telegramPrivateSnapshot;
const settingsFile=path.join(home,'connection.enc');
const trusted=e=>win&&!win.isDestroyed()&&e.sender===win.webContents&&e.senderFrame?.url.startsWith(origin+'/');
async function loadSettings(){
 try{return JSON.parse(safeStorage.decryptString(await fs.readFile(settingsFile)));}
 catch(e){if(e.code==='ENOENT')return null;throw Error('Не удалось прочитать сохранённый ключ. Введи его заново.');}
}
async function saveSettings(data){
 if(!safeStorage.isEncryptionAvailable())throw Error('Защищённое хранилище Windows недоступно. Ключ не сохранён.');
 if(typeof data?.key!=='string'||!data.key.trim()||data.key.length>8192)throw Error('Не передан ключ.');
 const settings={key:data.key.trim(),model:String(data.model||'').slice(0,100),voice:['Orus','Charon','Puck'].includes(data.voice)?data.voice:'Orus',control:data.control===true,vision:data.vision===true};
 await fs.mkdir(home,{recursive:true});
 const temp=settingsFile+'.tmp';await fs.writeFile(temp,safeStorage.encryptString(JSON.stringify(settings)));await fs.rename(temp,settingsFile);return {saved:true};
}
if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
 app.whenReady().then(async()=>{
  await fs.mkdir(home,{recursive:true});
  const defaults=JSON.parse(await fs.readFile(path.join(__dirname,'release-config.json'),'utf8'));
  updates=new UpdateService({home,root:process.env.JARVIS_DISTRIBUTION_ROOT,version:require('./package.json').version,defaultRepository:defaults.repository,notify:state=>{if(win&&!win.isDestroyed())win.webContents.send('jarvis:update',state);}});await updates.load();
  process.env.JARVIS_PORT='3214';
  const module=await import(pathToFileURL(path.join(__dirname,'server.mjs')).href);backend=module.server;stopComputer=module.stopComputer;shutdown=module.shutdown;
  const native=await import(pathToFileURL(path.join(__dirname,'system-tools.mjs')).href);
  closeNativeWorker=native.closeNativeWorker;
  telegram=await new TelegramService({home,prepare:options=>telegramSetup.ensure(options).catch(error=>{error.telegramSetup=true;throw error;}),encode:value=>{if(!safeStorage.isEncryptionAvailable())throw Error('Защищённое хранилище Windows недоступно.');return safeStorage.encryptString(value);},decode:bytes=>safeStorage.decryptString(bytes)}).load();
  module.registerMessenger((name,args,signal)=>args.service==='telegram'?telegram.command(name,args,signal):native.executeNative(name,args,signal));
  const spotify=await new SpotifyService({home,encode:value=>{if(!safeStorage.isEncryptionAvailable())throw Error('Защищённое хранение Windows недоступно.');return safeStorage.encryptString(value);},decode:bytes=>safeStorage.decryptString(bytes),openExternal:url=>shell.openExternal(url)}).load();
  services=await createServices({BrowserWindow,session,home,spotify});module.registerServices(services);
  journal=new JournalStore({file:path.join(home,'journal.enc'),encode:value=>safeStorage.encryptString(value),decode:bytes=>safeStorage.decryptString(bytes)});await journal.load();module.registerJournal(journal);
  let markerSnapshot=null,markerPromise=null,markerSignal=null,markerAt=0;
  module.registerComputer(async(name,args,signal,expectedForeground,expectedDisplay)=>{
   if(name!=='screen_view'){const result=await native.executeNative(name,args,signal,expectedForeground,expectedDisplay);if(['click_target','click_control','click_screen','focus_window','scroll_screen','press_key','type_text','move_mouse'].includes(name)){markerSnapshot=null;markerAt=0;}return result;}
   if(signal?.aborted)throw Error('Просмотр экрана остановлен.');
   if(markerSignal!==signal){markerSnapshot=null;markerSignal=signal;markerAt=0;}
   if(!markerPromise&&Date.now()-markerAt>900){const began=Date.now();markerAt=began;markerPromise=native.executeNative('list_controls',{},signal).then(result=>{if(markerSignal===signal&&!signal.aborted){markerSnapshot={...result,at:Date.now()};module.setNativeStatus({detectorAt:Date.now(),detectorMs:Date.now()-began,detector:'Windows UI Automation',detectorError:'',detectedTargets:result.controls?.length||0});}}).catch(error=>{if(!signal.aborted){markerSnapshot=null;module.setNativeStatus({detectorError:error.message});}}).finally(()=>{markerPromise=null;});}
   const primary=screen.getPrimaryDisplay();
   const before=await native.executeNative('foreground_window',{},signal);
   const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.min(2560,Math.round(primary.size.width*primary.scaleFactor)),height:Math.round(Math.min(2560,Math.round(primary.size.width*primary.scaleFactor))*primary.size.height/primary.size.width)}});
   const source=sources.find(item=>item.display_id===String(primary.id))||(sources.length===1?sources[0]:null);
   if(!source||source.thumbnail.isEmpty())throw Error('Не удалось получить основной экран.');
   const after=await native.executeNative('foreground_window',{},signal);
   if(signal?.aborted)throw Error('Просмотр экрана остановлен.');
   if(before.active!==after.active)throw Error('Окно сменилось во время снимка. Повторяю просмотр.');
   const size=source.thumbnail.getSize(),display=after.display;
   if(JSON.stringify(before.display)!==JSON.stringify(display))throw Error('Геометрия экрана изменилась во время захвата.');
   if(!display||Math.abs(size.width/size.height-display.width/display.height)>.02)throw Error('Размер снимка не соответствует основному экрану. Клик отменён.');
   const cursor=after.cursor?{x:Math.round((after.cursor.x-display.left)*1000/(display.width-1)),y:Math.round((after.cursor.y-display.top)*1000/(display.height-1))}:null;
   const targets=markerSnapshot?.activeHwnd===after.active&&Date.now()-markerSnapshot.at<30000?(markerSnapshot.controls||[]).filter(t=>t.left+t.width>display.left&&t.top+t.height>display.top&&t.left<display.left+display.width&&t.top<display.top+display.height).slice(0,80):[];
   const prepared=await native.executeNative('prepare_frame',{display,...(targets.length?{targets}:{}),image:source.thumbnail.toJPEG(95).toString('base64'),...(cursor&&cursor.x>=0&&cursor.x<=1000&&cursor.y>=0&&cursor.y<=1000?{cursorX:cursor.x,cursorY:cursor.y}:{})},signal);
   return {ok:true,image:prepared.image,display,cursor,targets,frameId:String(Date.now()),width:size.width,height:size.height,activeHwnd:after.active,activeWindow:after.title||'',coordinates:'x and y are normalized to 0..1000 over the entire image'};
  });
  native.executeNative('system_status',{}).then(state=>module.setNativeStatus({elevated:state.elevated,nativeAvailable:true,helperVersion:state.version})).catch(error=>module.setNativeStatus({lastError:error.message,nativeAvailable:false}));
  globalShortcut.register('Control+Alt+Escape',()=>{stopComputer();win?.webContents.send('jarvis:emergency-stop');});
  await new Promise((resolve,reject)=>{backend.once('error',reject);backend.listen(3214,'127.0.0.1',resolve);});
  origin='http://127.0.0.1:3214';Menu.setApplicationMenu(null);
  win=new BrowserWindow({width:1280,height:830,minWidth:940,minHeight:680,show:false,frame:false,title:'JARVIS',icon:path.join(__dirname,'assets','jarvis.ico'),backgroundColor:'#080d15',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  const notifyVisibility=()=>{if(win&&!win.isDestroyed())win.webContents.send('jarvis:visibility',win.isMinimized()||!win.isVisible());};for(const event of ['minimize','restore','hide','show'])win.on(event,notifyVisibility);win.webContents.on('did-finish-load',notifyVisibility);
  if(!smoke)trayController=installTray({app,win,Tray,Menu,icon:nativeImage.createFromPath(path.join(__dirname,'tray.png')),onStop:stopComputer,onCommand:command=>win.webContents.send('jarvis:command',command)});
  ipcMain.handle('jarvis:telegram',async(e,action,data={})=>{
   if(!trusted(e))throw Error('Untrusted page');
   if(action==='state')return telegram.state();
   if(action==='connect'){telegramPrivateSnapshot??=module.pausePrivateInput();return telegram.startLogin(data);}
   if(action==='retry'){telegramPrivateSnapshot??=module.pausePrivateInput();return telegram.retryLogin();}
   if(action==='password')return telegram.submitPassword(data.password);
   if(action==='cancel'){await telegram.close();return telegram.state();}
   if(action==='disconnect')return telegram.disconnect();
   if(action==='finish'){if(['preparing','qr','password','connecting','requesting_qr','saving'].includes(telegram.state().phase))throw Error('Сначала заверши или отмени вход.');module.resumePrivateInput(telegramPrivateSnapshot);telegramPrivateSnapshot=null;return {ok:true};}
   throw Error('Неизвестная команда Telegram.');
  });
  ipcMain.handle('jarvis:updates',async(e,action,data)=>{if(!trusted(e))throw Error('Untrusted page');if(action==='state')return updates.state();if(action==='save'){updates.stop();const state=await updates.save(data);updates.start();return state;}if(action==='check')return updates.check();if(action==='download')return updates.download();if(action==='restart'){if(!updates.ready)throw Error('Обновление ещё не готово.');await updates.activate();app.relaunch({execPath:path.join(process.env.JARVIS_DISTRIBUTION_ROOT,'JARVIS.exe'),args:[]});app.quit();return updates.state();}throw Error('Unknown update action');});
  ipcMain.handle('jarvis:journal',async(e,action,data)=>{if(!trusted(e))throw Error('Untrusted page');return journal.command(action,data);});
  ipcMain.handle('jarvis:services',async(e,action,data={})=>{if(!trusted(e))throw Error('Untrusted page');if(action==='spotify-connect')return services.spotify.connect(data.clientId);if(action==='spotify-refresh')return services.spotify.refresh();if(action==='spotify-disconnect')return services.spotify.disconnect();if(action==='spotify-device')return services.spotify.selectDevice(data.deviceId);if(action==='spotify-command')return module.musicAction(data.action,'spotify',data);if(action==='state')return services.state();if(action==='save')return services.save(data);if(action==='open')return services.open();if(action==='connect'){await services.save({musicProvider:'vk',vkLibrary:data.vkLibrary});return services.open();}if(action==='close'){services.close();return {ok:true};}if(action==='disconnect')return services.disconnect();if(action==='command')return module.musicAction(data.action,'vk',data);if(action==='youtube'){await shell.openExternal('https://music.youtube.com');return {ok:true};}throw Error('Unknown service action');});
  ipcMain.handle('jarvis:load',e=>{if(!trusted(e))throw Error('Untrusted page');return loadSettings();});
  ipcMain.handle('jarvis:save',(e,data)=>{if(!trusted(e))throw Error('Untrusted page');return saveSettings(data);});
  ipcMain.handle('jarvis:forget',async e=>{if(!trusted(e))throw Error('Untrusted page');await fs.rm(settingsFile,{force:true});return true;});
  ipcMain.on('jarvis:window',(e,action)=>{if(!trusted(e))return;if(action==='close')win.close();if(action==='minimize')win.minimize();if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();});
  win.webContents.setWindowOpenHandler(({url})=>{try{if(new URL(url).protocol==='https:')shell.openExternal(url);}catch{}return {action:'deny'};});
  win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith(origin+'/'))e.preventDefault();});
  win.webContents.session.setPermissionRequestHandler((wc,permission,callback,details)=>callback(wc===win.webContents&&permission==='media'&&details.mediaTypes?.every(t=>t==='audio')===true));
  win.webContents.session.setPermissionCheckHandler((wc,permission,requestingOrigin)=>wc===win.webContents&&requestingOrigin===origin&&permission==='media');
  if(smoke){
   win.webContents.on('did-fail-load',(_e,code,description)=>{console.error('LOAD FAILED',code,description);app.exit(1);});
   win.webContents.on('console-message',(_e,_level,message)=>{if(message.includes('JARVIS_UI_READY'))console.log(message);});
   ipcMain.once('jarvis:ready',async e=>{
    if(!trusted(e))return;
    try{
     const fake={key:'smoke-test-not-a-real-key',model:'test-model',control:false};await saveSettings(fake);
     const loaded=await loadSettings();if(loaded.key!==fake.key)throw Error('Credential round trip failed');
     const disk=await fs.readFile(settingsFile);if(disk.includes(Buffer.from(fake.key)))throw Error('Plaintext credential found');
     await fs.rm(settingsFile,{force:true});console.log('PASS: native window, isolated preload, encrypted save and restore.');
     await win.webContents.capturePage().then(img=>fs.writeFile(path.join(__dirname,'runtime','desktop-preview.png'),img.toPNG()));app.exit(0);
    }catch(error){console.error(error.message);app.exit(1);}
   });
   setTimeout(()=>{console.error('Desktop smoke test timed out');app.exit(1);},20000).unref();
  }else{showOnStart(win);}
  await win.loadURL(origin);if(!smoke)updates.start();
 }).catch(e=>{if(!smoke)dialog.showErrorBox('JARVIS',e.message);console.error(e.message);app.exit(1);});
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',event=>{if((journal||updates)&&!quitFlushed){event.preventDefault();quitFlushed=true;shutdown?.();updates?.stop();Promise.all([journal?.flush(),updates?.activate()]).catch(()=>{}).finally(()=>app.quit());return;}shutdown?.();stopComputer?.();closeNativeWorker?.();telegram?.close().catch(()=>{});services?.close();globalShortcut.unregisterAll();backend?.closeAllConnections();backend?.close();});
}
