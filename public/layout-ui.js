(()=>{
 const $=id=>document.getElementById(id),stage=$('assistant-panels'),handle=$('stage-resizer');let ratio=.54,drag=null;
 try{const saved=JSON.parse(localStorage.getItem('jarvis-layout-v2')||'{}');if(Number.isFinite(saved.ratio))ratio=saved.ratio;}catch{}
 const clamp=value=>Math.max(.28,Math.min(.72,value));
 function apply(){ratio=clamp(ratio);stage.style.setProperty('--core-rows',ratio+'fr');stage.style.setProperty('--chat-rows',(1-ratio)+'fr');handle.setAttribute('aria-valuenow',String(Math.round(ratio*100)));}
 function store(){try{localStorage.setItem('jarvis-layout-v2',JSON.stringify({ratio}));}catch{}}
 function end(event){if(!drag)return;drag=null;document.body.classList.remove('resizing','resizing-height');if(handle.hasPointerCapture?.(event?.pointerId))handle.releasePointerCapture(event.pointerId);store();}
 handle.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();drag=stage.getBoundingClientRect();handle.setPointerCapture?.(event.pointerId);document.body.classList.add('resizing','resizing-height');});
 handle.addEventListener('pointermove',event=>{if(!drag||!drag.height)return;ratio=clamp((event.clientY-drag.top)/drag.height);apply();});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(name,end);
 handle.addEventListener('dblclick',()=>{ratio=.54;apply();store();});
 handle.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();ratio=event.key==='Home'?.28:event.key==='End'?.72:ratio+(event.key==='ArrowUp'?-.05:.05);apply();store();});
 $('layout-reset').onclick=()=>{ratio=.54;apply();store();};window.addEventListener('blur',end);window.addEventListener('resize',apply);apply();
})();
