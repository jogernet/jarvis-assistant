const assert=require('node:assert/strict');
const names=require('./public/wake-name.js'),{WakeListener,intent}=require('./public/wake-listener.js'),{parseQuickCommand}=require('./quick-commands.cjs');
(async()=>{
 for(const text of ['Алиса','эй Алису','Алисе привет'])assert.equal(intent(text,false,'Алиса'),'wake');
 assert.equal(intent('Джарвис',false,'Алиса'),null);assert.equal(intent('колбаса',false,'Алиса'),null);assert.equal(intent('Максим',false,'Макс'),null);assert.equal(intent('Максу привет',false,'Макс'),'wake');
 assert.equal(intent('мой помощник',false,'Мой помощник'),'wake');assert.equal(intent('замолчи',true,'Алиса'),'sleep');
 for(const value of ['', '  ','замолчи','123','<script>','A'.repeat(41)])assert.throws(()=>names.validate(value));
 assert.equal(parseQuickCommand('Алиса включи следующий трек',{wakeName:'Алиса'}).action,'next');assert.equal(parseQuickCommand('Макс включи плейлист ночной',{wakeName:'Макс'}).args.name,'ночной');assert.equal(parseQuickCommand('Алиса не переключай музыку',{wakeName:'Алиса'}),null);
 let models=0,recognizers=0,wakes=0,current;
 class Recognizer{constructor(){recognizers++;this.events={};current=this;}on(name,fn){this.events[name]=fn;}remove(){}}
 const listener=new WakeListener({wakeName:'Алиса',loadModel:async()=>{models++;return {KaldiRecognizer:Recognizer};},onWake:()=>wakes++,onSleep(){},onState(){}});await listener.start();const count=recognizers;listener.setWakeName('Макс');listener.setActive(false);assert.equal(recognizers,count,'Changing wake name and redundant standby updates reuse the recognizer');assert.equal(models,1);current.events.partialresult({event:'partialresult',result:{partial:'Алиса'}});assert.equal(wakes,0);current.events.partialresult({event:'partialresult',result:{partial:'Макс'}});assert.equal(wakes,1);listener.stop();
 console.log('PASS: custom wake names, whole-word matching, Russian forms, stop commands, local routing and model reuse.');
})().catch(error=>{console.error(error);process.exitCode=1;});
