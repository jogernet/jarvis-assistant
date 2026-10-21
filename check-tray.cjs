const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {installTray}=require('./tray-controller.cjs');
const app=new EventEmitter(),win=new EventEmitter();let hidden=0,shown=0,quitCount=0,stops=0,commands=[];
Object.assign(win,{isDestroyed:()=>false,isMinimized:()=>false,hide(){hidden++;},show(){shown++;},focus(){},restore(){}});
app.quit=()=>{quitCount++;app.emit('before-quit');};
class FakeTray extends EventEmitter{setToolTip(){}setContextMenu(menu){this.menu=menu;}destroy(){this.destroyed=true;}}
const lifecycle=installTray({app,win,Tray:FakeTray,Menu:{buildFromTemplate:items=>items},icon:'test',onStop:()=>stops++,onCommand:command=>commands.push(command)});
let prevented=false;win.emit('close',{preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(hidden,1);assert.equal(quitCount,0);
let minimizePrevented=false;win.emit('minimize',{preventDefault(){minimizePrevented=true;}});assert.equal(hidden,1);assert.equal(minimizePrevented,false);assert.equal(quitCount,0);
win.emit('minimize');assert.equal(hidden,1);
lifecycle.tray.emit('double-click');assert.equal(shown,1);
lifecycle.tray.menu.find(item=>item.label==='Диагностика').click();assert.equal(commands[0],'diagnostics');
lifecycle.tray.menu.find(item=>item.label==='Остановить управление и экран').click();assert.equal(stops,1);
lifecycle.tray.menu.find(item=>item.label==='Полностью выйти').click();assert.equal(quitCount,1);assert.equal(lifecycle.tray.destroyed,true);
prevented=false;win.emit('close',{preventDefault(){prevented=true;}});assert.equal(prevented,false,'Complete exit must allow the real window to close');
console.log('PASS: close goes to tray, minimize stays on the taskbar, reopen, diagnostics, stop, complete exit and tray cleanup.');
app.emit('before-quit');assert.equal(lifecycle.tray.destroyed,true,'A second quit event after journal flush must be safe');
