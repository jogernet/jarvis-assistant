export class Diagnostics{
 constructor(now=()=>Date.now()){this.now=now;this.started=now();this.events=[];this.pending=new Set();this.totals={captured:0,sent:0,screenBytes:0,audioInBytes:0,audioOutBytes:0,audioChunks:0,toolCalls:0,toolErrors:0,skippedFrames:0};this.captureTimes=[];this.sendTimes=[];this.detectionTimes=[];this.state={connected:false,control:false,vision:false,model:'',nativeAvailable:false,elevated:null,lastError:'',lastCaptureAt:0,lastSentAt:0,lastResponseAt:0};this.tools=Object.create(null);}
 log(kind,message,details={}){this.events.unshift({at:this.now(),kind,message,details});this.events.length=Math.min(this.events.length,120);}
 set(values){if(values.detectorAt&&values.detectorAt!==this.state.detectorAt)this.detectionTimes.push(values.detectorAt);Object.assign(this.state,values);}
 toolStart(id,name,args={}){
  this.pending.add(id);this.timings??=new Map();this.timings.set(id,this.now());this.totals.toolCalls++;this.tools[name]??={calls:0,errors:0,lastAt:0,lastResult:'-'};this.tools[name].calls++;this.tools[name].lastAt=this.now();
  const details={tool:name};for(const key of ['x','y','button','key','amount','hwnd'])if(args[key]!==undefined)details[key]=args[key];
  if(typeof args.text==='string')details.textLength=args.text.length;
  if(typeof args.query==='string')details.queryLength=args.query.length;
  if(typeof args.url==='string'){try{details.site=new URL(args.url).hostname;}catch{}}
  this.log('tool','Вызов инструмента',details);
 }
 toolEnd(id,name,result){const began=this.timings?.get(id);const durationMs=began===undefined?null:Math.max(0,this.now()-began);this.timings?.delete(id);this.state.lastToolMs=durationMs;this.pending.delete(id);const tool=this.tools[name];if(!tool)return;tool.lastDurationMs=durationMs;tool.lastResult=result?.ok===false?'Ошибка':'Успех';if(result?.ok===false){tool.errors++;this.totals.toolErrors++;this.state.lastError=String(result.error||'Ошибка инструмента').slice(0,500);this.log('error','Ошибка инструмента',{tool:name,error:this.state.lastError,durationMs});}else this.log('result','Действие завершено',{tool:name,durationMs});}
 captured(frame,ms){const at=this.now();this.totals.captured++;this.captureTimes.push(at);Object.assign(this.state,{lastCaptureAt:at,captureMs:Math.round(ms),width:frame.width,height:frame.height,activeWindow:frame.activeWindow||'',activeHwnd:frame.activeHwnd||'',display:frame.display||null,cursor:frame.cursor||null});}
 sent(image){const at=this.now();this.totals.sent++;this.totals.screenBytes+=Math.floor(image.length*3/4);this.sendTimes.push(at);this.state.lastSentAt=at;this.preview=image;}
 audio(direction,bytes){this.totals[direction==='in'?'audioInBytes':'audioOutBytes']+=bytes;if(direction==='in')this.totals.audioChunks++;}
 snapshot(preview=false){const at=this.now(),window=5000;this.captureTimes=this.captureTimes.filter(t=>at-t<window);this.sendTimes=this.sendTimes.filter(t=>at-t<window);this.detectionTimes=this.detectionTimes.filter(t=>at-t<window);const duration=Math.max(1,Math.min(5,(at-this.started)/1000));return {at,started:this.started,...this.state,totals:{...this.totals},captureFps:+(this.captureTimes.length/duration).toFixed(2),sendFps:+(this.sendTimes.length/duration).toFixed(2),detectionFps:+(this.detectionTimes.length/duration).toFixed(2),pending:this.pending.size,tools:structuredClone(this.tools),events:structuredClone(this.events),...(preview&&this.preview?{preview:'data:image/jpeg;base64,'+this.preview}:{})};}
}
