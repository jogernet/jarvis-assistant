import {validateSystemAction} from './system-tools.mjs';
const coordinateActions=new Set(['click_screen','scroll_screen','move_mouse']);
const mutations=new Set(['focus_window','click_screen','scroll_screen','move_mouse','click_control','click_target','type_text','press_key']);
export class ComputerSession{
 constructor({execute,sendFrame,notify}){Object.assign(this,{execute,sendFrame,notify});this.control=false;this.vision=false;this.lastFrameAt=0;this.lastCapture=0;this.lastSent=0;this.abort=new AbortController();this.scene=0;this.capturePromise=null;this.verification=Promise.resolve();this.captureFps=20;this.adaptiveVision=true;this.busyUntil=0;}
 configure(control,vision){this.stop();this.control=control===true;this.vision=vision===true;this.abort=new AbortController();const generation=this.abort.signal;
  if(this.vision){this.timer=setInterval(()=>{if(this.capturePromise)return;const gap=this.adaptiveVision?(Date.now()<this.busyUntil?Math.max(250,1000/this.captureFps):1000):1000/this.captureFps;if(Date.now()-this.lastCapture<gap)return;this.view(false).catch(error=>{if(!generation.aborted)this.notify({visionError:error.message});});},Math.round(1000/this.captureFps));this.timer.unref?.();}
  this.notify({computerState:{control:this.control,vision:this.vision}});
 }
 stop(){clearInterval(this.timer);clearTimeout(this.sendTimer);clearTimeout(this.verifyTimer);this.sendTimer=null;this.resolveVerification?.();this.resolveVerification=null;this.abort.abort();this.scene++;this.capturePromise=null;this.control=false;this.vision=false;this.lastFrameAt=0;this.actionFrame=null;this.controlSnapshot=null;this.frame=null;this.sentFrame=null;this.cache=null;this.pendingFrame=null;this.notify({computerState:{control:false,vision:false}});}
 setAdaptive(value){this.adaptiveVision=value===true;return this.adaptiveVision;}
 setCaptureFps(value){if(![4,10,20,60].includes(value))throw Error('Допустимый захват: 4, 10, 20 или 60 FPS.');this.captureFps=value;if(this.vision)this.configure(this.control,this.vision);return value;}
 cancel(){const {control,vision}=this;this.configure(control,vision);}
 pin(frame){if(!frame||frame.scene!==this.scene)throw Error('Нужен новый screen_view.');this.actionFrame=frame;return frame.metadata;}
 async capture(force=false){
  const signal=this.abort.signal;if(!this.vision||signal.aborted)throw Error('Просмотр экрана выключен.');
  if(!force&&this.cache?.scene===this.scene&&Date.now()-this.lastCapture<Math.max(15,Math.round(900/this.captureFps)))return this.cache;
  if(this.capturePromise){const frame=await this.capturePromise;if(frame.scene===this.scene)return frame;return this.capture(force);}
  const scene=this.scene;
  const operation=(async()=>{const result=await this.execute('screen_view',{},signal);if(signal.aborted)throw new DOMException('Операция отменена','AbortError');const {image,...metadata}=result;const frame={image,metadata,scene,capturedAt:Date.now()};if(scene===this.scene){this.cache=frame;this.lastCapture=frame.capturedAt;}return frame;})();
  this.capturePromise=operation;
  try{return await operation;}finally{if(this.capturePromise===operation)this.capturePromise=null;}
 }
 send(frame){if(!this.vision||frame.scene!==this.scene||this.abort.signal.aborted||Date.now()-this.lastSent<1000)return false;if(this.sendFrame(frame.image,frame.metadata)===false){this.notify({visionError:'Кадр не отправлен: соединение занято или недоступно.'});return false;}this.lastSent=Date.now();this.frame=frame.metadata;this.lastFrameAt=frame.capturedAt;this.sentFrame=frame;if(frame.metadata.targets?.length)this.controlSnapshot={at:Date.now(),hwnd:frame.metadata.activeHwnd,ids:new Set(frame.metadata.targets.map(t=>t.id))};return true;}
 async view(actionable=true,force=false){
  let frame=await this.capture(force);if(frame.scene!==this.scene)frame=await this.capture(true);
  if(this.sentFrame===frame)return actionable?this.pin(frame):frame.metadata;
  const delay=Math.max(0,1000-(Date.now()-this.lastSent));
  if(delay&&actionable){const signal=this.abort.signal;await new Promise(resolve=>setTimeout(resolve,delay));if(signal.aborted)throw new DOMException('Операция отменена','AbortError');if(frame.scene!==this.scene||Date.now()-frame.capturedAt>150)frame=await this.capture(true);if(!this.send(frame)){if(this.sentFrame?.scene===this.scene)return this.pin(this.sentFrame);return this.view(true);}}
  else if(delay){this.pendingFrame=frame;if(!this.sendTimer){this.sendTimer=setTimeout(()=>{this.sendTimer=null;const latest=this.pendingFrame;this.pendingFrame=null;if(latest)this.send(latest);},delay);this.sendTimer.unref?.();}}
  else{clearTimeout(this.sendTimer);this.sendTimer=null;this.pendingFrame=null;this.send(frame);}
  return actionable?this.pin(this.sentFrame):frame.metadata;
 }
 scheduleVerification(){clearTimeout(this.verifyTimer);this.resolveVerification?.();const generation=this.abort.signal;this.verification=new Promise(resolve=>{this.resolveVerification=resolve;this.verifyTimer=setTimeout(()=>{if(generation.aborted)return resolve();this.view(false,true).catch(error=>{if(!generation.aborted)this.notify({visionError:error.message});}).finally(resolve);},90);});}
 async call(name,args){
  validateSystemAction(name,args);if(!this.control)throw Error('Управление компьютером остановлено.');const signal=this.abort.signal;
  if(['screen_view','read_screen','list_controls'].includes(name)||mutations.has(name))this.busyUntil=Date.now()+4000;
  if(name==='screen_view')return this.view(true,true);
  const bound=coordinateActions.has(name)?this.actionFrame:null;
  if(coordinateActions.has(name)&&(!this.vision||!bound||bound.scene!==this.scene||Date.now()-bound.capturedAt>5000))throw Error('Нужен свежий снимок экрана через screen_view.');
  if(['type_text','press_key'].includes(name)&&(!this.vision||!this.frame?.activeHwnd))throw Error('Сначала посмотри активное окно через screen_view.');
  if(bound&&args.frame_id!==undefined&&args.frame_id!==bound.metadata.frameId)throw Error('Координаты относятся к другому кадру. Запроси screen_view.');
  if(['click_control','click_target'].includes(name)&&(!this.controlSnapshot||Date.now()-this.controlSnapshot.at>30000||!this.controlSnapshot.ids.has(args.id)))throw Error('Нужен настоящий ID из свежего list_controls.');
  const targetFrame=bound?.metadata||this.frame;
  const hwnd=['click_control','click_target'].includes(name)?this.controlSnapshot.hwnd:name!=='focus_window'&&mutations.has(name)?targetFrame?.activeHwnd:null;
  const began=Date.now();const result=await this.execute(name,args,signal,hwnd,targetFrame?.display);
  if(name==='list_controls')this.controlSnapshot={at:Date.now(),hwnd:result.activeHwnd,ids:new Set((result.controls||[]).map(c=>c.id))};
  if(signal.aborted)throw new DOMException('Операция отменена','AbortError');
  if(mutations.has(name)){this.actionFrame=null;this.controlSnapshot=null;this.scene++;this.cache=null;this.lastFrameAt=0;if(this.vision)this.scheduleVerification();return {...result,executionMs:Date.now()-began,verificationPending:this.vision};}
  return result;
 }
}
