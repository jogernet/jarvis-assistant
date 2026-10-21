import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
import {NativeWorker} from './native-worker.mjs';
const executable=fileURLToPath(new URL('./WindowsControl-v6.exe',import.meta.url));
const test=JSON.parse(execFileSync(executable,['--self-test'],{encoding:'utf8',windowsHide:true}));assert.equal(test.mapping,true);assert.equal(test.inputSize,test.expected);
// Generate an artificial bitmap; this test neither captures the desktop nor moves the mouse.
const width=320,height=180,stride=width*3,size=54+stride*height,bmp=Buffer.alloc(size,45);bmp.write('BM');bmp.writeUInt32LE(size,2);bmp.writeUInt32LE(54,10);bmp.writeUInt32LE(40,14);bmp.writeInt32LE(width,18);bmp.writeInt32LE(height,22);bmp.writeUInt16LE(1,26);bmp.writeUInt16LE(24,28);bmp.writeUInt32LE(0,30);bmp.writeUInt32LE(stride*height,34);
const worker=new NativeWorker();try{const image=await worker.request('prepare_frame',{image:bmp.toString('base64'),cursorX:500,cursorY:500});assert.equal(image.width,width);assert.equal(image.height,height);const jpeg=Buffer.from(image.image,'base64');assert.equal(jpeg[0],255);assert.equal(jpeg[1],216);const marked=await worker.request('prepare_frame',{image:bmp.toString('base64'),display:{left:0,top:0,width:1920,height:1080},targets:[{id:'T12',left:300,top:240,width:600,height:200},{id:'T13',left:1050,top:600,width:600,height:200}]});assert.equal(marked.width,width);assert.notEqual(marked.image,image.image);writeFileSync('runtime/test-marker-preview.jpg',Buffer.from(marked.image,'base64'));}finally{worker.close();}
console.log('PASS: physical coordinate mapping, endpoints, negative origins, 4K center and native grid rendering on synthetic image.');
