const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let coreHeight=0,coreWidth=0,resizeCallback,intersectionCallback,lines=0,arcs=0,frameId=0,maxRadius=0;const frames=new Map(),listeners=new Map();
const classes=()=>{const values=new Set();return {add:x=>values.add(x),toggle:(x,on)=>on?values.add(x):values.delete(x),contains:x=>values.has(x)};};
const core={classList:classes(),getBoundingClientRect:()=>({height:coreHeight,width:coreWidth})},orb={classList:classes(),style:{},closest:()=>core};
const ctx={setTransform(){},clearRect(){maxRadius=0;},createRadialGradient:()=>({addColorStop(){}}),fillRect(){},beginPath(){},moveTo(){},lineTo(){lines++;},stroke(){},arc(x,y){arcs++;maxRadius=Math.max(maxRadius,Math.hypot(x-canvas.width/2,y-canvas.height/2));},fill(){}};
const canvas={getContext:()=>ctx},workspace={hidden:true};
const document={hidden:false,getElementById:id=>({'neural-canvas':canvas,orb,workspace})[id],addEventListener(k,fn){listeners.set(k,fn);}};
const window={devicePixelRatio:1,matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener(k,fn){listeners.set(k,fn);}};
vm.runInNewContext(fs.readFileSync('public/neural-ui.js','utf8'),{window,document,ResizeObserver:class{constructor(fn){resizeCallback=fn;}observe(){}},IntersectionObserver:class{constructor(fn){intersectionCallback=fn;}observe(){}},requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),Math});
workspace.hidden=false;coreHeight=400;coreWidth=900;resizeCallback();assert.equal(orb.style.width,'258px');assert.equal(orb.style.height,'258px');assert.ok(lines>100&&arcs>80,'Draw neural edges and nodes, not just the letter J');assert.equal(orb.classList.contains('neural-ready'),true);
coreHeight=180;resizeCallback();assert.equal(orb.style.width,'86px');assert.equal(core.classList.contains('compact-core'),true);
intersectionCallback([{isIntersecting:true}]);assert.equal(frames.size,1);let [id,fn]=[...frames.entries()][0];frames.delete(id);window.jarvisUiHidden=true;fn(100);assert.equal(frames.size,0,'Hidden app stops animation');
window.jarvisUiHidden=false;coreHeight=400;listeners.get('jarvis:panel')({detail:'chat'});assert.equal(orb.style.width,'258px');assert.equal(frames.size,1,'Returning to Chat restores a visible sphere');
const silentRadius=maxRadius;window.jarvisVoiceLevel=()=>1;resizeCallback();assert.ok(maxRadius>silentRadius*1.08,"Audio amplitude expands sphere");window.jarvisVoiceLevel=()=>0;for(let i=0;i<40;i++)resizeCallback();assert.ok(Math.abs(maxRadius-silentRadius)<.1,"Silence returns to baseline");
const ico=fs.readFileSync('assets/jarvis.ico');assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),7);for(let i=0;i<7;i++){const offset=ico.readUInt32LE(6+i*16+12);assert.equal(ico.subarray(offset+1,offset+4).toString(),'PNG');}
assert.ok(fs.readFileSync('desktop.cjs','utf8').includes("icon:path.join(__dirname,'assets','jarvis.ico')"));
console.log('PASS: nonzero neural sphere after hidden start, compact resizing, neural graph rendering, hidden-window pause, tab return and seven valid Windows icon sizes.');
