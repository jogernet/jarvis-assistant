import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export class NativeWorker{
 constructor(start=()=>spawn(fileURLToPath(new URL('./WindowsControl-v9.exe',import.meta.url)),['--server'],{windowsHide:true,stdio:['pipe','pipe','pipe']})){this.start=start;this.pending=new Map();this.serial=0;this.output='';}
 ensure(){if(this.child)return;const child=this.start();this.child=child;this.output='';child.stdout.setEncoding('utf8');
  child.stdout.on('data',chunk=>{if(this.child!==child)return;this.output+=chunk.toString();if(this.output.length>4000000){this.reset(Error('Слишком большой ответ Windows.'));return;}let newline;while((newline=this.output.indexOf('\n'))>=0){const line=this.output.slice(0,newline).replace(/^\uFEFF/,'');this.output=this.output.slice(newline+1);if(!line.trim())continue;try{const message=JSON.parse(line),pending=this.pending.get(String(message.id));if(!pending)continue;this.pending.delete(String(message.id));pending.cleanup();message.result?.ok===false?pending.reject(Error(message.result.error)):pending.resolve(message.result);}catch{this.reset(Error('Неверный ответ модуля Windows.'));return;}}});
  child.stderr?.resume();
  child.stdin.on('error',error=>{if(this.child===child)this.reset(error);});
  child.on('error',error=>{if(this.child===child)this.reset(error);});child.on('close',()=>{if(this.child===child)this.reset(Error('Модуль Windows завершился.'));});
 }
 request(name,args,signal,expectedForeground,expectedDisplay){
  if(signal?.aborted)return Promise.reject(new DOMException('Операция отменена','AbortError'));
  return new Promise((resolve,reject)=>{try{this.ensure();}catch(error){reject(error);return;}
   const id=String(++this.serial);const cancel=()=>this.reset(new DOMException('Операция отменена','AbortError'));
   const timer=setTimeout(()=>this.reset(Error('Windows не ответила вовремя.')),7000);
   const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);};
   this.pending.set(id,{resolve,reject,cleanup});signal?.addEventListener('abort',cancel,{once:true});
   this.child.stdin.write(JSON.stringify({id,action:name,args:{...args,...(expectedForeground?{_expectedForeground:expectedForeground}:{}),...(expectedDisplay?{_expectedDisplay:expectedDisplay}:{})}})+'\n');
  });
 }
 reset(error=Error('Модуль Windows остановлен.')){const child=this.child;this.child=null;this.output='';for(const pending of this.pending.values()){pending.cleanup();pending.reject(error);}this.pending.clear();child?.kill();}
 close(){this.reset();}
}
