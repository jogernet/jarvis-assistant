function installTray({app,win,Tray,Menu,icon,onStop,onCommand}){
 let quitting=false,destroyed=false;
 const tray=new Tray(icon);tray.setToolTip('JARVIS — личный ассистент');
 function show(){if(win.isDestroyed())return;if(win.isMinimized())win.restore();win.show();win.focus();}
 function quit(){quitting=true;app.quit();}
 const items=[{label:'Открыть JARVIS',click:show},{label:'Диагностика',click:()=>{show();onCommand('diagnostics');}},{type:'separator'},{label:'Включить / выключить микрофон',click:()=>onCommand('microphone')},{label:'Остановить управление и экран',click:onStop},{type:'separator'},{label:'Полностью выйти',click:quit}];
 tray.setContextMenu(Menu.buildFromTemplate(items));tray.on('double-click',show);
 win.on('close',event=>{if(!quitting){event.preventDefault();win.hide();}});
 app.on('before-quit',()=>{quitting=true;if(!destroyed){destroyed=true;tray.destroy();}});
 return {tray,show,quit};
}
module.exports={installTray};
