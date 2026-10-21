(function(root){
 function connect(context,gain){
  if(typeof context.createAnalyser!=='function'){gain.connect(context.destination);return {sample:()=>0};}
  const analyser=context.createAnalyser();analyser.fftSize=512;analyser.smoothingTimeConstant=0;
  gain.connect(analyser);analyser.connect(context.destination);
  const samples=new Float32Array(analyser.fftSize);
  return {sample(){analyser.getFloatTimeDomainData(samples);let power=0;for(const sample of samples)power+=sample*sample;const rms=Math.sqrt(power/samples.length);return rms<.002?0:Math.min(1,rms*5);}};
 }
 const api={connect};if(typeof module!=='undefined')module.exports=api;else root.JarvisVoiceMeter=api;
})(typeof window!=='undefined'?window:globalThis);
