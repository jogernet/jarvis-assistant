import {randomUUID} from 'node:crypto';

// Undo closures remain in memory; message bodies never enter the action log.
export class ActionCenter {
 constructor(notify=()=>{}){this.notify=notify;this.rows=[];this.current=null;this.last=null;}
 state(){return {current:this.current?{...this.current.row}:null,history:this.rows.map(r=>({...r})),canUndo:!!this.last?.undo&&!this.current,undoReason:this.last?.reason||'Пока нет выполненных действий.'};}
 publish(){this.notify(this.state());}
 async run(label,operation,{reason='Для этого действия автоматический возврат недоступен.',undoable=true}={}){
  if(this.current)throw Error('Дождись текущего действия или нажми «Остановить».');
  const row={id:randomUUID(),label,at:Date.now(),phase:'running'},abort=new AbortController();
  if(undoable)this.last={undo:null,reason};
  this.current={row,abort};this.rows.unshift(row);this.rows.length=Math.min(this.rows.length,40);this.publish();
  let committed=false;
  const setUndo=undo=>{this.last={undo,reason:undo?'':reason};committed=true;};
  try{const result=await operation(abort.signal,setUndo);if(result?.ok===false)throw Error(result.error||'Действие не подтверждено.');
   if(abort.signal.aborted)throw new DOMException('Операция остановлена. Уже выполненные шаги могли сохраниться.','AbortError');
   row.phase='finished';if(undoable&&!committed)this.last={undo:null,reason};return result;
  }catch(error){row.phase=abort.signal.aborted?'cancelled':'error';row.error=error.message;throw error;}
  finally{row.durationMs=Date.now()-row.at;this.current=null;this.publish();}
 }
 cancel(){this.current?.abort.abort();this.publish();return {ok:true,result:this.current?'Останавливаю действие. Уже выполненные шаги не отменены.':'Нет выполняющегося действия.'};}
 async undo(){
  if(this.current){this.cancel();return {ok:true,result:'Текущее действие останавливается. После остановки можно отменить последний обратимый шаг.'};}
  const last=this.last;if(!last?.undo)throw Error(last?.reason||'Пока нечего отменять.');
  return this.run('Отменяю последнее действие',async signal=>{const result=await last.undo(signal);if(result?.ok===false)throw Error(result.error);this.last=null;return {...result,result:result?.result||'Последнее действие отменено.'};},{undoable:false});
 }
}
