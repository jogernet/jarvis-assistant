const path=require('node:path');
const fs=require('node:fs/promises');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);

async function findNpm(){
 const {stdout}=await exec('where.exe',['npm.cmd'],{windowsHide:true,timeout:5000});
 for(const location of stdout.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)){
  const cli=path.join(path.dirname(location),'node_modules','npm','bin','npm-cli.js');
  try{await fs.access(cli);return cli;}catch{}
 }
 throw Error('npm не найден. Установи Node.js LTS и повтори подключение в Джарвисе.');
}
class TelegramSetup{
 constructor({directory=path.join(__dirname,'telegram-runtime'),loadSdk,locate=findNpm,start=spawn,timeoutMs=120000}={}){Object.assign(this,{directory,loadSdk,locate,start,timeoutMs});}
 async ensure({signal,progress=()=>{}}={}){
  signal?.throwIfAborted();progress('Проверяю компоненты Telegram…');
  try{return this.loadSdk();}catch{}
  progress('Подготавливаю загрузку клиента Telegram…');
  let cli;try{cli=await this.locate();}catch{throw Error('Не найден установщик компонентов. Установи Node.js LTS и повтори подключение в Джарвисе.');}
  signal?.throwIfAborted();progress('Загружаю компоненты Telegram. Обычно это занимает до минуты…');
  await fs.mkdir(this.directory,{recursive:true});
  await new Promise((resolve,reject)=>{
   // Fixed arguments, no command shell, credentials or messages in the child process.
   const child=this.start('node.exe',[cli,'install','--prefix',this.directory,'telegram@2.26.22','qrcode@1.5.4','--save-exact','--ignore-scripts','--no-audit','--no-fund','--fetch-retries=0','--fetch-timeout=20000'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
   let done=false,errorText='';
   const finish=error=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);error?reject(error):resolve();};
   const cancel=()=>{child.kill();finish(new DOMException('Подготовка Telegram отменена.','AbortError'));};
   const timer=setTimeout(()=>{child.kill();finish(Error('Загрузка компонентов не завершилась за две минуты. Проверь интернет и повтори подключение.'));},this.timeoutMs);
   child.stderr?.on('data',chunk=>{errorText=(errorText+chunk.toString()).slice(-6000);});
   child.once('error',()=>finish(Error('Не удалось запустить подготовку компонентов Telegram. Проверь установку Node.js.')));
   child.once('close',code=>finish(code===0?null:Error(/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ENETUNREACH/.test(errorText)?'Не удалось загрузить компоненты Telegram: нет доступа к серверу пакетов. Проверь интернет и повтори подключение.':'Не удалось подготовить компоненты Telegram. Повтори подключение; отдельный файл запускать не нужно.')));
   signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  });
  signal?.throwIfAborted();progress('Проверяю загруженные компоненты…');return this.loadSdk();
 }
}
module.exports={TelegramSetup};
