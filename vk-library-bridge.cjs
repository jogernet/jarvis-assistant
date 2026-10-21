const {probeScript}=require('./vk-player-bridge.cjs');
const {backgroundClick}=require('./vk-background-click.cjs');
// Select only controls and playlists already present on the user's VK music page.
function libraryBridge(mode,args={}){
 const norm=text=>String(text||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
 const visible=el=>{if(!el?.getBoundingClientRect)return false;const rect=el.getBoundingClientRect(),s=getComputedStyle(el);return rect.width>1&&rect.height>1&&s.display!=='none'&&s.visibility!=='hidden';};
 const all=(selector,root=document)=>{try{return [...root.querySelectorAll(selector)];}catch{return [];}};
 const textNodes=(names,root=document)=>all('a,button,[role=link],[role=button],h1,h2,h3,h4,span,div',root).filter(el=>visible(el)&&names.includes(norm(el.textContent)));
 function target(el,left=false){if(!el||el.isConnected===false||!visible(el))return null;if(!args.afterHover)el.scrollIntoView?.({block:'center',inline:'nearest'});const r=el.getBoundingClientRect(),x=r.left+(left?Math.min(24,r.width/2):r.width/2),y=r.top+r.height/2;if(args.activate){el.click();return {x,y,activated:true};}return {x,y};}
 function clickable(el){return el?.closest('a,button,[role=link],[role=button],[onclick],[data-playlist-id],.audio_pl_item,.audio_pl')||el;}
 function cards(){const result=[],seen=new Set();for(const node of all('.audio_pl_item,.audio_pl,[data-playlist-id],[class*=PlaylistCard],a[href*="audio_playlist"],a[href*="/music/album/"]')){if(!visible(node))continue;const label=all('.audio_pl__title,.audio_pl__title_text,[class*=PlaylistCard__title],[class*=PlaylistTitle],h3,h4',node).find(visible);const name=(label?.textContent||node.getAttribute('aria-label')||node.getAttribute('title')||(node.innerText||node.textContent||'').split('\n').find(t=>t.trim())||'').replace(/\s+/g,' ').trim().slice(0,160);const key=node.getAttribute('href')||name;if(!name||seen.has(key))continue;seen.add(key);result.push({name,node});if(result.length>=60)break;}return result;}

 if(mode==='list')return {ok:true,playlists:cards().map(({name})=>({name}))};
 if(mode==='scroll-library'){const candidates=all('[class*=scroll],[class*=Scroll],.audio_page__body').filter(el=>visible(el)&&el.clientHeight>150&&el.scrollHeight>el.clientHeight+100);const root=candidates.find(el=>all('.audio_row,.audio_pl_item,[data-playlist-id]',el).length)||document.scrollingElement;if(!root)return {moved:false};const before=root.scrollTop;root.scrollTop=args.reset?0:before+Math.max(400,Math.round(root.clientHeight*.8));for(const strip of all('.audio_pls,.audio_pls__list,[class*=Carousel]'))if(strip.scrollWidth>strip.clientWidth+100)strip.scrollLeft+=Math.max(400,strip.clientWidth*.8);return {moved:Math.abs(root.scrollTop-before)>2};}


 if(mode==='locate-mix'){const heading=textNodes(['слушать vk микс','vk микс'])[0];if(!heading)return {};for(let root=heading.parentElement,depth=0;root&&root!==document.body&&depth<5;root=root.parentElement,depth++){const hr=heading.getBoundingClientRect();const buttons=all('button,[role=button],[onclick],.audio_page__mix_play',root).filter(visible).filter(el=>{const r=el.getBoundingClientRect();return r.width<=100&&r.height<=100&&Math.abs(r.left+r.width/2-(hr.left+hr.width/2))<120&&r.top<hr.bottom&&r.bottom>hr.top-130;}).sort((a,b)=>Math.abs(a.getBoundingClientRect().top-hr.top)-Math.abs(b.getBoundingClientRect().top-hr.top));if(buttons.length)return {target:target(buttons[0])};}return {target:target(clickable(heading))};}
 if(mode==='locate-playlist'||mode==='locate-playlist-cover'){
  const query=norm(args.name),available=cards(),exact=available.filter(card=>norm(card.name)===query),matches=exact.length?exact:available.filter(card=>query&&norm(card.name).includes(query));
  if(matches.length>1)return {error:'Нашлось несколько плейлистов с таким названием. Уточни название.',choices:matches.map(c=>c.name)};
  if(matches.length===1){const card=matches[0];if(mode==='locate-playlist')return {target:target(clickable(card.node)),name:card.name};
   const cover=all('.audio_pl__cover,.audio_pl_item__cover,[class*=PlaylistCard__cover],[class*=PlaylistCard__image],img',card.node).find(visible)||card.node;
   const selectors=['.audio_pl__action_play','.audio_pl__play_btn','.audio_pl__play','.audio_pl_item__play','[class*=PlaylistCard__play]','[data-testid*=playlist-play]','button[aria-label*="Воспроизвести"]','[role=button][aria-label*="Воспроизвести"]'];let play;
   for(const selector of selectors){play=all(selector,card.node).find(visible);if(play)break;}
   if(!play)play=all('button,[role=button],[aria-label],[title],[onclick]',card.node).filter(visible).find(el=>/^(?:слушать|воспроизвести|play)(?:\s|$)/i.test(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'')||/\b(?:playPlaylist|playAlbum)\s*\(/.test(el.getAttribute('onclick')||''));
   return {hover:target(cover),target:play?target(play):null,name:card.name,...(args.afterHover&&!play?{error:'На обложке плейлиста не найдена кнопка Play после наведения.'}:{})};
  }
  const nodes=textNodes([query]);if(mode==='locate-playlist'&&nodes.length)return {target:target(clickable(nodes[0])),name:args.name};
  return {needsLibrary:true,error:'Плейлист не найден на открытой странице VK. Открой нужный раздел или обнови список.',choices:available.map(c=>c.name)};
 }
 if(mode==='page-info')return {path:location.pathname,headings:all('h1,h2,h3,h4,.audio_pl_snippet__title').map(el=>norm(el.textContent)).slice(0,40)};

 return {};
}
const libraryScript=(mode,args)=>'('+libraryBridge.toString()+')('+JSON.stringify(mode)+','+JSON.stringify(args||{})+')';
async function controlLibrary(win,action,args={},{delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 if(['my_tracks','play_track'].includes(action))return {ok:false,unsupported:true,error:'Мои треки в VK отключены. Выбери плейлист.'};
 const contents=win.webContents,read=()=>contents.executeJavaScript(probeScript),locate=(mode,options)=>contents.executeJavaScript(libraryScript(mode,options));
 async function activate(mode,options){
  let fresh=await locate(mode,options);if(fresh.hover){try{if(!await backgroundClick(contents,fresh.hover,{hoverOnly:true}))return {error:'Не удалось навести курсор внутри окна VK.'};await delay(80);fresh=await locate(mode,{...options,afterHover:true});for(let i=0;i<2&&fresh.hover&&!fresh.target;i++){await delay(100);fresh=await locate(mode,{...options,afterHover:true});}}catch(error){return {error:'Наведение на обложку VK не удалось: '+error.message};}}
  const point=fresh.target||fresh.navigate;if(!point)return fresh;
  try{if(await backgroundClick(contents,point))return {...fresh,target:{...point,activated:true},method:'VK cover Play'};}catch(error){return {error:'Не удалось нажать кнопку VK: '+error.message};}
  return contents.executeJavaScript(libraryScript(mode,{...options,afterHover:true,activate:true}),true);
 }
 let targetMode,targetOptions;
 async function find(mode,options){let result=await locate(mode,options);for(let i=0;i<12&&!result.target&&!result.hover&&!result.navigate&&!result.error?.includes('несколько');i++){const scroll=await locate('scroll-library',{});if(!scroll.moved)break;await delay(180);result=await locate(mode,options);}return result;}
 const selected={for_you:'Для вас',discoveries:'Открытия'}[action]||args.name;
 if(['playlists','play_playlist','open_playlist'].includes(action)&&args.name!==undefined&&(typeof args.name!=='string'||!args.name.trim()||args.name.length>160))return {ok:false,error:'Нужно название плейлиста до 160 символов.'};
 if(action==='playlists'){await locate('scroll-library',{reset:true});const names=new Map();for(let i=0;i<12;i++){const result=await locate('list');for(const item of result.playlists||[])names.set(item.name,item);const scroll=await locate('scroll-library',{});if(!scroll.moved)break;await delay(180);}return {ok:true,playlists:[...names.values()],needsLibrary:!names.size};}
 const before=await read(),pageBefore=await locate('page-info');
 let found;if(action==='mix'){targetMode='locate-mix';found=await locate(targetMode);}
 else{if(!selected)return {ok:false,error:'Укажи название плейлиста.'};targetMode=action==='open_playlist'?'locate-playlist':'locate-playlist-cover';targetOptions={name:selected};found=await find(targetMode,targetOptions);}
 if(found.error)return {ok:false,...found};if(!found.target&&!found.hover)return {ok:false,needsLibrary:true,error:action==='mix'?'Не нашёл кнопку «Слушать VK Микс». Открой главную страницу музыки VK.':'Не нашёл кнопку плейлиста на странице VK.'};
 const activated=await activate(targetMode,targetOptions);if(!activated.target?.activated)return {ok:false,error:activated.error||'Кнопка VK изменилась до нажатия. Повтори команду.'};
 if(action==='open_playlist'){for(let i=0;i<5;i++){await delay(150);const pageAfter=await locate('page-info'),opened=pageAfter.path!==pageBefore.path||(!pageBefore.headings?.includes(String(selected).toLowerCase())&&pageAfter.headings?.includes(String(selected).toLowerCase()));if(opened)return {ok:true,opened:true,verified:true,name:found.name||selected};}return {ok:false,error:'VK не подтвердил открытие выбранного плейлиста.'};}
 for(let i=0;i<6;i++){await delay([80,120,200,300,500,800][i]);const state=await read(),changed=before.playback!=='playing'||(before.trackId&&state.trackId&&before.trackId!==state.trackId)||(before.title&&state.title&&before.title!==state.title)||(before.position>2&&state.position<before.position-1);const sameTrack=found.trackId&&state.trackId&&(state.trackId===found.trackId||(!state.trackId.includes('_')&&found.trackId.split('_').at(-1)===state.trackId));const expected=found.trackId&&state.trackId?sameTrack:!found.expectedTitle||String(state.title||'').toLowerCase().replace(/\s+/g,' ').includes(found.expectedTitle.toLowerCase().replace(/\s+/g,' '));if(state.playback==='playing'&&changed&&expected)return {ok:true,verified:true,playback:state.playback,title:state.title,source:action,name:selected};}
 return {ok:false,error:'VK не подтвердил воспроизведение выбранной музыки.'};
}
module.exports={libraryBridge,libraryScript,controlLibrary};
