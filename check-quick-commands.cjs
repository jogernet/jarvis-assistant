const assert=require('node:assert/strict');
const {parseQuickCommand:parse}=require('./quick-commands.cjs');
const {withMusicFallback}=require('./music-fallback.cjs');
(async()=>{
 for(const text of ['Включи музыку','Джарвис, вруби мою музыку','Джарвису включи музыку пожалуйста'])assert.equal(parse(text).action,'start_music');
 for(const text of ['Следующий трек','Включи следующий трек','Переключи трек'])assert.equal(parse(text).action,'next');
 assert.equal(parse('Поставь на паузу').action,'pause');assert.equal(parse('сделай тише').action,'volume_down');assert.equal(parse('громкость 50 процентов').args.volume,50);assert.equal(parse('включи плейлист для вас').action,'for_you');assert.equal(parse('открой калькулятор').app,'calculator');
 for(const text of ['Не включай музыку','Как включить музыку','Расскажи что значит следующий трек','открой C:\\private.exe','громкость 200'])assert.equal(parse(text),null,text);
 for(const text of ['следующая песня','переключи музыку','включи следующий'])assert.equal(parse(text).action,'next');assert.equal(parse('включи плейлист любимое').args.name,'любимое');assert.equal(parse('включи трек потеряна').action,'play_track');assert.equal(parse('громкость пятьдесят').args.volume,50);assert.equal(parse('следующий трек в спотифай').service,'spotify');assert.equal(parse('включи музыку в вк').service,'vk');for(const text of ['не переключай музыку','как включить плейлист любимое','громче на 500'])assert.equal(parse(text),null);
 const actions=[];const result=await withMusicFallback('for_you',{},async action=>{actions.push(action);return action==='mix'?{ok:true,verified:true,playback:'playing',title:'Actual track'}:{ok:false,error:'unavailable'};});
 assert.deepEqual(actions,['for_you','mix']);assert.equal(result.fallback,true);assert.equal(result.sourceAction,'mix');assert.equal(result.title,'Actual track');
 let count=0;const failed=await withMusicFallback('next',{},async()=>{count++;return {ok:false};});assert.equal(count,1);assert.equal(failed.ok,false,'Track navigation must never unexpectedly switch the source');
 const allFailed=await withMusicFallback('for_you',{},async()=>({ok:false,error:'no playback'}));assert.equal(allFailed.ok,false);assert.ok(allFailed.attempts.length>=4);
 console.log('PASS: direct command variants, questions and negation stay out of automation, verified music fallback, navigation preserves source and failure stays honest.');
})().catch(error=>{console.error(error);process.exitCode=1;});
