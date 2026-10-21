const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const elements=new Map(),listeners=new Map(),stored=new Map();
function element(){const classes=new Set();return {handlers:{},style:{setProperty(k,v){this[k]=v;}},attrs:{},classList:{add(...v){v.forEach(x=>classes.add(x));},remove(...v){v.forEach(x=>classes.delete(x));},contains:x=>classes.has(x)},setAttribute(k,v){this.attrs[k]=v;},getBoundingClientRect:()=>({top:100,height:600,width:1000}),addEventListener(k,fn){this.handlers[k]=fn;},setPointerCapture(){this.captured=true;},hasPointerCapture(){return this.captured;},releasePointerCapture(){this.captured=false;}};}
for(const m of fs.readFileSync('public/index.html','utf8').matchAll(/id="([^"]+)"/g)){assert.ok(!elements.has(m[1]),'Duplicate ID '+m[1]);elements.set(m[1],element());}
const $=id=>{assert.ok(elements.has(id),'Missing '+id);return elements.get(id);},body=element();
vm.runInNewContext(fs.readFileSync('public/layout-ui.js','utf8'),{document:{getElementById:$,body},window:{addEventListener(k,fn){listeners.set(k,fn);}},localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)}});
const fire=(name,data={})=>$('stage-resizer').handlers[name]({button:0,pointerId:1,preventDefault(){},...data});
assert.equal($('stage-resizer').attrs['aria-valuenow'],'54');fire('pointerdown');fire('pointermove',{clientY:460});fire('pointerup');assert.equal($('stage-resizer').attrs['aria-valuenow'],'60');assert.equal(JSON.parse(stored.get('jarvis-layout-v2')).ratio,.6);
fire('keydown',{key:'Home'});assert.equal($('stage-resizer').attrs['aria-valuenow'],'28');fire('keydown',{key:'End'});assert.equal($('stage-resizer').attrs['aria-valuenow'],'72');fire('dblclick');assert.equal($('stage-resizer').attrs['aria-valuenow'],'54');
fire('pointerdown');fire('pointercancel');assert.equal(body.classList.contains('resizing'),false);$('layout-reset').onclick();assert.equal($('stage-resizer').attrs['aria-valuenow'],'54');
assert.equal(elements.has('inspector-toggle'),false);assert.equal(elements.has('inspector-resizer'),false);assert.equal(elements.has('nav-chat'),true);assert.equal(elements.has('tab-chat'),false);
console.log('PASS: chat/core ratio drag, saved ratio, keyboard bounds, cancelled drag, reset, Chat navigation and no obsolete right-sidebar controls.');
