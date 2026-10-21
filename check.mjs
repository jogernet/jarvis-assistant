import {server,targetFor,validateConnection} from './server.mjs';
import {Readable} from 'node:stream';
import assert from 'node:assert/strict';
async function request(url,method='GET',headers={},body=''){
 const req=Readable.from(body?[body]:[]);Object.assign(req,{url,method,headers:{host:'127.0.0.1:3213',...headers}});
 let status,content='';await new Promise(resolve=>server.emit('request',req,{setHeader(){},writeHead(s){status=s;},end(v){content+=v||'';resolve();}}));return {status,content};
}
const page=await request('/');assert.equal(page.status,200);assert.ok(page.content.includes('JARVIS'));assert.ok(!page.content.includes('__TOKEN__'));
const sampleKey='AIzaSy'+'aB9_-'.repeat(7);
assert.equal(validateConnection({key:sampleKey}).key,sampleKey);
assert.equal(validateConnection({key:'  '+sampleKey+'  '}).key,sampleKey);
assert.equal(validateConnection({key:'bad'}).key,'bad');
assert.equal(validateConnection({key:'!'.repeat(53)}).key,'!'.repeat(53));
assert.throws(()=>validateConnection({key:''}));
assert.equal((await request('/connect','POST',{},'{}')).status,403);
assert.equal((await request('/','GET',{host:'evil.example'})).status,403);
const token=page.content.match(/name="jarvis-token" content="([^"]+)/)[1];
assert.equal((await request('/connect','POST',{'x-jarvis-token':token},JSON.stringify({key:''}))).status,400);
assert.equal((await request('/connect','POST',{'x-jarvis-token':token,origin:'https://evil.example'},'{}')).status,403);
assert.equal(targetFor('open_app',{app:'calculator'}),'calc.exe');
assert.throws(()=>targetFor('open_app',{app:'cmd.exe'}));
assert.throws(()=>targetFor('open_url',{url:'file:///C:/Windows'}));
assert.throws(()=>targetFor('open_url',{url:'https://user:pass@example.com'}));
console.log('PASS: page, token, authentication, origin, host, invalid key and action restrictions.');
