const assert=require('node:assert/strict'),{connect}=require('./public/voice-meter.js');
let amplitude=0,gainTarget,analyserTarget;
const analyser={connect(target){analyserTarget=target;},getFloatTimeDomainData(samples){samples.fill(amplitude);}};
const context={destination:{},createAnalyser:()=>analyser},gain={connect(target){gainTarget=target;}};
const meter=connect(context,gain);
assert.equal(gainTarget,analyser);assert.equal(analyserTarget,context.destination);
assert.equal(meter.sample(),0);amplitude=.05;assert.ok(Math.abs(meter.sample()-.25)<1e-6);amplitude=.5;assert.equal(meter.sample(),1);amplitude=.0001;assert.equal(meter.sample(),0);
const fallback={destination:{}};assert.equal(connect(fallback,gain).sample(),0);assert.equal(gainTarget,fallback.destination);
console.log('PASS: speech RMS envelope, silence floor, loudness clamp and one output routing path.');
