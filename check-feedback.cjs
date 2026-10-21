const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const {showOnStart}=require('./show-on-start.cjs');
for(const first of ['ready','loaded']){
 const win=new EventEmitter();win.webContents=new EventEmitter();let shows=0,focuses=0;
 Object.assign(win,{isDestroyed:()=>false,isMinimized:()=>false,show(){shows++;},focus(){focuses++;}});
 showOnStart(win);if(first==='ready')win.emit('ready-to-show');else win.webContents.emit('did-finish-load');
 assert.equal(shows,1);win.emit('ready-to-show');win.webContents.emit('did-finish-load');assert.equal(shows,1,'Loading must never reopen a window the user has hidden');assert.equal(focuses,1);
}
const elements=new Map(),spoken=[],timers=new Map();let serial=0;
const element=()=>({textContent:'',hidden:false,dataset:{},children:[],append(row){this.children.push(row);}});
for(const id of ['status','activity-banner','core-state','chat','empty-chat'])elements.set(id,element());
const speech={speak(message){spoken.push(message);},cancel(){},getVoices:()=>[{lang:'ru-RU',name:'Test'}]};
const window={speechSynthesis:speech,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}}};
vm.runInNewContext(readFileSync('public/activity-ui.js','utf8'),{window,document:{getElementById:id=>elements.get(id),createElement:element},setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout(id){timers.delete(id);}});
const activity=window.jarvisActivity;
activity.heard('Нажми ',false);activity.heard('в центре',true);assert.equal(spoken.length,0,'Recognition must never trigger a separate narrator');assert.ok(!elements.get('status').textContent.includes('Нажми в центре'));
activity.progress({id:'click',stage:'started',label:'Нажимаю на кнопку'});assert.equal(spoken.length,0,'Tool start must never invoke local speech');assert.ok(elements.get('status').textContent.includes('Выполняю'));assert.equal(activity.busy,true);
assert.equal(activity.modelAudio,undefined);
activity.progress({id:'click',stage:'finished',verificationPending:true});assert.ok(elements.get('activity-banner').textContent.includes('Проверяю'));assert.ok(!elements.get('activity-banner').textContent.includes('успех'));
activity.progress({id:'bad',stage:'error',error:'Окно изменилось'});assert.equal(spoken.length,0,'Errors must not invoke a local narrator');activity.complete();assert.ok(elements.get('status').textContent.includes('Ошибка'));
activity.submitted('Открой браузер');assert.equal(spoken.length,0);activity.stop();assert.equal(activity.busy,false);
const html=readFileSync('public/index.html','utf8');assert.ok(html.indexOf('/activity-ui.js')<html.indexOf('/desktop-app.js'));assert.ok(html.includes('id="activity-banner"'));
console.log('PASS: window visible on startup once, no local narration on speech/text/tools/errors, visual progress and stop.');
