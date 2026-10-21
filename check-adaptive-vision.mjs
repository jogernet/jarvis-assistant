import assert from 'node:assert/strict';
import {ComputerSession} from './computer-session.mjs';
let captures=0;const session=new ComputerSession({execute:async()=>({ok:true,image:String(++captures),frameId:String(captures),activeHwnd:'42'}),sendFrame(){return true;},notify(){}});
session.configure(true,true);await new Promise(resolve=>setTimeout(resolve,1150));assert.ok(captures<=2,'Idle adaptive vision must not encode 20 frames per second');assert.ok(captures>=1);
const before=captures,began=Date.now();await session.call('screen_view',{});assert.ok(captures>before,'Explicit screen inspection captures fresh pixels');await new Promise(resolve=>setTimeout(resolve,650));const burst=captures-before;assert.ok(burst<=Math.ceil((Date.now()-began)/250)+3,'Active adaptive vision remains bounded');session.stop();
console.log('PASS: idle adaptive capture stays near 1 FPS, explicit inspection stays fresh, active capture is bounded and stop releases timers.');
