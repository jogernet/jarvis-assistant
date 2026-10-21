(()=>{
 const canvas=document.getElementById('neural-canvas'),orb=document.getElementById('orb');if(!canvas?.getContext)return;
 const ctx=canvas.getContext('2d');if(!ctx)return;const core=orb.closest('.core-panel');orb.classList.add('neural-ready');
 const count=84,points=Array.from({length:count},(_,i)=>{const y=1-2*(i+.5)/count,r=Math.sqrt(1-y*y),a=i*2.399963;return {x:Math.cos(a)*r,y,z:Math.sin(a)*r};});
 const edges=[];for(let i=0;i<count;i++){const p=points[i];const near=points.map((q,j)=>({j,d:(p.x-q.x)**2+(p.y-q.y)**2+(p.z-q.z)**2})).filter(x=>x.j!==i).sort((a,b)=>a.d-b.d).slice(0,4);for(const {j}of near)if(j>i)edges.push([i,j]);}
 let frame=0,last=0,size=240,scale=1,visible=true,envelope=0;
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 function resize(){const bounds=core?.getBoundingClientRect();if(bounds?.height>0&&bounds.width>0){const compact=bounds.height<280;core.classList.toggle('compact-core',compact);size=Math.max(72,Math.min(300,bounds.height-(compact?94:142),bounds.width-32));orb.style.width=size+'px';orb.style.height=size+'px';}else size=240;scale=Math.min(window.devicePixelRatio||1,1.5);canvas.width=Math.round(size*scale);canvas.height=Math.round(size*scale);draw(last);}
 function draw(time){const sampled=window.jarvisVoiceLevel?.()||0,target=Number.isFinite(sampled)?Math.pow(Math.max(0,Math.min(1,sampled)),.65):0;envelope+=(target-envelope)*(target>envelope ? 0.7 : 0.25);if(envelope<.001)envelope=0;orb.style.filter='drop-shadow(0 0 '+(12+envelope*22)+'px rgba(38,153,255,'+(.4+envelope*.35)+'))';ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,size,size);const angle=reduced.matches?0:time*.00008,c=Math.cos(angle),s=Math.sin(angle),radius=size*(.32+(reduced.matches?0:envelope*.14)),center=size/2;
  const projected=points.map(p=>{const x=p.x*c+p.z*s,z=p.z*c-p.x*s,y=p.y*Math.cos(.16)-z*Math.sin(.16),depth=p.y*Math.sin(.16)+z*Math.cos(.16);return {x:center+x*radius,y:center+y*radius,z:depth};});
  const glow=ctx.createRadialGradient(center,center,1,center,center,size*.5);glow.addColorStop(0,'rgba(29,128,244,'+(.30+envelope*.45)+')');glow.addColorStop(.6,'rgba(26,129,255,'+(.10+envelope*.22)+')');glow.addColorStop(1,'rgba(10,59,102,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,size,size);
  for(const [i,j]of edges){const a=projected[i],b=projected[j],front=(a.z+b.z+2)/4;ctx.strokeStyle='rgba(67,176,255,'+(.16+front*.52+envelope*.18)+')';ctx.lineWidth=.8+front*.5+envelope*.4;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  for(const p of projected){const front=(p.z+1)/2;ctx.fillStyle='rgba(149,224,255,'+(.35+front*.65)+')';ctx.beginPath();ctx.arc(p.x,p.y,1+front*1.2+envelope*.6,0,Math.PI*2);ctx.fill();}
 }
 function tick(time){frame=0;if(!visible||document.hidden||document.getElementById('workspace').hidden||window.jarvisUiHidden)return;if(time-last>45){last=time;draw(time);}if(!reduced.matches)frame=requestAnimationFrame(tick);}
 function resume(){if(frame)cancelAnimationFrame(frame);frame=0;if(visible&&!document.hidden&&!window.jarvisUiHidden){resize();frame=requestAnimationFrame(tick);}}
 new ResizeObserver(resize).observe(core||orb);
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;resume();}).observe(orb);
 window.addEventListener('jarvis:panel',event=>{if(event.detail==='chat')resume();});window.addEventListener('jarvis:voice-stop',()=>{envelope=0;if(visible&&!document.hidden)draw(last);});document.addEventListener('visibilitychange',resume);window.addEventListener('jarvis:visible',resume);reduced.addEventListener('change',resume);window.addEventListener('pagehide',()=>cancelAnimationFrame(frame));
 resize();
})();
