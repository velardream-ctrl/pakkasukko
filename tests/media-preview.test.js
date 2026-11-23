import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mediaAPI} from '../src/media.js';

const id='11111111-2222-4333-8444-555555555555';
const route='/api/admin/media/check/'+id;
const request=new Request('https://pakkasukko.test'+route);
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

test('owner can verify uploaded media without downloading the file',async()=>{
  const calls=[];
  const env={MEDIA:{head:async key=>{calls.push(key);return key===id?{httpMetadata:{contentType:'image/webp'}}:null;},get:()=>{throw Error('must not fetch bytes');}}};
  const result=await mediaAPI(request,env,route,reply,true);
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{available:true,mime:'image/webp'});
  assert.deepEqual(calls,[id]);
});

test('owner media check also finds original when thumbnail missing',async()=>{
  const calls=[];
  const env={MEDIA:{head:async key=>{calls.push(key);return key===id+'-original'?{httpMetadata:{contentType:'image/jpeg'}}:null;}}};
  const result=await mediaAPI(request,env,route,reply,true);
  assert.equal(result.status,200);
  assert.deepEqual(calls,[id,id+'-original']);
});

test('owner sees 404 for missing R2 image, private request cannot check',async()=>{
  const env={MEDIA:{head:async()=>null}};
  const missing=await mediaAPI(request,env,route,reply,true);
  assert.equal(missing.status,404);
  assert.match((await missing.json()).error,/отсутствует/);
  const denied=await mediaAPI(request,env,route,reply,false);
  assert.equal(denied.status,403);
});

test('editor provides session recovery without losing in-memory edits',()=>{
  const editor=readFileSync(new URL('../docs/editor.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../docs/editor.css',import.meta.url),'utf8');
  assert.match(editor,/function requireOwnerLogin\(\)/);
  assert.match(editor,/Войти в админку/);
  assert.match(editor,/Проверить вход и обновить фотографии/);
  assert.match(editor,/if\(r.status===401\)requireOwnerLogin\(\)/);
  assert.match(editor,/verifyMedia\(e\.target\.value\)/);
  assert.match(editor,/doc\.addEventListener\('error'/);
  assert.match(css,/#ownerSessionNotice/);
});
