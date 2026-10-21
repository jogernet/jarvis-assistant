class Capture extends AudioWorkletProcessor{
 constructor(){super();this.pcm=new Int16Array(640);this.offset=0;}
 process(inputs){const input=inputs[0]?.[0];if(input)for(const value of input){this.pcm[this.offset++]=Math.round(Math.max(-1,Math.min(1,value))*32767);if(this.offset===this.pcm.length){const buffer=this.pcm.buffer;this.port.postMessage(buffer,[buffer]);this.pcm=new Int16Array(640);this.offset=0;}}return true;}
}
registerProcessor('capture',Capture);
